'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import { configService } from '@/services/deployment-config.service';
import type { DeploymentFormData } from '../types';

const inputClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none';
const selectClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white focus:border-[#FF4400] focus:outline-none appearance-none';
const labelClassName = 'text-sm font-medium text-white';
const hintClassName = 'text-xs text-[#A7A7A7]';
const errorClassName = 'text-xs text-red-400';
const font = { fontFamily: 'Satoshi, sans-serif' };

export function StepBasicInfo() {
  const { register, watch, formState: { errors }, setError, clearErrors } = useFormContext<DeploymentFormData>();
  const searchParams = useSearchParams();
  const isEditing = !!searchParams.get('customerId');
  const customerId = watch('customerId');
  const [checkingId, setCheckingId] = useState(false);
  const [idAvailable, setIdAvailable] = useState<boolean | null>(null);

  const checkUniqueness = useCallback(async (id: string) => {
    if (!id || id.length < 3 || !/^[a-z0-9-]+$/.test(id)) {
      setIdAvailable(null);
      return;
    }
    setCheckingId(true);
    try {
      await configService.get(id);
      // If it succeeds, the ID already exists
      setIdAvailable(false);
      setError('customerId', { type: 'manual', message: 'This Customer ID is already taken' });
    } catch {
      // 404 means it's available
      setIdAvailable(true);
      clearErrors('customerId');
    } finally {
      setCheckingId(false);
    }
  }, [setError, clearErrors]);

  useEffect(() => {
    if (isEditing) return; // Skip uniqueness check when editing existing config
    const timeout = setTimeout(() => {
      if (customerId) checkUniqueness(customerId);
    }, 500);
    return () => clearTimeout(timeout);
  }, [customerId, checkUniqueness, isEditing]);

  return (
    <div className="flex flex-col gap-4" style={font}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">Basic Information</h2>
        <p className="text-sm text-[#A7A7A7]">
          Set up the fundamental details for your deployment
        </p>
      </div>

      <div
        className="flex flex-col gap-5 rounded-lg p-6"
        style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B' }}
      >
        {/* Customer ID */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>Customer ID</label>
          <div className="relative">
            <input
              type="text"
              {...register('customerId')}
              placeholder="my-company"
              disabled={isEditing}
              className={`${inputClassName} ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
              style={font}
            />
            {checkingId && (
              <div className="absolute inset-y-0 right-3 flex items-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#5B5B5B] border-t-[#FF4400]" />
              </div>
            )}
            {!checkingId && idAvailable === true && !errors.customerId && (
              <div className="absolute inset-y-0 right-3 flex items-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8L7 11L12 5" stroke="#00CF23" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
          {errors.customerId ? (
            <p className={errorClassName}>{errors.customerId.message}</p>
          ) : isEditing ? (
            <p className={hintClassName}>
              Customer ID cannot be changed after deployment
            </p>
          ) : idAvailable === true ? (
            <p className="text-xs text-emerald-400">Customer ID is available</p>
          ) : (
            <p className={hintClassName}>
              Unique identifier — lowercase letters, numbers, and hyphens only
            </p>
          )}
        </div>

        {/* Environment */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>Environment</label>
          <div className="relative">
            <select
              {...register('environment')}
              className={selectClassName}
              style={font}
            >
              <option value="prod">Production</option>
              <option value="staging">Staging</option>
              <option value="dev">Development</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="#9A9A9A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          {errors.environment ? (
            <p className={errorClassName}>{errors.environment.message}</p>
          ) : (
            <p className={hintClassName}>
              Choose the deployment environment type
            </p>
          )}
        </div>

        {/* Domain Name */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>Domain Name</label>
          <input
            type="text"
            {...register('domainName')}
            placeholder="e.g. usecortex.opengig.work"
            className={inputClassName}
            style={font}
          />
          {errors.domainName ? (
            <p className={errorClassName}>{errors.domainName.message}</p>
          ) : (
            <p className={hintClassName}>
              Primary domain for accessing your deployment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
