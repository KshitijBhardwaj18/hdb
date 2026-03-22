export enum DeploymentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  DESTROYING = 'destroying',
  DESTROYED = 'destroyed',
}

// --- AWS Config ---

export interface AwsConfigInput {
  role_arn: string;
  external_id: string;
  region?: string;
}

// --- VPC Config ---

export interface SubnetInput {
  cidr_block: string;
  availability_zone: string;
  name?: string;
  tags?: Record<string, string>;
}

export interface VpcEndpointsInput {
  s3?: boolean;
  dynamodb?: boolean;
  ecr_api?: boolean;
  ecr_dkr?: boolean;
  sts?: boolean;
  logs?: boolean;
  ec2?: boolean;
  ssm?: boolean;
  ssmmessages?: boolean;
  ec2messages?: boolean;
  elasticloadbalancing?: boolean;
  autoscaling?: boolean;
}

export interface VpcConfigInput {
  cidr_block?: string;
  secondary_cidr_blocks?: string[];
  nat_gateway_strategy?: 'none' | 'single' | 'one_per_az';
  public_subnets?: SubnetInput[];
  private_subnets?: SubnetInput[];
  pod_subnets?: SubnetInput[];
  vpc_endpoints?: VpcEndpointsInput;
  enable_dns_hostnames?: boolean;
  enable_dns_support?: boolean;
  tags?: Record<string, string>;
}

// --- EKS Config ---

export interface EksAccessInput {
  endpoint_private_access?: boolean;
  endpoint_public_access?: boolean;
  public_access_cidrs?: string[];
  authentication_mode?: string;
  bootstrap_cluster_creator_admin_permissions?: boolean;
  ssm_access_node?: {
    enabled: boolean;
    instance_type?: string;
  };
}

export interface BootstrapNodeGroupConfig {
  instance_types?: string[];
  desired_size?: number;
  min_size?: number;
  max_size?: number;
  disk_size?: number;
  labels?: Record<string, string>;
}

export interface KarpenterNodePoolConfig {
  instance_families?: string[];
  instance_sizes?: string[];
  capacity_types?: string[];
  architectures?: string[];
  cpu_limit?: number;
  memory_limit_gb?: number;
}

export interface KarpenterConfigInput {
  version?: string;
  node_pool?: KarpenterNodePoolConfig;
}

export interface AddonConfigInput {
  enabled?: boolean;
  version?: string | null;
}

export interface EksAddonsInput {
  vpc_cni?: AddonConfigInput;
  coredns?: AddonConfigInput;
  kube_proxy?: AddonConfigInput;
  ebs_csi_driver?: AddonConfigInput;
  efs_csi_driver?: AddonConfigInput;
  pod_identity_agent?: AddonConfigInput;
  snapshot_controller?: AddonConfigInput;
}

export interface EksConfigInput {
  version?: string;
  service_ipv4_cidr?: string;
  access?: EksAccessInput;
  bootstrap_node_group?: BootstrapNodeGroupConfig;
  karpenter?: KarpenterConfigInput;
  addons?: EksAddonsInput;
}

// --- Cluster Addons ---

export interface ArgoCDRepoConfig {
  url: string;
  username?: string;
  password?: string;
  branch?: string;
}

export interface ArgoCDAddonInput {
  enabled?: boolean;
  server_replicas?: number;
  repo_server_replicas?: number;
  ha_enabled?: boolean;
  hostname?: string;
  repository?: ArgoCDRepoConfig;
}

export interface ClusterAddonsInput {
  argocd?: ArgoCDAddonInput;
}

// --- Kafka ---

export interface KafkaConfigInput {
  custom_kafka?: boolean;
  auth_type?: 'IAM' | 'SCRAM' | 'PLAIN';
  bootstrap_servers?: string;
  username?: string;
  password?: string;
  topic?: string;
  group_id?: string;
}

// --- MongoDB ---

export interface MongoDBConfigInput {
  mode?: string;
  atlas_client_id?: string;
  atlas_client_secret?: string;
  atlas_org_id?: string;
  atlas_project_name?: string;
  atlas_project_id?: string;
  atlas_cluster_name?: string;
  cluster_tier?: string;
  cluster_region?: string;
  db_username?: string;
  db_password?: string;
  disk_size_gb?: number;
  atlas_cidr_block?: string;
  connection_uri?: string;
}

// --- Root Config ---

export interface CustomerConfigInput {
  customer_id: string;
  environment?: string;
  domain: string;
  aws_config: AwsConfigInput;
  vpc_config?: VpcConfigInput;
  eks_config?: EksConfigInput;
  addons?: ClusterAddonsInput;
  kafka_config?: KafkaConfigInput;
  mongodb_config?: MongoDBConfigInput;
  tags?: Record<string, string>;
}

// --- Responses ---

export interface CustomerConfigResponse {
  customer_id: string;
  environment: string;
  domain: string;
  aws_region: string;
  // Full config (GET single) also returns aws_config
  aws_config?: AwsConfigInput & { availability_zones?: string[] };
  vpc_config?: VpcConfigInput;
  eks_config?: EksConfigInput;
  addons?: ClusterAddonsInput;
  kafka_config?: KafkaConfigInput;
  mongodb_config?: MongoDBConfigInput;
  tags?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface DeployRequest {
  environment?: string;
  dry_run?: boolean;
}

export interface DestroyRequest {
  confirm: boolean;
}

export interface DeploymentResponse {
  customer_id: string;
  environment: string;
  stack_name: string;
  status: DeploymentStatus;
  message: string;
  deployment_id?: string;
}

export interface CustomerDeployment {
  id: string;
  customer_id: string;
  environment: string;
  stack_name: string;
  aws_region: string;
  role_arn: string;
  status: DeploymentStatus;
  addon_status?: string | null;
  pulumi_deployment_id?: string;
  outputs?: Record<string, unknown>;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// --- Deployment Events (real-time progress) ---

export type DeploymentEventType =
  // Deploy lifecycle
  | 'deploy_queued'
  | 'deploy_lock_acquired'
  | 'deploy_lock_failed'
  | 'config_loaded'
  | 'pulumi_configuring'
  | 'pulumi_running'
  | 'pulumi_progress'
  | 'pulumi_succeeded'
  | 'pulumi_failed'
  | 'gitops_started'
  | 'gitops_succeeded'
  | 'gitops_failed'
  | 'addons_waiting'
  | 'addons_started'
  | 'addons_succeeded'
  | 'addons_failed'
  | 'deploy_succeeded'
  | 'deploy_failed'
  // Destroy lifecycle
  | 'destroy_queued'
  | 'destroy_lock_acquired'
  | 'destroy_lock_failed'
  | 'cleanup_started'
  | 'cleanup_succeeded'
  | 'cleanup_failed'
  | 'pulumi_destroying'
  | 'pulumi_destroy_succeeded'
  | 'pulumi_destroy_failed'
  | 'destroy_succeeded'
  | 'destroy_failed';

export interface DeploymentEvent {
  id: string;
  event_type: DeploymentEventType;
  stack_name: string;
  message: string;
  timestamp: string;
  details?: string | null;
}

export interface DeploymentEventsResponse {
  stack_name: string;
  events: DeploymentEvent[];
}

// --- AWS Connection Test ---

export interface AwsTestConnectionRequest {
  role_arn: string;
  external_id: string;
  region: string;
}

export interface AwsTestConnectionSuccess {
  status: 'connected';
  account_id: string;
  assumed_role_arn: string;
  region: string;
}

export interface AwsTestConnectionFailure {
  status: 'failed';
  error: string;
}

// --- Atlas Connection Test ---

export interface AtlasTestConnectionRequest {
  atlas_client_id: string;
  atlas_client_secret: string;
  atlas_org_id: string;
}

export interface AtlasTestConnectionSuccess {
  status: string;
  org_name: string;
  project_count: number;
}

export type AwsTestConnectionResponse = AwsTestConnectionSuccess | AwsTestConnectionFailure;

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationErrorResponse {
  error: string;
  message: string;
  details: ValidationErrorDetail[];
}
