'use client';
import { Toaster } from '@repo/ui/components/sonner';
import { ThemeProvider } from '@repo/ui/components/theme-provider';
import { TooltipProvider } from '@repo/ui/components/tooltip';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SessionProvider } from 'next-auth/react';
import { ReactQueryClientProvider } from '@/lib/tanstack-query';

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <SessionProvider>
      <ThemeProvider attribute='class' defaultTheme='system' disableTransitionOnChange>
        <ReactQueryClientProvider>
          <Toaster duration={2500} richColors closeButton position='top-right' />
          <TooltipProvider>{children}</TooltipProvider>
          {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </ReactQueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
};

export default Providers;
