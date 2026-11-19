import { describe, expect, it } from 'vitest';

import { LOCAL_NETWORK_PASSPHRASE, LOCAL_RPC_URL } from '../../../../scripts/local-network.mjs';
import { NETWORKS } from './networks';

// BUG-001 (docs/qa/BUG_LEDGER.md): `pnpm local:up` wrote `/soroban/rpc` into the local Manager
// config while the app reads `/rpc`. Both now come from scripts/local-network.mjs.
describe('local network config', () => {
  it('matches what scripts/local-up.mjs writes for the local Manager', () => {
    expect(NETWORKS.local.rpcUrl).toBe(LOCAL_RPC_URL);
    expect(NETWORKS.local.networkPassphrase).toBe(LOCAL_NETWORK_PASSPHRASE);
  });

  it('uses the quickstart /rpc endpoint, not the legacy /soroban/rpc path', () => {
    expect(new URL(LOCAL_RPC_URL).pathname).toBe('/rpc');
  });
});
