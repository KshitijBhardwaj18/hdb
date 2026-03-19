'use client';

import { useFormContext } from 'react-hook-form';
import type { DeploymentFormData } from '../types';

const selectClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white focus:border-[#FF4400] focus:outline-none appearance-none';
const labelClassName = 'text-sm font-medium text-white';
const hintClassName = 'text-xs text-[#A7A7A7]';
const font = { fontFamily: 'Satoshi, sans-serif' };

export function StepCluster() {
  const { register } = useFormContext<DeploymentFormData>();

  return (
    <div className="flex flex-col gap-4" style={font}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">
          Kubernetes Cluster
        </h2>
        <p className="text-sm text-[#A7A7A7]">
          Configure your EKS cluster version. Node groups, autoscaling, and access are configured with secure defaults.
        </p>
      </div>

      <div
        className="flex flex-col gap-5 rounded-lg p-6"
        style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B' }}
      >
        {/* Kubernetes Version */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>Kubernetes Version</label>
          <div className="relative">
            <select
              {...register('kubernetesVersion')}
              className={selectClassName}
              style={font}
            >
              <option value="1.34">1.34 (Latest — Recommended)</option>
              <option value="1.33">1.33</option>
              <option value="1.32">1.32</option>
              <option value="1.31">1.31</option>
              <option value="1.30">1.30</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="#9A9A9A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className={hintClassName}>
            We recommend using the latest stable version for security patches and features
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-[#5B5B5B]" />

        {/* Defaults info */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Cluster Defaults</h3>
          <div className="flex flex-col gap-2.5">
            <DefaultRow label="Cluster Access" value="Private only (SSM access node enabled)" />
            <DefaultRow label="Bootstrap Nodes" value="t3.medium, 2 nodes (min 2, max 3)" />
            <DefaultRow label="Autoscaling" value="Karpenter with spot + on-demand (t3, m5, c5 families)" />
            <DefaultRow label="Service CIDR" value="172.20.0.0/16" />
            <DefaultRow label="Encryption" value="Enabled (KMS)" />
            <DefaultRow label="Logging" value="API, Audit, Authenticator, Controller Manager, Scheduler" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
        <path d="M4 8L7 11L12 5" stroke="#00CF23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex flex-col">
        <span className="text-sm text-white" style={{ fontFamily: 'Satoshi, sans-serif' }}>{label}</span>
        <span className="text-xs text-[#A7A7A7]" style={{ fontFamily: 'Satoshi, sans-serif' }}>{value}</span>
      </div>
    </div>
  );
}
