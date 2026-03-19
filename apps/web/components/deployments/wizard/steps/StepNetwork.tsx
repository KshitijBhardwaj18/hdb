'use client';

import { useFormContext } from 'react-hook-form';
import type { DeploymentFormData } from '../types';

const CIDR_PREFIX_INFO: Record<number, { ips: number; label: string; warning?: string }> = {
  16: { ips: 65536, label: '65,536 IPs — Recommended' },
  17: { ips: 32768, label: '32,768 IPs' },
  18: { ips: 16384, label: '16,384 IPs' },
  19: { ips: 8192, label: '8,192 IPs' },
  20: { ips: 4096, label: '4,096 IPs', warning: 'Tight — limited room for growth' },
  21: { ips: 2048, label: '2,048 IPs — Minimum', warning: 'Minimum viable. Fits 3x /24 public + 3x /23 private subnets' },
};

const inputClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none';
const selectClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white focus:border-[#FF4400] focus:outline-none appearance-none';
const labelClassName = 'text-sm font-medium text-white';
const hintClassName = 'text-xs text-[#A7A7A7]';
const errorClassName = 'text-xs text-red-400';
const font = { fontFamily: 'Satoshi, sans-serif' };

function getCidrPrefix(cidr: string): number | null {
  const match = cidr.match(/\/(\d{1,2})$/);
  if (!match || !match[1]) return null;
  const prefix = parseInt(match[1], 10);
  return isNaN(prefix) ? null : prefix;
}

export function StepNetwork() {
  const { register, watch, formState: { errors } } = useFormContext<DeploymentFormData>();

  const vpcCidr = watch('vpcCidr');

  const prefix = getCidrPrefix(vpcCidr);
  const cidrInfo = prefix !== null ? CIDR_PREFIX_INFO[prefix] : null;
  const cidrOutOfRange = prefix !== null && (prefix < 16 || prefix > 21);

  return (
    <div className="flex flex-col gap-4" style={font}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">
          Network Configuration
        </h2>
        <p className="text-sm text-[#A7A7A7]">
          Configure VPC and network connectivity. Subnets are automatically created based on your selected availability zones.
        </p>
      </div>

      {/* Card 1: Main VPC Config */}
      <div
        className="flex flex-col gap-5 rounded-lg p-6"
        style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B' }}
      >
        {/* VPC CIDR Block */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>VPC CIDR Block</label>
          <input
            type="text"
            {...register('vpcCidr')}
            placeholder="10.0.0.0/16"
            className={inputClassName}
            style={font}
          />
          {errors.vpcCidr ? (
            <p className={errorClassName}>{errors.vpcCidr.message}</p>
          ) : cidrOutOfRange ? (
            <p className={errorClassName}>
              CIDR prefix must be between /16 and /21
            </p>
          ) : cidrInfo ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white">{cidrInfo.label}</span>
              </div>
              {cidrInfo.warning && (
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="#F59E0B" strokeWidth="1.2" fill="none" />
                    <path d="M7 4.5V7.5" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cx="7" cy="9.5" r="0.6" fill="#F59E0B" />
                  </svg>
                  <span className="text-xs text-amber-400">{cidrInfo.warning}</span>
                </div>
              )}
            </div>
          ) : (
            <p className={hintClassName}>
              IP address range for your VPC. Allowed: /16 (65,536 IPs) to /21 (2,048 IPs)
            </p>
          )}
        </div>

        {/* NAT Gateway Strategy */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>NAT Gateway Strategy</label>
          <div className="relative">
            <select
              {...register('natGatewayStrategy')}
              className={selectClassName}
              style={font}
            >
              <option value="single">
                Single NAT Gateway (Cost-effective)
              </option>
              <option value="one_per_az">Multi-AZ NAT Gateway (High Availability)</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="#9A9A9A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className={hintClassName}>
            Single gateway reduces costs, multi-AZ provides redundancy
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-[#5B5B5B]" />

        {/* Auto-configured info */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="#A7A7A7" strokeWidth="1" fill="none" />
              <path d="M8 5v4" stroke="#A7A7A7" strokeWidth="1" strokeLinecap="round" />
              <circle cx="8" cy="11" r="0.5" fill="#A7A7A7" />
            </svg>
            <span className="text-sm text-[#A7A7A7]">
              DNS hostnames and DNS support are enabled by default. Public and private subnets are automatically created based on your availability zones.
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
