'use client';

import { Check, Copy, Globe, Terminal } from 'lucide-react';
import { useState } from 'react';
import { useSsmSession } from '@/hooks/use-cluster';

interface DeploymentInfo {
  customerId: string;
  environment: string;
  rawEnvironment: string;
  status: 'live' | 'not-deployed';
  awsRegion: string;
  domain: string;
  kubernetesVersion: string;
  lastUpdated: string;
  deployDate: string;
  deployedAt?: string;
}

interface DeploymentOverviewProps {
  deployment: DeploymentInfo;
}

const deploySteps = [
  { step: 1, text: 'Network infrastructure is created in your AWS account' },
  { step: 2, text: 'Kubernetes cluster is provisioned with your configuration' },
  { step: 3, text: 'All applications and services are installed and configured' },
  { step: 4, text: 'Your cluster is ready to use (typically takes 30-40 minutes)' },
];

export function DeploymentOverview({ deployment }: DeploymentOverviewProps) {
  const isLive = deployment.status === 'live';

  const { data: ssmData } = useSsmSession(
    isLive ? deployment.customerId : null,
    isLive ? deployment.rawEnvironment : null,
  );
  const session = ssmData?.session;

  return (
    <div className='flex flex-col gap-6'>
      {/* Deployment Info Card */}
      <div className='rounded-lg bg-[#222222] p-6' style={{ border: '0.5px solid #5B5B5B' }}>
        {/* Header row */}
        <div className='mb-5 flex items-start gap-3'>
          {/* Signal icon */}
          <div className='flex h-10 w-10 items-center justify-center'>
            <svg width='28' height='28' viewBox='0 0 28 28' fill='none'>
              <circle cx='14' cy='14' r='4' fill={isLive ? '#00CF23' : '#A7A7A7'} />
              <path d='M8 8a8.5 8.5 0 0 1 12 0' stroke={isLive ? '#00CF23' : '#A7A7A7'} strokeWidth='1.5' strokeLinecap='round' fill='none' />
              <path d='M5 5a13 13 0 0 1 18 0' stroke={isLive ? '#00CF23' : '#A7A7A7'} strokeWidth='1.5' strokeLinecap='round' fill='none' opacity='0.5' />
            </svg>
          </div>
          <div className='flex flex-col'>
            <span className='text-2xl font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              {deployment.customerId}
            </span>
            <div className='flex items-center gap-2'>
              {isLive ? (
                <span
                  className='rounded px-1.5 py-0.5 text-xs font-medium text-[#00CF23]'
                  style={{ background: 'rgba(0, 207, 35, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
                >
                  Live
                </span>
              ) : (
                <span className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Not Deployed
                </span>
              )}
              {deployment.deployedAt && (
                <span className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Deployed: {deployment.deployedAt}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info row */}
        <div className='flex items-center gap-8'>
          <InfoItem icon={<Globe className='h-5 w-5 text-[#A7A7A7]' />} label='Region' value={deployment.awsRegion} />
          <InfoItem
            icon={
              <svg width='20' height='20' viewBox='0 0 20 20' fill='none'>
                <circle cx='10' cy='6' r='3' stroke='#A7A7A7' strokeWidth='1.5' fill='none' />
                <circle cx='6' cy='14' r='2' stroke='#A7A7A7' strokeWidth='1.5' fill='none' />
                <circle cx='14' cy='14' r='2' stroke='#A7A7A7' strokeWidth='1.5' fill='none' />
                <line x1='8' y1='8' x2='6' y2='12' stroke='#A7A7A7' strokeWidth='1' />
                <line x1='12' y1='8' x2='14' y2='12' stroke='#A7A7A7' strokeWidth='1' />
              </svg>
            }
            label='Domain'
            value={deployment.domain}
          />
          <InfoItem
            icon={
              <svg width='20' height='20' viewBox='0 0 20 20' fill='none'>
                <rect x='3' y='5' width='14' height='10' rx='2' stroke='#A7A7A7' strokeWidth='1.5' fill='none' />
                <line x1='3' y1='9' x2='17' y2='9' stroke='#A7A7A7' strokeWidth='1' />
              </svg>
            }
            label='Environment'
            value={deployment.environment}
          />
        </div>
      </div>

      {/* Bottom section */}
      {isLive ? (
        <>
          <div className='rounded-lg bg-[#222222] p-6' style={{ border: '0.5px solid #5B5B5B' }}>
            <h3 className='mb-5 text-xl font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Deployment Summary
            </h3>
            <div className='flex flex-col gap-4'>
              <SummaryItem label='Kubernetes Version' value={deployment.kubernetesVersion} />
              <SummaryItem label='Last Updated' value={deployment.lastUpdated} />
              <SummaryItem label='Deploy Date' value={deployment.deployDate} />
            </div>
          </div>

          {/* SSM Access Commands */}
          <div className='rounded-lg bg-[#222222] p-6' style={{ border: '0.5px solid #5B5B5B' }}>
            <div className='mb-5 flex items-center gap-2'>
              <Terminal className='h-5 w-5 text-[#FF4400]' />
              <h3 className='text-xl font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                Cluster Access
              </h3>
            </div>

            {session ? (
              <div className='flex flex-col gap-4'>
                <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Use the following commands to access your EKS cluster via SSM Session Manager.
                </p>

                <CommandBlock
                  label='1. Start SSM Session'
                  command={session.start_session_command}
                />
                <CommandBlock
                  label='2. Configure kubectl (run inside session)'
                  command={session.configure_kubectl_command}
                />
                <CommandBlock
                  label='3. Verify cluster access'
                  command='kubectl get nodes'
                />

                <div
                  className='rounded-lg p-4'
                  style={{ background: 'rgba(255, 68, 0, 0.06)', border: '0.5px solid rgba(255, 68, 0, 0.2)' }}
                >
                  <p className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                    <span className='font-semibold text-[#FF4400]'>Prerequisites:</span>{' '}
                    Install the AWS CLI and Session Manager plugin. Configure AWS credentials with access to the customer account.
                  </p>
                </div>
              </div>
            ) : (
              <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                Loading access commands...
              </p>
            )}
          </div>
        </>
      ) : (
        <div className='rounded-lg bg-[#222222] p-6' style={{ border: '0.5px solid #5B5B5B' }}>
          <h3 className='mb-5 text-xl font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            What happens when you deploy?
          </h3>
          <div className='flex flex-col gap-4'>
            {deploySteps.map((item) => (
              <div key={item.step} className='flex items-start gap-3'>
                <div
                  className='flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white'
                  style={{ background: 'rgba(113, 113, 122, 0.15)', fontFamily: 'Satoshi, sans-serif' }}
                >
                  {item.step}
                </div>
                <p className='text-sm text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className='flex items-center gap-2'>
      {icon}
      <div className='flex flex-col'>
        <span className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>{label}</span>
        <span className='text-sm font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>{value}</span>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>{label}</span>
      <span className='text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>{value}</span>
    </div>
  );
}

function CommandBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-xs font-medium text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        {label}
      </span>
      <div className='flex items-center justify-between rounded-lg bg-[#1A1A1A] px-4 py-3' style={{ border: '0.5px solid #3A3A3A' }}>
        <code className='text-sm text-[#22D3EE]' style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {command}
        </code>
        <button
          onClick={handleCopy}
          className='ml-3 flex-shrink-0 text-[#A7A7A7] transition-colors hover:text-white'
        >
          {copied ? <Check className='h-4 w-4 text-[#00CF23]' /> : <Copy className='h-4 w-4' />}
        </button>
      </div>
    </div>
  );
}
