"""MongoDB database for tracking customer deployments."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from api.models import DeploymentEventType, DeploymentStatus, is_valid_transition
from api.settings import settings

logger = logging.getLogger(__name__)

# Reduced from 45 min to 5 min — long tasks renew the lock periodically.
LOCK_TTL_SECONDS = 300
LOCK_RENEW_SECONDS = 240  # renew before expiry

# Max deployments a single user may have active at once.
MAX_DEPLOYMENTS_PER_USER = 5


class Database:
    """MongoDB-backed database for deployment tracking."""

    def __init__(self, uri: str | None = None, db_name: str | None = None) -> None:
        self._uri = uri or settings.mongodb_uri
        self._db_name = db_name or settings.mongodb_database
        self._client: MongoClient[dict[str, Any]] = MongoClient(self._uri)
        self._db = self._client[self._db_name]
        self._deployments: Collection[dict[str, Any]] = self._db["deployments"]
        self._locks: Collection[dict[str, Any]] = self._db["locks"]
        self._users: Collection[dict[str, Any]] = self._db["users"]
        self._events: Collection[dict[str, Any]] = self._db["deployment_events"]

        self._deployments.create_index("stack_name", unique=True)
        self._deployments.create_index("customer_id")
        self._deployments.create_index("user_id")
        self._deployments.create_index("status")
        self._deployments.create_index("created_at")
        self._locks.create_index("stack_name", unique=True)
        self._locks.create_index("expires_at", expireAfterSeconds=0)
        self._users.create_index("email", unique=True)
        self._events.create_index([("stack_name", ASCENDING), ("timestamp", ASCENDING)])

    # ------------------------------------------------------------------
    # Deployment CRUD
    # ------------------------------------------------------------------

    def create_deployment(
        self,
        user_id: str,
        customer_id: str,
        environment: str,
        aws_region: str,
        role_arn: str,
    ) -> dict[str, Any]:
        stack_name = f"{customer_id}-{environment}"

        existing = self._deployments.find_one({"stack_name": stack_name})
        if existing:
            raise ValueError(f"Deployment {stack_name} already exists")

        now = datetime.now(timezone.utc)
        doc: dict[str, Any] = {
            "user_id": user_id,
            "customer_id": customer_id,
            "environment": environment,
            "stack_name": stack_name,
            "aws_region": aws_region,
            "role_arn": role_arn,
            "status": DeploymentStatus.PENDING.value,
            "addon_status": None,
            "pulumi_deployment_id": None,
            "outputs": None,
            "error_message": None,
            "created_at": now,
            "updated_at": now,
        }
        result = self._deployments.insert_one(doc)
        doc["_id"] = result.inserted_id
        doc["status"] = DeploymentStatus(doc["status"])
        return doc

    def get_deployment(
        self, customer_id: str, environment: str
    ) -> Optional[dict[str, Any]]:
        stack_name = f"{customer_id}-{environment}"
        doc = self._deployments.find_one({"stack_name": stack_name})
        if doc:
            doc["status"] = DeploymentStatus(doc["status"])
        return doc

    def get_deployment_for_user(
        self, user_id: str, customer_id: str, environment: str
    ) -> Optional[dict[str, Any]]:
        stack_name = f"{customer_id}-{environment}"
        doc = self._deployments.find_one({"stack_name": stack_name, "user_id": user_id})
        if doc:
            doc["status"] = DeploymentStatus(doc["status"])
        return doc

    def get_deployment_by_stack(self, stack_name: str) -> Optional[dict[str, Any]]:
        doc = self._deployments.find_one({"stack_name": stack_name})
        if doc:
            doc["status"] = DeploymentStatus(doc["status"])
        return doc

    # ------------------------------------------------------------------
    # Status transitions with state-machine enforcement
    # ------------------------------------------------------------------

    def transition_deployment_status(
        self,
        stack_name: str,
        to_status: DeploymentStatus,
        *,
        pulumi_deployment_id: Optional[str] = None,
        outputs: Optional[str] = None,
        error_message: Optional[str] = None,
        addon_status: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Atomically transition deployment status if the transition is valid.

        Uses ``find_one_and_update`` with a filter on current status so that
        only allowed transitions succeed.  Returns ``None`` if the transition
        was rejected (invalid source status or document not found).
        """
        # Build the set of statuses that may transition to ``to_status``
        allowed_from = [
            s.value
            for s in DeploymentStatus
            if is_valid_transition(s, to_status)
        ]

        update: dict[str, Any] = {
            "status": to_status.value,
            "updated_at": datetime.now(timezone.utc),
        }
        if pulumi_deployment_id is not None:
            update["pulumi_deployment_id"] = pulumi_deployment_id
        if outputs is not None:
            update["outputs"] = outputs
        if error_message is not None:
            update["error_message"] = error_message
        if addon_status is not None:
            update["addon_status"] = addon_status

        result = self._deployments.find_one_and_update(
            {"stack_name": stack_name, "status": {"$in": allowed_from}},
            {"$set": update},
            return_document=True,
        )
        if result:
            result["status"] = DeploymentStatus(result["status"])
            return result

        # Transition rejected — log the current state for debugging.
        current = self._deployments.find_one({"stack_name": stack_name})
        current_status = current["status"] if current else "NOT_FOUND"
        logger.warning(
            "Rejected transition %s → %s for %s (current: %s)",
            allowed_from,
            to_status.value,
            stack_name,
            current_status,
        )
        return None

    def update_deployment_status(
        self,
        stack_name: str,
        status: DeploymentStatus,
        pulumi_deployment_id: Optional[str] = None,
        outputs: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Legacy helper — delegates to transition_deployment_status."""
        return self.transition_deployment_status(
            stack_name,
            status,
            pulumi_deployment_id=pulumi_deployment_id,
            outputs=outputs,
            error_message=error_message,
        )

    def save_deployment_outputs(self, stack_name: str, outputs: str) -> None:
        """Save deployment outputs without changing status."""
        self._deployments.update_one(
            {"stack_name": stack_name},
            {"$set": {"outputs": outputs, "updated_at": datetime.now(timezone.utc)}},
        )

    def update_addon_status(
        self, stack_name: str, addon_status: str
    ) -> Optional[dict[str, Any]]:
        """Update only the addon_status field (does not change deployment status)."""
        result = self._deployments.find_one_and_update(
            {"stack_name": stack_name},
            {"$set": {"addon_status": addon_status, "updated_at": datetime.now(timezone.utc)}},
            return_document=True,
        )
        if result:
            result["status"] = DeploymentStatus(result["status"])
        return result

    # ------------------------------------------------------------------
    # Atomic deploy / destroy start (race-free)
    # ------------------------------------------------------------------

    def atomic_start_deploy(
        self,
        user_id: str,
        customer_id: str,
        environment: str,
        aws_region: str,
        role_arn: str,
    ) -> tuple[Optional[dict[str, Any]], str]:
        """Atomically create or re-queue a deployment.

        Returns ``(doc, error_message)``.  On success ``error_message`` is empty.
        On failure ``doc`` is ``None`` and ``error_message`` describes the reason.
        """
        stack_name = f"{customer_id}-{environment}"

        existing = self._deployments.find_one(
            {"stack_name": stack_name, "user_id": user_id}
        )

        if existing is None:
            # Brand-new deployment — insert
            try:
                doc = self.create_deployment(
                    user_id=user_id,
                    customer_id=customer_id,
                    environment=environment,
                    aws_region=aws_region,
                    role_arn=role_arn,
                )
                return doc, ""
            except ValueError as e:
                return None, str(e)

        current_status = DeploymentStatus(existing["status"])

        # Block if already in progress or destroying — UNLESS the lock has expired
        # (meaning the worker crashed and the deployment is stale).
        if current_status in (
            DeploymentStatus.IN_PROGRESS,
            DeploymentStatus.PENDING,
            DeploymentStatus.DESTROYING,
        ):
            lock = self._locks.find_one({"stack_name": stack_name})
            if lock is not None:
                # Lock still held → worker is alive, block the new deploy
                if current_status == DeploymentStatus.DESTROYING:
                    return None, "DEPLOYMENT_DESTROYING"
                return None, "DEPLOYMENT_IN_PROGRESS"
            # Lock expired → worker died. Reset to FAILED so we can redeploy.
            logger.warning(
                "Stale deployment detected for %s (status=%s, no lock). Resetting to FAILED.",
                stack_name,
                current_status.value,
            )
            self._deployments.update_one(
                {"stack_name": stack_name, "user_id": user_id},
                {
                    "$set": {
                        "status": DeploymentStatus.FAILED.value,
                        "error_message": "Deployment was interrupted (worker crashed or timed out)",
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            # Fall through to the redeploy logic below

        # Atomically set to PENDING only if still in a deployable state
        deployable_states = [
            DeploymentStatus.SUCCEEDED.value,
            DeploymentStatus.FAILED.value,
            DeploymentStatus.DESTROYED.value,
        ]
        now = datetime.now(timezone.utc)
        result = self._deployments.find_one_and_update(
            {"stack_name": stack_name, "user_id": user_id, "status": {"$in": deployable_states}},
            {
                "$set": {
                    "status": DeploymentStatus.PENDING.value,
                    "error_message": None,
                    "addon_status": None,
                    "updated_at": now,
                }
            },
            return_document=True,
        )
        if result:
            result["status"] = DeploymentStatus(result["status"])
            return result, ""

        # The atomic update failed — someone else changed the status in between
        refreshed = self._deployments.find_one({"stack_name": stack_name})
        if refreshed:
            return None, f"Cannot deploy: current status is {refreshed['status']}"
        return None, "Deployment not found"

    def atomic_start_destroy(
        self,
        user_id: str,
        customer_id: str,
        environment: str,
    ) -> tuple[Optional[dict[str, Any]], str]:
        """Atomically mark a deployment as DESTROYING.

        Returns ``(doc, error_code)`` where ``error_code`` is empty on success.
        """
        stack_name = f"{customer_id}-{environment}"

        destroyable_states = [
            DeploymentStatus.SUCCEEDED.value,
            DeploymentStatus.FAILED.value,
        ]
        now = datetime.now(timezone.utc)
        result = self._deployments.find_one_and_update(
            {"stack_name": stack_name, "user_id": user_id, "status": {"$in": destroyable_states}},
            {"$set": {"status": DeploymentStatus.DESTROYING.value, "updated_at": now}},
            return_document=True,
        )
        if result:
            result["status"] = DeploymentStatus(result["status"])
            return result, ""

        # Determine why it failed
        existing = self._deployments.find_one({"stack_name": stack_name, "user_id": user_id})
        if not existing:
            return None, "DEPLOYMENT_NOT_FOUND"
        current = existing["status"]

        # If stuck in an active state but lock expired → worker died, reset to FAILED
        if current in (
            DeploymentStatus.IN_PROGRESS.value,
            DeploymentStatus.PENDING.value,
            DeploymentStatus.DESTROYING.value,
        ):
            lock = self._locks.find_one({"stack_name": stack_name})
            if lock is None:
                logger.warning(
                    "Stale deployment detected for %s (status=%s, no lock). Resetting to FAILED.",
                    stack_name,
                    current,
                )
                self._deployments.update_one(
                    {"stack_name": stack_name, "user_id": user_id},
                    {
                        "$set": {
                            "status": DeploymentStatus.FAILED.value,
                            "error_message": "Operation was interrupted (worker crashed or timed out)",
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
                # Now it's FAILED → destroyable. Re-run the atomic update.
                result = self._deployments.find_one_and_update(
                    {"stack_name": stack_name, "user_id": user_id, "status": DeploymentStatus.FAILED.value},
                    {"$set": {"status": DeploymentStatus.DESTROYING.value, "updated_at": datetime.now(timezone.utc)}},
                    return_document=True,
                )
                if result:
                    result["status"] = DeploymentStatus(result["status"])
                    return result, ""
            # Lock still held → worker is alive
            if current == DeploymentStatus.DESTROYING.value:
                return None, "DEPLOYMENT_DESTROYING"
            return None, "DEPLOYMENT_IN_PROGRESS"

        if current == DeploymentStatus.DESTROYED.value:
            return None, "ALREADY_DESTROYED"
        return None, f"Cannot destroy: current status is {current}"

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_deployments_by_customer(self, customer_id: str) -> list[dict[str, Any]]:
        docs = list(self._deployments.find({"customer_id": customer_id}))
        for doc in docs:
            doc["status"] = DeploymentStatus(doc["status"])
        return docs

    def get_deployments_for_user(self, user_id: str) -> list[dict[str, Any]]:
        docs = list(self._deployments.find({"user_id": user_id}))
        for doc in docs:
            doc["status"] = DeploymentStatus(doc["status"])
        return docs

    def get_active_deployment_count(self, user_id: str) -> int:
        """Count deployments that are not in a terminal state."""
        active_statuses = [
            DeploymentStatus.PENDING.value,
            DeploymentStatus.IN_PROGRESS.value,
            DeploymentStatus.SUCCEEDED.value,
            DeploymentStatus.DESTROYING.value,
        ]
        return self._deployments.count_documents(
            {"user_id": user_id, "status": {"$in": active_statuses}}
        )

    def has_active_deployment(self, user_id: str, customer_id: str, environment: str) -> bool:
        """Check if there is a non-terminal deployment for this stack."""
        stack_name = f"{customer_id}-{environment}"
        active_statuses = [
            DeploymentStatus.PENDING.value,
            DeploymentStatus.IN_PROGRESS.value,
            DeploymentStatus.DESTROYING.value,
        ]
        return (
            self._deployments.count_documents(
                {"stack_name": stack_name, "user_id": user_id, "status": {"$in": active_statuses}},
                limit=1,
            )
            > 0
        )

    # ------------------------------------------------------------------
    # Locks
    # ------------------------------------------------------------------

    def acquire_lock(self, stack_name: str, operation: str) -> bool:
        now = datetime.now(timezone.utc)
        try:
            self._locks.insert_one(
                {
                    "stack_name": stack_name,
                    "operation": operation,
                    "acquired_at": now,
                    "expires_at": now + timedelta(seconds=LOCK_TTL_SECONDS),
                }
            )
            logger.info("Lock acquired for %s (%s)", stack_name, operation)
            return True
        except DuplicateKeyError:
            logger.warning("Lock already held for %s — cannot start %s", stack_name, operation)
            return False

    def renew_lock(self, stack_name: str) -> bool:
        """Extend the lock TTL. Call periodically during long operations."""
        now = datetime.now(timezone.utc)
        result = self._locks.update_one(
            {"stack_name": stack_name},
            {"$set": {"expires_at": now + timedelta(seconds=LOCK_TTL_SECONDS)}},
        )
        renewed = result.modified_count > 0
        if renewed:
            logger.debug("Lock renewed for %s", stack_name)
        return renewed

    def release_lock(self, stack_name: str) -> bool:
        result = self._locks.delete_one({"stack_name": stack_name})
        released = result.deleted_count > 0
        if released:
            logger.info("Lock released for %s", stack_name)
        return released

    # ------------------------------------------------------------------
    # Deployment events
    # ------------------------------------------------------------------

    def add_event(
        self,
        stack_name: str,
        event_type: DeploymentEventType,
        message: str,
        details: str | None = None,
    ) -> None:
        """Record a deployment event for real-time progress tracking."""
        self._events.insert_one(
            {
                "stack_name": stack_name,
                "event_type": event_type.value,
                "message": message,
                "details": details,
                "timestamp": datetime.now(timezone.utc),
            }
        )

    def get_events(
        self,
        stack_name: str,
        since: datetime | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Return events for a stack, optionally since a timestamp."""
        query: dict[str, Any] = {"stack_name": stack_name}
        if since is not None:
            query["timestamp"] = {"$gt": since}
        return list(
            self._events.find(query)
            .sort("timestamp", ASCENDING)
            .limit(limit)
        )

    def clear_events(self, stack_name: str) -> int:
        """Remove all events for a stack (e.g. on redeploy)."""
        result = self._events.delete_many({"stack_name": stack_name})
        return result.deleted_count

    # ------------------------------------------------------------------
    # Audit log
    # ------------------------------------------------------------------

    def audit_log(
        self,
        action: str,
        customer_id: str,
        *,
        user_id: str = "",
        environment: str = "",
        details: str = "",
        actor: str = "system",
    ) -> None:
        self._db["audit_log"].insert_one(
            {
                "action": action,
                "customer_id": customer_id,
                "user_id": user_id,
                "environment": environment,
                "details": details,
                "actor": actor,
                "timestamp": datetime.now(timezone.utc),
            }
        )


db = Database()
