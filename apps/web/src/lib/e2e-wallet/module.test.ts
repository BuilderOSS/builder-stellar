import { describe, expect, it, vi } from 'vitest';

import { isSep53UnsupportedError } from '@/lib/auth/client';

import { E2EWalletModule } from './module';
import {
  E2E_SIGN_BINDING,
  E2E_USER_REJECTED,
  E2E_WALLET_ID,
  type E2ESignRequest,
  type E2ESignResponse
} from './protocol';

const ADDRESS = 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO';
const TESTNET = 'Test SDF Network ; September 2015';

function moduleWith(handler: (request: E2ESignRequest) => E2ESignResponse) {
  const binding = vi.fn(async (request: E2ESignRequest) => handler(request));
  return { wallet: new E2EWalletModule({ [E2E_SIGN_BINDING]: binding }), binding };
}

describe('E2EWalletModule', () => {
  it('identifies as the E2E Wallet hot wallet', () => {
    const wallet = new E2EWalletModule({});
    expect(wallet.productId).toBe(E2E_WALLET_ID);
    expect(wallet.productName).toBe('E2E Wallet');
    expect(wallet.productIcon.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('is available only when the Playwright binding is attached', async () => {
    expect(await new E2EWalletModule({}).isAvailable()).toBe(false);
    expect(await new E2EWalletModule({ [E2E_SIGN_BINDING]: 'not a function' }).isAvailable()).toBe(false);
    expect(await moduleWith(() => ({ ok: true, result: { address: ADDRESS } })).wallet.isAvailable()).toBe(true);
  });

  it('fails like a disconnected wallet when the binding is missing', async () => {
    await expect(new E2EWalletModule({}).getAddress()).rejects.toMatchObject({ code: -1 });
  });

  it('forwards every call with its payload and options', async () => {
    const { wallet, binding } = moduleWith((request) => {
      switch (request.method) {
        case 'getAddress':
          return { ok: true, result: { address: ADDRESS } };
        case 'getNetwork':
          return { ok: true, result: { network: 'TESTNET', networkPassphrase: TESTNET } };
        case 'signTransaction':
          return { ok: true, result: { signedTxXdr: `signed:${request.xdr}`, signerAddress: ADDRESS } };
        case 'signAuthEntry':
          return { ok: true, result: { signedAuthEntry: `sig:${request.authEntry}`, signerAddress: ADDRESS } };
        case 'signMessage':
          return { ok: true, result: { signedMessage: `sig:${request.message}`, signerAddress: ADDRESS } };
      }
    });
    const opts = { networkPassphrase: TESTNET, address: ADDRESS };

    expect(await wallet.getAddress()).toEqual({ address: ADDRESS });
    expect(await wallet.getNetwork()).toEqual({ network: 'TESTNET', networkPassphrase: TESTNET });
    expect(await wallet.signTransaction('AAAA', opts)).toEqual({ signedTxXdr: 'signed:AAAA', signerAddress: ADDRESS });
    expect(await wallet.signAuthEntry('BBBB', opts)).toEqual({ signedAuthEntry: 'sig:BBBB', signerAddress: ADDRESS });
    expect(await wallet.signMessage('hello', opts)).toEqual({ signedMessage: 'sig:hello', signerAddress: ADDRESS });

    expect(binding.mock.calls.map(([request]) => request)).toEqual([
      { method: 'getAddress' },
      { method: 'getNetwork' },
      { method: 'signTransaction', xdr: 'AAAA', opts },
      { method: 'signAuthEntry', authEntry: 'BBBB', opts },
      { method: 'signMessage', message: 'hello', opts }
    ]);
  });

  it('throws the kit-shaped error on a rejection, which sign-in treats as a refusal, not "unsupported"', async () => {
    const { wallet } = moduleWith(() => ({ ok: false, error: E2E_USER_REJECTED }));
    const error = await wallet.signMessage('hello').catch((caught: unknown) => caught);
    expect(error).toEqual(E2E_USER_REJECTED);
    expect(error).not.toBeInstanceOf(Error);
    // A refusal must not fall back to SEP-10 (components/shell/wallet-session.tsx).
    expect(isSep53UnsupportedError(error)).toBe(false);
  });

  it('passes an "unsupported" error through so the SEP-10 fallback runs', async () => {
    const { wallet } = moduleWith(() => ({ ok: false, error: { code: -3, message: 'signMessage is not supported' } }));
    const error = await wallet.signMessage('hello').catch((caught: unknown) => caught);
    expect(isSep53UnsupportedError(error)).toBe(true);
  });
});
