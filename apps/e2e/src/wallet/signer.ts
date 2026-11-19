import { createHash } from 'node:crypto';

import { FeeBumpTransaction, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

import {
  E2E_USER_REJECTED,
  type E2ESignMethod,
  type E2ESignRequest,
  type E2ESignResponse,
  type E2ESignResult,
  type E2EWalletError
} from '../../../web/src/lib/e2e-wallet/protocol.ts';
import type { Identity } from '../identities.ts';

/** The only network the signer signs for: it refuses anything else (§3.2). */
export const SIGNER_NETWORK = { network: 'TESTNET', networkPassphrase: Networks.TESTNET } as const;

export type RejectRule = { method: E2ESignMethod | 'any'; times: number; error: E2EWalletError };

export type SignerCall = {
  method: E2ESignMethod;
  identity: string | null;
  outcome: 'ok' | 'rejected' | 'error';
  at: number;
};

export type SignerOptions = {
  /** Reads an account's current sequence number (RPC). Used by the per-account lock. */
  accountSequence?: (address: string) => Promise<bigint>;
  /** How long a signed transaction may stay unsubmitted before the next one from that account goes ahead. */
  submitWaitMs?: number;
  pollMs?: number;
  /** What the wallet reports from getNetwork. Override to test the network-mismatch state (W20). */
  reportedNetwork?: { network: string; networkPassphrase: string };
};

export class SequenceCollisionError extends Error {
  constructor(address: string, seq: bigint, current: bigint) {
    super(
      `Transaction from ${address} uses sequence ${seq}, but the account is already at ${current}. ` +
        'Two timelines are signing from one identity; give each its own (apps/e2e/src/identities.ts).'
    );
    this.name = 'SequenceCollisionError';
  }
}

/**
 * The test-process side of the E2E Wallet (decision E2). Playwright exposes `handle` to the page as
 * `window.__e2eSign`; the module in `apps/web/src/lib/e2e-wallet` calls it. It holds the identities'
 * keypairs, signs only for testnet, and can be told to reject the next call.
 *
 * Per-account lock: signing for one account is serialised, and a transaction is only signed after
 * the previous one from that account has landed (its sequence is used) or `submitWaitMs` has passed.
 * A transaction whose sequence is already used fails fast with `SequenceCollisionError` instead of
 * a `tx_bad_seq` from the network later.
 */
export class E2ESigner {
  private identities = new Map<string, Identity>();
  private active: Identity | null = null;
  private rejects: RejectRule[] = [];
  private locks = new Map<string, Promise<unknown>>();
  private lastSigned = new Map<string, { seq: bigint; at: number }>();
  readonly calls: SignerCall[] = [];

  constructor(
    identities: Identity[],
    private readonly options: SignerOptions = {}
  ) {
    for (const identity of identities) this.identities.set(identity.name, identity);
  }

  /** Switch the wallet's account, like picking another account in a real wallet. */
  use(name: string | null) {
    if (name === null) {
      this.active = null;
      return;
    }
    const identity = this.identities.get(name);
    if (!identity) throw new Error(`The signer has no identity named ${name}`);
    this.active = identity;
  }

  get address() {
    return this.active?.address ?? null;
  }

  /** Reject the next `times` calls of `method` ("any" for every method) as a user would. */
  rejectNext(method: RejectRule['method'] = 'any', times = 1) {
    this.rejects.push({ method, times, error: E2E_USER_REJECTED });
  }

  /** Reject every call until `clearRejects` (a wallet that refuses everything). */
  rejectAll() {
    this.rejects.push({ method: 'any', times: Number.POSITIVE_INFINITY, error: E2E_USER_REJECTED });
  }

  /** Answer the next call of `method` as a wallet without it would (code -3), e.g. to drive the SEP-10 fallback. */
  unsupportedNext(method: E2ESignMethod, times = 1) {
    this.rejects.push({ method, times, error: { code: -3, message: `${method} is not supported by this wallet` } });
  }

  clearRejects() {
    this.rejects = [];
  }

  setReportedNetwork(network: SignerOptions['reportedNetwork']) {
    this.options.reportedNetwork = network;
  }

  private takeReject(method: E2ESignMethod): E2EWalletError | null {
    const rule = this.rejects.find((candidate) => candidate.method === method || candidate.method === 'any');
    if (!rule) return null;
    rule.times -= 1;
    if (rule.times <= 0) this.rejects.splice(this.rejects.indexOf(rule), 1);
    return rule.error;
  }

  async handle(request: E2ESignRequest): Promise<E2ESignResponse> {
    const identity = this.active;
    const record = (outcome: SignerCall['outcome']) =>
      this.calls.push({ method: request.method, identity: identity?.name ?? null, outcome, at: Date.now() });

    const refusal = request.method === 'getNetwork' ? null : this.takeReject(request.method);
    if (refusal) {
      record('rejected');
      return { ok: false, error: refusal };
    }
    try {
      const result = await this.dispatch(request, identity);
      record('ok');
      return { ok: true, result };
    } catch (error) {
      record('error');
      const walletError: E2EWalletError =
        error && typeof error === 'object' && 'code' in error && 'message' in error
          ? (error as E2EWalletError)
          : { code: -1, message: error instanceof Error ? error.message : String(error) };
      return { ok: false, error: walletError };
    }
  }

  private async dispatch(request: E2ESignRequest, identity: Identity | null): Promise<E2ESignResult[E2ESignMethod]> {
    if (request.method === 'getNetwork') return this.options.reportedNetwork ?? SIGNER_NETWORK;
    if (!identity) throw { code: -1, message: 'The E2E Wallet has no account selected.' };
    if (request.method === 'getAddress') return { address: identity.address };

    const { opts } = request;
    if (opts?.networkPassphrase && opts.networkPassphrase !== SIGNER_NETWORK.networkPassphrase) {
      throw { code: -1, message: `The E2E Wallet signs only for testnet, not "${opts.networkPassphrase}".` };
    }
    if (opts?.address && opts.address !== identity.address) {
      throw { code: -1, message: `The E2E Wallet is on ${identity.address}, not ${opts.address}.` };
    }

    switch (request.method) {
      case 'signMessage':
        return {
          signedMessage: Buffer.from(identity.keypair.signMessage(request.message)).toString('base64'),
          signerAddress: identity.address
        };
      case 'signAuthEntry': {
        // SEP-43: the input is a HashIdPreimage (base64 XDR); the wallet signs its SHA-256.
        const preimage = Buffer.from(request.authEntry, 'base64');
        const signature = identity.keypair.sign(createHash('sha256').update(preimage).digest());
        return { signedAuthEntry: Buffer.from(signature).toString('base64'), signerAddress: identity.address };
      }
      case 'signTransaction':
        return this.withAccountLock(identity.address, () => this.signTransaction(request.xdr, identity.keypair));
    }
  }

  private async signTransaction(xdr: string, keypair: Keypair) {
    const parsed = TransactionBuilder.fromXDR(xdr, SIGNER_NETWORK.networkPassphrase);
    const inner = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
    const ownSequence = inner.source === keypair.publicKey() ? BigInt(inner.sequence) : null;

    // SEP-10 challenges have sequence 0 from the server account: no lock needed.
    if (ownSequence !== null && this.options.accountSequence) {
      await this.waitForPreviousSubmit(keypair.publicKey());
      const current = await this.options.accountSequence(keypair.publicKey());
      if (ownSequence <= current) throw new SequenceCollisionError(keypair.publicKey(), ownSequence, current);
    }

    parsed.sign(keypair);
    if (ownSequence !== null) this.lastSigned.set(keypair.publicKey(), { seq: ownSequence, at: Date.now() });
    return { signedTxXdr: parsed.toXDR(), signerAddress: keypair.publicKey() };
  }

  private async waitForPreviousSubmit(address: string) {
    const previous = this.lastSigned.get(address);
    const read = this.options.accountSequence;
    if (!previous || !read) return;
    const deadline = previous.at + (this.options.submitWaitMs ?? 60_000);
    while (Date.now() < deadline) {
      if ((await read(address)) >= previous.seq) return;
      await new Promise((resolve) => setTimeout(resolve, this.options.pollMs ?? 1_000));
    }
    // The app abandoned that transaction (a cancelled sheet); go ahead.
  }

  private withAccountLock<T>(address: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(address) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.locks.set(
      address,
      next.catch(() => undefined)
    );
    return next;
  }
}

/** Reads an account's sequence from Horizon-free RPC (`getAccount`). */
export function rpcAccountSequence(rpcUrl: string) {
  return async (address: string) => {
    const { rpc } = await import('@stellar/stellar-sdk');
    const account = await new rpc.Server(rpcUrl).getAccount(address);
    return BigInt(account.sequenceNumber());
  };
}

export { Keypair };
