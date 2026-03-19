'use client';

import { useConfigs } from '@/hooks/use-deployment-config';

export function ClusterConfigTab() {
  const { data: configs, isLoading } = useConfigs();
  const config = configs?.[0];
  const hasConfig = !!config;

  const eks = config?.eks_config;

  return (
    <div className='flex flex-col gap-6'>
      {/* Kubernetes */}
      <div
        className='rounded-lg bg-[#222222] p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        <div className='mb-5 flex flex-col gap-1'>
          <h2 className='text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Kubernetes Cluster
          </h2>
          <p className='text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            EKS cluster configuration details
          </p>
        </div>

        {isLoading ? (
          <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>Loading...</p>
        ) : hasConfig ? (
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <ConfigItem label='Kubernetes Version' value={eks?.version ?? '1.34'} />
            <ConfigItem label='Service IPv4 CIDR' value={eks?.service_ipv4_cidr ?? '172.20.0.0/16'} />
            <ConfigItem label='Private Endpoint' value={eks?.access?.endpoint_private_access !== false ? 'Enabled' : 'Disabled'} />
            <ConfigItem label='Public Endpoint' value={eks?.access?.endpoint_public_access ? 'Enabled' : 'Disabled'} />
            <ConfigItem label='SSM Access Node' value={eks?.access?.ssm_access_node?.enabled !== false ? 'Enabled' : 'Disabled'} />
            <ConfigItem label='SSM Instance Type' value={eks?.access?.ssm_access_node?.instance_type ?? 't3.micro'} />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>{label}</span>
      <span className='text-sm font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className='rounded-lg border border-dashed border-[#5B5B5B] p-8 text-center'>
      <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        No cluster configuration available. Deploy a cluster first to manage its settings here.
      </p>
    </div>
  );
}
