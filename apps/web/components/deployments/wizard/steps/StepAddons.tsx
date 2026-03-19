'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { DeploymentFormData } from '../types';

const inputClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none';
const selectClassName =
  'h-10 w-full rounded-lg border-[0.5px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white focus:border-[#FF4400] focus:outline-none appearance-none';
const labelClassName = 'text-sm font-medium text-white';
const hintClassName = 'text-xs text-[#A7A7A7]';
const errorClassName = 'text-xs text-red-400';
const font = { fontFamily: 'Satoshi, sans-serif' };

function SelectChevron() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="#9A9A9A"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function StepAddons() {
  const { register, watch, setValue, formState: { errors } } = useFormContext<DeploymentFormData>();
  const [showPassword, setShowPassword] = useState(false);
  const [showKafkaPassword, setShowKafkaPassword] = useState(false);

  const mongoDbMode = watch('mongoDbMode');
  const kafkaSource = watch('kafkaSource');
  const kafkaAuthType = watch('kafkaAuthType');
  const customerId = watch('customerId');

  return (
    <div className="flex flex-col gap-4" style={font}>
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">Services</h2>
        <p className="text-sm text-[#A7A7A7]">
          Configure MongoDB and Kafka for your deployment
        </p>
      </div>

      {/* Card 1 — MongoDB Setup */}
      <div
        className="flex flex-col gap-5 rounded-lg p-6"
        style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B' }}
      >
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold text-white">MongoDB Setup</h3>
          <p className="text-xs text-[#A7A7A7]">
            Database configuration for application data
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex flex-col gap-2">
          <label className={labelClassName}>Mode</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setValue('mongoDbMode', 'atlas')}
              className="flex flex-col gap-1 rounded-lg px-4 py-3.5 text-left transition-colors"
              style={{
                backgroundColor: '#202020',
                border: mongoDbMode === 'atlas' ? '1.5px solid #FF4400' : '1px solid #5B5B5B',
              }}
            >
              <span className="text-sm font-medium text-white">Atlas (Managed)</span>
              <span className="text-xs text-[#A7A7A7]">We provision a new Atlas cluster for you</span>
            </button>
            <button
              type="button"
              onClick={() => setValue('mongoDbMode', 'atlas-peering')}
              className="flex flex-col gap-1 rounded-lg px-4 py-3.5 text-left transition-colors"
              style={{
                backgroundColor: '#202020',
                border: mongoDbMode === 'atlas-peering' ? '1.5px solid #FF4400' : '1px solid #5B5B5B',
              }}
            >
              <span className="text-sm font-medium text-white">Atlas Peering</span>
              <span className="text-xs text-[#A7A7A7]">Connect to your existing Atlas cluster</span>
            </button>
          </div>
        </div>

        {/* Atlas mode fields */}
        {mongoDbMode === 'atlas' && (
          <div className="flex flex-col gap-4">
            {/* Atlas credentials */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Atlas Client ID</label>
                <input
                  type="text"
                  {...register('atlasClientId')}
                  placeholder="Enter client ID"
                  className={inputClassName}
                  style={font}
                />
                {errors.atlasClientId && <p className={errorClassName}>{errors.atlasClientId.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Atlas Client Secret</label>
                <input
                  type="password"
                  {...register('atlasClientSecret')}
                  placeholder="Enter client secret"
                  className={inputClassName}
                  style={font}
                />
                {errors.atlasClientSecret && <p className={errorClassName}>{errors.atlasClientSecret.message}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Atlas Organization ID</label>
              <input
                type="text"
                {...register('atlasOrgId')}
                placeholder="Enter organization ID"
                className={inputClassName}
                style={font}
              />
              {errors.atlasOrgId && <p className={errorClassName}>{errors.atlasOrgId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Atlas Project Name</label>
              <input
                type="text"
                {...register('atlasProjectName')}
                placeholder={customerId ? `${customerId}-cortex` : 'customer-id-cortex'}
                className={inputClassName}
                style={font}
              />
              <p className={hintClassName}>Defaults to {customerId ? `${customerId}-cortex` : '{customer-id}-cortex'} if left empty</p>
            </div>

            {/* Tier */}
            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Cluster Tier</label>
              <div className="relative">
                <select
                  {...register('mongoDbTier')}
                  className={selectClassName}
                  style={font}
                >
                  <option value="M10">M10 (2 GB RAM, 10 GB Storage)</option>
                  <option value="M20">M20 (4 GB RAM, 20 GB Storage)</option>
                  <option value="M30">M30 (8 GB RAM, 40 GB Storage)</option>
                </select>
                <SelectChevron />
              </div>
            </div>

            {/* DB credentials */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>DB Username</label>
                <input
                  type="text"
                  {...register('mongoDbUsername')}
                  placeholder="cortex"
                  className={inputClassName}
                  style={font}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>DB Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('mongoDbPassword')}
                    placeholder="Min 8 characters"
                    className={inputClassName}
                    style={{ ...font, paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3 flex items-center"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      {showPassword ? (
                        <path
                          d="M2 8C2 8 4 4 8 4C12 4 14 8 14 8C14 8 12 12 8 12C4 12 2 8 2 8Z"
                          stroke="#9A9A9A"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <path
                          d="M2 2L14 14M6.5 6.67C6.18 7.02 6 7.49 6 8C6 9.1 6.9 10 8 10C8.51 10 8.98 9.82 9.33 9.5M12.5 10.5C13.39 9.63 14 8.53 14 8C14 8 12 4 8 4C7.36 4 6.77 4.12 6.23 4.31"
                          stroke="#9A9A9A"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </svg>
                  </button>
                </div>
                {errors.mongoDbPassword && <p className={errorClassName}>{errors.mongoDbPassword.message}</p>}
              </div>
            </div>

            {/* Auto-configured info */}
            <div
              className="flex items-start gap-3 rounded-lg px-4 py-3"
              style={{ backgroundColor: '#1A1A2E', border: '0.5px solid #3B3B5B' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
                <circle cx="8" cy="8" r="7" stroke="#6B7BFF" strokeWidth="1.2" />
                <path d="M8 7V11M8 5V5.5" stroke="#6B7BFF" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <p className="text-xs text-[#A7A7A7]">
                Region, disk size (10 GB), and CIDR block (192.168.248.0/21) are auto-configured based on your AWS region.
              </p>
            </div>
          </div>
        )}

        {/* Atlas Peering mode fields */}
        {mongoDbMode === 'atlas-peering' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Atlas Project ID</label>
              <input
                type="text"
                {...register('atlasProjectId')}
                placeholder="Enter your Atlas project ID"
                className={inputClassName}
                style={font}
              />
              {errors.atlasProjectId && <p className={errorClassName}>{errors.atlasProjectId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Atlas Cluster Name</label>
              <input
                type="text"
                {...register('atlasClusterName')}
                placeholder="Enter your Atlas cluster name"
                className={inputClassName}
                style={font}
              />
              {errors.atlasClusterName && <p className={errorClassName}>{errors.atlasClusterName.message}</p>}
            </div>

            <div
              className="flex items-start gap-3 rounded-lg px-4 py-3"
              style={{ backgroundColor: '#1A1A2E', border: '0.5px solid #3B3B5B' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
                <circle cx="8" cy="8" r="7" stroke="#6B7BFF" strokeWidth="1.2" />
                <path d="M8 7V11M8 5V5.5" stroke="#6B7BFF" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <p className="text-xs text-[#A7A7A7]">
                VPC peering will be configured automatically between your AWS VPC and the existing Atlas cluster.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Card 2 — Kafka Configuration */}
      <div
        className="flex flex-col gap-5 rounded-lg p-6"
        style={{ backgroundColor: '#222222', border: '0.5px solid #5B5B5B' }}
      >
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold text-white">Kafka Configuration</h3>
          <p className="text-xs text-[#A7A7A7]">
            Event streaming platform setup
          </p>
        </div>

        {/* Source selector */}
        <div className="flex flex-col gap-2">
          <label className={labelClassName}>Kafka Source</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setValue('kafkaSource', 'managed-msk')}
              className="flex flex-col gap-1 rounded-lg px-4 py-3.5 text-left transition-colors"
              style={{
                backgroundColor: '#202020',
                border: kafkaSource === 'managed-msk' ? '1.5px solid #FF4400' : '1px solid #5B5B5B',
              }}
            >
              <span className="text-sm font-medium text-white">Managed MSK</span>
              <span className="text-xs text-[#A7A7A7]">Platform provisions MSK Serverless (recommended)</span>
            </button>
            <button
              type="button"
              onClick={() => setValue('kafkaSource', 'byo')}
              className="flex flex-col gap-1 rounded-lg px-4 py-3.5 text-left transition-colors"
              style={{
                backgroundColor: '#202020',
                border: kafkaSource === 'byo' ? '1.5px solid #FF4400' : '1px solid #5B5B5B',
              }}
            >
              <span className="text-sm font-medium text-white">Bring Your Own</span>
              <span className="text-xs text-[#A7A7A7]">Connect to your existing Kafka cluster</span>
            </button>
          </div>
        </div>

        {/* Managed MSK — no fields needed */}
        {kafkaSource === 'managed-msk' && (
          <div
            className="flex items-start gap-3 rounded-lg px-4 py-3"
            style={{ backgroundColor: '#1A2E1A', border: '0.5px solid #3B5B3B' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
              <circle cx="8" cy="8" r="7" stroke="#4ADE80" strokeWidth="1.2" />
              <path d="M5 8L7 10L11 6" stroke="#4ADE80" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-xs text-[#A7A7A7]">
              MSK Serverless will be provisioned automatically with IAM authentication. No configuration needed.
            </p>
          </div>
        )}

        {/* BYO Kafka fields */}
        {kafkaSource === 'byo' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Bootstrap Servers</label>
              <input
                type="text"
                {...register('kafkaBootstrapServers')}
                placeholder="broker1:9092,broker2:9092"
                className={inputClassName}
                style={font}
              />
              <p className={hintClassName}>Comma-separated list of Kafka broker addresses</p>
              {errors.kafkaBootstrapServers && <p className={errorClassName}>{errors.kafkaBootstrapServers.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Authentication Type</label>
              <div className="relative">
                <select
                  {...register('kafkaAuthType')}
                  className={selectClassName}
                  style={font}
                >
                  <option value="IAM">IAM</option>
                  <option value="SCRAM">SCRAM</option>
                  <option value="PLAIN">PLAIN</option>
                </select>
                <SelectChevron />
              </div>
            </div>

            {/* Username/Password for SCRAM/PLAIN */}
            {(kafkaAuthType === 'SCRAM' || kafkaAuthType === 'PLAIN') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClassName}>Username</label>
                  <input
                    type="text"
                    {...register('kafkaUsername')}
                    placeholder="Enter username"
                    className={inputClassName}
                    style={font}
                  />
                  {errors.kafkaUsername && <p className={errorClassName}>{errors.kafkaUsername.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClassName}>Password</label>
                  <div className="relative">
                    <input
                      type={showKafkaPassword ? 'text' : 'password'}
                      {...register('kafkaPassword')}
                      placeholder="Enter password"
                      className={inputClassName}
                      style={{ ...font, paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKafkaPassword(!showKafkaPassword)}
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        {showKafkaPassword ? (
                          <path
                            d="M2 8C2 8 4 4 8 4C12 4 14 8 14 8C14 8 12 12 8 12C4 12 2 8 2 8Z"
                            stroke="#9A9A9A"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <path
                            d="M2 2L14 14M6.5 6.67C6.18 7.02 6 7.49 6 8C6 9.1 6.9 10 8 10C8.51 10 8.98 9.82 9.33 9.5M12.5 10.5C13.39 9.63 14 8.53 14 8C14 8 12 4 8 4C7.36 4 6.77 4.12 6.23 4.31"
                            stroke="#9A9A9A"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                    </button>
                  </div>
                  {errors.kafkaPassword && <p className={errorClassName}>{errors.kafkaPassword.message}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
