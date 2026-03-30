import { z } from 'zod';

const cidrRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;

function cidrSchema(minPrefix: number, maxPrefix: number) {
  return z.string().regex(cidrRegex, 'Invalid CIDR format').refine(
    (val) => {
      const prefix = parseInt(val.split('/')[1] ?? '', 10);
      return prefix >= minPrefix && prefix <= maxPrefix;
    },
    { message: `CIDR prefix must be between /${minPrefix} and /${maxPrefix}` },
  );
}

export const stepBasicInfoSchema = z.object({
  customerId: z
    .string()
    .min(3, 'Must be at least 3 characters')
    .max(50, 'Must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  environment: z.enum(['prod', 'staging', 'dev'], { message: 'Select an environment' }),
  domainName: z.string().min(1, 'Domain name is required'),
});

export const stepCloudSetupSchema = z.object({
  awsRegion: z.string().min(1, 'Region is required'),
  availabilityZones: z.array(z.string()).min(2, 'Select at least 2 availability zones'),
  roleArn: z
    .string()
    .min(1, 'Role ARN is required')
    .regex(/^arn:aws:iam::\d{12}:role\/.+$/, 'Must be a valid IAM role ARN'),
  externalId: z.string().min(10, 'External ID must be at least 10 characters'),
  awsConnectionVerified: z.literal(true, {
    errorMap: () => ({ message: 'You must verify your AWS connection before proceeding' }),
  }),
});

const subnetSchema = z.object({
  name: z.string(),
  cidr: z.string(),
  az: z.string(),
});

export const stepNetworkSchema = z.object({
  vpcCidr: cidrSchema(16, 21),
  natGatewayStrategy: z.string().min(1),
  enableDnsHostnames: z.boolean(),
  enableDnsSupport: z.boolean(),
  publicSubnets: z.array(subnetSchema),
  privateSubnets: z.array(subnetSchema),
  vpcEndpoints: z.array(z.string()),
});

export const stepClusterSchema = z.object({
  kubernetesVersion: z.string().min(1),
  serviceIpv4Cidr: cidrSchema(12, 24),
  clusterDnsHostnames: z.boolean(),
  endpointPublicAccess: z.boolean(),
  publicAccessCidrs: z.string(),
  bootstrapInstanceType: z.string().min(1),
  bootstrapDiskSize: z.string(),
  bootstrapDesiredSize: z.string(),
  bootstrapMinSize: z.string(),
  bootstrapMaxSize: z.string(),
  karpenterInstanceFamilies: z.array(z.string()),
  karpenterInstanceSizes: z.array(z.string()),
  karpenterCapacityTypes: z.array(z.string()),
  karpenterCpuLimit: z.string(),
  karpenterMemoryLimit: z.string(),
});

export const stepServicesSchema = z.discriminatedUnion('mongoDbMode', [
  // Atlas mode
  z.object({
    mongoDbMode: z.literal('atlas'),
    atlasClientId: z.string().min(1, 'Atlas Client ID is required'),
    atlasClientSecret: z.string().min(1, 'Atlas Client Secret is required'),
    atlasOrgId: z.string().min(1, 'Atlas Organization ID is required'),
    atlasProjectName: z.string(),
    mongoDbTier: z.string().min(1),
    mongoDbUsername: z.string().min(1, 'Username is required'),
    mongoDbPassword: z.string().min(8, 'Password must be at least 8 characters'),
    atlasProjectId: z.string(),
    atlasClusterName: z.string(),
    atlasClusterRegion: z.string(),
    kafkaSource: z.string(),
    kafkaBootstrapServers: z.string(),
    kafkaAuthType: z.string(),
    kafkaUsername: z.string(),
    kafkaPassword: z.string(),
  }),
  // Atlas Peering mode
  z.object({
    mongoDbMode: z.literal('atlas-peering'),
    atlasClientId: z.string().min(1, 'Atlas Client ID is required'),
    atlasClientSecret: z.string().min(1, 'Atlas Client Secret is required'),
    atlasOrgId: z.string(),
    atlasProjectName: z.string(),
    mongoDbTier: z.string(),
    mongoDbUsername: z.string().min(1, 'Username is required'),
    mongoDbPassword: z.string().min(8, 'Password must be at least 8 characters'),
    atlasProjectId: z.string().min(1, 'Atlas Project ID is required'),
    atlasClusterName: z.string().min(1, 'Atlas Cluster Name is required'),
    atlasClusterRegion: z.string().min(1),
    kafkaSource: z.string(),
    kafkaBootstrapServers: z.string(),
    kafkaAuthType: z.string(),
    kafkaUsername: z.string(),
    kafkaPassword: z.string(),
  }),
]).superRefine((data, ctx) => {
  // Kafka BYO validation
  if (data.kafkaSource === 'byo') {
    if (!data.kafkaBootstrapServers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bootstrap servers are required',
        path: ['kafkaBootstrapServers'],
      });
    }
    if (data.kafkaAuthType === 'SCRAM' || data.kafkaAuthType === 'PLAIN') {
      if (!data.kafkaUsername) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Username is required for SCRAM/PLAIN auth',
          path: ['kafkaUsername'],
        });
      }
      if (!data.kafkaPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Password is required for SCRAM/PLAIN auth',
          path: ['kafkaPassword'],
        });
      }
    }
  }
});

export const fullConfigSchema = stepBasicInfoSchema
  .merge(stepCloudSetupSchema.omit({ awsConnectionVerified: true }).merge(z.object({ awsConnectionVerified: z.boolean() })))
  .merge(stepNetworkSchema)
  .merge(stepClusterSchema)
  .merge(
    z.object({
      mongoDbMode: z.string(),
      atlasClientId: z.string(),
      atlasClientSecret: z.string(),
      atlasOrgId: z.string(),
      atlasProjectName: z.string(),
      mongoDbTier: z.string(),
      mongoDbUsername: z.string(),
      mongoDbPassword: z.string(),
      atlasProjectId: z.string(),
      atlasClusterName: z.string(),
      atlasClusterRegion: z.string(),
      kafkaSource: z.string(),
      kafkaBootstrapServers: z.string(),
      kafkaAuthType: z.string(),
      kafkaUsername: z.string(),
      kafkaPassword: z.string(),
    }),
  );

// Map step number (1-based) to its Zod schema
export const STEP_SCHEMAS: Record<number, z.ZodType> = {
  1: stepBasicInfoSchema,
  2: stepCloudSetupSchema,
  3: stepNetworkSchema,
  4: stepClusterSchema,
  5: stepServicesSchema,
  // Step 6 (Review) has no additional validation
};
