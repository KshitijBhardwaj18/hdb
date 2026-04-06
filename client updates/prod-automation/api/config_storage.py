"""Customer configuration storage backed by MongoDB."""

import logging
from abc import ABC, abstractmethod
from typing import Any, Optional

from pymongo import MongoClient
from pymongo.collection import Collection

from api.models import CustomerConfigResolved
from api.settings import settings

logger = logging.getLogger(__name__)

# Sensitive field paths to encrypt/decrypt in MongoDB documents
_SENSITIVE_PATHS = [
    ("aws_config", "external_id"),
    ("mongodb_config", "atlas_client_secret"),
    ("mongodb_config", "db_password"),
    ("mongodb_config", "connection_uri"),
    ("kafka_config", "password"),
    ("addons", "argocd", "repository", "password"),
]


def _get_cipher():
    """Get Fernet cipher if encryption key is configured."""
    key = settings.config_encryption_key
    if not key:
        return None
    from cryptography.fernet import Fernet

    return Fernet(key.encode())


def _walk_path(doc: dict, path: tuple) -> tuple[Optional[dict], str]:
    """Walk a nested dict path, return (parent_dict, final_key) or (None, '') if missing."""
    obj = doc
    for key in path[:-1]:
        if not isinstance(obj, dict):
            return None, ""
        obj = obj.get(key)
        if obj is None:
            return None, ""
    return obj, path[-1]


def _encrypt_sensitive_fields(doc: dict) -> None:
    cipher = _get_cipher()
    if not cipher:
        return
    for path in _SENSITIVE_PATHS:
        parent, key = _walk_path(doc, path)
        if parent and parent.get(key):
            val = parent[key]
            if isinstance(val, str) and not val.startswith("gAAAAA"):
                parent[key] = cipher.encrypt(val.encode()).decode()


def _decrypt_sensitive_fields(doc: dict) -> None:
    cipher = _get_cipher()
    if not cipher:
        return
    for path in _SENSITIVE_PATHS:
        parent, key = _walk_path(doc, path)
        if parent and parent.get(key):
            val = parent[key]
            if isinstance(val, str) and val.startswith("gAAAAA"):
                try:
                    parent[key] = cipher.decrypt(val.encode()).decode()
                except Exception:
                    logger.warning(
                        "Failed to decrypt field %s, leaving as-is", ".".join(path)
                    )


class ConfigStorageBackend(ABC):
    @abstractmethod
    def save(self, user_id: str, customer_id: str, config: CustomerConfigResolved) -> None:
        pass

    @abstractmethod
    def get(self, user_id: str, customer_id: str) -> Optional[CustomerConfigResolved]:
        pass

    @abstractmethod
    def delete(self, user_id: str, customer_id: str) -> bool:
        pass

    @abstractmethod
    def list_by_user(self, user_id: str) -> list[CustomerConfigResolved]:
        pass

    @abstractmethod
    def exists(self, user_id: str, customer_id: str) -> bool:
        pass


class MongoConfigStorage(ConfigStorageBackend):
    """MongoDB-backed configuration storage."""

    def __init__(self, uri: str | None = None, db_name: str | None = None) -> None:
        self._uri = uri or settings.mongodb_uri
        self._db_name = db_name or settings.mongodb_database
        self._client: MongoClient[dict[str, Any]] = MongoClient(self._uri)
        self._db = self._client[self._db_name]
        self._configs: Collection[dict[str, Any]] = self._db["configs"]

        self._configs.create_index(
            [("user_id", 1), ("customer_id", 1)],
            unique=True,
        )
        self._configs.create_index("user_id")

    def save(self, user_id: str, customer_id: str, config: CustomerConfigResolved) -> None:
        doc = config.model_dump(mode="json")
        doc["customer_id"] = customer_id
        doc["user_id"] = user_id
        _encrypt_sensitive_fields(doc)
        self._configs.replace_one(
            {"user_id": user_id, "customer_id": customer_id},
            doc,
            upsert=True,
        )

    def get(self, user_id: str, customer_id: str) -> Optional[CustomerConfigResolved]:
        doc = self._configs.find_one({"user_id": user_id, "customer_id": customer_id})
        if doc is None:
            return None
        doc.pop("_id", None)
        doc.pop("user_id", None)
        _decrypt_sensitive_fields(doc)
        return CustomerConfigResolved.model_validate(doc)

    def delete(self, user_id: str, customer_id: str) -> bool:
        result = self._configs.delete_one({"user_id": user_id, "customer_id": customer_id})
        return result.deleted_count > 0

    def list_by_user(self, user_id: str) -> list[CustomerConfigResolved]:
        configs: list[CustomerConfigResolved] = []
        for doc in self._configs.find({"user_id": user_id}):
            doc.pop("_id", None)
            doc.pop("user_id", None)
            _decrypt_sensitive_fields(doc)
            try:
                configs.append(CustomerConfigResolved.model_validate(doc))
            except Exception:
                logger.warning("Skipping invalid config doc: %s", doc.get("customer_id"))
        return configs

    def exists(self, user_id: str, customer_id: str) -> bool:
        return (
            self._configs.count_documents(
                {"user_id": user_id, "customer_id": customer_id}, limit=1
            )
            > 0
        )

    def get_by_customer_id(self, customer_id: str) -> Optional[CustomerConfigResolved]:
        """Get config by customer_id only (for system/worker use, no user filter)."""
        doc = self._configs.find_one({"customer_id": customer_id})
        if doc is None:
            return None
        doc.pop("_id", None)
        doc.pop("user_id", None)
        _decrypt_sensitive_fields(doc)
        return CustomerConfigResolved.model_validate(doc)


config_storage = MongoConfigStorage()
