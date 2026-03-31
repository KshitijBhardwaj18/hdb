import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_settings_logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Pulumi S3 backend
    pulumi_backend_url: str = ""
    pulumi_secrets_provider: str = ""
    pulumi_work_dir: str = "."

    # AWS credentials
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"

    # MongoDB
    mongodb_uri: str = ""
    mongodb_database: str = "byoc_platform"

    # Redis (Celery broker)
    redis_url: str = "redis://redis:6379/0"

    # Config storage — kept for backward compat but now backed by MongoDB
    config_storage_path: str = "config"

    # Encryption key for sensitive config fields (Fernet)
    config_encryption_key: str = ""

    # GitHub (for GitOps writer)
    github_pat: str = ""
    github_repo: str = ""
    github_branch: str = "main"

    # Auth / JWT
    jwt_secret: str = ""
    jwt_expires_in_hours: int = 168  # 7 days

    # Deployment limits
    max_deployments_per_user: int = 5

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Platform-managed secrets (from .env, not from customer)
    falkordb_password: str = ""
    milvus_token: str = ""

    # NextJS platform secrets
    nextjs_nextauth_secret: str = ""
    nextjs_google_client_id: str = ""
    nextjs_google_client_secret: str = ""
    nextjs_auth_dynamodb_id: str = ""
    nextjs_auth_dynamodb_secret: str = ""
    nextjs_aws_config: str = ""
    nextjs_mcp_encryption_key: str = ""
    nextjs_resend_api_key: str = ""
    nextjs_stripe_secret_key: str = ""
    nextjs_frontend_config: str = ""
    nextjs_nextauth_url: str = ""
    nextjs_auth_dynamodb_region: str = "us-east-1"
    nextjs_email_from: str = ""



@lru_cache
def get_settings() -> Settings:
    s = Settings()
    missing = []
    if not s.pulumi_backend_url:
        missing.append("PULUMI_BACKEND_URL")
    if not s.pulumi_secrets_provider:
        missing.append("PULUMI_SECRETS_PROVIDER")
    if not s.mongodb_uri:
        missing.append("MONGODB_URI")
    if not s.jwt_secret:
        missing.append("JWT_SECRET")
    if not s.falkordb_password:
        missing.append("FALKORDB_PASSWORD")
    if not s.milvus_token:
        missing.append("MILVUS_TOKEN")
    if not s.github_pat:
        missing.append("GITHUB_PAT")
    if not s.github_repo:
        missing.append("GITHUB_REPO")
    if not s.config_encryption_key:
        _settings_logger.warning(
            "CONFIG_ENCRYPTION_KEY is not set — sensitive config fields will be "
            "stored in PLAINTEXT in MongoDB. Generate one with: "
            'python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    if missing:
        _settings_logger.warning(
            "Missing required environment variables: %s. "
            "Set them in the .env file before deploying.",
            ", ".join(missing),
        )
    return s


settings = get_settings()
