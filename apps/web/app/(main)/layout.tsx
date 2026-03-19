import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TopBar } from '@/components/layout/TopBar';

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <div className='min-h-screen bg-[#1D1E1F]'>
        <AppSidebar />
        <TopBar />
        <main className='pl-64 pt-[60px]'>
          <div className='p-6'>{children}</div>
        </main>
      </div>
    </AuthProvider>
  );
};

export default MainLayout;
