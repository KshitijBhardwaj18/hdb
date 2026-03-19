'use client';

import { Rocket, RefreshCw, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyDeployment } from '@/components/dashboard/EmptyDeployment';
import { DeploymentOverview } from '@/components/dashboard/DeploymentOverview';
import { useConfigs } from '@/hooks/use-deployment-config';
import { useDeploymentStatus } from '@/hooks/use-deployment';
import { DeploymentStatus } from '@/types/deployment.types';

type DashboardState = 'loading' | 'empty' | 'continue' | 'deploying' | 'live' | 'failed';

function useDashboardState() {
  const { data: configs, isLoading: configsLoading } = useConfigs();

  const config = configs?.[0] ?? null;

  const { data: deployment, isLoading: deploymentLoading } = useDeploymentStatus(
    config?.customer_id ?? null,
    config?.environment ?? null,
  );

  if (configsLoading) return { state: 'loading' as DashboardState, config: null, deployment: null };
  if (!configs || configs.length === 0) return { state: 'empty' as DashboardState, config: null, deployment: null };

  if (deploymentLoading) return { state: 'loading' as DashboardState, config, deployment: null };

  if (!deployment) {
    return { state: 'continue' as DashboardState, config, deployment: null };
  }

  let state: DashboardState;
  switch (deployment.status) {
    case DeploymentStatus.PENDING:
    case DeploymentStatus.IN_PROGRESS:
      state = 'deploying';
      break;
    case DeploymentStatus.SUCCEEDED:
      state = 'live';
      break;
    case DeploymentStatus.FAILED:
      state = 'failed';
      break;
    case DeploymentStatus.DESTROYING:
      state = 'deploying';
      break;
    case DeploymentStatus.DESTROYED:
      state = 'continue';
      break;
    default:
      state = 'continue';
  }

  return { state, config, deployment };
}

export default function DashboardPage() {
  const { state, config } = useDashboardState();

  if (state === 'loading') {
    return (
      <div className='flex items-center justify-center py-32'>
        <Loader2 className='h-8 w-8 animate-spin text-[#A7A7A7]' />
      </div>
    );
  }

  const showContinue = (state === 'continue' || state === 'failed') && config;
  const showLive = state === 'live' && config;
  const showDeploying = state === 'deploying' && config;

  const deploymentInfo = config
    ? {
        customerId: config.customer_id,
        environment: config.environment === 'prod' ? 'Production' : config.environment === 'staging' ? 'Staging' : 'Development',
        rawEnvironment: config.environment,
        status: (state === 'live' ? 'live' : 'not-deployed') as 'live' | 'not-deployed',
        awsRegion: config.aws_region ?? 'us-east-1',
        domain: config.domain ?? '',
        kubernetesVersion: config.eks_config?.version ?? '1.34',
        lastUpdated: config.updated_at ? new Date(config.updated_at).toLocaleDateString() : '',
        deployDate: config.created_at ? new Date(config.created_at).toLocaleDateString() : '',
      }
    : null;

  return (
    <div className='flex flex-col gap-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <img src='/logo.png' alt='HydraDB' className='h-10 w-[100px] object-contain' />
          <div className='flex flex-col gap-1'>
            <h1
              className='text-[32px] font-bold leading-[1.125] text-white'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              Deployment Overview
            </h1>
          <p
            className='text-base text-[#A7A7A7]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            Monitor cluster health and access core services
          </p>
          </div>
        </div>

        {showLive && config && (
          <Link
            href={`/deployments/new?customerId=${encodeURIComponent(config.customer_id)}`}
            className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <RefreshCw className='h-4 w-4' />
            Redeploy
          </Link>
        )}
        {showDeploying && config && (
          <Link
            href={`/deployments/progress?customerId=${encodeURIComponent(config.customer_id)}&environment=${encodeURIComponent(config.environment)}`}
            className='flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <Loader2 className='h-4 w-4 animate-spin' />
            View Progress
          </Link>
        )}
        {showContinue && (
          <Link
            href={`/deployments/new?customerId=${encodeURIComponent(config.customer_id)}`}
            className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <Rocket className='h-4 w-4' />
            {state === 'failed' ? 'Retry Deployment' : 'Continue Deployment'}
          </Link>
        )}
      </div>

      {/* Content based on state */}
      {state === 'empty' && <EmptyDeployment />}
      {deploymentInfo && (showContinue || showLive || showDeploying) && (
        <DeploymentOverview deployment={deploymentInfo} />
      )}
    </div>
  );
}
