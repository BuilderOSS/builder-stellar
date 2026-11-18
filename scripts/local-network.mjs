// The local quickstart network, shared by `scripts/local-up.mjs` and the web app's
// `NETWORKS.local` (apps/web/src/config/networks.ts). The quickstart serves Stellar RPC at
// `/rpc`; keep one value so the Manager artifact and the app can't drift apart again
// (docs/qa/BUG_LEDGER.md, BUG-001).
export const LOCAL_RPC_URL = 'http://localhost:8000/rpc';
export const LOCAL_NETWORK_PASSPHRASE = 'Standalone Network ; February 2017';
