'use client';

import { useFormContext } from 'react-hook-form';
import type { DeploymentFormData } from '../types';

export function StepReview() {
  const { getValues } = useFormContext<DeploymentFormData>();
  const data = getValues();

  return (
    <div className='flex flex-col gap-4' style={{ fontFamily: 'Satoshi, sans-serif' }}>
      {/* Header */}
      <div className='flex flex-col gap-1'>
        <h2 className='text-lg font-semibold text-white'>Review Your Configuration</h2>
        <p className='text-sm text-[#A7A7A7]'>
          Please review all settings before deploying. You can go back to make changes if needed.
        </p>
      </div>

      <div className='flex flex-col gap-3'>
        {/* 1. Basic Information */}
        <ReviewSection title='Basic Information'>
          <ReviewRow label='Customer ID' value={data.customerId || '\u2014'} />
          <ReviewRow label='Environment' value={data.environment || '\u2014'} />
          <ReviewRow label='Domain Name' value={data.domainName || '\u2014'} />
        </ReviewSection>

        {/* 2. Cloud Provider Setup */}
        <ReviewSection title='Cloud Provider Setup'>
          <ReviewRow label='AWS Region' value={data.awsRegion || '\u2014'} />
          <ReviewRow label='Availability Zones' value={data.availabilityZones.join(', ') || '\u2014'} />
          <ReviewRow label='Role ARN' value={data.roleArn || '\u2014'} />
          <ReviewRow label='External ID' value={data.externalId || '\u2014'} />
        </ReviewSection>

        {/* 3. Network Configuration */}
        <ReviewSection title='Network Configuration'>
          <ReviewRow label='VPC CIDR Block' value={data.vpcCidr || '\u2014'} />
          <ReviewRow label='NAT Gateway Strategy' value={data.natGatewayStrategy === 'one_per_az' ? 'Multi-AZ' : 'Single'} />
          <ReviewRow label='Subnets' value='Auto-configured from availability zones' />
          <ReviewRow label='VPC Endpoints' value='Auto-configured by API' />
        </ReviewSection>

        {/* 4. Kubernetes Cluster */}
        <ReviewSection title='Kubernetes Cluster'>
          <ReviewRow label='K8s Version' value={data.kubernetesVersion || '\u2014'} />
          <ReviewRow label='Cluster Access' value='Private (SSM access node enabled)' />
          <ReviewRow label='Bootstrap Nodes' value='Defaults (t3.medium, 2 nodes)' />
          <ReviewRow label='Autoscaling' value='Karpenter (defaults)' />
        </ReviewSection>

        {/* 5. MongoDB */}
        <ReviewSection title='MongoDB'>
          <ReviewRow label='Mode' value={data.mongoDbMode === 'atlas' ? 'Atlas (Managed)' : 'Atlas Peering'} />
          {data.mongoDbMode === 'atlas' && (
            <>
              <ReviewRow label='Atlas Organization ID' value={data.atlasOrgId || '\u2014'} />
              <ReviewRow label='Atlas Project Name' value={data.atlasProjectName || `${data.customerId}-hydradb`} />
              <ReviewRow label='Cluster Tier' value={data.mongoDbTier || '\u2014'} />
              <ReviewRow label='DB Username' value={data.mongoDbUsername || '\u2014'} />
              <ReviewRow label='Region' value={`Auto (${data.awsRegion})`} />
              <ReviewRow label='Disk Size' value='10 GB (default)' />
            </>
          )}
          {data.mongoDbMode === 'atlas-peering' && (
            <>
              <ReviewRow label='Atlas Project ID' value={data.atlasProjectId || '\u2014'} />
              <ReviewRow label='Atlas Cluster Name' value={data.atlasClusterName || '\u2014'} />
            </>
          )}
        </ReviewSection>

        {/* 6. Kafka */}
        <ReviewSection title='Kafka'>
          <ReviewRow label='Source' value={data.kafkaSource === 'managed-msk' ? 'Managed MSK (Serverless)' : 'Bring Your Own'} />
          {data.kafkaSource === 'byo' && (
            <>
              <ReviewRow label='Bootstrap Servers' value={data.kafkaBootstrapServers || '\u2014'} />
              <ReviewRow label='Auth Type' value={data.kafkaAuthType || 'IAM'} />
              {(data.kafkaAuthType === 'SCRAM' || data.kafkaAuthType === 'PLAIN') && (
                <ReviewRow label='Username' value={data.kafkaUsername || '\u2014'} />
              )}
            </>
          )}
        </ReviewSection>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className='rounded-lg p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
      style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
    >
      <h3 className='mb-4 text-base font-semibold text-white'>{title}</h3>
      <div className='flex flex-col'>{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className='flex items-center justify-between border-b border-[#5B5B5B]/30 py-2.5 last:border-b-0'
      style={{ fontFamily: 'Satoshi, sans-serif' }}
    >
      <span className='text-sm text-[#A7A7A7]'>{label}</span>
      <span className='text-sm font-medium text-white text-right max-w-[60%] break-all'>{value}</span>
    </div>
  );
}
