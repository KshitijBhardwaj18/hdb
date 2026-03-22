'use client';

import { Rocket, RefreshCw, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyDeployment } from '@/components/dashboard/EmptyDeployment';
import { DeploymentOverview } from '@/components/dashboard/DeploymentOverview';
import { useConfigs } from '@/hooks/use-deployment-config';
import { useAllDeployments, useDeploymentStatus } from '@/hooks/use-deployment';
import { DeploymentStatus } from '@/types/deployment.types';
import type { CustomerConfigResponse, CustomerDeployment } from '@/types/deployment.types';

type DeploymentState = 'live' | 'deploying' | 'destroying' | 'deploy-failed' | 'destroy-failed' | 'continue';

function getDeploymentState(deployment: CustomerDeployment | undefined): DeploymentState {
  if (!deployment) return 'continue';
  switch (deployment.status) {
    case DeploymentStatus.PENDING:
    case DeploymentStatus.IN_PROGRESS:
      return 'deploying';
    case DeploymentStatus.SUCCEEDED:
      return 'live';
    case DeploymentStatus.FAILED: {
      // Distinguish deploy failure from destroy failure
      const msg = deployment.error_message?.toLowerCase() ?? '';
      if (msg.includes('destroy')) return 'destroy-failed';
      return 'deploy-failed';
    }
    case DeploymentStatus.DESTROYING:
      return 'destroying';
    case DeploymentStatus.DESTROYED:
      return 'continue';
    default:
      return 'continue';
  }
}

function StatusBadge({ state }: { state: DeploymentState }) {
  switch (state) {
    case 'live':
      return (
        <span
          className='rounded px-2 py-0.5 text-xs font-medium text-[#00CF23]'
          style={{ background: 'rgba(0, 207, 35, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
        >
          Live
        </span>
      );
    case 'deploying':
      return (
        <span
          className='flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-400'
          style={{ background: 'rgba(251, 191, 36, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
        >
          <Loader2 className='h-3 w-3 animate-spin' />
          Deploying
        </span>
      );
    case 'destroying':
      return (
        <span
          className='flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-red-400'
          style={{ background: 'rgba(239, 68, 68, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
        >
          <Loader2 className='h-3 w-3 animate-spin' />
          Destroying
        </span>
      );
    case 'deploy-failed':
      return (
        <span
          className='flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-red-400'
          style={{ background: 'rgba(239, 68, 68, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
        >
          <AlertCircle className='h-3 w-3' />
          Deploy Failed
        </span>
      );
    case 'destroy-failed':
      return (
        <span
          className='flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-red-400'
          style={{ background: 'rgba(239, 68, 68, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
        >
          <AlertCircle className='h-3 w-3' />
          Destroy Failed
        </span>
      );
    case 'continue':
      return (
        <span className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
          Not Deployed
        </span>
      );
  }
}

function DeploymentCard({
  config,
  deployment,
}: {
  config: CustomerConfigResponse;
  deployment: CustomerDeployment | undefined;
}) {
  const state = getDeploymentState(deployment);
  const isActive = state === 'deploying' || state === 'destroying';

  return (
    <div
      className='flex flex-col gap-4 rounded-lg bg-[#222222] p-5'
      style={{ border: '0.5px solid #5B5B5B' }}
    >
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center'>
            <svg width='28' height='28' viewBox='0 0 28 28' fill='none'>
              <circle
                cx='14'
                cy='14'
                r='4'
                fill={state === 'live' ? '#00CF23' : (state === 'deploy-failed' || state === 'destroy-failed') ? '#EF4444' : state === 'deploying' || state === 'destroying' ? '#FBBF24' : '#A7A7A7'}
              />
            </svg>
          </div>
          <div className='flex flex-col'>
            <span
              className='text-lg font-semibold text-white'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {config.customer_id}
            </span>
            <StatusBadge state={state} />
          </div>
        </div>

        {/* Action button */}
        {state === 'live' && (
          <Link
            href={`/deployments/new?customerId=${encodeURIComponent(config.customer_id)}`}
            className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <RefreshCw className='h-3.5 w-3.5' />
            Redeploy
          </Link>
        )}
        {(state === 'deploying' || state === 'destroying') && (
          <Link
            href={`/deployments/progress?customerId=${encodeURIComponent(config.customer_id)}&environment=${encodeURIComponent(config.environment)}`}
            className='flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
            View Progress
          </Link>
        )}
        {state === 'deploy-failed' && (
          <div className='flex items-center gap-2'>
            <Link
              href={`/deployments/progress?customerId=${encodeURIComponent(config.customer_id)}&environment=${encodeURIComponent(config.environment)}`}
              className='flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
              style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
            >
              <AlertCircle className='h-3.5 w-3.5' />
              Logs
            </Link>
            <Link
              href={`/deployments/new?customerId=${encodeURIComponent(config.customer_id)}`}
              className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              <Rocket className='h-3.5 w-3.5' />
              Retry Deploy
            </Link>
          </div>
        )}
        {state === 'destroy-failed' && (
          <div className='flex items-center gap-2'>
            <Link
              href={`/deployments/progress?customerId=${encodeURIComponent(config.customer_id)}&environment=${encodeURIComponent(config.environment)}`}
              className='flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
              style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
            >
              <AlertCircle className='h-3.5 w-3.5' />
              Logs
            </Link>
            <Link
              href='/settings'
              className='flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              <Trash2 className='h-3.5 w-3.5' />
              Retry Destroy
            </Link>
          </div>
        )}
        {state === 'continue' && (
          <Link
            href={`/deployments/new?customerId=${encodeURIComponent(config.customer_id)}`}
            className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <Rocket className='h-3.5 w-3.5' />
            Deploy
          </Link>
        )}
      </div>

      {/* Info row */}
      <div className='flex items-center gap-6 text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        <span>Region: <span className='text-white'>{config.aws_region ?? 'us-east-1'}</span></span>
        <span>Env: <span className='text-white'>{config.environment}</span></span>
        {config.domain && <span>Domain: <span className='text-white'>{config.domain}</span></span>}
      </div>

      {/* Error message for failed deployments */}
      {(state === 'deploy-failed' || state === 'destroy-failed') && (
        <div
          className='rounded-lg p-3'
          style={{ background: 'rgba(239, 68, 68, 0.08)', border: '0.5px solid rgba(239, 68, 68, 0.3)' }}
        >
          <p className='text-sm text-red-400' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            {state === 'destroy-failed'
              ? 'Infrastructure destroy failed. Retry from Settings.'
              : 'Deployment failed. Retry or edit your configuration.'}
          </p>
        </div>
      )}

      {/* Addon status */}
      {state === 'live' && deployment?.addon_status && deployment.addon_status !== 'succeeded' && deployment.addon_status !== 'skipped' && (
        <div
          className='rounded-lg p-3'
          style={{ background: 'rgba(251, 191, 36, 0.08)', border: '0.5px solid rgba(251, 191, 36, 0.3)' }}
        >
          <p className='text-sm text-amber-400' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            Addon status: {deployment.addon_status}
            {deployment.addon_status === 'failed' && ' — addons may need to be reinstalled'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: configs, isLoading: configsLoading } = useConfigs();
  const { data: allDeployments, isLoading: deploymentsLoading } = useAllDeployments();

  // Build a map of deployment per stack_name for quick lookup
  const deploymentMap = new Map<string, CustomerDeployment>();
  for (const dep of allDeployments ?? []) {
    deploymentMap.set(`${dep.customer_id}-${dep.environment}`, dep);
  }

  // For backward compat — also fetch status for the first config to use in overview
  const firstConfig = configs?.[0] ?? null;
  const { data: firstDeployment } = useDeploymentStatus(
    firstConfig?.customer_id ?? null,
    firstConfig?.environment ?? null,
  );

  const isLoading = configsLoading || deploymentsLoading;
  const hasConfigs = configs && configs.length > 0;
  const hasMultipleConfigs = configs && configs.length > 1;

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-32'>
        <Loader2 className='h-8 w-8 animate-spin text-[#A7A7A7]' />
      </div>
    );
  }

  if (!hasConfigs) {
    return (
      <div className='flex flex-col gap-6'>
        <DashboardHeader />
        <EmptyDeployment />
      </div>
    );
  }

  // Single config — show the full overview (backward compat)
  if (!hasMultipleConfigs && firstConfig) {
    const dep = firstDeployment ?? deploymentMap.get(`${firstConfig.customer_id}-${firstConfig.environment}`);
    const state = getDeploymentState(dep);

    const deploymentInfo = {
      customerId: firstConfig.customer_id,
      environment: firstConfig.environment === 'prod' ? 'Production' : firstConfig.environment === 'staging' ? 'Staging' : 'Development',
      rawEnvironment: firstConfig.environment,
      status: state,
      awsRegion: firstConfig.aws_region ?? 'us-east-1',
      domain: firstConfig.domain ?? '',
      kubernetesVersion: firstConfig.eks_config?.version ?? '1.34',
      lastUpdated: firstConfig.updated_at ? new Date(firstConfig.updated_at).toLocaleDateString() : '',
      deployDate: firstConfig.created_at ? new Date(firstConfig.created_at).toLocaleDateString() : '',
    };

    return (
      <div className='flex flex-col gap-6'>
        <DashboardHeader
          showAction={
            state === 'live' ? (
              <Link
                href={`/deployments/new?customerId=${encodeURIComponent(firstConfig.customer_id)}`}
                className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                <RefreshCw className='h-4 w-4' />
                Redeploy
              </Link>
            ) : state === 'deploying' ? (
              <Link
                href={`/deployments/progress?customerId=${encodeURIComponent(firstConfig.customer_id)}&environment=${encodeURIComponent(firstConfig.environment)}`}
                className='flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                <Loader2 className='h-4 w-4 animate-spin' />
                Deploying...
              </Link>
            ) : state === 'destroying' ? (
              <Link
                href={`/deployments/progress?customerId=${encodeURIComponent(firstConfig.customer_id)}&environment=${encodeURIComponent(firstConfig.environment)}`}
                className='flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                <Loader2 className='h-4 w-4 animate-spin' />
                Destroying...
              </Link>
            ) : state === 'deploy-failed' ? (
              <div className='flex items-center gap-2'>
                <Link
                  href={`/deployments/progress?customerId=${encodeURIComponent(firstConfig.customer_id)}&environment=${encodeURIComponent(firstConfig.environment)}`}
                  className='flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                  style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
                >
                  <AlertCircle className='h-4 w-4' />
                  View Logs
                </Link>
                <Link
                  href={`/deployments/new?customerId=${encodeURIComponent(firstConfig.customer_id)}`}
                  className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                >
                  <Rocket className='h-4 w-4' />
                  Retry Deployment
                </Link>
              </div>
            ) : state === 'destroy-failed' ? (
              <div className='flex items-center gap-2'>
                <Link
                  href={`/deployments/progress?customerId=${encodeURIComponent(firstConfig.customer_id)}&environment=${encodeURIComponent(firstConfig.environment)}`}
                  className='flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                  style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
                >
                  <AlertCircle className='h-4 w-4' />
                  View Logs
                </Link>
                <Link
                  href={`/settings`}
                  className='flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                >
                  <Trash2 className='h-4 w-4' />
                  Retry Destroy
                </Link>
              </div>
            ) : (
              <Link
                href={`/deployments/new?customerId=${encodeURIComponent(firstConfig.customer_id)}`}
                className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                <Rocket className='h-4 w-4' />
                Deploy
              </Link>
            )
          }
        />
        {(state === 'deploy-failed' || state === 'destroy-failed') && (
          <div
            className='rounded-lg p-4'
            style={{ background: 'rgba(239, 68, 68, 0.08)', border: '0.5px solid rgba(239, 68, 68, 0.3)' }}
          >
            <div className='flex items-start gap-2'>
              <AlertCircle className='mt-0.5 h-4 w-4 flex-shrink-0 text-red-400' />
              <p className='text-sm text-red-400' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                {state === 'destroy-failed'
                  ? 'Infrastructure destroy failed. You can retry from Settings or view the logs for details.'
                  : 'Deployment failed. You can retry or edit your configuration and try again.'}
              </p>
            </div>
          </div>
        )}
        <DeploymentOverview deployment={deploymentInfo} />
      </div>
    );
  }

  // Multiple configs — show cards for each
  return (
    <div className='flex flex-col gap-6'>
      <DashboardHeader
        showAction={
          <Link
            href='/deployments/new'
            className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <Rocket className='h-4 w-4' />
            New Deployment
          </Link>
        }
      />
      <div className='flex flex-col gap-4'>
        {configs.map((config) => {
          const dep = deploymentMap.get(`${config.customer_id}-${config.environment}`);
          return <DeploymentCard key={config.customer_id} config={config} deployment={dep} />;
        })}
      </div>
    </div>
  );
}

function DashboardHeader({ showAction }: { showAction?: React.ReactNode }) {
  return (
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
      {showAction}
    </div>
  );
}
