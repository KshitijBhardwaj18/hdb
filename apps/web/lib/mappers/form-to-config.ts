import type { DeploymentFormData } from '@/components/deployments/wizard/types';
import type {
  CustomerConfigInput,
  CustomerConfigResponse,
} from '@/types/deployment.types';

// Map AWS region to Atlas region format
function awsRegionToAtlasRegion(awsRegion: string): string {
  return awsRegion.replace(/-/g, '_').toUpperCase();
}

export function mapFormToConfig(data: DeploymentFormData): CustomerConfigInput {
  return {
    customer_id: data.customerId,
    environment: data.environment,
    domain: data.domainName,
    aws_config: {
      role_arn: data.roleArn,
      external_id: data.externalId,
      region: data.awsRegion,
    },
    vpc_config: {
      cidr_block: data.vpcCidr,
      nat_gateway_strategy: data.natGatewayStrategy as 'none' | 'single' | 'one_per_az',
      enable_dns_hostnames: true,
      enable_dns_support: true,
    },
    eks_config: {
      version: data.kubernetesVersion,
      access: {
        endpoint_private_access: true,
        endpoint_public_access: false,
        public_access_cidrs: [],
        ssm_access_node: {
          enabled: true,
          instance_type: 't3.micro',
        },
      },
    },
    addons: {
      argocd: { enabled: true },
    },
    kafka_config: data.kafkaSource === 'byo'
      ? {
          custom_kafka: true,
          auth_type: data.kafkaAuthType as 'IAM' | 'SCRAM' | 'PLAIN',
          bootstrap_servers: data.kafkaBootstrapServers || undefined,
          ...(data.kafkaAuthType !== 'IAM' && data.kafkaUsername
            ? { username: data.kafkaUsername, password: data.kafkaPassword }
            : {}),
        }
      : { custom_kafka: false, auth_type: 'IAM' },
    mongodb_config: data.mongoDbMode === 'atlas'
      ? {
          mode: 'atlas',
          atlas_client_id: data.atlasClientId || undefined,
          atlas_client_secret: data.atlasClientSecret || undefined,
          atlas_org_id: data.atlasOrgId || undefined,
          atlas_project_name: data.atlasProjectName || `${data.customerId}-hydradb`,
          cluster_tier: data.mongoDbTier,
          cluster_region: awsRegionToAtlasRegion(data.awsRegion),
          db_username: data.mongoDbUsername || undefined,
          db_password: data.mongoDbPassword || undefined,
          disk_size_gb: 10,
          atlas_cidr_block: '192.168.248.0/21',
        }
      : {
          mode: 'atlas-peering',
          atlas_project_id: data.atlasProjectId || undefined,
          atlas_cluster_name: data.atlasClusterName || undefined,
        },
  };
}

export function mapConfigToForm(config: CustomerConfigResponse): Partial<DeploymentFormData> {
  const eks = config.eks_config;
  const vpc = config.vpc_config;
  const mongo = config.mongodb_config;
  const kafka = config.kafka_config;

  return {
    customerId: config.customer_id,
    environment: config.environment,
    domainName: config.domain ?? '',
    awsRegion: config.aws_config?.region ?? config.aws_region ?? 'us-east-1',
    availabilityZones: config.aws_config?.availability_zones ?? ['us-east-1a', 'us-east-1b', 'us-east-1c'],
    roleArn: config.aws_config?.role_arn ?? '',
    externalId: config.aws_config?.external_id ?? '',
    awsConnectionVerified: false,
    vpcCidr: vpc?.cidr_block ?? '10.0.0.0/16',
    natGatewayStrategy: vpc?.nat_gateway_strategy ?? 'single',
    enableDnsHostnames: true,
    enableDnsSupport: true,
    publicSubnets: [],
    privateSubnets: [],
    vpcEndpoints: [],
    kubernetesVersion: eks?.version ?? '1.34',
    serviceIpv4Cidr: eks?.service_ipv4_cidr ?? '172.20.0.0/16',
    clusterDnsHostnames: true,
    endpointPublicAccess: false,
    publicAccessCidrs: '',
    bootstrapInstanceType: 't3.medium',
    bootstrapDiskSize: '',
    bootstrapDesiredSize: '2',
    bootstrapMinSize: '2',
    bootstrapMaxSize: '3',
    karpenterInstanceFamilies: [],
    karpenterInstanceSizes: [],
    karpenterCapacityTypes: [],
    karpenterCpuLimit: '1000',
    karpenterMemoryLimit: '1000',

    // MongoDB
    mongoDbMode: mongo?.mode ?? 'atlas',
    atlasClientId: mongo?.atlas_client_id ?? '',
    atlasClientSecret: '',
    atlasOrgId: mongo?.atlas_org_id ?? '',
    atlasProjectName: mongo?.atlas_project_name ?? '',
    mongoDbTier: mongo?.cluster_tier ?? 'M10',
    mongoDbUsername: mongo?.db_username ?? 'cortex',
    mongoDbPassword: '',
    atlasProjectId: mongo?.atlas_project_id ?? '',
    atlasClusterName: mongo?.atlas_cluster_name ?? '',

    // Kafka
    kafkaSource: kafka?.custom_kafka ? 'byo' : 'managed-msk',
    kafkaBootstrapServers: kafka?.bootstrap_servers ?? '',
    kafkaAuthType: kafka?.auth_type ?? 'IAM',
    kafkaUsername: '',
    kafkaPassword: '',
  };
}
