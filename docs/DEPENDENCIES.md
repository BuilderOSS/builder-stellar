# Dependencies and advisories

How dependencies are pinned and updated, and where each known advisory stands. The advisory status
below was checked on 25 November 2026 with `pnpm audit` and OSV-Scanner 2.6.0 over `pnpm-lock.yaml`
and `Cargo.lock`. Rerun both before relying on it:

```bash
pnpm audit
docker run --rm -v "$PWD:/src:ro" ghcr.io/google/osv-scanner:v2.6.0 scan source --lockfile /src/Cargo.lock --lockfile /src/pnpm-lock.yaml
```

## How updates arrive

- **Dependabot** ([`.github/dependabot.yml`](../.github/dependabot.yml)) opens weekly pull requests
  against `dev` for Cargo, npm and GitHub Actions, with minor and patch updates grouped per ecosystem.
  It leaves out soroban-sdk and the OpenZeppelin crates (they move together, by hand:
  [OpenZeppelin pin](OPENZEPPELIN_PIN.md)), Next major versions, and the contract build image
  ([reproducible builds](REPRODUCIBLE_BUILDS.md)).
- **Contract dependencies.** Any `Cargo.lock` change in the contracts' dependency graph changes every
  contract's hash, even for a crate used only at compile time. Merging one is fine; the change reaches
  a network only with the next contract release, which publishes new hashes.
- **Overrides.** [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) forces patched versions where a
  parent package pins a version with an advisory. Each override stays within the same major version.
  Remove an override once its parent ships the fix itself.

## Updated on 25 November 2026

| Package | From | To | How |
| --- | --- | --- | --- |
| `next` (web, docs, design tokens) | 15.5.25 | 15.5.29 | Specifiers raised to `^15.5.29` |
| `prisma`, `@prisma/client` | 6.19.0 | 6.19.3 | Specifiers |
| `effect` (through `@prisma/config`) | 3.18.4 | 3.22.5 | Override |
| `sharp` | 0.35.4 | 0.35.5 | Specifier |
| `undici` | 6.28.1 | 6.29.1 | Specifier |
| `postcss` (through Next and Panda CSS) | 8.4.31, 8.5.14 | 8.5.33 | Override |
| `browserslist`, `postcss-selector-parser` (through Panda CSS) | 4.28.1, 7.1.1 | 4.29.6, 7.2.1 | Override |
| `smol-toml`, `source-map-js`, `follow-redirects`, `vite`, `zod` 4, and the Panda CSS MCP server's `@modelcontextprotocol/sdk`, `hono`, `@hono/node-server`, `body-parser`, `qs`, `ip-address`, `fast-uri` | | Latest within their ranges | `pnpm update` |

## Open advisories

None of these has a fix within the version range its parent allows. Where the fix is a new major
version, the parent package has to adopt it, or the update needs its own change and testing.

### npm

| Package | Advisory | Fixed in | Comes from | Where it runs |
| --- | --- | --- | --- | --- |
| `elliptic` 6.6.1 | GHSA-848j-6mx2-7j84 | No fixed version | Stellar Wallets Kit → `@hot-wallet/sdk` → `@near-js/crypto` → `secp256k1` | Browser, NEAR key handling inside a wallet library. Tribe Builder signs with Stellar ed25519 keys, which do not use it |
| `uuid` 8.3.2 | GHSA-w5hq-g745-h8pq | 11.1.1 | Wallets Kit → `@solana/web3.js` → `jayson` | Browser. The advisory affects the `buf` argument of v3, v5 and v6; `jayson` calls `v4` only |
| `stream-json` 1.9.1 | GHSA-528h-pc64-c93x, GHSA-hqr4-qq8f-hg3x, GHSA-mjw6-4jj6-33hc | 3.5.0, 3.6.0 | Wallets Kit → `@solana/web3.js` → `jayson` | `jayson`'s JSON stream parser. Reachability not assessed further |
| `zod` 3.22.4, 3.25.76 | GHSA-mrhx-c7xc-m3w5 | 4.6.6 | Wallets Kit → `@reown/appkit` packages | Browser, inside the WalletConnect and Coinbase wallet libraries |
| `deepmerge-ts` 7.1.5 | GHSA-ggr8-5vv4-36mx | 8.0.0 | `prisma` → `@prisma/config` | Prisma CLI at code generation, merging local configuration |
| `minimatch` 10.2.6 | GHSA-g3hv-75wg-m249 | 11.0.1 | Panda CSS → `ts-morph` | Style generation at build time, with the repository's own globs |
| `vitest`, `@vitest/mocker` 3.2.7; `tinypool` 1.1.1 | GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8; GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr | Vitest 4.1.12; tinypool 2.1.2 | The web, docs and walkthrough test suites | Local and CI test runs only; never in a build that ships |

The move to Vitest 4 changes test configuration in three packages and is a separate change.

### Rust

| Crate | Advisory | Fixed in | Comes from | In the contract WASM |
| --- | --- | --- | --- | --- |
| `heapless` 0.8.0 | RUSTSEC-2026-0574 to RUSTSEC-2026-0582 | 0.9.4 | `soroban-sdk` → `stellar-strkey` | Yes. `stellar-strkey` uses `heapless::String` and `heapless::Vec`; eight of the nine advisories name other types (`FindMutView`, `Spsc`, `IndexMap`, `SortedLinkedList`, `Deque` and the Treiber stack). RUSTSEC-2026-0577 (a panicking `Drop` implementation) is not assessed here. The fix needs a `stellar-strkey` release that soroban-sdk adopts |
| `serde_with` 3.20.0 | GHSA-7gcf-g7xr-8hxj | 3.21.0 | `stellar-xdr`, used by the SDK's macros and by test snapshots | No: compile time and tests only. Updating it changes every contract hash, so it ships with the next contract release |
| `crypto-bigint` 0.5.5 | RUSTSEC-2026-0387 | 0.7.6 | `soroban-env-host` → `elliptic-curve` | No: the native test host only |
| `paste` 1.0.15 | RUSTSEC-2024-0436 (unmaintained) | None | Procedural macro used by `wasmi` and `ark-ff` in the test host | No |
| `chrono` 0.4.44 | RUSTSEC-2026-0543 (unmaintained) | None | Listed in `Cargo.lock`; `cargo tree` finds no workspace crate that builds it | No |
