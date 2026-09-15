'use client';

import { useRef } from 'react';

import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { toaster } from '@/lib/toaster';

function shortenHash(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export function useTransactionFeedback(network: DaoNetworkName) {
  const toastIdRef = useRef<string | undefined>(undefined);

  function start(message: string) {
    toastIdRef.current = toaster.create({
      title: message,
      description: 'Approve the transaction in your wallet.',
      type: 'loading',
      duration: Infinity
    });
  }

  function success(message: string, hash: string) {
    const payload = {
      title: message,
      description: hash ? 'Transaction confirmed on-chain.' : 'Transaction submitted.',
      type: 'success' as const,
      duration: hash ? 20000 : 8000,
      action: hash
        ? {
            label: `View tx ${shortenHash(hash)}`,
            onClick: () => window.open(getExplorerTxUrl(network, hash), '_blank', 'noreferrer')
          }
        : undefined
    };

    if (toastIdRef.current) {
      toaster.update(toastIdRef.current, payload);
      toastIdRef.current = undefined;
      return;
    }

    toaster.success(payload);
  }

  function submitted(message: string, hash: string) {
    const payload = {
      title: message,
      description: hash
        ? `Transaction ${shortenHash(hash)} submitted. Waiting for confirmation...`
        : 'Transaction submitted. Waiting for confirmation...',
      type: 'loading' as const,
      duration: Infinity,
      action: hash
        ? {
            label: 'View pending',
            onClick: () => window.open(getExplorerTxUrl(network, hash), '_blank', 'noreferrer')
          }
        : undefined
    };

    if (toastIdRef.current) {
      toaster.update(toastIdRef.current, payload);
    } else {
      toastIdRef.current = toaster.create(payload);
    }
  }

  function fail(error: unknown, fallback: string) {
    const payload = {
      title: fallback,
      description: error instanceof Error ? error.message : fallback,
      type: 'error' as const,
      duration: Infinity
    };

    if (toastIdRef.current) {
      toaster.update(toastIdRef.current, payload);
      toastIdRef.current = undefined;
      return;
    }

    toaster.error(payload);
  }

  return { start, submitted, success, fail };
}
