import { execFileSync } from 'node:child_process';

import { Keypair } from '@stellar/stellar-sdk';

/**
 * Walkthrough identities: funded testnet keys held by `stellar keys` on the machine running the
 * suite (docs/plans/walkthroughs-and-docs.md §3.3). Secrets are read into this process only, for
 * the signer; nothing here logs or returns them in a printable form.
 *
 * One identity per concurrent timeline (§13.1): two timelines signing from one account collide on
 * sequence numbers (`tx_bad_seq`). `claimIdentity` enforces that.
 */
export const E2E_IDENTITIES = ['e2e-founder', 'e2e-member-a', 'e2e-member-b', 'e2e-operator'] as const;
export type E2EIdentityName = (typeof E2E_IDENTITIES)[number];

/** Signs SEP-53 challenges on the app server (`STELLAR_WEB_AUTH_SECRET`). Not a wallet. */
export const E2E_WEB_AUTH_IDENTITY = 'e2e-web-auth';

export type Identity = { name: string; address: string; keypair: Keypair };

export type KeyStore = {
  address(name: string): string | null;
  secret(name: string): string | null;
  generate(name: string): void;
};

function stellar(args: string[]): string | null {
  try {
    return execFileSync('stellar', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/** The `stellar keys` CLI. `generate` makes a new local key without funding it (preflight funds). */
export const stellarKeyStore: KeyStore = {
  address: (name) => stellar(['keys', 'public-key', name]) || stellar(['keys', 'address', name]),
  secret: (name) => stellar(['keys', 'secret', name]),
  generate: (name) => {
    stellar(['keys', 'generate', name]);
  }
};

export function loadIdentity(name: string, store: KeyStore = stellarKeyStore, { create = false } = {}): Identity {
  let secret = store.secret(name);
  if (!secret && create) {
    store.generate(name);
    secret = store.secret(name);
  }
  if (!secret) {
    throw new Error(`No stellar key named "${name}". Create it with: stellar keys generate ${name}`);
  }
  const keypair = Keypair.fromSecret(secret);
  const address = store.address(name);
  if (address && address !== keypair.publicKey()) {
    throw new Error(`stellar keys reports a different address for "${name}" than its secret derives.`);
  }
  return { name, address: keypair.publicKey(), keypair };
}

/** Tracks which timeline owns which identity, so two concurrent timelines never share an account. */
export class IdentityClaims {
  private owners = new Map<string, string>();

  claim(identity: string, timeline: string) {
    const owner = this.owners.get(identity);
    if (owner && owner !== timeline) {
      throw new Error(
        `Identity ${identity} is already used by timeline "${owner}"; timeline "${timeline}" needs its own funded identity.`
      );
    }
    this.owners.set(identity, timeline);
  }

  release(timeline: string) {
    for (const [identity, owner] of this.owners) if (owner === timeline) this.owners.delete(identity);
  }
}
