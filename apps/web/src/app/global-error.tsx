'use client';

import '../../styled-system/styles.css';
import './globals.css';

import { css } from 'styled-system/css';

import { RouteError } from '@/components/route-error';

const wrap = css({ maxW: 'content', mx: 'auto', px: 'clamp(16px, 4vw, 40px)', py: '10' });

// Replaces the root layout when it fails, so it renders its own document.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <main className={wrap}>
          <RouteError error={error} reset={reset} title="Something went wrong" homeLabel="Go home" />
        </main>
      </body>
    </html>
  );
}
