"""Deployment lifecycle endpoints with full state-machine enforcement."""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Never

import requests
import urllib3
from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.auth_models import UserResponse
from api.config_storage import config_storage
from api.database import MAX_DEPLOYMENTS_PER_USER, db
from api.dependencies import get_current_user
from api.models import (
    ApiErrorResponse,
    CnameRecord,
    CustomerDeployment,
    DeploymentEvent,
    DeploymentEventType,
    DeploymentEventsResponse,
    DeploymentResponse,
    DeploymentStatus,
    DeployRequest,
    DestroyRequest,
    DnsStatusResponse,
    ErrorCode,
    ServiceHealthCheck,
)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/deployments",
    tags=["deployments"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _raise(code: ErrorCode, message: str, http_status: int = 409) -> Never:
    raise HTTPException(
        status_code=http_status,
        detail=ApiErrorResponse(code=code, message=message).model_dump(),
    )


def _parse_deployment_outputs(outputs_raw: str | None) -> dict | None:
    """Safely parse deployment outputs JSON."""
    if not outputs_raw or not outputs_raw.strip():
        return None
    try:
        return json.loads(outputs_raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _doc_to_deployment(d: dict[str, Any]) -> CustomerDeployment:
    """Convert a MongoDB deployment document to a CustomerDeployment model."""
    return CustomerDeployment(
        id=str(d.get("_id", "")),
        customer_id=d["customer_id"],
        environment=d["environment"],
        stack_name=d["stack_name"],
        aws_region=d["aws_region"],
        role_arn=d["role_arn"],
        status=d["status"],
        addon_status=d.get("addon_status"),
        pulumi_deployment_id=d.get("pulumi_deployment_id"),
        outputs=_parse_deployment_outputs(d.get("outputs")),
        error_message=d.get("error_message"),
        created_at=d["created_at"],
        updated_at=d["updated_at"],
    )


_ERROR_CODE_TO_HTTP: dict[str, tuple[int, ErrorCode]] = {
    "DEPLOYMENT_IN_PROGRESS": (409, ErrorCode.DEPLOYMENT_IN_PROGRESS),
    "DEPLOYMENT_DESTROYING": (409, ErrorCode.DEPLOYMENT_DESTROYING),
    "DEPLOYMENT_NOT_FOUND": (404, ErrorCode.DEPLOYMENT_NOT_FOUND),
    "ALREADY_DESTROYED": (409, ErrorCode.ALREADY_DESTROYED),
}


# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------


@router.post(
    "/{customer_id}",
    response_model=DeploymentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Deploy customer infrastructure",
)
async def deploy(
    customer_id: str,
    request: DeployRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> DeploymentResponse:
    """Deploy infrastructure for a customer.

    Uses atomic DB operations to prevent race conditions between
    concurrent deploy / destroy requests.
    """

    # 1. Verify config exists for this user
    config = config_storage.get(current_user.id, customer_id)
    if config is None:
        _raise(
            ErrorCode.CONFIG_NOT_FOUND,
            f"Configuration for customer '{customer_id}' not found. "
            "Create a configuration first using POST /api/v1/configs",
            http_status=404,
        )

    stack_name = f"{customer_id}-{request.environment}"

    # 2. Quota check
    active_count = db.get_active_deployment_count(current_user.id)
    # Allow re-deploy of existing stacks (doesn't increase count)
    existing = db.get_deployment_for_user(current_user.id, customer_id, request.environment)
    if existing is None and active_count >= MAX_DEPLOYMENTS_PER_USER:
        _raise(
            ErrorCode.QUOTA_EXCEEDED,
            f"You have reached the maximum of {MAX_DEPLOYMENTS_PER_USER} active deployments. "
            "Destroy an existing deployment before creating a new one.",
        )

    # 3. Atomic start — handles all state checks + race conditions in one DB op
    doc, error = db.atomic_start_deploy(
        user_id=current_user.id,
        customer_id=customer_id,
        environment=request.environment,
        aws_region=config.aws_config.region,
        role_arn=config.aws_config.role_arn,
    )

    if doc is None:
        http_status, error_code = _ERROR_CODE_TO_HTTP.get(
            error, (409, ErrorCode.OPERATION_LOCKED)
        )
        _raise(error_code, f"Cannot deploy {stack_name}: {error}", http_status=http_status)

    # 4. Clear old events from previous runs
    db.clear_events(stack_name)
    db.add_event(
        stack_name,
        event_type=DeploymentEventType.DEPLOY_QUEUED,
        message="Deployment queued",
    )

    # 5. Dispatch Celery task
    from worker.celery_app import deploy_task

    task = deploy_task.delay(customer_id, request.environment)

    db.audit_log(
        "deployment_started",
        customer_id,
        user_id=current_user.id,
        environment=request.environment,
        actor=current_user.email,
    )

    return DeploymentResponse(
        customer_id=customer_id,
        environment=request.environment,
        stack_name=stack_name,
        status=DeploymentStatus.PENDING,
        message=f"Deployment queued (task_id={task.id}). Check status endpoint for progress.",
    )


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


@router.get(
    "/{customer_id}/{environment}/status",
    response_model=CustomerDeployment,
    summary="Get deployment status",
)
async def get_deployment_status(
    customer_id: str,
    environment: str = "prod",
    current_user: UserResponse = Depends(get_current_user),
) -> CustomerDeployment:
    deployment = db.get_deployment_for_user(current_user.id, customer_id, environment)
    if not deployment:
        _raise(
            ErrorCode.DEPLOYMENT_NOT_FOUND,
            f"Deployment for {customer_id}-{environment} not found",
            http_status=404,
        )

    return _doc_to_deployment(deployment)


# ---------------------------------------------------------------------------
# Events (real-time progress)
# ---------------------------------------------------------------------------


@router.get(
    "/{customer_id}/{environment}/events",
    response_model=DeploymentEventsResponse,
    summary="Get deployment events for progress tracking",
)
async def get_deployment_events(
    customer_id: str,
    environment: str,
    since: str | None = Query(None, description="ISO timestamp — return only events after this"),
    current_user: UserResponse = Depends(get_current_user),
) -> DeploymentEventsResponse:
    """Return deployment events for real-time progress display."""
    stack_name = f"{customer_id}-{environment}"

    # Verify ownership
    deployment = db.get_deployment_for_user(current_user.id, customer_id, environment)
    if not deployment:
        _raise(
            ErrorCode.DEPLOYMENT_NOT_FOUND,
            f"Deployment for {stack_name} not found",
            http_status=404,
        )

    since_dt: datetime | None = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            since_dt = None

    raw_events = db.get_events(stack_name, since=since_dt)

    events = [
        DeploymentEvent(
            id=str(e.get("_id", "")),
            event_type=e["event_type"],
            stack_name=e["stack_name"],
            message=e["message"],
            timestamp=e["timestamp"],
            details=e.get("details"),
        )
        for e in raw_events
    ]

    return DeploymentEventsResponse(stack_name=stack_name, events=events)


# ---------------------------------------------------------------------------
# DNS Status
# ---------------------------------------------------------------------------

_SERVICE_SUBDOMAINS = [
    ("Dashboard", "dashboard"),
    ("Cortex App", "cortex-app"),
    ("Cortex Ingestion", "cortex-ingestion"),
    ("FalkorDB Dashboard", "falkordb-dashboard"),
    ("Grafana", "grafana"),
    ("Prometheus", "prometheus"),
    ("Milvus", "milvus"),
]


def _check_single_service(url: str, timeout: float = 5.0) -> tuple[str, int | None]:
    """HEAD-check a single URL. Returns (status_string, http_code | None)."""
    try:
        resp = requests.head(url, timeout=timeout, verify=False, allow_redirects=True)
        return ("reachable", resp.status_code)
    except requests.exceptions.Timeout:
        return ("timeout", None)
    except Exception:
        return ("unreachable", None)


@router.get(
    "/{customer_id}/{environment}/dns-status",
    response_model=DnsStatusResponse,
    summary="Check DNS configuration and service health",
    description="Checks reachability of all service endpoints for a deployment.",
)
async def get_dns_status(
    customer_id: str,
    environment: str,
    current_user: UserResponse = Depends(get_current_user),
) -> DnsStatusResponse:
    """Check DNS and service health for a customer deployment."""
    config = config_storage.get(current_user.id, customer_id)
    if config is None:
        _raise(ErrorCode.CONFIG_NOT_FOUND, f"Configuration for '{customer_id}' not found", 404)

    domain = config.domain

    # Try to get NLB address from deployment outputs
    nlb_address: str | None = None
    deployment = db.get_deployment_for_user(current_user.id, customer_id, environment)
    if deployment:
        outputs = _parse_deployment_outputs(deployment.get("outputs"))
        if outputs:
            nlb_address = (
                outputs.get("nlb_address")
                or outputs.get("nlb_dns_name")
                or outputs.get("load_balancer_hostname")
            )

    target_hint = nlb_address or "your-nlb-address.elb.amazonaws.com"

    # Build service list
    services_to_check = [
        {"name": name, "hostname": f"{sub}.hydradb.{domain}", "url": f"https://{sub}.hydradb.{domain}"}
        for name, sub in _SERVICE_SUBDOMAINS
    ]

    # Check all services concurrently
    check_results = await asyncio.gather(
        *(asyncio.to_thread(_check_single_service, svc["url"]) for svc in services_to_check)
    )

    services = [
        ServiceHealthCheck(
            name=svc["name"],
            hostname=svc["hostname"],
            url=svc["url"],
            status=result[0],
            status_code=result[1],
        )
        for svc, result in zip(services_to_check, check_results)
    ]

    return DnsStatusResponse(
        domain=domain,
        nlb_address=nlb_address,
        cname_records=[
            CnameRecord(name=f"*.hydradb.{domain}", target=target_hint),
            CnameRecord(name=f"*.milvus.hydradb.{domain}", target=target_hint),
        ],
        services=services,
        all_healthy=all(s.status == "reachable" for s in services),
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get(
    "/{customer_id}",
    response_model=list[CustomerDeployment],
    summary="List customer deployments",
)
async def list_customer_deployments(
    customer_id: str,
    current_user: UserResponse = Depends(get_current_user),
) -> list[CustomerDeployment]:
    config = config_storage.get(current_user.id, customer_id)
    if config is None:
        _raise(
            ErrorCode.CONFIG_NOT_FOUND,
            f"Customer '{customer_id}' not found",
            http_status=404,
        )
    deployments = db.get_deployments_by_customer(customer_id)
    user_deployments = [d for d in deployments if d.get("user_id") == current_user.id]
    return [_doc_to_deployment(d) for d in user_deployments]


# ---------------------------------------------------------------------------
# List all deployments for user
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[CustomerDeployment],
    summary="List all deployments for current user",
)
async def list_all_deployments(
    current_user: UserResponse = Depends(get_current_user),
) -> list[CustomerDeployment]:
    """Return every deployment owned by the current user."""
    docs = db.get_deployments_for_user(current_user.id)
    return [_doc_to_deployment(d) for d in docs]


# ---------------------------------------------------------------------------
# Destroy
# ---------------------------------------------------------------------------


@router.post(
    "/{customer_id}/{environment}/destroy",
    response_model=DeploymentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Destroy customer infrastructure",
)
async def destroy(
    customer_id: str,
    environment: str,
    request: DestroyRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> DeploymentResponse:
    """Destroy infrastructure. Uses atomic status transition to prevent races."""
    stack_name = f"{customer_id}-{environment}"

    doc, error = db.atomic_start_destroy(
        user_id=current_user.id,
        customer_id=customer_id,
        environment=environment,
    )

    if doc is None:
        http_status, error_code = _ERROR_CODE_TO_HTTP.get(
            error, (409, ErrorCode.OPERATION_LOCKED)
        )
        _raise(error_code, f"Cannot destroy {stack_name}: {error}", http_status=http_status)

    db.clear_events(stack_name)
    db.add_event(
        stack_name,
        event_type=DeploymentEventType.DESTROY_QUEUED,
        message="Destroy queued",
    )

    from worker.celery_app import destroy_task

    task = destroy_task.delay(customer_id, environment)

    db.audit_log(
        "deployment_destroy_started",
        customer_id,
        user_id=current_user.id,
        environment=environment,
        actor=current_user.email,
    )

    return DeploymentResponse(
        customer_id=customer_id,
        environment=environment,
        stack_name=stack_name,
        status=DeploymentStatus.DESTROYING,
        message=f"Destruction queued (task_id={task.id}). Check status endpoint for progress. "
        "This operation cannot be undone.",
    )


# ---------------------------------------------------------------------------
# Addon Install
# ---------------------------------------------------------------------------


@router.post(
    "/{customer_id}/{environment}/addons/install",
    response_model=DeploymentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Install addons on a deployed cluster",
)
async def install_addons(
    customer_id: str,
    environment: str,
    current_user: UserResponse = Depends(get_current_user),
) -> DeploymentResponse:
    stack_name = f"{customer_id}-{environment}"

    existing = db.get_deployment_for_user(current_user.id, customer_id, environment)
    if not existing:
        _raise(
            ErrorCode.DEPLOYMENT_NOT_FOUND,
            f"Deployment {stack_name} not found",
            http_status=404,
        )

    if existing["status"] != DeploymentStatus.SUCCEEDED:
        _raise(
            ErrorCode.INVALID_TRANSITION,
            f"Deployment {stack_name} must be in SUCCEEDED state to install addons. "
            f"Current status: {existing['status'].value}",
        )

    from worker.celery_app import install_addons_task

    task = install_addons_task.delay(customer_id, environment)

    return DeploymentResponse(
        customer_id=customer_id,
        environment=environment,
        stack_name=stack_name,
        status=existing["status"],
        message=f"Addon install queued (task_id={task.id}). "
        "Check cluster access endpoint for SSM command status.",
    )
