'use client';

import { useState } from 'react';
import { cn } from '@repo/ui/lib/utils';
import { AccountTab } from '@/components/settings/AccountTab';
import { ClusterConfigTab } from '@/components/settings/ClusterConfigTab';

const tabs = [
  { id: 'account', label: 'Account' },
  { id: 'cluster', label: 'Cluster Configuration' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('account');

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-1'>
        <h1 className='text-[32px] font-bold leading-[1.125] text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
          Settings
        </h1>
        <p className='text-base text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
          Manage account and cluster configuration
        </p>
      </div>

      <div
        className='flex gap-1 rounded-2xl bg-white/5 p-1.5 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
        style={{ border: '0.5px solid #5B5B5B' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'bg-[#FF4400] text-white' : 'text-[#A7A7A7] hover:text-white',
            )}
            style={{ fontFamily: 'Satoshi, sans-serif' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'account' && <AccountTab />}
      {activeTab === 'cluster' && <ClusterConfigTab />}
    </div>
  );
}
