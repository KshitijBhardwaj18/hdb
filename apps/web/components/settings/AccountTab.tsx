'use client';

import { AlertTriangle, Eye, EyeOff, Lock, Mail, Pencil, Trash2, User, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useConfigs, useDeleteConfig } from '@/hooks/use-deployment-config';
import { useDestroy, useDeploymentStatus } from '@/hooks/use-deployment';
import { DeploymentStatus } from '@/types/deployment.types';
import { ApiClient } from '@/lib/api-client';

export function AccountTab() {
  const user = useAuth();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty.');
      return;
    }
    if (trimmed === user.name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await ApiClient.patch('/api/auth/me', { name: trimmed });
      toast.success('Name updated successfully. Refresh to see changes.');
      setIsEditingName(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update name';
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await ApiClient.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Password changed successfully.');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const router = useRouter();
  const { data: configs } = useConfigs();
  const config = configs?.[0];
  const { data: deployment } = useDeploymentStatus(
    config?.customer_id ?? null,
    config?.environment ?? null,
  );
  const isOperationActive = deployment?.status === DeploymentStatus.PENDING
    || deployment?.status === DeploymentStatus.IN_PROGRESS
    || deployment?.status === DeploymentStatus.DESTROYING;
  const deleteConfig = useDeleteConfig();
  const destroyMutation = useDestroy();
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteCluster = async () => {
    if (!config) return;
    if (deleteConfirmText !== config.customer_id) {
      toast.error('Please type the Customer ID to confirm.');
      return;
    }
    setIsDeleting(true);
    try {
      // Step 1: Request destroy (backend will reject if already destroying/destroyed)
      try {
        await destroyMutation.mutateAsync({
          customerId: config.customer_id,
          environment: config.environment,
        });
        // Destroy was accepted — redirect to progress page so user can monitor
        toast.success(
          'Infrastructure destroy started. The configuration will be available for deletion once the destroy completes.',
        );
        setShowDeleteWarning(false);
        router.push(
          `/deployments/progress?customerId=${encodeURIComponent(config.customer_id)}&environment=${encodeURIComponent(config.environment)}`,
        );
        return;
      } catch (destroyErr) {
        // Check if it's an "already destroyed" or "not found" error — safe to delete config
        const msg = destroyErr instanceof Error ? destroyErr.message : '';
        const isAlreadyGone =
          msg.includes('already been destroyed') ||
          msg.includes('not found') ||
          msg.includes('ALREADY_DESTROYED') ||
          msg.includes('DEPLOYMENT_NOT_FOUND');

        if (!isAlreadyGone) {
          // Real error (e.g., deployment is in progress) — surface it
          throw destroyErr;
        }
      }

      // Step 2: No active deployment — safe to delete config
      await deleteConfig.mutateAsync(config.customer_id);
      toast.success('Configuration deleted.');
      setShowDeleteWarning(false);
      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete cluster';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      {/* Account Details */}
      <div
        className='rounded-lg bg-[#222222] p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        <div className='mb-5 flex items-center justify-between'>
          <div className='flex flex-col gap-1'>
            <h2 className='text-lg font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Account Details
            </h2>
            <p className='text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Manage your personal account information
            </p>
          </div>
          {!isEditingName && (
            <button
              onClick={() => { setEditName(user.name); setIsEditingName(true); }}
              className='flex items-center gap-2 rounded-lg bg-[#FF4400] px-4 py-2 text-base font-medium text-white transition-colors hover:bg-[#E63D00]'
              style={{ fontFamily: 'Satoshi, sans-serif' }}
            >
              <Pencil className='h-4 w-4' />
              Edit Info
            </button>
          )}
        </div>

        <div className='flex flex-col gap-4'>
          {isEditingName ? (
            <div className='flex flex-col gap-3'>
              <div className='flex items-center gap-3'>
                <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#2A2A2A]'>
                  <User className='h-4 w-4 text-[#A7A7A7]' />
                </div>
                <div className='flex flex-1 flex-col gap-1'>
                  <span className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>User Name</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className='rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] px-3.5 py-2 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  />
                </div>
              </div>
              <div className='flex items-center gap-2 pl-12'>
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className='rounded-lg bg-[#FF4400] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-60'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                >
                  {savingName ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  className='rounded-lg px-4 py-1.5 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <InfoRow icon={<User className='h-4 w-4 text-[#A7A7A7]' />} label='User Name' value={user.name} />
          )}
          <InfoRow icon={<Mail className='h-4 w-4 text-[#A7A7A7]' />} label='Email Address' value={user.email} />
        </div>
      </div>

      {/* Change Password */}
      <div
        className='rounded-lg bg-[#222222] p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        <div className='flex items-center justify-between'>
          <div className='flex flex-col gap-1'>
            <h3 className='text-base font-semibold text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              Change Password
            </h3>
            <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
              You have to enter current password, then set new one.
            </p>
          </div>
          {!showPasswordForm && (
            <button
              onClick={() => setShowPasswordForm(true)}
              className='rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5'
              style={{ border: '0.67px solid #A7A7A7', fontFamily: 'Satoshi, sans-serif' }}
            >
              Change Password
            </button>
          )}
          {showPasswordForm && (
            <button
              onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              className='text-[#A7A7A7] transition-colors hover:text-white'
            >
              <X className='h-5 w-5' />
            </button>
          )}
        </div>

        {showPasswordForm && (
          <div className='mt-5 flex flex-col gap-4'>
            <PasswordField
              label='Current Password'
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrentPw}
              onToggle={() => setShowCurrentPw(!showCurrentPw)}
            />
            <PasswordField
              label='New Password'
              value={newPassword}
              onChange={setNewPassword}
              show={showNewPw}
              onToggle={() => setShowNewPw(!showNewPw)}
            />
            <div className='flex flex-col gap-1.5'>
              <label className='text-sm font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                Confirm New Password
              </label>
              <div className='relative'>
                <Lock className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#A7A7A7]' />
                <input
                  type='password'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder='Confirm new password'
                  className='w-full rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] py-2 pr-3.5 pl-10 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
                  style={{ fontFamily: 'Satoshi, sans-serif' }}
                />
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={handleChangePassword}
                disabled={savingPassword}
                className='rounded-lg bg-[#FF4400] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E63D00] disabled:opacity-60'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
              <button
                onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                className='rounded-lg px-5 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone — Delete Cluster */}
      {config && (
        <div
          className='rounded-lg bg-[#222222] p-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
          style={{ border: '0.5px solid #5B5B5B' }}
        >
          <div className='flex items-center justify-between'>
            <div className='flex items-start gap-3'>
              <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/10'>
                <Trash2 className='h-4 w-4 text-red-400' />
              </div>
              <div className='flex flex-col gap-1'>
                <h3 className='text-base font-semibold text-red-400' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Delete Cluster
                </h3>
                <p className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                  Permanently destroy all infrastructure and delete the configuration. This action cannot be undone.
                </p>
              </div>
            </div>
            {!showDeleteWarning && (
              <button
                onClick={() => setShowDeleteWarning(true)}
                disabled={isOperationActive}
                className='flex-shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40'
                style={{ fontFamily: 'Satoshi, sans-serif' }}
                title={isOperationActive ? 'Cannot delete while a deployment or destroy is in progress' : undefined}
              >
                {isOperationActive ? 'Operation In Progress...' : 'Delete Cluster'}
              </button>
            )}
          </div>

          {showDeleteWarning && (
            <div className='mt-5'>
              <div
                className='mb-4 flex items-start gap-3 rounded-lg p-4'
                style={{ background: 'rgba(239, 68, 68, 0.08)', border: '0.5px solid rgba(239, 68, 68, 0.3)' }}
              >
                <AlertTriangle className='h-5 w-5 flex-shrink-0 text-red-400' />
                <div className='flex flex-col gap-1'>
                  <p className='text-sm font-semibold text-red-400' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                    Warning: This action is irreversible
                  </p>
                  <ul className='list-disc pl-4 text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                    <li>All AWS infrastructure (VPC, EKS cluster, nodes) will be destroyed</li>
                    <li>All data stored in the cluster will be permanently lost</li>
                    <li>MongoDB Atlas resources will be removed</li>
                    <li>The deployment configuration will be deleted</li>
                  </ul>
                </div>
              </div>

              <div className='flex flex-col gap-3'>
                <div className='flex flex-col gap-1.5'>
                  <label className='text-sm text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
                    Type <span className='font-semibold text-white'>{config.customer_id}</span> to confirm
                  </label>
                  <input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={config.customer_id}
                    className='rounded-lg border-[0.7px] border-red-500/30 bg-[#202020] px-3.5 py-2 text-sm text-white placeholder:text-[#9A9A9A] focus:border-red-500 focus:outline-none'
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  />
                </div>
                <div className='flex items-center gap-2'>
                  <button
                    onClick={handleDeleteCluster}
                    disabled={isDeleting || deleteConfirmText !== config.customer_id}
                    className='rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40'
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  >
                    {isDeleting ? 'Deleting...' : 'I understand, delete this cluster'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteWarning(false); setDeleteConfirmText(''); }}
                    className='rounded-lg px-5 py-2 text-sm font-medium text-[#A7A7A7] transition-colors hover:text-white'
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className='flex items-center gap-3'>
      <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#2A2A2A]'>{icon}</div>
      <div className='flex flex-col'>
        <span className='text-xs text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
          {label}
        </span>
        <span className='text-sm font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <label className='text-sm font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
        {label}
      </label>
      <div className='relative'>
        <Lock className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#A7A7A7]' />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className='w-full rounded-lg border-[0.7px] border-[#5B5B5B] bg-[#202020] py-2 pr-10 pl-10 text-sm text-white placeholder:text-[#9A9A9A] focus:border-[#FF4400] focus:outline-none'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        />
        <button
          type='button'
          onClick={onToggle}
          className='absolute top-1/2 right-3 -translate-y-1/2 text-[#A7A7A7] hover:text-white'
        >
          {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
        </button>
      </div>
    </div>
  );
}
