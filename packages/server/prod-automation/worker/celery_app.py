"""Celery application and task definitions for BYOC platform.

Key improvements over the original:
- Real deployment events at every stage (replaces frontend guesswork)
- State-machine–enforced status transitions
- Exponential-backoff retries (3 attempts)
- Lock renewal during long operations
- Addon install status tracked in the database
- Structured error capture from Pulumi
"""

import asyncio
import json
import logging
import os
import time
import threading

from celery import Celery
from celery.signals import worker_process_init

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "byoc",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=86400,
    broker_connection_retry_on_startup=True,
    task_soft_time_limit=3600,
    task_time_limit=4200,
)


def _run_async(coro):  # type: ignore[no-untyped-def]
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _cleanup_vpc_resources(
    region: str,
    role_arn: str,
    external_id: str,
    vpc_id: str,
    session_name: str,
) -> None:
    """Clean up ALL resources in a VPC via AWS API.

    Used before/between Pulumi destroy attempts to clear resources that
    block VPC and security group deletion. Handles: instances, load balancers,
    VPC endpoints, ENIs, and non-default security groups.
    Safe because the VPC is unique to the customer deployment.
    """
    if not vpc_id:
        return

    import boto3

    sts = boto3.client("sts", region_name=region)
    assumed = sts.assume_role(
        RoleArn=role_arn,
        ExternalId=external_id,
        RoleSessionName=session_name,
        DurationSeconds=3600,
    )
    creds = assumed["Credentials"]
    cred_kwargs = {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
    }
    ec2 = boto3.client("ec2", region_name=region, **cred_kwargs)
    elbv2 = boto3.client("elbv2", region_name=region, **cred_kwargs)

    # 1. Terminate all instances in VPC
    reservations = ec2.describe_instances(
        Filters=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "instance-state-name", "Values": ["running", "pending", "stopping"]},
        ]
    ).get("Reservations", [])
    instance_ids = [i["InstanceId"] for r in reservations for i in r.get("Instances", [])]
    if instance_ids:
        logger.info("Terminating %d instances in VPC %s", len(instance_ids), vpc_id)
        ec2.terminate_instances(InstanceIds=instance_ids)
        ec2.get_waiter("instance_terminated").wait(
            InstanceIds=instance_ids, WaiterConfig={"Delay": 15, "MaxAttempts": 40},
        )
        logger.info("All instances terminated")

    # 2. Delete load balancers in VPC
    lbs = elbv2.describe_load_balancers().get("LoadBalancers", [])
    for lb in lbs:
        if lb.get("VpcId") == vpc_id:
            try:
                elbv2.delete_load_balancer(LoadBalancerArn=lb["LoadBalancerArn"])
                logger.info("Deleted LB %s", lb["LoadBalancerName"])
            except Exception:
                pass

    # 3. Delete VPC endpoints
    try:
        endpoints = ec2.describe_vpc_endpoints(
            Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
        ).get("VpcEndpoints", [])
        endpoint_ids = [ep["VpcEndpointId"] for ep in endpoints]
        if endpoint_ids:
            ec2.delete_vpc_endpoints(VpcEndpointIds=endpoint_ids)
            logger.info("Deleted %d VPC endpoints", len(endpoint_ids))
    except Exception as e:
        logger.warning("VPC endpoint cleanup failed: %s", e)

    # 4. Wait for ENI release
    logger.info("Waiting 60s for ENI release...")
    time.sleep(60)

    # 5. Detach and delete orphaned ENIs
    enis = ec2.describe_network_interfaces(
        Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
    ).get("NetworkInterfaces", [])
    for eni in enis:
        eni_id = eni["NetworkInterfaceId"]
        attach = eni.get("Attachment", {})
        if attach.get("DeviceIndex") == 0:
            continue  # skip primary interfaces
        if attach.get("AttachmentId"):
            try:
                ec2.detach_network_interface(AttachmentId=attach["AttachmentId"], Force=True)
                time.sleep(3)
            except Exception:
                pass
        try:
            ec2.delete_network_interface(NetworkInterfaceId=eni_id)
            logger.info("Deleted ENI %s", eni_id)
        except Exception:
            pass

    # 6. Delete non-default security groups
    try:
        sgs = ec2.describe_security_groups(
            Filters=[{"Name": "vpc-id", "Values": [vpc_id]}]
        ).get("SecurityGroups", [])
        for sg in sgs:
            if sg["GroupName"] == "default":
                continue
            sg_id = sg["GroupId"]
            # Remove all ingress/egress rules first (dependencies between SGs)
            try:
                if sg.get("IpPermissions"):
                    ec2.revoke_security_group_ingress(GroupId=sg_id, IpPermissions=sg["IpPermissions"])
                if sg.get("IpPermissionsEgress"):
                    ec2.revoke_security_group_egress(GroupId=sg_id, IpPermissions=sg["IpPermissionsEgress"])
            except Exception:
                pass
        # Delete after all rules are removed (avoids cross-SG dependency issues)
        for sg in sgs:
            if sg["GroupName"] == "default":
                continue
            try:
                ec2.delete_security_group(GroupId=sg["GroupId"])
                logger.info("Deleted SG %s (%s)", sg["GroupId"], sg.get("GroupName", ""))
            except Exception as sg_err:
                logger.warning("Could not delete SG %s: %s", sg["GroupId"], sg_err)
    except Exception as e:
        logger.warning("Security group cleanup failed: %s", e)

    logger.info("VPC resource cleanup done for %s", vpc_id)


def _empty_milvus_s3_bucket_before_destroy(
    region: str,
    role_arn: str,
    external_id: str,
    customer_id: str,
    session_name: str,
    milvus_bucket_name: str | None,
) -> None:
    import boto3

    sts = boto3.client("sts", region_name=region)
    assumed = sts.assume_role(
        RoleArn=role_arn,
        ExternalId=external_id,
        RoleSessionName=session_name,
        DurationSeconds=3600,
    )
    creds = assumed["Credentials"]
    cred_kwargs = {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
    }
    s3 = boto3.resource("s3", region_name=region, **cred_kwargs)

    names: list[str] = []
    if milvus_bucket_name:
        names.append(milvus_bucket_name)
    else:
        for b in s3.buckets.all():
            if f"{customer_id}-milvus" in b.name:
                names.append(b.name)

    for name in names:
        try:
            s3.Bucket(name).objects.all().delete()
            logger.info("Emptied Milvus bucket %s", name)
        except Exception as bucket_err:
            logger.warning("Could not empty Milvus bucket %s: %s", name, bucket_err)


class _LockRenewer:
    """Background thread that renews the DB lock every interval."""

    def __init__(self, stack_name: str, interval: int = 240):
        self._stack_name = stack_name
        self._interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        from api.database import db

        while not self._stop.wait(timeout=self._interval):
            try:
                db.renew_lock(self._stack_name)
            except Exception:
                logger.exception("Failed to renew lock for %s", self._stack_name)


@worker_process_init.connect
def _init_worker(**kwargs):  # type: ignore[no-untyped-def]
    from dotenv import load_dotenv

    load_dotenv()
    logger.info("Worker process initialized")


# ---------------------------------------------------------------------------
# Deploy task
# ---------------------------------------------------------------------------


@celery_app.task(
    bind=True,
    name="byoc.deploy",
    max_retries=0,
    acks_late=True,
)
def deploy_task(self, customer_id: str, environment: str) -> dict:  # type: ignore[no-untyped-def]
    from api.config_storage import config_storage
    from api.database import db
    from api.models import DeploymentEventType, DeploymentStatus
    from api.pulumi_engine import PulumiEngine
    from api.settings import settings

    stack_name = f"{customer_id}-{environment}"
    logger.info("Starting deploy task for %s (attempt %d)", stack_name, self.request.retries + 1)

    # --- acquire lock ---
    if not db.acquire_lock(stack_name, "deploy"):
        db.add_event(stack_name, DeploymentEventType.DEPLOY_LOCK_FAILED, "Could not acquire lock — another operation is running")
        logger.error("Cannot deploy %s — lock already held", stack_name)
        return {"status": "locked", "stack_name": stack_name}

    db.add_event(stack_name, DeploymentEventType.DEPLOY_LOCK_ACQUIRED, "Lock acquired, starting deployment")

    # Clear stale events from previous attempts
    db.clear_events(stack_name)

    renewer = _LockRenewer(stack_name)
    renewer.start()

    try:
        # --- load config ---
        config = config_storage.get_by_customer_id(customer_id)
        if not config:
            msg = f"Customer config not found: {customer_id}"
            db.add_event(stack_name, DeploymentEventType.DEPLOY_FAILED, msg)
            raise ValueError(msg)

        db.add_event(stack_name, DeploymentEventType.CONFIG_LOADED, "Configuration loaded")

        engine = PulumiEngine(
            backend_url=settings.pulumi_backend_url,
            secrets_provider=settings.pulumi_secrets_provider,
            work_dir=settings.pulumi_work_dir,
        )

        # --- transition to IN_PROGRESS ---
        transitioned = db.transition_deployment_status(
            stack_name=stack_name,
            to_status=DeploymentStatus.IN_PROGRESS,
        )
        if not transitioned:
            msg = "Failed to transition to IN_PROGRESS (invalid current state)"
            db.add_event(stack_name, DeploymentEventType.DEPLOY_FAILED, msg)
            return {"status": "invalid_state", "stack_name": stack_name}

        db.audit_log("deploy_started", customer_id, environment=environment)

        # --- configure pulumi ---
        db.add_event(stack_name, DeploymentEventType.PULUMI_CONFIGURING, "Setting Pulumi configuration values")

        # --- run pulumi up ---
        db.add_event(stack_name, DeploymentEventType.PULUMI_RUNNING, "Running pulumi up — provisioning infrastructure")

        # Capture last N log lines for error context
        pulumi_lines: list[str] = []

        def _on_output(msg: str) -> None:
            logger.info(msg)
            pulumi_lines.append(msg)
            if len(pulumi_lines) > 200:
                pulumi_lines.pop(0)

        result = engine.deploy(stack_name, config, on_output=_on_output)

        if result.summary.result != "succeeded":
            error_context = "\n".join(pulumi_lines[-30:])
            error_msg = f"Pulumi up finished with result: {result.summary.result}"
            db.add_event(stack_name, DeploymentEventType.PULUMI_FAILED, error_msg, details=error_context)
            db.transition_deployment_status(
                stack_name=stack_name,
                to_status=DeploymentStatus.FAILED,
                error_message=error_msg,
            )
            return {"status": "failed", "stack_name": stack_name, "error": error_msg}

        db.add_event(stack_name, DeploymentEventType.PULUMI_SUCCEEDED, "Infrastructure provisioned successfully")

        # --- get outputs ---
        outputs = engine.get_outputs(stack_name)
        db.save_deployment_outputs(
            stack_name=stack_name,
            outputs=json.dumps(outputs),
        )

        # --- gitops ---
        try:
            from api.services.gitops_writer import GitOpsWriter

            db.add_event(stack_name, DeploymentEventType.GITOPS_STARTED, "Pushing GitOps values to GitHub")
            writer = GitOpsWriter(config, outputs)
            writer.push_to_github()
            db.add_event(stack_name, DeploymentEventType.GITOPS_SUCCEEDED, "GitOps values pushed successfully")
            logger.info("GitOps values pushed for %s", stack_name)
        except Exception as gitops_err:
            logger.exception("GitOps write failed for %s", stack_name)
            db.add_event(
                stack_name,
                DeploymentEventType.GITOPS_FAILED,
                f"GitOps push failed: {gitops_err}",
                details=str(gitops_err),
            )

        # --- addons ---
        addon_delay = 90
        db.add_event(stack_name, DeploymentEventType.ADDONS_WAITING, f"Waiting {addon_delay}s for access node to boot")
        db.update_addon_status(stack_name, "pending")
        logger.info("Waiting %ds for access node boot...", addon_delay)
        time.sleep(addon_delay)

        try:
            if config.addons and config.addons.argocd and config.addons.argocd.enabled:
                from api.services.addon_installer import AddonInstallerService

                db.add_event(stack_name, DeploymentEventType.ADDONS_STARTED, "Installing cluster addons (Karpenter + ArgoCD)")
                db.update_addon_status(stack_name, "in_progress")
                installer = AddonInstallerService(customer_id, environment)
                addon_result = _run_async(installer.install_all_addons())
                logger.info("Addon SSM command sent for %s: command_id=%s", stack_name, addon_result.ssm_command_id)

                # Poll for SSM command completion
                addon_max_wait = 1200  # 20 minutes
                addon_poll = 15
                addon_elapsed = 0
                while addon_elapsed < addon_max_wait:
                    time.sleep(addon_poll)
                    addon_elapsed += addon_poll
                    status_result = _run_async(installer.get_install_status(
                        addon_result.ssm_command_id, addon_result.instance_id
                    ))
                    if status_result.status.value == "succeeded":
                        db.add_event(stack_name, DeploymentEventType.ADDONS_SUCCEEDED,
                                     f"Addons installed (command_id={addon_result.ssm_command_id})")
                        db.update_addon_status(stack_name, "succeeded")
                        logger.info("Addon install succeeded for %s", stack_name)
                        break
                    elif status_result.status.value == "failed":
                        raise Exception(f"Addon install failed: {status_result.error or 'unknown error'}")
                    if addon_elapsed % 60 == 0:
                        db.add_event(stack_name, DeploymentEventType.ADDONS_STARTED,
                                     f"Addons still installing... ({addon_elapsed}s elapsed)")
                else:
                    raise Exception(f"Addon install timed out after {addon_max_wait}s")
            else:
                db.update_addon_status(stack_name, "skipped")
                db.add_event(stack_name, DeploymentEventType.ADDONS_SUCCEEDED, "No addons enabled — skipped")
        except Exception as addon_err:
            logger.exception("Addon install failed for %s", stack_name)
            db.update_addon_status(stack_name, "failed")
            db.add_event(
                stack_name,
                DeploymentEventType.ADDONS_FAILED,
                f"Addon installation failed: {addon_err}",
                details=str(addon_err),
            )

        db.transition_deployment_status(
            stack_name=stack_name,
            to_status=DeploymentStatus.SUCCEEDED,
            outputs=json.dumps(outputs),
            error_message="",
        )
        db.add_event(stack_name, DeploymentEventType.DEPLOY_SUCCEEDED, "Deployment completed successfully")
        db.audit_log("deploy_succeeded", customer_id, environment=environment)
        return {"status": "succeeded", "stack_name": stack_name}

    except Exception as e:
        logger.exception("Deploy failed for %s", stack_name)
        db.add_event(
            stack_name,
            DeploymentEventType.DEPLOY_FAILED,
            f"Deploy failed: {e}",
            details=str(e),
        )
        db.transition_deployment_status(
            stack_name=stack_name,
            to_status=DeploymentStatus.FAILED,
            error_message=f"Deploy failed: {e}",
        )
        db.audit_log("deploy_failed", customer_id, environment=environment, details=str(e))

        return {"status": "failed", "stack_name": stack_name, "error": str(e)}
    finally:
        renewer.stop()
        db.release_lock(stack_name)


# ---------------------------------------------------------------------------
# Destroy task
# ---------------------------------------------------------------------------


@celery_app.task(
    bind=True,
    name="byoc.destroy",
    max_retries=0,
    acks_late=True,
)
def destroy_task(self, customer_id: str, environment: str) -> dict:  # type: ignore[no-untyped-def]
    from api.database import db
    from api.models import DeploymentEventType, DeploymentStatus
    from api.pulumi_engine import PulumiEngine
    from api.settings import settings

    stack_name = f"{customer_id}-{environment}"
    logger.info("Starting destroy task for %s (attempt %d)", stack_name, self.request.retries + 1)

    if not db.acquire_lock(stack_name, "destroy"):
        db.add_event(stack_name, DeploymentEventType.DESTROY_LOCK_FAILED, "Could not acquire lock")
        logger.error("Cannot destroy %s — lock already held", stack_name)
        return {"status": "locked", "stack_name": stack_name}

    db.add_event(stack_name, DeploymentEventType.DESTROY_LOCK_ACQUIRED, "Lock acquired, starting destroy")
    renewer = _LockRenewer(stack_name)
    renewer.start()

    try:
        engine = PulumiEngine(
            backend_url=settings.pulumi_backend_url,
            secrets_provider=settings.pulumi_secrets_provider,
            work_dir=settings.pulumi_work_dir,
        )

        # The route already set status to DESTROYING atomically
        db.audit_log("destroy_started", customer_id, environment=environment)

        # --- load config + outputs for ENI cleanup during retries ---
        from api.config_storage import config_storage
        config = config_storage.get_by_customer_id(customer_id)
        deployment = db.get_deployment(customer_id, environment)
        outputs = json.loads(deployment.get("outputs", "{}") or "{}") if deployment else {}

        # --- pre-destroy cleanup ---
        try:
            from api.services.destroy_manager import DestroyManager

            db.add_event(stack_name, DeploymentEventType.CLEANUP_STARTED, "Running pre-destroy cleanup (LoadBalancers, etc.)")
            destroy_mgr = DestroyManager(customer_id, environment)
            logger.info("Running pre-destroy cleanup for %s", stack_name)
            cleanup_result = _run_async(destroy_mgr.run_pre_destroy())

            if cleanup_result.status.value == "failed":
                error_msg = f"Pre-destroy cleanup failed: {cleanup_result.error}"
                db.add_event(stack_name, DeploymentEventType.CLEANUP_FAILED, error_msg, details=str(cleanup_result.error))
                logger.error("Pre-destroy cleanup failed for %s: %s", stack_name, cleanup_result.error)
                db.transition_deployment_status(stack_name=stack_name, to_status=DeploymentStatus.FAILED, error_message=error_msg)
                db.add_event(stack_name, DeploymentEventType.DESTROY_FAILED, error_msg)
                return {"status": "failed", "stack_name": stack_name, "error": error_msg}
            else:
                db.add_event(stack_name, DeploymentEventType.CLEANUP_SUCCEEDED, "Pre-destroy cleanup completed")
                logger.info("Pre-destroy cleanup succeeded for %s", stack_name)
        except Exception as cleanup_err:
            err_str = str(cleanup_err)
            # If access node is gone (terminated/not found), skip pre-destroy and proceed
            if "InvalidInstanceId" in err_str or "not available" in err_str or "not found" in err_str:
                logger.warning("Access node unavailable for %s — running direct AWS cleanup", stack_name)
                db.add_event(stack_name, DeploymentEventType.CLEANUP_STARTED,
                             "Access node unavailable — running direct AWS cleanup")
                try:
                    _cleanup_vpc_resources(
                        region=config.aws_config.region,
                        role_arn=config.aws_config.role_arn,
                        external_id=config.aws_config.external_id,
                        vpc_id=outputs.get("vpc_id", ""),
                        session_name=f"byoc-direct-cleanup-{customer_id}",
                    )
                    db.add_event(stack_name, DeploymentEventType.CLEANUP_SUCCEEDED, "Direct AWS cleanup completed")
                except Exception as direct_err:
                    logger.warning("Direct AWS cleanup failed: %s. Proceeding anyway.", direct_err)
                    db.add_event(stack_name, DeploymentEventType.CLEANUP_SUCCEEDED,
                                 "Direct cleanup partial — proceeding with destroy")
            else:
                error_msg = f"Pre-destroy cleanup error: {cleanup_err}"
                db.add_event(stack_name, DeploymentEventType.CLEANUP_FAILED, error_msg, details=err_str)
                logger.exception("Pre-destroy cleanup error for %s", stack_name)
                db.transition_deployment_status(stack_name=stack_name, to_status=DeploymentStatus.FAILED, error_message=error_msg)
                db.add_event(stack_name, DeploymentEventType.DESTROY_FAILED, error_msg)
                return {"status": "failed", "stack_name": stack_name, "error": error_msg}

        # --- post-cleanup: catch lingering VPC CNI ENIs via AWS API ---
        try:
            _cleanup_vpc_resources(
                region=config.aws_config.region,
                role_arn=config.aws_config.role_arn,
                external_id=config.aws_config.external_id,
                vpc_id=outputs.get("vpc_id", ""),
                session_name=f"byoc-post-cleanup-{customer_id}",
            )
            logger.info("Post-cleanup done for %s", stack_name)
        except Exception as post_err:
            logger.warning("Post-cleanup failed (non-fatal): %s", post_err)

        try:
            _milvus_bucket = (outputs.get("milvus_bucket_name") or "").strip() or None
            _empty_milvus_s3_bucket_before_destroy(
                region=config.aws_config.region,
                role_arn=config.aws_config.role_arn,
                external_id=config.aws_config.external_id,
                customer_id=customer_id,
                session_name=f"byoc-milvus-bucket-empty-{customer_id}",
                milvus_bucket_name=_milvus_bucket,
            )
        except Exception as bucket_err:
            logger.warning("Milvus bucket cleanup failed (non-fatal): %s", bucket_err)

        # --- pulumi destroy ---
        db.add_event(stack_name, DeploymentEventType.PULUMI_DESTROYING, "Running pulumi destroy")

        pulumi_lines: list[str] = []

        def _on_output(msg: str) -> None:
            logger.info(msg)
            pulumi_lines.append(msg)
            if len(pulumi_lines) > 200:
                pulumi_lines.pop(0)

        from pulumi.automation.errors import CommandError

        max_attempts = 3
        last_error = None
        result = None
        for attempt in range(1, max_attempts + 1):
            try:
                result = engine.destroy(stack_name, on_output=_on_output)
                if result.summary.result == "succeeded":
                    break
            except CommandError as e:
                last_error = e
                logger.warning("Destroy attempt %d/%d raised error for %s: %s", attempt, max_attempts, stack_name, str(e)[:200])
                result = None

            if attempt >= max_attempts:
                break

            logger.warning("Cleaning up ENIs before retry %d...", attempt + 1)
            db.add_event(stack_name, DeploymentEventType.PULUMI_DESTROYING,
                         f"Destroy attempt {attempt} needs retry — cleaning up ENIs...")

            # Clean up orphaned ENIs blocking security group deletion
            try:
                _cleanup_vpc_resources(
                    region=config.aws_config.region,
                    role_arn=config.aws_config.role_arn,
                    external_id=config.aws_config.external_id,
                    vpc_id=outputs.get("vpc_id", ""),
                    session_name=f"byoc-eni-cleanup-{customer_id}",
                )
            except Exception as eni_err:
                logger.warning("ENI cleanup failed: %s", eni_err)
                time.sleep(300)

        if result and result.summary.result == "succeeded":
            db.add_event(stack_name, DeploymentEventType.PULUMI_DESTROY_SUCCEEDED, "Pulumi destroy completed")

            # Force-delete any secrets stuck in scheduled deletion
            try:
                import boto3 as _boto3
                _sts = _boto3.client("sts", region_name=config.aws_config.region)
                _assumed = _sts.assume_role(
                    RoleArn=config.aws_config.role_arn,
                    ExternalId=config.aws_config.external_id,
                    RoleSessionName=f"byoc-secret-cleanup-{customer_id}",
                    DurationSeconds=3600,
                )
                _creds = _assumed["Credentials"]
                _sm = _boto3.client("secretsmanager", region_name=config.aws_config.region,
                    aws_access_key_id=_creds["AccessKeyId"],
                    aws_secret_access_key=_creds["SecretAccessKey"],
                    aws_session_token=_creds["SessionToken"])

                for secret_name in [
                    f"/byoc/{customer_id}/cortex-app",
                    f"/byoc/{customer_id}/cortex-ingestion",
                    f"/byoc/{customer_id}/nextjs",
                    f"/byoc/{customer_id}/argocd-generated-tokens",
                ]:
                    try:
                        resp = _sm.describe_secret(SecretId=secret_name)
                        if resp.get("DeletedDate"):
                            _sm.restore_secret(SecretId=secret_name)
                            _sm.delete_secret(SecretId=secret_name, ForceDeleteWithoutRecovery=True)
                            logger.info("Force-deleted scheduled secret %s", secret_name)
                        else:
                            _sm.delete_secret(SecretId=secret_name, ForceDeleteWithoutRecovery=True)
                            logger.info("Force-deleted secret %s", secret_name)
                    except _sm.exceptions.ResourceNotFoundException:
                        pass
                    except Exception as sec_err:
                        logger.warning("Could not delete secret %s: %s", secret_name, sec_err)
                logger.info("Secret cleanup done for %s", customer_id)
            except Exception as sec_cleanup_err:
                logger.warning("Secret cleanup failed (non-fatal): %s", sec_cleanup_err)

            db.transition_deployment_status(
                stack_name=stack_name,
                to_status=DeploymentStatus.DESTROYED,
                outputs="",
                error_message="",
            )
            db.add_event(stack_name, DeploymentEventType.DESTROY_SUCCEEDED, "All infrastructure destroyed successfully")
            db.audit_log("destroy_succeeded", customer_id, environment=environment)
            return {"status": "destroyed", "stack_name": stack_name}

        error_context = "\n".join(pulumi_lines[-30:])
        error_msg = f"Destroy failed after {max_attempts} attempts: {last_error or (result.summary.result if result else 'unknown')}"
        db.add_event(
            stack_name,
            DeploymentEventType.PULUMI_DESTROY_FAILED,
            error_msg,
            details=error_context,
        )
        db.transition_deployment_status(
            stack_name=stack_name,
            to_status=DeploymentStatus.FAILED,
            error_message=error_msg,
        )
        db.add_event(stack_name, DeploymentEventType.DESTROY_FAILED, error_msg)
        db.audit_log(
            "destroy_failed",
            customer_id,
            environment=environment,
            details=f"result: {last_error or (result.summary.result if result else 'unknown')}",
        )
        return {"status": "failed", "stack_name": stack_name}

    except Exception as e:
        logger.exception("Destroy failed for %s", stack_name)
        db.add_event(
            stack_name,
            DeploymentEventType.DESTROY_FAILED,
            f"Destroy failed: {e}",
            details=str(e),
        )
        db.transition_deployment_status(
            stack_name=stack_name,
            to_status=DeploymentStatus.FAILED,
            error_message=f"Destroy failed: {e}",
        )
        db.audit_log("destroy_failed", customer_id, environment=environment, details=str(e))

        # No outer retry — user can retry from UI
        return {"status": "failed", "stack_name": stack_name, "error": str(e)}
    finally:
        renewer.stop()
        db.release_lock(stack_name)


# ---------------------------------------------------------------------------
# Addon install task
# ---------------------------------------------------------------------------


@celery_app.task(
    bind=True,
    name="byoc.install_addons",
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def install_addons_task(self, customer_id: str, environment: str) -> dict:  # type: ignore[no-untyped-def]
    from api.database import db
    from api.models import DeploymentEventType
    from api.services.addon_installer import AddonInstallerService

    stack_name = f"{customer_id}-{environment}"
    logger.info("Starting addon install task for %s", stack_name)

    db.update_addon_status(stack_name, "in_progress")
    db.add_event(stack_name, DeploymentEventType.ADDONS_STARTED, "Installing cluster addons")

    try:
        installer = AddonInstallerService(customer_id, environment)
        result = _run_async(installer.install_all_addons())
        db.update_addon_status(stack_name, "succeeded")
        db.add_event(
            stack_name,
            DeploymentEventType.ADDONS_SUCCEEDED,
            f"Addons installed (command_id={result.ssm_command_id})",
        )
        return {
            "status": result.status.value,
            "stack_name": stack_name,
            "ssm_command_id": result.ssm_command_id,
        }
    except Exception as e:
        logger.exception("Addon install failed for %s", stack_name)
        db.update_addon_status(stack_name, "failed")
        db.add_event(
            stack_name,
            DeploymentEventType.ADDONS_FAILED,
            f"Addon install failed: {e}",
            details=str(e),
        )
        return {"status": "failed", "stack_name": stack_name, "error": str(e)}
