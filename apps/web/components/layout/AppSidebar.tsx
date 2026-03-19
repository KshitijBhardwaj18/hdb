'use client';

import { LayoutDashboard, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@repo/ui/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className='fixed left-0 top-0 z-30 flex h-screen w-64 flex-col bg-[#1D1E1F] shadow-[0_1px_4px_0_rgba(12,12,13,0.05)]'
      style={{ borderRight: '0.5px solid #5B5B5B' }}
    >
      <div className='flex items-center justify-center px-4 py-5'>
        <img src='/logo.png' alt='HydraDB' className='h-10 w-[160px] object-contain' />
      </div>

      <nav className='flex flex-1 flex-col px-4'>
        <div className='flex flex-col gap-2'>
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-lg px-4 text-base transition-colors',
                  isActive ? 'bg-[#FF4400] font-bold text-white' : 'font-medium text-white hover:bg-white/5',
                )}
                style={{ fontFamily: 'Satoshi, sans-serif' }}
              >
                <item.icon className='h-4 w-4' />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className='px-4 py-4' style={{ borderTop: '0.5px solid #5B5B5B' }}>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className='flex h-10 w-full items-center gap-2 rounded-lg px-4 text-base font-medium text-[#FF4400] transition-colors hover:bg-white/5'
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          <LogOut className='h-4 w-4' />
          Log Out
        </button>
      </div>
    </aside>
  );
}
