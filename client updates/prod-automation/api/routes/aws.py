"""AWS connection testing endpoints."""

import logging
import urllib.error
import urllib.parse
import urllib.request

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth_models import UserResponse
from api.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/aws",
    tags=["aws"],
    dependencies=[Depends(get_current_user)],
)


class TestConnectionRequest(BaseModel):
    role_arn: str = Field(
        ...,
        description="IAM role ARN to assume",
        pattern=r"^arn:aws:iam::\d{12}:role/.+$",
    )
    external_id: str = Field(
        ...,
        description="External ID for secure role assumption",
        min_length=10,
    )
    region: str = Field(default="us-east-1", description="AWS region")


class TestConnectionSuccess(BaseModel):
    status: str = "connected"
    account_id: str
    assumed_role_arn: str
    region: str
    vcpu_quota: int | None = None
    vcpu_warning: str | None = None


class TestConnectionFailure(BaseModel):
    status: str = "failed"
    error: str


@router.post(
    "/test-connection",
    response_model=TestConnectionSuccess,
    responses={403: {"model": TestConnectionFailure}},
    summary="Test AWS cross-account role assumption",
)
async def test_connection(
    request: TestConnectionRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Test AWS connection by attempting to assume the provided IAM role.
    Uses STS AssumeRole and then calls GetCallerIdentity to verify access.
    """
    try:
        sts = boto3.client("sts", region_name=request.region)

        assumed = sts.assume_role(
            RoleArn=request.role_arn,
            ExternalId=request.external_id,
            RoleSessionName="hydradb-connection-test",
            DurationSeconds=900,
        )

        creds = assumed["Credentials"]

        # Verify by calling GetCallerIdentity with assumed credentials
        assumed_sts = boto3.client(
            "sts",
            region_name=request.region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )

        identity = assumed_sts.get_caller_identity()

        # Check vCPU quota (best-effort)
        vcpu_quota = None
        vcpu_warning = None
        try:
            sq = boto3.client(
                "service-quotas",
                region_name=request.region,
                aws_access_key_id=creds["AccessKeyId"],
                aws_secret_access_key=creds["SecretAccessKey"],
                aws_session_token=creds["SessionToken"],
            )
            quota_resp = sq.get_service_quota(
                ServiceCode="ec2",
                QuotaCode="L-1216C47A",
            )
            vcpu_quota = int(quota_resp["Quota"]["Value"])
            if vcpu_quota < 32:
                vcpu_warning = (
                    f"Your account has a {vcpu_quota} vCPU limit. "
                    "HydraDB requires at least 32 vCPUs. "
                    "Request an increase at AWS Console → Service Quotas → EC2 → "
                    "Running On-Demand Standard instances."
                )
        except Exception as quota_err:
            logger.warning(
                "Could not check vCPU quota for role %s in %s: %s",
                request.role_arn, request.region, quota_err,
            )
            vcpu_warning = (
                "Could not check vCPU quota — ensure the role has "
                "servicequotas:GetServiceQuota permission. "
                "HydraDB requires at least 32 vCPUs (EC2 On-Demand Standard)."
            )

        return TestConnectionSuccess(
            status="connected",
            account_id=identity["Account"],
            assumed_role_arn=identity["Arn"],
            region=request.region,
            vcpu_quota=vcpu_quota,
            vcpu_warning=vcpu_warning,
        )

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_msg = e.response["Error"]["Message"]
        logger.warning(
            "AWS connection test failed for role %s: %s - %s",
            request.role_arn,
            error_code,
            error_msg,
        )

        if error_code == "AccessDenied":
            detail = "Access denied — check trust policy and external ID"
        elif error_code == "MalformedPolicyDocument":
            detail = "Malformed trust policy on the IAM role"
        elif error_code == "RegionDisabledException":
            detail = f"Region {request.region} is not enabled in the target account"
        else:
            detail = f"{error_code}: {error_msg}"

        raise HTTPException(status_code=403, detail=detail)

    except NoCredentialsError:
        logger.error("Platform AWS credentials not configured")
        raise HTTPException(
            status_code=500,
            detail="Platform AWS credentials are not configured. Contact support.",
        )

    except Exception as e:
        logger.exception("Unexpected error during AWS connection test")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Atlas connection test
# ---------------------------------------------------------------------------


class TestAtlasRequest(BaseModel):
    atlas_client_id: str = Field(..., description="Atlas Service Account client ID")
    atlas_client_secret: str = Field(..., description="Atlas Service Account client secret")
    atlas_org_id: str = Field(..., description="Atlas Organization ID")
    customer_id: str = Field(default="", description="Optional: check for existing project/user")
    db_username: str = Field(default="", description="Optional: check if this database username exists")


class TestAtlasSuccess(BaseModel):
    status: str = "connected"
    org_name: str
    project_count: int
    project_exists: bool = False
    db_user_exists: bool = False
    warnings: list[str] = []


@router.post(
    "/test-atlas-connection",
    response_model=TestAtlasSuccess,
    responses={403: {"model": TestConnectionFailure}},
    summary="Test MongoDB Atlas credentials",
)
async def test_atlas_connection(
    request: TestAtlasRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Test Atlas Service Account credentials by listing projects in the org."""
    import urllib.request
    import urllib.parse
    import json
    import base64

    try:
        # Get OAuth2 token
        token_data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
        creds = base64.b64encode(
            f"{request.atlas_client_id}:{request.atlas_client_secret}".encode()
        ).decode()

        token_req = urllib.request.Request(
            "https://cloud.mongodb.com/api/oauth/token", data=token_data
        )
        token_req.add_header("Content-Type", "application/x-www-form-urlencoded")
        token_req.add_header("Authorization", f"Basic {creds}")

        token_resp = json.loads(urllib.request.urlopen(token_req).read())
        access_token = token_resp["access_token"]

        # Verify org access
        org_req = urllib.request.Request(
            f"https://cloud.mongodb.com/api/atlas/v2/orgs/{request.atlas_org_id}"
        )
        org_req.add_header("Authorization", f"Bearer {access_token}")
        org_req.add_header("Accept", "application/vnd.atlas.2023-01-01+json")

        org_resp = json.loads(urllib.request.urlopen(org_req).read())
        org_name = org_resp.get("name", "Unknown")

        # Count projects
        projects_req = urllib.request.Request(
            "https://cloud.mongodb.com/api/atlas/v2/groups?itemsPerPage=100"
        )
        projects_req.add_header("Authorization", f"Bearer {access_token}")
        projects_req.add_header("Accept", "application/vnd.atlas.2023-01-01+json")

        projects_resp = json.loads(urllib.request.urlopen(projects_req).read())
        project_count = projects_resp.get("totalCount", 0)

        # Check for existing project and db user
        project_exists = False
        db_user_exists = False
        warnings: list[str] = []

        if request.customer_id:
            project_name = f"{request.customer_id}-cortex"
            project_id = None
            for p in projects_resp.get("results", []):
                if p.get("name") == project_name:
                    project_exists = True
                    project_id = p.get("id")
                    warnings.append(
                        f"Atlas project '{project_name}' already exists. "
                        "Delete it in Atlas console before deploying, or use a different customer ID."
                    )
                    break

            if project_id and request.db_username:
                try:
                    user_req = urllib.request.Request(
                        f"https://cloud.mongodb.com/api/atlas/v2/groups/{project_id}/databaseUsers/admin/{request.db_username}"
                    )
                    user_req.add_header("Authorization", f"Bearer {access_token}")
                    user_req.add_header("Accept", "application/vnd.atlas.2023-01-01+json")
                    urllib.request.urlopen(user_req)
                    db_user_exists = True
                    warnings.append(
                        f"Database user '{request.db_username}' already exists in project '{project_name}'. "
                        "Use a different username or delete the existing one."
                    )
                except urllib.error.HTTPError as e:
                    if e.code == 404:
                        db_user_exists = False

        return TestAtlasSuccess(
            status="connected",
            org_name=org_name,
            project_count=project_count,
            project_exists=project_exists,
            db_user_exists=db_user_exists,
            warnings=warnings,
        )

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise HTTPException(
            status_code=403,
            detail=TestConnectionFailure(
                status="failed",
                error=f"Atlas API returned {e.code}: {body}",
            ).model_dump(),
        )
    except Exception as e:
        raise HTTPException(
            status_code=403,
            detail=TestConnectionFailure(
                status="failed",
                error=str(e),
            ).model_dump(),
        )
