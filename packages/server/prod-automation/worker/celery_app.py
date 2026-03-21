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
    max_retries=3,
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

        # --- clean up orphaned Secrets Manager secrets from previous failed deploys ---
        try:
            import boto3

            sts = boto3.client("sts", region_name=config.aws_config.region)
            assumed = sts.assume_role(
                RoleArn=config.aws_config.role_arn,
                ExternalId=config.aws_config.external_id,
                RoleSessionName=f"byoc-cleanup-{customer_id}",
                DurationSeconds=900,
            )
            creds = assumed["Credentials"]
            sm = boto3.client(
                "secretsmanager",
                region_name=config.aws_config.region,
                aws_access_key_id=creds["AccessKeyId"],
                aws_secret_access_key=creds["SecretAccessKey"],
                aws_session_token=creds["SessionToken"],
            )
            for secret_suffix in ["cortex-app", "cortex-ingestion", "nextjs", "argocd-generated-tokens"]:
                secret_name = f"/byoc/{customer_id}/{secret_suffix}"
                try:
                    sm.describe_secret(SecretId=secret_name)
                    sm.delete_secret(SecretId=secret_name, ForceDeleteWithoutRecovery=True)
                    logger.info("Cleaned up orphaned secret: %s", secret_name)
                except sm.exceptions.ResourceNotFoundException:
                    pass
                except Exception as e:
                    logger.warning("Could not clean up secret %s: %s", secret_name, e)
        except Exception as e:
            logger.warning("Pre-deploy secret cleanup failed (non-fatal): %s", e)

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
        db.transition_deployment_status(
            stack_name=stack_name,
            to_status=DeploymentStatus.SUCCEEDED,
            outputs=json.dumps(outputs),
            error_message="",
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
                db.add_event(
                    stack_name,
                    DeploymentEventType.ADDONS_SUCCEEDED,
                    f"Addons installed (command_id={addon_result.ssm_command_id})",
                )
                db.update_addon_status(stack_name, "succeeded")
                logger.info("Addon install for %s: command_id=%s", stack_name, addon_result.ssm_command_id)
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

        # Retry with exponential backoff: 30s, 120s, 300s
        if self.request.retries < self.max_retries:
            delay = 30 * (4 ** self.request.retries)  # 30, 120, 480
            logger.info("Retrying deploy for %s in %ds (attempt %d)", stack_name, delay, self.request.retries + 2)
            # Release lock so the retry can re-acquire it
            db.release_lock(stack_name)
            renewer.stop()
            # Reset status to PENDING for retry
            db.transition_deployment_status(stack_name=stack_name, to_status=DeploymentStatus.PENDING)
            raise self.retry(countdown=delay, exc=e)

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
    max_retries=2,
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

        # --- pre-destroy cleanup ---
        try:
            from api.services.destroy_manager import DestroyManager

            db.add_event(stack_name, DeploymentEventType.CLEANUP_STARTED, "Running pre-destroy cleanup (LoadBalancers, etc.)")
            destroy_mgr = DestroyManager(customer_id, environment)
            logger.info("Running pre-destroy cleanup for %s", stack_name)
            cleanup_result = _run_async(destroy_mgr.run_pre_destroy())

            if cleanup_result.status.value == "failed":
                db.add_event(
                    stack_name,
                    DeploymentEventType.CLEANUP_FAILED,
                    f"Pre-destroy cleanup failed: {cleanup_result.error}. Proceeding with destroy.",
                    details=str(cleanup_result.error),
                )
                logger.warning("Pre-destroy cleanup failed for %s: %s", stack_name, cleanup_result.error)
            else:
                db.add_event(stack_name, DeploymentEventType.CLEANUP_SUCCEEDED, "Pre-destroy cleanup completed")
                logger.info("Pre-destroy cleanup succeeded for %s", stack_name)
        except Exception as cleanup_err:
            db.add_event(
                stack_name,
                DeploymentEventType.CLEANUP_FAILED,
                f"Pre-destroy cleanup error: {cleanup_err}. Proceeding with destroy.",
                details=str(cleanup_err),
            )
            logger.exception("Pre-destroy cleanup error for %s", stack_name)

        # --- pulumi destroy ---
        db.add_event(stack_name, DeploymentEventType.PULUMI_DESTROYING, "Running pulumi destroy")

        pulumi_lines: list[str] = []

        def _on_output(msg: str) -> None:
            logger.info(msg)
            pulumi_lines.append(msg)
            if len(pulumi_lines) > 200:
                pulumi_lines.pop(0)

        max_attempts = 3
        result = None
        for attempt in range(1, max_attempts + 1):
            result = engine.destroy(stack_name, on_output=_on_output)
            if result.summary.result == "succeeded":
                break
            if attempt < max_attempts:
                logger.warning(
                    "Destroy attempt %d/%d failed for %s. Waiting 5min for AWS cleanup...",
                    attempt, max_attempts, stack_name,
                )
                db.add_event(stack_name, DeploymentEventType.PULUMI_DESTROY_FAILED,
                             f"Destroy attempt {attempt} failed, retrying in 5 minutes...")
                time.sleep(300)

        if result.summary.result == "succeeded":
            db.add_event(stack_name, DeploymentEventType.PULUMI_DESTROY_SUCCEEDED, "Pulumi destroy completed")
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
        error_msg = f"Destroy failed after {max_attempts} attempts: {result.summary.result}"
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
            details=f"result: {result.summary.result}",
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

        if self.request.retries < self.max_retries:
            delay = 30 * (4 ** self.request.retries)
            db.release_lock(stack_name)
            renewer.stop()
            # Re-set to DESTROYING for retry
            db.transition_deployment_status(stack_name=stack_name, to_status=DeploymentStatus.DESTROYING)
            raise self.retry(countdown=delay, exc=e)

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
