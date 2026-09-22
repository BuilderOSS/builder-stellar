import '../../styled-system/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppToaster } from '@/components/app-toaster';
const daoConfig = { tokenName: 'DAO', tokenDescription: 'Stellar DAO' };

export const metadata: Metadata = {
  title: daoConfig.tokenName,
  description: daoConfig.tokenDescription
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
