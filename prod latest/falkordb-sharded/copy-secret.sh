#!/bin/bash
set -e

# Usage: ./copy-secret.sh <target-namespace>
TARGET_NS=${1}

if [ -z "$TARGET_NS" ]; then
    echo "Usage: $0 <target-namespace>"
    echo "Example: $0 falkordb-free-sh"
    echo "Example: $0 falkordb-pro-sh"
    exit 1
fi

echo "Ensuring namespace ${TARGET_NS} exists..."
kubectl create namespace "${TARGET_NS}" --dry-run=client -o yaml | kubectl apply -f -

echo "Copying falkordb-shared-password from falkordb-shared to ${TARGET_NS}..."

kubectl get secret falkordb-shared-password -n falkordb-shared -o json | \
  jq --arg ns "$TARGET_NS" '.metadata.namespace = $ns | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .metadata.ownerReferences)' | \
  kubectl apply -f -

echo "Done."