'use client';

import { Buffer } from 'buffer';
import useSWR from 'swr';

import { createAuthMessage } from './message';
import type { AuthChallengeResponse, AuthSessionResponse, Sep10ChallengeResponse } from './types';

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'include' });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || 'Authentication request failed.');
  return body;
}

export function useAuthSession() {
  return useSWR<AuthSessionResponse>('/api/auth/session', fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false
  });
}

export async function requestAuthChallenge(address: string) {
  return fetchJson<AuthChallengeResponse>('/api/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  });
}

export async function verifyAuthProof(input: { address: string; message: string; signature: string }) {
  return fetchJson<AuthSessionResponse>('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
}

export async function requestSep10Challenge(address: string) {
  return fetchJson<Sep10ChallengeResponse>('/api/auth/sep10/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  });
}

export async function verifySep10Proof(signedTxXdr: string) {
  return fetchJson<AuthSessionResponse>('/api/auth/sep10/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTxXdr })
  });
}

export async function logoutAuth() {
  return fetchJson<AuthSessionResponse>('/api/auth/logout', { method: 'POST' });
}

export function normalizeWalletSignature(signature: string) {
  const value = signature.trim();
  const hex = value.replace(/^0x/, '');
  if (/^[0-9a-fA-F]{128}$/.test(hex)) {
    return Buffer.from(hex, 'hex').toString('base64');
  }
  return value;
}

export function createClientAuthMessage(challenge: AuthChallengeResponse, address: string) {
  return createAuthMessage({
    appName: challenge.appName,
    address,
    domain: challenge.domain,
    uri: challenge.uri,
    network: challenge.network,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expirationTime: challenge.expirationTime,
    serverPublicKey: challenge.serverPublicKey,
    serverSignature: challenge.serverSignature
  });
}

export function isSep53UnsupportedError(error: unknown) {
  const candidate = error as { code?: number; message?: string; error?: { code?: number; message?: string } };
  const code = candidate?.code ?? candidate?.error?.code;
  const message = String(candidate?.message ?? candidate?.error?.message ?? '').toLowerCase();
  if (/(reject|denied|declined|cancel)/.test(message)) return false;
  return code === -3 || /(unsupported|not supported|not implemented|method not found|signmessage)/.test(message);
}

export const WALLET_DECLINED_MESSAGE = "You declined the request in your wallet, so you're not signed in.";

/**
 * The sign-in error to show. Stellar Wallets Kit modules reject with plain `{ code, message }`
 * objects, not `Error`s, so reading only `Error#message` dropped every wallet's reason
 * (docs/qa/BUG_LEDGER.md BUG-003). A refusal (SEP-43 code -4, or a "rejected"/"declined" message)
 * gets plain words instead of the wallet's own.
 */
export function walletErrorMessage(error: unknown, fallback = 'Wallet sign-in failed.') {
  const candidate = error as { code?: number; message?: unknown; error?: { code?: number; message?: unknown } } | null;
  const raw = candidate?.message ?? candidate?.error?.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  const code = candidate?.code ?? candidate?.error?.code;
  if (code === -4 || /(reject|denied|declined|cancel)/i.test(message)) return WALLET_DECLINED_MESSAGE;
  return message || fallback;
}
