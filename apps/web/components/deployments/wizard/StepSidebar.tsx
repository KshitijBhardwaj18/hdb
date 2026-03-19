'use client';

import { cn } from '@repo/ui/lib/utils';
import { WIZARD_STEPS } from './types';

interface StepSidebarProps {
  currentStep: number;
}

export function StepSidebar({ currentStep }: StepSidebarProps) {
  return (
    <div className='flex flex-col gap-1'>
      {WIZARD_STEPS.map((step) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-3 rounded-full px-3 py-2 transition-colors',
              isActive && 'bg-[#FF4400]/10',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                isActive
                  ? 'border-[#FF4400] bg-[#FF4400] text-white'
                  : isCompleted
                    ? 'border-[#FF4400] text-[#FF4400]'
                    : 'border-[#5B5B5B] text-[#A7A7A7]',
              )}
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {String(step.number).padStart(2, '0')}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                isActive ? 'text-white' : isCompleted ? 'text-white' : 'text-[#A7A7A7]',
              )}
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
