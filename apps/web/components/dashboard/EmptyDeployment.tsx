'use client';

import { Rocket } from 'lucide-react';
import Link from 'next/link';

const deploySteps = [
  { step: 1, text: 'Network infrastructure is created in your AWS account' },
  { step: 2, text: 'Kubernetes cluster is provisioned with your configuration' },
  { step: 3, text: 'All applications and services are installed and configured' },
  { step: 4, text: 'Your cluster is ready to use (typically takes 30-40 minutes)' },
];

export function EmptyDeployment() {
  return (
    <div className='flex flex-col gap-6'>
      {/* Empty state card */}
      <div
        className='flex flex-col items-center justify-center gap-5 rounded-lg bg-[#222222] py-20'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        {/* Logo */}
        <img src='/logo.png' alt='HydraDB' className='h-16 w-[140px] object-contain opacity-50' />

        <p
          className='text-lg text-white'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          No deployment yet. Create your first deployment!
        </p>

        <Link
          href='/deployments/new'
          className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-[#E63D00]'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          <Rocket className='h-4 w-4' />
          New Deployment
        </Link>
      </div>

      {/* What happens card */}
      <div
        className='rounded-lg bg-[#222222] p-6'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        <h3
          className='mb-6 text-xl font-semibold text-white'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          What happens when you deploy?
        </h3>
        <div className='flex flex-col gap-5'>
          {deploySteps.map((item) => (
            <div key={item.step} className='flex items-start gap-4'>
              <div
                className='flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white'
                style={{
                  background: 'rgba(113, 113, 122, 0.15)',
                  fontFamily: 'Satoshi, sans-serif',
                }}
              >
                {item.step}
              </div>
              <p
                className='pt-0.5 text-base text-white'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
