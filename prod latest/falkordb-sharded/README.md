# FalkorDB Sharded Clusters (Free & Pro)

This directory contains configurations for two separate sharded FalkorDB deployments (`free` and `pro`) using KubeBlocks on dedicated **r8i** (AVX-512) nodes managed by Karpenter.

## Architecture

| Component | Nodes | Instance | Pool |
|-----------|-------|----------|------|
| FalkorDB data (3 shards × 2 replicas) | shared across r8i nodes | r8i.xlarge or larger | `falkordb-pool` |
| Redis exporter | 1 pod per tier | general pool | `general-pool` |
| Stats exporter | 1 pod per tier | general pool | `general-pool` |

### Resource sizing (per pod)

Both the `free` and `pro` tiers are currently initialized with the following sizing:
- **CPU**: 0.5 requests, 1.5 limits
- **Memory**: 4 Gi requests, 12 Gi limits
- **Storage**: 50 Gi (gp3)

To change resources, simply edit the `resources` section in `free/01_falkordb-cluster.yaml` or `pro/01_falkordb-cluster.yaml`.

### Authentication

Both clusters use the **same shared password** from the `falkordb-shared` namespace (`falkordb-shared-password`).
A helper script `copy-secret.sh` is provided to copy this secret into the respective namespaces before deploying.

## Directory Structure

```text
prod/falkordb-sharded/
├── free/
│   ├── 01_falkordb-cluster.yaml   # Namespace, Storage, Cluster, Exporters
│   └── 02_ops-tuning.yaml         # KubeBlocks OpsRequest for Redis config
├── pro/
│   ├── 01_falkordb-cluster.yaml   # Namespace, Storage, Cluster, Exporters
│   └── 02_ops-tuning.yaml         # KubeBlocks OpsRequest for Redis config
├── copy-secret.sh                 # Helper to pull the shared password into the new namespace
└── README.md                      # This file
```

## Quick Start: Deploying a Tier

To deploy the **Free** cluster:

### 1. Apply Karpenter resources (if not already applied)

```bash
kubectl apply -f ../karpenter/falkordb-compute.yaml
```

### 2. Copy the shared password

This script creates the namespace (if it doesn't exist) and copies the shared password secret from `falkordb-shared` into it.

```bash
./copy-secret.sh falkordb-free-sh
```

### 3. Deploy the cluster and monitoring

This single manifest contains the Namespace, StorageClass, Cluster, and all monitoring Exporters.

```bash
kubectl apply -f free/01_falkordb-cluster.yaml
```

### 4. Wait for the cluster to be ready

```bash
kubectl get cluster falkordb-free-sh -n falkordb-free-sh -w
```

### 5. Apply performance tuning

Once the cluster is in the `Running` state, apply the tuning parameters (AOF persistence, activedefrag, maxclients):

```bash
kubectl apply -f free/02_ops-tuning.yaml
```

*(To deploy the **Pro** cluster, simply repeat the above steps using `falkordb-pro-sh` and the `pro/` directory).*

## Connecting to a Cluster

### Get the password

```bash
kubectl get secret falkordb-shared-password -n falkordb-shared \
  -o jsonpath='{.data.password}' | base64 -d
```

### Discover shard services

You can connect to any individual shard, theres a unified **gateway service** that automatically load-balances across all primary shards for initial cluster discovery.

```bash
# For free tier
kubectl get svc -n falkordb-free-sh falkordb-free-sh-gateway
```

### Port-forward and connect

```bash
# Forward the gateway service
kubectl port-forward -n falkordb-free-sh svc/falkordb-free-sh-gateway 6379:6379

# Connect with redis-cli in cluster mode (-c)
redis-cli -h 127.0.0.1 -p 6379 -a <password> -c
```

### Test query

```cypher
GRAPH.QUERY social "CREATE (:Person {name: 'Alice', age: 30})-[:KNOWS]->(:Person {name: 'Bob', age: 25})"
GRAPH.QUERY social "MATCH (p:Person) RETURN p.name, p.age"
```

## Day-2 Operations

### Scaling Shards (Horizontal)

To increase the number of shards from 3 to 4:

```bash
kubectl patch cluster -n falkordb-free-sh falkordb-free-sh --type merge \
  -p '{"spec":{"shardings":[{"name":"shard","shards":4}]}}'
```

### Scaling Resources (Vertical)

```yaml
apiVersion: operations.kubeblocks.io/v1alpha1
kind: OpsRequest
metadata:
  name: falkordb-free-sh-vscale
  namespace: falkordb-free-sh
spec:
  clusterName: falkordb-free-sh
  type: VerticalScaling
  verticalScaling:
  - componentName: falkordb
    requests:
      cpu: "1.5"
      memory: "14Gi"
    limits:
      cpu: "2"
      memory: "14Gi"
```

### Storage: why EBS instead of S3?

FalkorDB (built on Redis) requires a POSIX-compliant filesystem with reliable `fsync` semantics for AOF and RDB persistence. Object storage (S3, GCS, Azure Blob) mapped via FUSE drivers (AWS Mountpoint, GCS FUSE) cannot serve as a primary data volume because:

- They lack native POSIX `fsync` guarantees.
- Random write latency is 10-100x slower.
- AOF (append-only) operations trigger full object rewrites.

**S3 / GCS / Azure Blob should be used for backups**, which is fully supported via the KubeBlocks `BackupRepo` CRD.

## Cleanup

```bash
# Wipe out the free cluster and its storage
kubectl patch cluster falkordb-free-sh -n falkordb-free-sh \
  -p '{"spec":{"terminationPolicy":"WipeOut"}}' --type="merge"
kubectl delete cluster falkordb-free-sh -n falkordb-free-sh
kubectl delete ns falkordb-free-sh
```
