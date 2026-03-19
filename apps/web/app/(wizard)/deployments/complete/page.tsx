'use client';

import { Check, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function DeploymentCompletePage() {
  const searchParams = useSearchParams();
  const region = searchParams.get('region') || 'us-east-1';
  const elapsed = searchParams.get('elapsed');

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
        {/* Green checkmark circle */}
        <div className='mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#00CF23]'>
          <Check className='h-8 w-8 text-white' strokeWidth={3} />
        </div>

        {/* Title */}
        <h1
          className='mb-3 text-2xl font-bold text-white'
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Deployment Complete
        </h1>

        {/* Subtitle */}
        <p
          className='mb-6 text-base text-[#A7A7A7]'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          Your cluster is now running in {region}
        </p>

        {/* Time elapsed badge */}
        <div
          className='mb-8 flex items-center gap-2 rounded-lg px-5 py-2.5'
          style={{ border: '0.67px solid #5B5B5B', fontFamily: "'JetBrains Mono', monospace" }}
        >
          <Clock className='h-4 w-4 text-white' />
          <span className='text-sm text-white'>Time Elapsed : {elapsedDisplay}</span>
        </div>

        {/* Action buttons */}
        <div className='flex items-center gap-3'>
          <Link
            href='/dashboard'
            className='rounded-lg bg-[#FF4400] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00]'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            Go to Dashboard
          </Link>
          <button
            className='flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-[#1D1E1F] transition-colors hover:bg-gray-100'
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            <ExternalLink className='h-4 w-4' />
            Open App
          </button>
        </div>
      </div>
    </div>
  );
}
