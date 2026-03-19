'use client';

import { useAuth } from '@/contexts/AuthContext';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TopBar() {
  const user = useAuth();

  return (
    <header
      className='fixed left-64 right-0 top-0 z-20 flex h-[60px] items-center justify-between bg-[#1D1E1F] px-6 shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
      style={{ borderBottom: '0.5px solid #5B5B5B' }}
    >
      <div />

      <div className='flex items-center gap-1.5'>
        <div className='flex flex-col items-end'>
          <span className='text-sm font-medium text-white' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            {user.name}
          </span>
          <span className='text-xs font-medium text-[#A7A7A7]' style={{ fontFamily: 'Satoshi, sans-serif' }}>
            {user.email}
          </span>
        </div>
        <div
          className='flex h-9 w-9 items-center justify-center rounded-full text-base font-medium text-white'
          style={{
            background: 'linear-gradient(135deg, rgba(203,87,6,1) 0%, rgba(255,68,0,1) 100%)',
            fontFamily: 'Satoshi, sans-serif',
          }}
        >
          {getInitials(user.name)}
        </div>
      </div>
    </header>
  );
}
