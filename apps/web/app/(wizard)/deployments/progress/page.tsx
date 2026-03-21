'use client';

import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useDeploymentStatus, useDeploymentEvents, useDeploy } from '@/hooks/use-deployment';
import { DeploymentStatus } from '@/types/deployment.types';
import type { DeploymentEvent, DeploymentEventType } from '@/types/deployment.types';

// ---------------------------------------------------------------------------
// Stage definitions — mapped from real backend events
// ---------------------------------------------------------------------------

interface Stage {
  id: string;
  label: string;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
  events: DeploymentEvent[];
}

/** Which event types belong to which stage. */
const STAGE_MAP: { id: string; label: string; startEvents: DeploymentEventType[]; doneEvents: DeploymentEventType[]; failEvents: DeploymentEventType[] }[] = [
  {
    id: 'setup',
    label: 'Preparing Deployment',
    startEvents: ['deploy_queued', 'deploy_lock_acquired', 'config_loaded'],
    doneEvents: ['config_loaded'],
    failEvents: ['deploy_lock_failed'],
  },
  {
    id: 'infrastructure',
    label: 'Provisioning Infrastructure',
    startEvents: ['pulumi_configuring', 'pulumi_running', 'pulumi_progress'],
    doneEvents: ['pulumi_succeeded'],
    failEvents: ['pulumi_failed'],
  },
  {
    id: 'gitops',
    label: 'Configuring GitOps',
    startEvents: ['gitops_started'],
    doneEvents: ['gitops_succeeded'],
    failEvents: ['gitops_failed'],
  },
  {
    id: 'addons',
    label: 'Installing Applications',
    startEvents: ['addons_waiting', 'addons_started'],
    doneEvents: ['addons_succeeded'],
    failEvents: ['addons_failed'],
  },
  {
    id: 'complete',
    label: 'Finalizing',
    startEvents: ['deploy_succeeded'],
    doneEvents: ['deploy_succeeded'],
    failEvents: ['deploy_failed'],
  },
];

const DESTROY_STAGE_MAP: typeof STAGE_MAP = [
  {
    id: 'setup',
    label: 'Preparing Destroy',
    startEvents: ['destroy_queued', 'destroy_lock_acquired'],
    doneEvents: ['destroy_lock_acquired'],
    failEvents: ['destroy_lock_failed'],
  },
  {
    id: 'cleanup',
    label: 'Pre-Destroy Cleanup',
    startEvents: ['cleanup_started'],
    doneEvents: ['cleanup_succeeded'],
    failEvents: ['cleanup_failed'],
  },
  {
    id: 'destroy',
    label: 'Destroying Infrastructure',
    startEvents: ['pulumi_destroying'],
    doneEvents: ['pulumi_destroy_succeeded'],
    failEvents: ['pulumi_destroy_failed'],
  },
  {
    id: 'complete',
    label: 'Finalizing',
    startEvents: ['destroy_succeeded'],
    doneEvents: ['destroy_succeeded'],
    failEvents: ['destroy_failed'],
  },
];

/** Detect terminal failure from events (faster than status polling). */
function hasTerminalFailure(events: DeploymentEvent[], isDestroy: boolean): boolean {
  return events.some(
    (e) => e.event_type === (isDestroy ? 'destroy_failed' : 'deploy_failed'),
  );
}

function buildStages(
  events: DeploymentEvent[],
  backendStatus: DeploymentStatus | undefined,
  isDestroy: boolean,
): Stage[] {
  const stageMap = isDestroy ? DESTROY_STAGE_MAP : STAGE_MAP;
  const eventTypes = new Set(events.map((e) => e.event_type));
  const terminalFail = hasTerminalFailure(events, isDestroy);

  return stageMap.map((def) => {
    const stageEvents = events.filter(
      (e) =>
        def.startEvents.includes(e.event_type) ||
        def.doneEvents.includes(e.event_type) ||
        def.failEvents.includes(e.event_type),
    );

    const hasFailed = def.failEvents.some((t) => eventTypes.has(t));
    const hasDone = def.doneEvents.some((t) => eventTypes.has(t));
    const hasStarted = def.startEvents.some((t) => eventTypes.has(t));

    let status: Stage['status'] = 'pending';
    if (hasFailed) status = 'failed';
    else if (hasDone) status = 'completed';
    else if (hasStarted) {
      // If terminal failure happened, any in-progress stage is failed too
      status = terminalFail ? 'failed' : 'in-progress';
    }

    return { id: def.id, label: def.label, status, events: stageEvents };
  });
}

// Parse server timestamp as UTC
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

  const [expandedStage, setExpandedStage] = useState<string | null>('setup');
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [, setTick] = useState(0);
  const navigatedRef = useRef(false);

  const { data: deployment } = useDeploymentStatus(customerId, environment);
  const { data: events = [] } = useDeploymentEvents(customerId, environment);
  const retryDeploy = useDeploy();

  const backendStatus = deployment?.status;
  const isDestroy = backendStatus === DeploymentStatus.DESTROYING || events.some((e) => e.event_type.startsWith('destroy_'));

  const stages = useMemo(
    () => buildStages(events, backendStatus, isDestroy),
    [events, backendStatus, isDestroy],
  );

  // Detect failure from events (faster than status poll)
  const eventFailed = hasTerminalFailure(events, isDestroy);
  const isFailed = backendStatus === DeploymentStatus.FAILED || eventFailed;
  const isTerminal =
    isFailed ||
    backendStatus === DeploymentStatus.SUCCEEDED ||
    backendStatus === DeploymentStatus.DESTROYED;

  // Compute elapsed purely from server timestamps (avoids client/server clock skew).
  // For in-progress: server span + local seconds since last event poll.
  const serverSpanMs = useMemo(() => {
    if (events.length < 2) return 0;
    return parseUtc(events[events.length - 1]!.timestamp) - parseUtc(events[0]!.timestamp);
  }, [events]);

  const lastEventReceivedAt = useRef(0);
  useEffect(() => {
    if (events.length > 0) lastEventReceivedAt.current = Date.now();
  }, [events]);

  const elapsedSeconds = (() => {
    if (events.length === 0) return 0;
    if (isTerminal) {
      return Math.max(0, Math.floor(serverSpanMs / 1000));
    }
    // Server span + time since we last received an event (local delta only)
    const localDelta = lastEventReceivedAt.current > 0 ? Date.now() - lastEventReceivedAt.current : 0;
    return Math.max(0, Math.floor((serverSpanMs + localDelta) / 1000));
  })();

  // Tick every second for the timer (stop on terminal state)
  useEffect(() => {
    if (isTerminal) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isTerminal]);

  // Navigate to complete after success
  useEffect(() => {
    if (
      (backendStatus === DeploymentStatus.SUCCEEDED || backendStatus === DeploymentStatus.DESTROYED) &&
      !navigatedRef.current
    ) {
      navigatedRef.current = true;
      const timer = setTimeout(() => {
        const params = new URLSearchParams();
        if (customerId) params.set('customerId', customerId);
        if (environment) params.set('environment', environment);
        params.set('elapsed', String(elapsedSeconds));
        if (deployment?.aws_region) params.set('region', deployment.aws_region);
        if (backendStatus === DeploymentStatus.DESTROYED) {
          params.set('destroyed', '1');
        }
        router.push(`/deployments/complete?${params.toString()}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [backendStatus, customerId, environment, elapsedSeconds, deployment, router]);

  // Auto-expand current stage
  useEffect(() => {
    const current = stages.find((s) => s.status === 'in-progress' || s.status === 'failed');
    if (current) setExpandedStage(current.id);
  }, [stages]);

  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const failedCount = stages.filter((s) => s.status === 'failed').length;
  const overallProgress = isFailed
    ? Math.round(((completedCount + failedCount) / stages.length) * 100)
    : Math.round((completedCount / stages.length) * 100);

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
    // In-progress: pulse at 60%
    return 60;
  };

  const handleRetry = async () => {
    if (!customerId || !environment) return;
    navigatedRef.current = false;
    await retryDeploy.mutateAsync({ customerId, request: { environment } });
  };

  const title = isFailed
    ? isDestroy ? 'Destroy Failed' : 'Deployment Failed'
    : isDestroy
      ? 'Destroying Infrastructure'
      : 'Deploying Your Cluster';

  const failedEvent = [...events].reverse().find((e) =>
    e.event_type === 'deploy_failed' || e.event_type === 'destroy_failed',
  );
  const subtitle = isFailed
    ? deployment?.error_message || failedEvent?.message || 'An error occurred'
    : isDestroy
      ? 'Removing all resources from your AWS account'
      : 'This typically takes 30-40 minutes';

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
            {isDestroy ? 'Destroy Progress' : 'Deployment Progress'}
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
            <h2
              className='mb-2 text-center text-2xl font-bold text-white'
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {title}
            </h2>
            <p
              className='mb-8 text-center text-base text-[#A7A7A7]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {subtitle}
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
                            : isDestroy
                              ? 'linear-gradient(90deg, #EF4444, #F87171)'
                              : 'linear-gradient(90deg, #00CF23, #00E025)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className='flex'>
                {stages.map((stage, i) => (
                  <span
                    key={stage.id}
                    className='flex-1 text-center text-xs text-[#A7A7A7]'
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  >
                    {String(i + 1).padStart(2, '0')}. {stage.label}
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

                      {stage.events.length > 0 && (
                        <button
                          onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                          className='flex items-center gap-1 text-sm text-[#A7A7A7] transition-colors hover:text-white'
                          style={{ fontFamily: 'Satoshi, sans-serif' }}
                        >
                          {isExpanded ? 'Hide Log' : 'View Log'}
                          {isExpanded ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
                        </button>
                      )}
                    </div>

                    {isExpanded && stage.events.length > 0 && (
                      <div
                        className='ml-11 mt-1 rounded-lg bg-[#1A1A1A] p-4'
                        style={{ border: '0.5px solid #333' }}
                      >
                        <div className='flex flex-col gap-1'>
                          {stage.events.map((event, idx) => (
                            <p
                              key={event.id || idx}
                              className={`text-sm leading-relaxed ${
                                event.event_type.includes('failed')
                                  ? 'text-red-400'
                                  : event.event_type.includes('succeeded') || event.event_type.includes('loaded')
                                    ? 'text-[#00CF23]'
                                    : 'text-[#A7A7A7]'
                              }`}
                              style={{ fontFamily: "'JetBrains Mono', monospace" }}
                            >
                              <span className='text-[#555]'>
                                [{new Date(event.timestamp).toLocaleTimeString()}]
                              </span>{' '}
                              {event.message}
                            </p>
                          ))}
                          {stage.events.some((e) => e.details) && (
                            <details className='mt-2'>
                              <summary className='cursor-pointer text-xs text-[#555] hover:text-[#A7A7A7]'>
                                Show details
                              </summary>
                              <pre className='mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-[#666]'>
                                {stage.events
                                  .filter((e) => e.details)
                                  .map((e) => e.details)
                                  .join('\n')}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* No events yet — show waiting message */}
            {events.length === 0 && !isFailed && (
              <div className='mt-4 flex items-center justify-center gap-2 text-sm text-[#A7A7A7]'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span style={{ fontFamily: 'Satoshi, sans-serif' }}>Waiting for deployment to start...</span>
              </div>
            )}
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
            Time Elapsed : {formatTime(elapsedSeconds)}
          </span>
        </div>

        {isFailed ? (
          <>
            <button
              onClick={() => router.push('/dashboard')}
              className='rounded-lg px-5 py-2.5 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
              style={{ border: '0.67px solid #5B5B5B', fontFamily: 'Satoshi, sans-serif' }}
            >
              Go to Dashboard
            </button>
            {!isDestroy && (
              <button
                onClick={handleRetry}
                disabled={retryDeploy.isPending}
                className='rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-60'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                {retryDeploy.isPending ? 'Retrying...' : 'Retry Deployment'}
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => setShowStopConfirm(true)}
            className='rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            {isDestroy ? 'Stop Destroy' : 'Stop Deployment'}
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
                  Cannot Stop Operation
                </h3>
              </div>
              <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                Once {isDestroy ? 'a destroy' : 'a deployment'} has started, it cannot be stopped.
                The process must complete before any changes can be made.
              </p>
              <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
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
