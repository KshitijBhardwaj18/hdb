'use client';

import { Check } from 'lucide-react';
import { WIZARD_STEPS } from './types';

interface HorizontalStepperProps {
  currentStep: number;
}

export function HorizontalStepper({ currentStep }: HorizontalStepperProps) {
  return (
    <div className='flex items-center justify-center gap-0'>
      {WIZARD_STEPS.map((step, index) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        const isLast = index === WIZARD_STEPS.length - 1;

        return (
          <div key={step.id} className='flex items-center'>
            {/* Step circle with pill background for active */}
            <div className='flex flex-col items-center gap-2'>
              <div className='flex items-center'>
                {/* Pill background for active/completed */}
                <div
                  className={`flex items-center justify-center rounded-full ${
                    isActive
                      ? 'h-[42px] w-[90px] bg-[#FF4400]'
                      : isCompleted
                        ? 'h-[42px] w-[90px] bg-[#FF4400]/20'
                        : 'h-[42px] w-[70px] bg-[#2A2A2A]'
                  }`}
                  style={{ border: isActive || isCompleted ? 'none' : '0.5px solid #5B5B5B' }}
                >
                  {isCompleted ? (
                    <div className='flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#FF4400]'>
                      <Check className='h-4 w-4 text-white' strokeWidth={3} />
                    </div>
                  ) : (
                    <span
                      className={`text-sm font-medium ${isActive ? 'text-white' : 'text-[#A7A7A7]'}`}
                      style={{ fontFamily: 'Satoshi, sans-serif' }}
                    >
                      {String(step.number).padStart(2, '0')}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive || isCompleted ? 'text-white' : 'text-[#A7A7A7]'
                }`}
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={`mx-1 h-[2px] w-8 ${
                  isCompleted ? 'bg-[#FF4400]' : 'bg-[#5B5B5B]'
                }`}
                style={{ marginBottom: '24px' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
