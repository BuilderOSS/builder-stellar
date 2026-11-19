import { type ModuleInterface, ModuleType } from '@creit.tech/stellar-wallets-kit/types';

import {
  E2E_SIGN_BINDING,
  E2E_WALLET_ID,
  type E2ESignBinding,
  type E2ESignMethod,
  type E2ESignOptions,
  type E2ESignRequest,
  type E2ESignResult,
  type E2EWalletError
} from './protocol';

/**
 * A test-only Stellar Wallets Kit module for the walkthrough suite (apps/e2e). It appears in the
 * kit's modal like any wallet and forwards every call to `window.__e2eSign`, which Playwright
 * installs per page. Registered only when the app is built with NEXT_PUBLIC_E2E_WALLET=1
 * (`lib/wallet-kit.ts`); `scripts/assert-e2e-wallet.mjs` fails a build that contains it otherwise.
 */
export class E2EWalletModule implements ModuleInterface {
  moduleType = ModuleType.HOT_WALLET;
  productId = E2E_WALLET_ID;
  productName = 'E2E Wallet';
  productUrl = 'https://github.com/BuilderOSS/builder-stellar/tree/dev/apps/e2e';
  // A plain grey square: the modal needs an icon and this must not load anything remote.
  productIcon =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNiIgZmlsbD0iIzc3NyIvPjwvc3ZnPg==';

  constructor(private readonly scope: { [E2E_SIGN_BINDING]?: unknown } = globalThis as never) {}

  private binding(): E2ESignBinding | null {
    const candidate = this.scope[E2E_SIGN_BINDING];
    return typeof candidate === 'function' ? (candidate as E2ESignBinding) : null;
  }

  private async call<M extends E2ESignMethod>(
    request: Extract<E2ESignRequest, { method: M }>
  ): Promise<E2ESignResult[M]> {
    const binding = this.binding();
    if (!binding)
      throw { code: -1, message: 'The E2E Wallet signer is not attached to this page.' } satisfies E2EWalletError;
    const response = await binding(request);
    // Throw the kit-shaped object, as the kit's own modules do (parseError), not an Error.
    if (!response.ok) throw response.error;
    return response.result as E2ESignResult[M];
  }

  async isAvailable() {
    return this.binding() !== null;
  }

  async getAddress() {
    return this.call({ method: 'getAddress' });
  }

  async getNetwork() {
    return this.call({ method: 'getNetwork' });
  }

  async signTransaction(xdr: string, opts?: E2ESignOptions) {
    return this.call({ method: 'signTransaction', xdr, opts });
  }

  async signAuthEntry(authEntry: string, opts?: E2ESignOptions) {
    return this.call({ method: 'signAuthEntry', authEntry, opts });
  }

  async signMessage(message: string, opts?: E2ESignOptions) {
    return this.call({ method: 'signMessage', message, opts });
  }

  async disconnect() {
    /* Nothing to close: the signer lives in the test process. */
  }
}
