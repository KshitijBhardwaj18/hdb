'use client';

import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useDeploymentStatus, useDeploy } from '@/hooks/use-deployment';
import { DeploymentStatus } from '@/types/deployment.types';

interface DeploymentStage {
  id: string;
  label: string;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
}

const STAGE_DEFS: { id: string; label: string }[] = [
  { id: 'network', label: 'Creating Network' },
  { id: 'cluster', label: 'Provisioning Cluster' },
  { id: 'storage', label: 'Setting Up Storage' },
  { id: 'platform', label: 'Installing Platform' },
  { id: 'applications', label: 'Deploying Applications' },
];

// Time-based heuristic: approximate minutes per stage (infra ~35 min)
const STAGE_DURATIONS = [5, 12, 5, 8, 5]; // total ~35 min

// Extra addon installation time after backend reports SUCCEEDED (10 min)
const ADDON_PHASE_SECONDS = 10 * 60;

function getStagesFromElapsed(
  elapsedSeconds: number,
  backendStatus: DeploymentStatus | undefined,
  addonPhaseActive: boolean,
  addonElapsedSeconds: number,
): DeploymentStage[] {
  // Fully done (addon phase also complete)
  if (backendStatus === DeploymentStatus.SUCCEEDED && !addonPhaseActive) {
    return STAGE_DEFS.map((s) => ({ ...s, status: 'completed' as const }));
  }

  if (backendStatus === DeploymentStatus.FAILED) {
    const elapsedMinutes = elapsedSeconds / 60;
    let accumulated = 0;
    return STAGE_DEFS.map((s, i) => {
      const stageStart = accumulated;
      accumulated += STAGE_DURATIONS[i]!;
      if (elapsedMinutes >= accumulated) return { ...s, status: 'completed' as const };
      if (elapsedMinutes >= stageStart) return { ...s, status: 'failed' as const };
      return { ...s, status: 'pending' as const };
    });
  }

  // Backend succeeded but addon phase still running — first 4 complete, last one in progress
  if (backendStatus === DeploymentStatus.SUCCEEDED && addonPhaseActive) {
    return STAGE_DEFS.map((s, i) => {
      if (i < 4) return { ...s, status: 'completed' as const };
      return { ...s, status: 'in-progress' as const };
    });
  }

  // Normal in-progress
  const elapsedMinutes = elapsedSeconds / 60;
  let accumulated = 0;
  return STAGE_DEFS.map((s, i) => {
    const stageStart = accumulated;
    accumulated += STAGE_DURATIONS[i]!;
    if (elapsedMinutes >= accumulated) return { ...s, status: 'completed' as const };
    if (elapsedMinutes >= stageStart) return { ...s, status: 'in-progress' as const };
    return { ...s, status: 'pending' as const };
  });
}

// Parse server timestamp as UTC (append Z if no timezone info present)
function parseUtc(ts: string): number {
  if (!ts) return 0;
  const normalized = /[Z+\-]\d{0,2}:?\d{0,2}$/.test(ts) ? ts : ts + 'Z';
  return new Date(normalized).getTime();
}

export default function DeploymentProgressPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');
  const environment = searchParams.get('environment');

  const [expandedStage, setExpandedStage] = useState<string | null>('network');
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [, setTick] = useState(0);
  const navigatedRef = useRef(false);
  const addonStartRef = useRef<number | null>(null);

  const { data: deployment } = useDeploymentStatus(customerId, environment);
  const retryDeploy = useDeploy();

  const backendStatus = deployment?.status;

  // Track addon phase: starts when backend first reports SUCCEEDED
  if (backendStatus === DeploymentStatus.SUCCEEDED && addonStartRef.current === null) {
    addonStartRef.current = Date.now();
  }
  // Reset on retry
  if (backendStatus === DeploymentStatus.PENDING || backendStatus === DeploymentStatus.IN_PROGRESS) {
    addonStartRef.current = null;
  }

  const addonElapsedSeconds = addonStartRef.current
    ? Math.floor((Date.now() - addonStartRef.current) / 1000)
    : 0;
  const addonPhaseActive = backendStatus === DeploymentStatus.SUCCEEDED && addonElapsedSeconds < ADDON_PHASE_SECONDS;

  // Compute elapsed from deployment timestamps
  const elapsedSeconds = (() => {
    if (!deployment?.updated_at) return 0;
    if (deployment.status === DeploymentStatus.FAILED) {
      const startMs = parseUtc(deployment.created_at);
      const endMs = parseUtc(deployment.updated_at);
      return Math.max(0, Math.floor((endMs - startMs) / 1000));
    }
    const startMs = parseUtc(deployment.updated_at);
    const nowMs = Date.now();
    return Math.max(0, Math.floor((nowMs - startMs) / 1000));
  })();

  const stages = getStagesFromElapsed(elapsedSeconds, backendStatus, addonPhaseActive, addonElapsedSeconds);

  // Tick every second to re-render
  useEffect(() => {
    if (backendStatus === DeploymentStatus.FAILED) return;
    if (backendStatus === DeploymentStatus.SUCCEEDED && !addonPhaseActive) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [backendStatus, addonPhaseActive]);

  // Navigate to complete after addon phase finishes
  useEffect(() => {
    if (backendStatus === DeploymentStatus.SUCCEEDED && !addonPhaseActive && !navigatedRef.current) {
      navigatedRef.current = true;
      const timer = setTimeout(() => {
        const params = new URLSearchParams();
        if (customerId) params.set('customerId', customerId);
        if (environment) params.set('environment', environment);
        params.set('elapsed', String(elapsedSeconds + ADDON_PHASE_SECONDS));
        if (deployment?.aws_region) params.set('region', deployment.aws_region);
        router.push(`/deployments/complete?${params.toString()}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [backendStatus, addonPhaseActive, customerId, environment, elapsedSeconds, deployment, router]);

  // Auto-expand current stage
  useEffect(() => {
    const current = stages.find((s) => s.status === 'in-progress' || s.status === 'failed');
    if (current) setExpandedStage(current.id);
  }, [stages]);

  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const overallProgress = Math.round((completedCount / stages.length) * 100);
  const isFailed = backendStatus === DeploymentStatus.FAILED;

  // Display elapsed: for addon phase, add addon time to infra time
  const displayElapsed = addonPhaseActive ? elapsedSeconds + addonElapsedSeconds : elapsedSeconds;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const getSegmentProgress = (index: number) => {
    const stage = stages[index];
    if (!stage) return 0;
    if (stage.status === 'completed') return 100;
    if (stage.status === 'pending') return 0;
    if (stage.status === 'failed') return 50;
    // Addon phase progress for last stage
    if (index === 4 && addonPhaseActive) {
      return Math.min(Math.round((addonElapsedSeconds / ADDON_PHASE_SECONDS) * 100), 95);
    }
    const elapsedMinutes = elapsedSeconds / 60;
    let stageStart = 0;
    for (let i = 0; i < index; i++) stageStart += STAGE_DURATIONS[i]!;
    const stageDuration = STAGE_DURATIONS[index]!;
    const stageElapsed = elapsedMinutes - stageStart;
    return Math.min(Math.round((stageElapsed / stageDuration) * 100), 95);
  };

  const handleRetry = async () => {
    if (!customerId || !environment) return;
    await retryDeploy.mutateAsync({ customerId, request: { environment } });
    navigatedRef.current = false;
    addonStartRef.current = null;
  };

  return (
    <div className='flex min-h-screen flex-col'>
      {/* Header */}
      <div
        className='flex items-center justify-between px-8 py-5'
        style={{ borderBottom: '0.5px solid #5B5B5B' }}
      >
        <div className='flex flex-col gap-0.5'>
          <h1
            className='text-2xl font-semibold text-white'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            Deployment Progress
          </h1>
          <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            {customerId} / {environment}
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className='flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
          style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
        >
          <ArrowLeft className='h-4 w-4' />
          Dashboard
        </button>
      </div>

      {/* Content */}
      <div className='flex flex-1 items-start justify-center px-8 py-8'>
        <div className='w-full max-w-[900px]'>
          <div className='rounded-lg bg-[#222222] p-8' style={{ border: '0.5px solid #5B5B5B' }}>
            {/* Title */}
            <h2
              className='mb-2 text-center text-2xl font-bold text-white'
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {isFailed ? 'Deployment Failed' : addonPhaseActive ? 'Deploying Applications' : 'Deploying Your Cluster'}
            </h2>
            <p
              className='mb-8 text-center text-base text-[#A7A7A7]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {isFailed
                ? deployment?.error_message || 'An error occurred during deployment'
                : addonPhaseActive
                  ? 'Infrastructure is ready. Installing applications and services...'
                  : 'This typically takes 30-40 minutes'}
            </p>

            {/* Progress bar */}
            <div className='mb-8'>
              <div className='mb-2 flex items-center justify-between'>
                <span className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Progress
                </span>
                <span className='text-sm font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  {overallProgress}%
                </span>
              </div>

              {/* 5-segment progress bar */}
              <div className='mb-2 flex gap-1'>
                {stages.map((stage, i) => {
                  const progress = getSegmentProgress(i);
                  return (
                    <div
                      key={stage.id}
                      className='h-2.5 flex-1 overflow-hidden rounded-sm bg-[#2A2A2A]'
                    >
                      <div
                        className='h-full rounded-sm transition-all duration-500'
                        style={{
                          width: `${progress}%`,
                          background: stage.status === 'failed'
                            ? '#EF4444'
                            : 'linear-gradient(90deg, #00CF23, #00E025)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Stage labels */}
              <div className='flex'>
                {stages.map((stage, i) => (
                  <span
                    key={stage.id}
                    className='flex-1 text-center text-xs text-[#A7A7A7]'
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  >
                    {String(i + 1).padStart(2, '0')}. {stage.label.replace('Creating ', '').replace('Provisioning ', '').replace('Setting Up ', '').replace('Installing ', '').replace('Deploying ', '')}
                  </span>
                ))}
              </div>
            </div>

            {/* Stage list */}
            <div className='flex flex-col gap-3'>
              {stages.map((stage) => {
                const isExpanded = expandedStage === stage.id;

                return (
                  <div key={stage.id}>
                    <div className='flex items-center justify-between py-2'>
                      <div className='flex items-center gap-3'>
                        {stage.status === 'completed' && (
                          <div className='flex h-8 w-8 items-center justify-center rounded-full bg-[#00CF23]'>
                            <Check className='h-4 w-4 text-white' strokeWidth={3} />
                          </div>
                        )}
                        {stage.status === 'in-progress' && (
                          <div className='flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#A7A7A7]'>
                            <Loader2 className='h-4 w-4 animate-spin text-[#A7A7A7]' />
                          </div>
                        )}
                        {stage.status === 'failed' && (
                          <div className='flex h-8 w-8 items-center justify-center rounded-full bg-red-500'>
                            <AlertCircle className='h-4 w-4 text-white' />
                          </div>
                        )}
                        {stage.status === 'pending' && (
                          <div className='flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#3A3A3A]'>
                            <div className='h-2 w-2 rounded-full bg-[#3A3A3A]' />
                          </div>
                        )}

                        <span
                          className={`text-base font-medium ${
                            stage.status === 'pending' ? 'text-[#A7A7A7]' : 'text-white'
                          }`}
                          style={{ fontFamily: 'Satoshi, sans-serif' }}
                        >
                          {stage.label}
                        </span>

                        {stage.status === 'completed' && (
                          <span
                            className='rounded px-2 py-0.5 text-xs font-medium text-[#00CF23]'
                            style={{ background: 'rgba(0, 207, 35, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
                          >
                            Completed
                          </span>
                        )}
                        {stage.status === 'in-progress' && (
                          <span
                            className='rounded border border-[#5B5B5B] px-2 py-0.5 text-xs font-medium text-white'
                            style={{ fontFamily: 'Satoshi, sans-serif' }}
                          >
                            In Progress
                          </span>
                        )}
                        {stage.status === 'failed' && (
                          <span
                            className='rounded px-2 py-0.5 text-xs font-medium text-red-400'
                            style={{ background: 'rgba(239, 68, 68, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
                          >
                            Failed
                          </span>
                        )}
                      </div>

                      {stage.status !== 'pending' && (
                        <button
                          onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                          className='flex items-center gap-1 text-sm text-[#A7A7A7] transition-colors hover:text-white'
                          style={{ fontFamily: 'Satoshi, sans-serif' }}
                        >
                          {isExpanded ? 'Hide Log' : 'View Log'}
                          {isExpanded ? (
                            <ChevronUp className='h-4 w-4' />
                          ) : (
                            <ChevronDown className='h-4 w-4' />
                          )}
                        </button>
                      )}
                    </div>

                    {isExpanded && stage.status !== 'pending' && (
                      <div
                        className='ml-11 mt-1 rounded-lg bg-[#1A1A1A] p-4'
                        style={{ border: '0.5px solid #333' }}
                      >
                        <p
                          className={`text-sm leading-relaxed ${stage.status === 'failed' ? 'text-red-400' : 'text-[#00CF23]'}`}
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {stage.status === 'failed'
                            ? `> Error: ${deployment?.error_message || 'Deployment failed at this stage'}`
                            : stage.status === 'completed'
                              ? `> ${stage.label.replace('Creating', 'Created').replace('Provisioning', 'Provisioned').replace('Setting Up', 'Set up').replace('Installing', 'Installed').replace('Deploying', 'Deployed')} successfully.`
                              : '> Processing...'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className='flex items-center justify-end gap-3 px-8 py-4'
        style={{ borderTop: '0.5px solid #5B5B5B' }}
      >
        <div
          className='flex items-center gap-2 rounded-lg px-5 py-2.5'
          style={{ border: '0.67px solid #5B5B5B', fontFamily: "'JetBrains Mono', monospace" }}
        >
          <Clock className='h-4 w-4 text-white' />
          <span className='text-sm text-white'>
            Time Elapsed : {formatTime(displayElapsed)}
          </span>
        </div>

        {isFailed ? (
          <button
            onClick={handleRetry}
            disabled={retryDeploy.isPending}
            className='rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-60'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            {retryDeploy.isPending ? 'Retrying...' : 'Retry Deployment'}
          </button>
        ) : (
          <button
            onClick={() => setShowStopConfirm(true)}
            className='rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            Stop Deployment
          </button>
        )}
      </div>

      {/* Stop Deployment Confirmation Modal */}
      {showStopConfirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div
            className='flex w-full max-w-[440px] flex-col gap-5 rounded-lg bg-[#222222] p-6'
            style={{ border: '0.5px solid #5B5B5B' }}
          >
            <div className='flex flex-col gap-2'>
              <div className='flex items-center gap-2'>
                <AlertCircle className='h-5 w-5 text-amber-400' />
                <h3
                  className='text-lg font-semibold text-white'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                >
                  Cannot Stop Deployment
                </h3>
              </div>
              <p
                className='text-sm text-[#A7A7A7]'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                Once a deployment has started, it cannot be stopped. The infrastructure
                provisioning process must complete before any changes can be made.
              </p>
              <p
                className='text-sm text-[#A7A7A7]'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                You can safely leave this page and check the progress from your dashboard.
              </p>
            </div>
            <div className='flex items-center justify-end gap-3'>
              <button
                onClick={() => router.push('/dashboard')}
                className='rounded-lg px-4 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => setShowStopConfirm(false)}
                className='rounded-lg bg-[#FF4400] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                Continue Watching
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
