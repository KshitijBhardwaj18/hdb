"""FastAPI application for BYOC Platform."""

from dotenv import load_dotenv

load_dotenv()

import logging
import uuid

logging.basicConfig(level=logging.INFO)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from api.routes.auth import router as auth_router
from api.routes.aws import router as aws_router
from api.routes.configs import router as configs_router
from api.routes.deployments import router as deployments_router
from api.routes.cluster import router as cluster_router
from api.settings import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cortex Prod automation",
    description="Multi-tenant infrastructure deployment API. "
    "Manage customer configurations and deploy EKS infrastructure.",
    version="2.0.0",
)


# ---------------------------------------------------------------------------
# Request ID middleware — attaches X-Request-ID to every response
# ---------------------------------------------------------------------------


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handler — catch unhandled errors and return structured JSON
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(
        "Unhandled exception [request_id=%s]: %s",
        request_id,
        exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. Please try again or contact support.",
            "request_id": request_id,
        },
    )


app.include_router(auth_router)
app.include_router(aws_router)
app.include_router(configs_router)
app.include_router(deployments_router)
app.include_router(cluster_router)


@app.get("/health", tags=["health"])
async def health_check():  # type: ignore[no-untyped-def]
    """Health check endpoint."""
    checks: dict[str, str] = {}

    try:
        from api.database import db

        db._client.admin.command("ping")
        checks["mongodb"] = "ok"
    except Exception as e:
        checks["mongodb"] = f"error: {e}"

    try:
        import redis as redis_lib

        from api.settings import settings

        r = redis_lib.from_url(settings.redis_url, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    try:
        from worker.celery_app import celery_app as celery

        inspector = celery.control.inspect(timeout=2)
        active = inspector.active_queues()
        if active:
            checks["celery"] = f"ok ({len(active)} worker(s))"
        else:
            checks["celery"] = "no workers"
    except Exception as e:
        checks["celery"] = f"error: {e}"

    all_ok = all(v.startswith("ok") for v in checks.values())
    result = {"status": "healthy" if all_ok else "degraded", "checks": checks}

    if not all_ok:
        return JSONResponse(status_code=503, content=result)
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
