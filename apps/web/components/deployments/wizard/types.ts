export interface SubnetConfig {
  name: string;
  cidr: string;
  az: string;
}

export interface DeploymentFormData {
  // Step 1: Basic Info
  customerId: string;
  environment: string;
  domainName: string;

  // Step 2: Cloud Setup
  awsRegion: string;
  availabilityZones: string[];
  roleArn: string;
  externalId: string;
  awsConnectionVerified: boolean;

  // Step 3: Network
  vpcCidr: string;
  natGatewayStrategy: string;
  enableDnsHostnames: boolean;
  enableDnsSupport: boolean;
  publicSubnets: SubnetConfig[];
  privateSubnets: SubnetConfig[];
  vpcEndpoints: string[];

  // Step 4: Cluster
  kubernetesVersion: string;
  serviceIpv4Cidr: string;
  clusterDnsHostnames: boolean;
  endpointPublicAccess: boolean;
  publicAccessCidrs: string;
  bootstrapInstanceType: string;
  bootstrapDiskSize: string;
  bootstrapDesiredSize: string;
  bootstrapMinSize: string;
  bootstrapMaxSize: string;
  karpenterInstanceFamilies: string[];
  karpenterInstanceSizes: string[];
  karpenterCapacityTypes: string[];
  karpenterCpuLimit: string;
  karpenterMemoryLimit: string;

  // Step 5: Services (MongoDB + Kafka)
  mongoDbMode: string;
  atlasClientId: string;
  atlasClientSecret: string;
  atlasOrgId: string;
  atlasProjectName: string;
  mongoDbTier: string;
  mongoDbUsername: string;
  mongoDbPassword: string;
  atlasProjectId: string;
  atlasClusterName: string;
  kafkaSource: string;
  kafkaBootstrapServers: string;
  kafkaAuthType: string;
  kafkaUsername: string;
  kafkaPassword: string;
}

export const DEFAULT_FORM_DATA: DeploymentFormData = {
  customerId: '',
  environment: 'prod',
  domainName: '',

  awsRegion: 'us-east-1',
  availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
  roleArn: '',
  externalId: '',
  awsConnectionVerified: false,

  vpcCidr: '10.0.0.0/16',
  natGatewayStrategy: 'single',
  enableDnsHostnames: true,
  enableDnsSupport: true,
  publicSubnets: [],
  privateSubnets: [],
  vpcEndpoints: [],

  kubernetesVersion: '1.34',
  serviceIpv4Cidr: '172.20.0.0/16',
  clusterDnsHostnames: true,
  endpointPublicAccess: true,
  publicAccessCidrs: '0.0.0.0/0',
  bootstrapInstanceType: 't3.large',
  bootstrapDiskSize: '',
  bootstrapDesiredSize: '6',
  bootstrapMinSize: '3',
  bootstrapMaxSize: '10',
  karpenterInstanceFamilies: [],
  karpenterInstanceSizes: [],
  karpenterCapacityTypes: [],
  karpenterCpuLimit: '100',
  karpenterMemoryLimit: '256',

  mongoDbMode: 'atlas',
  atlasClientId: '',
  atlasClientSecret: '',
  atlasOrgId: '',
  atlasProjectName: '',
  mongoDbTier: 'M10',
  mongoDbUsername: '',
  mongoDbPassword: '',
  atlasProjectId: '',
  atlasClusterName: '',
  kafkaSource: 'managed-msk',
  kafkaBootstrapServers: '',
  kafkaAuthType: 'IAM',
  kafkaUsername: '',
  kafkaPassword: '',
};

export const WIZARD_STEPS = [
  { id: 'basic', label: 'Basic Info', number: 1 },
  { id: 'cloud', label: 'Cloud Setup', number: 2 },
  { id: 'network', label: 'Network', number: 3 },
  { id: 'cluster', label: 'Cluster', number: 4 },
  { id: 'services', label: 'Services', number: 5 },
  { id: 'review', label: 'Review & Deploy', number: 6 },
] as const;
