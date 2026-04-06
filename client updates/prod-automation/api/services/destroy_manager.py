import asyncio
import logging
import time

from botocore.exceptions import ClientError

from api.models import AddonInstallResult, AddonInstallStatus
from api.services.addon_installer import AddonInstallerService


logger = logging.getLogger(__name__)


class DestroyManager(AddonInstallerService):
    """Handles pre-destroy cleanup before Pulumi destroy.

    Inherits from AddonInstallerService to reuse SSM client, config,
    deployment outputs, and state management.
    """

    def _build_pre_destroy_script(self) -> str:
        cluster_name = self.outputs.get("eks_cluster_name")
        region = self.config.aws_config.region

        return f"""#!/bin/bash
set -o pipefail

export PATH="/usr/local/bin:$PATH"
export HOME="${{HOME:-/root}}"
mkdir -p "$HOME/.kube"
export KUBECONFIG="$HOME/.kube/config"

CLUSTER_NAME="{cluster_name}"
REGION="{region}"

echo "==> Configuring kubectl for $CLUSTER_NAME in $REGION..."
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION"

echo "==> Starting lean pre-destroy cleanup..."

# =============================================================================
# PHASE 1: Delete LoadBalancer services (NLB target deregistration needs time)
# =============================================================================
echo "==> Phase 1: Deleting LoadBalancer services..."
kubectl delete svc -n nginx-inc --all --timeout=60s 2>/dev/null || true
kubectl get svc -A -o json 2>/dev/null | \\
    jq -r '.items[] | select(.spec.type=="LoadBalancer") | "\\(.metadata.namespace)/\\(.metadata.name)"' | \\
    while read svc; do
        NS="${{svc%%/*}}"
        NAME="${{svc##*/}}"
        kubectl delete svc "$NAME" -n "$NS" --timeout=60s 2>/dev/null || true
    done
echo "==> Waiting 60s for NLB deregistration..."
sleep 60

# =============================================================================
# PHASE 2: Delete ArgoCD applications (patch finalizers first, then delete)
# =============================================================================
echo "==> Phase 2: Deleting ArgoCD applications..."
if kubectl get namespace argocd &>/dev/null; then
    for app in $(kubectl get applications -n argocd -o name 2>/dev/null); do
        kubectl patch "$app" -n argocd --type merge -p '{{"metadata":{{"finalizers":null}}}}' 2>/dev/null || true
    done
    kubectl delete applications --all -n argocd --timeout=60s 2>/dev/null || true
fi
echo "==> ArgoCD applications deleted!"

# =============================================================================
# PHASE 3: Delete Karpenter nodes (ENI cleanup)
# =============================================================================
echo "==> Phase 3: Deleting Karpenter managed nodes..."
kubectl delete nodepools --all --timeout=60s 2>/dev/null || true
kubectl delete ec2nodeclasses --all --timeout=60s 2>/dev/null || true

TIMEOUT=180
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    BOOTSTRAP_COUNT=$(kubectl get nodes -l eks.amazonaws.com/nodegroup --no-headers 2>/dev/null | wc -l)
    KARPENTER_NODES=$((NODE_COUNT - BOOTSTRAP_COUNT))
    if [ "$KARPENTER_NODES" -le 0 ] 2>/dev/null; then
        echo "==> All Karpenter nodes terminated!"
        break
    fi
    echo "    $KARPENTER_NODES Karpenter nodes remaining..."
    sleep 10
    ELAPSED=$((ELAPSED + 10))
done
if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "==> WARNING: Timeout waiting for Karpenter nodes. Proceeding anyway."
fi

# =============================================================================
# PHASE 4: Delete CRD instances (prevents finalizer deadlocks during destroy)
# =============================================================================
echo "==> Phase 4: Deleting CRD instances..."
kubectl delete clusters.apps.kubeblocks.io --all -A --timeout=60s 2>/dev/null || true
kubectl delete milvus --all -A --timeout=60s 2>/dev/null || true
kubectl delete clickhouseinstallations --all -A --timeout=60s 2>/dev/null || true
kubectl delete clusterissuers --all --timeout=30s 2>/dev/null || true
kubectl delete externalsecrets --all -A --timeout=30s 2>/dev/null || true

# =============================================================================
# PHASE 5: Wait for ENIs to release
# =============================================================================
echo "==> Phase 5: Waiting 60s for ENIs to release..."
sleep 60

echo "==> Pre-destroy cleanup complete! Safe to run pulumi destroy."
"""

    def _run_pre_destroy_sync(self) -> AddonInstallResult:
        instance_id = self.outputs.get("access_node_instance_id")
        cluster_name = self.outputs.get("eks_cluster_name")

        if not instance_id:
            raise ValueError("SSM access node is not available in deployment outputs")
        if not cluster_name:
            raise ValueError("EKS cluster name not found in deployment outputs")

        script = self._build_pre_destroy_script()
        ssm = self._get_client("ssm")

        response = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": script.split("\n")},
            TimeoutSeconds=1800,
            Comment=f"Pre-destroy cleanup for {self.customer_id}-{self.environment}",
        )

        command_id = response["Command"]["CommandId"]
        self._save_addon_state("pre-destroy", command_id, instance_id)

        poll_interval = 15

        while True:
            time.sleep(poll_interval)

            try:
                invocation = ssm.get_command_invocation(
                    CommandId=command_id,
                    InstanceId=instance_id,
                )
            except ClientError as e:
                error_code = e.response["Error"]["Code"]
                if error_code == "InvocationDoesNotExist":
                    continue
                if error_code == "ExpiredTokenException":
                    logger.warning("STS token expired during pre-destroy polling, refreshing...")
                    ssm = self._get_client("ssm", force_refresh=True)
                    continue
                raise

            ssm_status = invocation.get("Status", "")

            if ssm_status == "Success":
                return AddonInstallResult(
                    addon_name="pre-destroy",
                    status=AddonInstallStatus.SUCCEEDED,
                    ssm_command_id=command_id,
                    instance_id=instance_id,
                    output=invocation.get("StandardOutputContent"),
                )
            elif ssm_status in ("Failed", "TimedOut", "Cancelled"):
                return AddonInstallResult(
                    addon_name="pre-destroy",
                    status=AddonInstallStatus.FAILED,
                    ssm_command_id=command_id,
                    instance_id=instance_id,
                    output=invocation.get("StandardOutputContent"),
                    error=invocation.get("StandardErrorContent"),
                )


    async def run_pre_destroy(self) -> AddonInstallResult:
        return await asyncio.to_thread(self._run_pre_destroy_sync)

