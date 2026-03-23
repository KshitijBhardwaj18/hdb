'use client';

import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTestAwsConnection } from '@/hooks/use-aws-connection';
import type { DeploymentFormData } from '../types';

const PLATFORM_ACCOUNT_ID = '225919348997';

const AZ_OPTIONS: Record<string, string[]> = {
  'us-east-1': ['us-east-1a', 'us-east-1b', 'us-east-1c'],
  'us-west-2': ['us-west-2a', 'us-west-2b', 'us-west-2c'],
  'eu-west-1': ['eu-west-1a', 'eu-west-1b', 'eu-west-1c'],
  'ap-south-1': ['ap-south-1a', 'ap-south-1b', 'ap-south-1c'],
};

const inputClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none';
const selectClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white focus:border-[#FF4400] focus:outline-none appearance-none';
const labelClassName = 'text-sm font-medium text-white';
const hintClassName = 'text-xs text-[#A7A7A7]';
const errorClassName = 'text-xs text-red-400';
const font = { fontFamily: 'Satoshi, sans-serif' };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center gap-1 rounded bg-[#2A2A2A] px-2 py-0.5 text-xs text-[#A7A7A7] transition-colors hover:text-white"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SetupInstructions() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg" style={{ backgroundColor: '#1A1A1A', border: '0.5px solid #5B5B5B' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="#FF4400" strokeWidth="1.5" fill="none" />
            <path d="M10 9V14" stroke="#FF4400" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="7" r="0.75" fill="#FF4400" />
          </svg>
          <span className="text-sm font-semibold text-white" style={font}>
            IAM Role Setup Instructions
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[#A7A7A7]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#A7A7A7]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[#5B5B5B] px-5 py-5">
          <p className="mb-4 text-sm text-[#A7A7A7]" style={font}>
            Create an IAM role in your AWS account that allows HydraDB to deploy infrastructure on your behalf.
          </p>

          <ol className="flex flex-col gap-4 text-sm text-white" style={font}>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">1</span>
              <span>
                Go to the{' '}
                <a
                  href="https://console.aws.amazon.com/iam/home#/roles$new?step=type"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FF4400] underline"
                >
                  AWS IAM Console → Create Role
                </a>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">2</span>
              <span>Select <strong>&quot;Another AWS account&quot;</strong> as the trusted entity type</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">3</span>
              <span>
                Enter Account ID: <code className="rounded bg-[#2A2A2A] px-1.5 py-0.5 text-[#FF4400]">{PLATFORM_ACCOUNT_ID}</code>
                <CopyButton text={PLATFORM_ACCOUNT_ID} />
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">4</span>
              <span>
                Check <strong>&quot;Require external ID&quot;</strong> and enter your chosen External ID (enter it below too)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">5</span>
              <span>
                Attach the <code className="rounded bg-[#2A2A2A] px-1.5 py-0.5 text-[#FF4400]">AdministratorAccess</code> policy
                <span className="block mt-1 text-xs text-[#A7A7A7]">
                  Or scope to: EKS, VPC, EC2, S3, DynamoDB, Secrets Manager, IAM, KMS, SSM, CloudWatch
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">6</span>
              <span>
                Name the role (e.g. <code className="rounded bg-[#2A2A2A] px-1.5 py-0.5 text-[#FF4400]">hydradb-deploy-role</code>) and create it
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FF4400]/15 text-xs font-medium text-[#FF4400]">7</span>
              <span>Copy the <strong>Role ARN</strong> and paste it in the field below</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

export function StepCloudSetup() {
  const { register, watch, setValue, formState: { errors } } = useFormContext<DeploymentFormData>();
  const awsRegion = watch('awsRegion');
  const roleArn = watch('roleArn');
  const externalId = watch('externalId');
  const availabilityZones = watch('availabilityZones');
  const awsConnectionVerified = watch('awsConnectionVerified');
  const azOptions = AZ_OPTIONS[awsRegion] ?? [];

  const testConnection = useTestAwsConnection();

  const toggleAz = (az: string) => {
    const updated = availabilityZones.includes(az)
      ? availabilityZones.filter((z: string) => z !== az)
      : [...availabilityZones, az];
    setValue('availabilityZones', updated, { shouldValidate: true });
  };

  const handleTestConnection = () => {
    if (!roleArn || !externalId) return;
    setValue('awsConnectionVerified', false);
    testConnection.mutate(
      { role_arn: roleArn, external_id: externalId, region: awsRegion },
      {
        onSuccess: () => {
          setValue('awsConnectionVerified', true);
        },
      },
    );
  };

  const connectionTested = testConnection.isSuccess || awsConnectionVerified;
  const connectionFailed = testConnection.isError;

  return (
    <div className="flex flex-col gap-4" style={font}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">
          Cloud Provider Setup
        </h2>
        <p className="text-sm text-[#A7A7A7]">
          Configure AWS credentials and region settings
        </p>
      </div>

      {/* Setup Instructions (expandable) */}
      <SetupInstructions />

      <div
        className="flex flex-col gap-5 rounded-lg p-6"
        style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B' }}
      >
        {/* AWS Region */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>AWS Region</label>
          <div className="relative">
            <select
              {...register('awsRegion', {
                onChange: () => {
                  setValue('availabilityZones', []);
                  setValue('awsConnectionVerified', false);
                  testConnection.reset();
                },
              })}
              className={selectClassName}
              style={font}
            >
              <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
              <option value="us-west-2">US West (Oregon) - us-west-2</option>
              <option value="eu-west-1">EU West (Ireland) - eu-west-1</option>
              <option value="ap-south-1">Asia Pacific (Mumbai) - ap-south-1</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="#9A9A9A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className={hintClassName}>
            Geographic location for your infrastructure
          </p>
        </div>

        {/* Availability Zones */}
        <div className="flex flex-col gap-2">
          <label className={labelClassName}>Availability Zones</label>
          {errors.availabilityZones ? (
            <p className={errorClassName}>{errors.availabilityZones.message}</p>
          ) : (
            <p className={hintClassName}>
              Select at least 2 zones for high availability
            </p>
          )}
          <div className="flex flex-wrap gap-4 pt-1">
            {azOptions.map((az) => {
              const checked = availabilityZones.includes(az);
              return (
                <label
                  key={az}
                  htmlFor={`az-${az}`}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-white"
                >
                  <button
                    type="button"
                    id={`az-${az}`}
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleAz(az)}
                    className="flex h-4 w-4 items-center justify-center rounded border-[0.5px]"
                    style={{
                      backgroundColor: checked ? '#FF4400' : '#202020',
                      borderColor: checked ? '#FF4400' : '#5B5B5B',
                    }}
                  >
                    {checked && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5L4.5 7.5L8 3"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  {az}
                </label>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#5B5B5B]" />

        {/* Role ARN */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>Role ARN</label>
          <input
            type="text"
            {...register('roleArn', {
              onChange: () => {
                setValue('awsConnectionVerified', false);
                testConnection.reset();
              },
            })}
            placeholder="arn:aws:iam::123456789012:role/hydradb-deploy-role"
            className={inputClassName}
            style={font}
          />
          {errors.roleArn ? (
            <p className={errorClassName}>{errors.roleArn.message}</p>
          ) : (
            <p className={hintClassName}>
              IAM role ARN for cross-account deployment access
            </p>
          )}
        </div>

        {/* External ID */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName}>External ID</label>
          <input
            type="text"
            {...register('externalId', {
              onChange: () => {
                setValue('awsConnectionVerified', false);
                testConnection.reset();
              },
            })}
            placeholder="my-unique-external-id-12345"
            className={inputClassName}
            style={font}
          />
          {errors.externalId ? (
            <p className={errorClassName}>{errors.externalId.message}</p>
          ) : (
            <p className={hintClassName}>
              Unique identifier for secure role assumption (min 10 characters)
            </p>
          )}
        </div>

        {/* Test Connection */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!roleArn || !externalId || externalId.length < 10 || testConnection.isPending}
              className="flex items-center gap-2 rounded-lg bg-[#FF4400] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-40 disabled:cursor-not-allowed"
              style={font}
            >
              {testConnection.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>

            {connectionTested && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span style={font}>Connected successfully</span>
              </div>
            )}

            {connectionFailed && !testConnection.isPending && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <XCircle className="h-4 w-4" />
                <span style={font}>Connection failed</span>
              </div>
            )}
          </div>

          {/* Success details */}
          {connectionTested && testConnection.data && (
            <div
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: 'rgba(0, 207, 35, 0.08)', border: '0.5px solid rgba(0, 207, 35, 0.3)' }}
            >
              <div className="flex flex-col gap-1 text-xs" style={font}>
                <span className="text-[#A7A7A7]">
                  Account ID: <span className="text-white">{testConnection.data.account_id}</span>
                </span>
                <span className="text-[#A7A7A7]">
                  Assumed Role: <span className="text-white">{testConnection.data.assumed_role_arn}</span>
                </span>
              </div>
            </div>
          )}

          {/* vCPU quota */}
          {connectionTested && testConnection.data && (testConnection.data.vcpu_quota != null || testConnection.data.vcpu_warning) && (
            <div
              className="rounded-lg px-4 py-3"
              style={{
                backgroundColor: testConnection.data.vcpu_warning
                  ? 'rgba(251, 191, 36, 0.08)'
                  : 'rgba(0, 207, 35, 0.08)',
                border: testConnection.data.vcpu_warning
                  ? '0.5px solid rgba(251, 191, 36, 0.3)'
                  : '0.5px solid rgba(0, 207, 35, 0.3)',
              }}
            >
              <div className="flex flex-col gap-1 text-xs" style={font}>
                {testConnection.data.vcpu_quota != null && (
                  <span className={testConnection.data.vcpu_warning ? 'text-amber-400' : 'text-[#A7A7A7]'}>
                    vCPU Quota: <span className="text-white">{testConnection.data.vcpu_quota}</span>
                    {testConnection.data.vcpu_quota >= 32 ? ' (sufficient)' : ' (insufficient — minimum 32 required)'}
                  </span>
                )}
                {testConnection.data.vcpu_warning && (
                  <span className="text-amber-400">{testConnection.data.vcpu_warning}</span>
                )}
              </div>
            </div>
          )}

          {/* Failure details */}
          {connectionFailed && !testConnection.isPending && (
            <div
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '0.5px solid rgba(239, 68, 68, 0.3)' }}
            >
              <p className="text-xs text-red-400" style={font}>
                {testConnection.error instanceof Error
                  ? testConnection.error.message
                  : 'Check your Role ARN, External ID, and trust policy configuration.'}
              </p>
            </div>
          )}

          {!connectionTested && !connectionFailed && !testConnection.isPending && (
            <p className="text-xs text-[#A7A7A7]" style={font}>
              You must verify your AWS connection before proceeding to the next step.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
