import type { Metadata } from 'next';
import { Suspense } from 'react';
import Providers from '@/app/providers';
import { dmSans } from '@/lib/fonts';
import GlobalLoading from './loading';
import '@repo/ui/globals.css';

export const metadata: Metadata = {
  title: 'HydraDB',
  description: 'HydraDB - Deployment Management Platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={`${dmSans.className} antialiased`}>
        <Suspense fallback={<GlobalLoading />}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
