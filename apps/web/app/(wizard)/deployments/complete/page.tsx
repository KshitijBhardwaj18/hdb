'use client';

import { Check, Clock, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function DeploymentCompletePage() {
  const searchParams = useSearchParams();
  const region = searchParams.get('region') || 'us-east-1';
  const elapsed = searchParams.get('elapsed');
  const destroyed = searchParams.get('destroyed') === '1';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const elapsedDisplay = elapsed ? formatTime(parseInt(elapsed, 10)) : '\u2014';

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-[#1D1E1F]'>
      <div
        className='flex w-full max-w-[600px] flex-col items-center rounded-lg bg-[#222222] px-12 py-16'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        {/* Icon */}
        <div
          className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full ${
            destroyed ? 'bg-red-500' : 'bg-[#00CF23]'
          }`}
        >
          {destroyed ? (
            <Trash2 className='h-8 w-8 text-white' />
          ) : (
            <Check className='h-8 w-8 text-white' strokeWidth={3} />
          )}
        </div>

        {/* Title */}
        <h1
          className='mb-3 text-2xl font-bold text-white'
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {destroyed ? 'Infrastructure Destroyed' : 'Deployment Complete'}
        </h1>

        {/* Subtitle */}
        <p
          className='mb-6 text-base text-[#A7A7A7]'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          {destroyed
            ? 'All resources have been removed from your AWS account'
            : `Your cluster is now running in ${region}`}
        </p>

        {/* Time elapsed badge */}
        <div
          className='mb-8 flex items-center gap-2 rounded-lg px-5 py-2.5'
          style={{ border: '0.67px solid #5B5B5B', fontFamily: "'JetBrains Mono', monospace" }}
        >
          <Clock className='h-4 w-4 text-white' />
          <span className='text-sm text-white'>Time Elapsed : {elapsedDisplay}</span>
        </div>

        {/* Post-deploy DNS instructions */}
        {!destroyed && (
          <div
            className='mb-8 w-full rounded-lg p-5'
            style={{ backgroundColor: '#1A1A1A', border: '0.5px solid #5B5B5B' }}
          >
            <h3
              className='mb-3 text-sm font-semibold text-white'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              Next Steps: Configure DNS
            </h3>
            <p
              className='mb-3 text-sm text-[#A7A7A7]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              Create a wildcard CNAME record pointing to your cluster&apos;s load balancer to enable all services.
            </p>
            <div
              className='rounded-lg bg-[#202020] p-4'
              style={{ border: '0.5px solid #333', fontFamily: "'JetBrains Mono', monospace" }}
            >
              <p className='mb-2 text-xs text-[#A7A7A7]'>DNS Record:</p>
              <p className='text-sm text-[#00CF23]'>
                *.hydradb.{'<your-domain>'}  CNAME  {'<NLB-address>'}
              </p>
              <p className='mb-1 mt-3 text-xs text-[#A7A7A7]'>This will enable:</p>
              <div className='flex flex-col gap-0.5 text-xs text-[#A7A7A7]'>
                <span>dashboard.hydradb.{'<your-domain>'}</span>
                <span>cortex-app.hydradb.{'<your-domain>'}</span>
                <span>argocd.hydradb.{'<your-domain>'}</span>
                <span>grafana.hydradb.{'<your-domain>'}</span>
                <span>and all other services...</span>
              </div>
            </div>
            <p
              className='mt-3 text-xs text-[#A7A7A7]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              The NLB address can be found in your AWS Console under EC2 → Load Balancers, or in the deployment details on your dashboard.
            </p>
            <div className='mt-3 rounded-lg bg-[#202020] p-3' style={{ border: '0.5px solid #333' }}>
              <p className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                <span className='font-semibold text-white'>Minimum Requirements:</span> Your AWS account needs at least 32 vCPU quota for On-Demand Standard instances.
                Check at AWS Console → Service Quotas → EC2 → Running On-Demand Standard instances.
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className='flex items-center gap-3'>
          <Link
            href='/dashboard'
            className='rounded-lg bg-[#FF4400] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            Go to Dashboard
          </Link>
          {!destroyed && (
            <button
              className='flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-[#1D1E1F] transition-colors hover:bg-gray-100'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              <ExternalLink className='h-4 w-4' />
              Open App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
