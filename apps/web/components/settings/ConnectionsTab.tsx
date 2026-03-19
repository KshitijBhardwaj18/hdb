'use client';

import { useConfigs } from '@/hooks/use-deployment-config';

export function ConnectionsTab() {
  const { data: configs, isLoading } = useConfigs();
  const config = configs?.[0];
  const hasConnection = !!config;

  const roleArn = config?.aws_config?.role_arn ?? '';
  const externalId = config?.aws_config?.external_id ?? '';
  const region = config?.aws_region ?? config?.aws_config?.region ?? '';
  const azs = config?.aws_config?.availability_zones ?? [];
  const vpcCidr = config?.vpc_config?.cidr_block ?? '';
  const natStrategy = config?.vpc_config?.nat_gateway_strategy ?? '';
  const environment = config?.environment ?? '';
  const domain = config?.domain ?? '';

  return (
    <div className='flex flex-col gap-6'>
      {/* AWS Connection */}
      <div
        className='rounded-lg bg-[#222222] p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        <div className='mb-5 flex flex-col gap-1'>
          <h2 className='text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            AWS Connection
          </h2>
          <p className='text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Manage your AWS infrastructure connection
          </p>
        </div>

        {isLoading ? (
          <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>Loading...</p>
        ) : hasConnection ? (
          <>
            <div className='mb-5 grid grid-cols-1 gap-4 md:grid-cols-2'>
              <ReadOnlyField label='Role ARN' value={roleArn} />
              <ReadOnlyField label='External ID' value={externalId} />
              <ReadOnlyField label='Region' value={region} />
              <ReadOnlyField label='Availability Zones' value={azs.length > 0 ? azs.join(', ') : 'Default'} />
            </div>

            <div className='flex items-center justify-between rounded-lg p-4' style={{ border: '0.5px solid #5B5B5B' }}>
              <div className='flex flex-col gap-0.5'>
                <div className='flex items-center gap-2'>
                  <h3 className='text-sm font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                    Configured
                  </h3>
                  <span className='h-2.5 w-2.5 rounded-full bg-emerald-500' />
                </div>
                <p className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  AWS credentials are configured in your deployment
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className='rounded-lg border border-dashed border-[#5B5B5B] p-8 text-center'>
            <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              No AWS connection configured. Create a deployment to set up your AWS connection.
            </p>
          </div>
        )}
      </div>

      {/* Network & Environment */}
      {hasConnection && (
        <div
          className='rounded-lg bg-[#222222] p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
          style={{ border: '0.5px solid #5B5B5B' }}
        >
          <div className='mb-5 flex flex-col gap-1'>
            <h2 className='text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Network & Environment
            </h2>
            <p className='text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              VPC and deployment environment details
            </p>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <ReadOnlyField label='Environment' value={environment === 'prod' ? 'Production' : environment === 'staging' ? 'Staging' : environment === 'dev' ? 'Development' : environment} />
            <ReadOnlyField label='Domain' value={domain} />
            <ReadOnlyField label='VPC CIDR' value={vpcCidr} />
            <ReadOnlyField label='NAT Gateway Strategy' value={natStrategy === 'one_per_az' ? 'One per AZ' : natStrategy === 'single' ? 'Single' : natStrategy === 'none' ? 'None' : natStrategy} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <label className='text-base font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        {label}
      </label>
      <input
        readOnly
        value={value}
        placeholder='Not configured'
        className='rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-base text-white placeholder:text-[#9A9A9A] focus:outline-none'
        style={{ fontFamily: 'Satoshi, sans-serif' }}
      />
    </div>
  );
}
