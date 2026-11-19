/**
 * The wire protocol between the E2E Wallet module (in the page) and the walkthrough suite's signer
 * (in the Playwright test process, `apps/e2e/src/wallet`). The page calls
 * `window.__e2eSign(request)`, a function Playwright installs with `page.exposeBinding`; the
 * signer answers with a result or a kit-shaped error. Secrets never enter the page
 * (docs/plans/walkthroughs-and-docs.md decision E2).
 *
 * This file has no imports so the e2e workspace can import its types without pulling in the app.
 */

/** Kit module id. Also the marker `apps/web/scripts/assert-e2e-wallet.mjs` looks for in a build. */
export const E2E_WALLET_ID = 'e2e_wallet';

/** The window function Playwright exposes. Also a build marker. */
export const E2E_SIGN_BINDING = '__e2eSign';

export type E2ESignOptions = {
  networkPassphrase?: string;
  address?: string;
  path?: string;
};

export type E2ESignRequest =
  | { method: 'getAddress' }
  | { method: 'getNetwork' }
  | { method: 'signTransaction'; xdr: string; opts?: E2ESignOptions }
  | { method: 'signAuthEntry'; authEntry: string; opts?: E2ESignOptions }
  | { method: 'signMessage'; message: string; opts?: E2ESignOptions };

export type E2ESignMethod = E2ESignRequest['method'];

/** Same shape as the kit's `IKitError`, so the app's error handling sees what a real wallet sends. */
export type E2EWalletError = { code: number; message: string; ext?: string };

export type E2ESignResult = {
  getAddress: { address: string };
  getNetwork: { network: string; networkPassphrase: string };
  signTransaction: { signedTxXdr: string; signerAddress: string };
  signAuthEntry: { signedAuthEntry: string; signerAddress: string };
  signMessage: { signedMessage: string; signerAddress: string };
};

export type E2ESignResponse<M extends E2ESignMethod = E2ESignMethod> =
  { ok: true; result: E2ESignResult[M] } | { ok: false; error: E2EWalletError };

/** The rejection a real wallet sends (Freighter's wording); `isSep53UnsupportedError` must not treat it as "unsupported". */
export const E2E_USER_REJECTED: E2EWalletError = { code: -4, message: 'The user rejected this request.' };

export type E2ESignBinding = (request: E2ESignRequest) => Promise<E2ESignResponse>;
