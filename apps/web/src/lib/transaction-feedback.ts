'use client';

import { useRef } from 'react';

import { type ContractName, describeContractError } from '@/lib/contract-errors';
import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { toaster } from '@/lib/toaster';

function shortenHash(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

/**
 * Wallet SDKs often reject with plain objects (`{ code, message }`) rather than Errors; keep their
 * message instead of collapsing to the generic title.
 */
export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message)
    return error.message;
  return fallback;
}

export function useTransactionFeedback(network: DaoNetworkName) {
  const toastIdRef = useRef<string | undefined>(undefined);

  /**
   * A second start (the next step of a multi-step flow) moves the same toast on, so an earlier step's
   * "Approve the transaction" never stays spinning after the flow is done (BUG-CAP-13).
   */
  function start(message: string) {
    const payload = {
      title: message,
      description: 'Approve the transaction in your wallet.',
      type: 'loading' as const,
      duration: Infinity
    };
    // Reuse it only while it's on screen: a toast the person closed starts a new one.
    if (toastIdRef.current && toaster.isVisible(toastIdRef.current)) {
      toaster.update(toastIdRef.current, payload);
      return;
    }
    toastIdRef.current = toaster.create(payload);
  }

  /** `description` replaces the default line, for an outcome that sent nothing (e.g. already done). */
  function success(message: string, hash: string, description?: string) {
    const payload = {
      title: message,
      description: description ?? (hash ? 'Transaction confirmed onchain.' : 'Transaction submitted.'),
      type: 'success' as const,
      duration: hash ? 20000 : 8000,
      action: hash
        ? {
            label: `View transaction ${shortenHash(hash)}`,
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
        ? `Transaction ${shortenHash(hash)} submitted. Waiting for confirmation…`
        : 'Transaction submitted. Waiting for confirmation…',
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

  /**
   * Sent, but the network has not confirmed it within the wait: a recovery state, not a failure.
   * The page shows the same transaction with a way to check again.
   */
  function unconfirmed(hash: string) {
    const payload = {
      title: 'Waiting for confirmation',
      description: `Transaction ${shortenHash(hash)} was sent but isn't confirmed yet. Check it before you try again.`,
      type: 'info' as const,
      duration: 20000,
      action: {
        label: 'Check the transaction',
        onClick: () => window.open(getExplorerTxUrl(network, hash), '_blank', 'noreferrer')
      }
    };

    if (toastIdRef.current) {
      toaster.update(toastIdRef.current, payload);
      toastIdRef.current = undefined;
      return;
    }

    toaster.create(payload);
  }

  function fail(error: unknown, fallback: string, contract?: ContractName) {
    const payload = {
      title: fallback,
      description: describeContractError(error, contract) ?? errorMessage(error, fallback),
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

  return { start, submitted, success, unconfirmed, fail };
}
