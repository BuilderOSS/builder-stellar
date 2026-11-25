# Reproducible contract builds

Anyone with git, Node and Docker can rebuild a tagged release and get the same contract WASM, byte
for byte. The hashes the Manager registers, and the `to_hash` members approve in an upgrade proposal,
can therefore be checked against source. This page covers what is pinned, how a release is built and
published, how to verify one, and what has been checked so far.

## What is pinned

| Input | Pin | Where |
| --- | --- | --- |
| Rust compiler | 1.95.0, with the `wasm32v1-none` target | [`rust-toolchain.toml`](../rust-toolchain.toml) |
| Build image | `rust:1.95.0-slim-trixie`, by index digest, on `linux/amd64` | [`docker/wasm-build/Dockerfile`](../docker/wasm-build/Dockerfile) |
| Stellar CLI | 28.0.0, the release archive checked by sha256 | the Dockerfile and [`ci.yml`](../.github/workflows/ci.yml) |
| Rust dependencies | `Cargo.lock`; every build runs with `--locked` | [`Cargo.lock`](../Cargo.lock) |
| OpenZeppelin `stellar-contracts` | git commit `fbfde38` | [OpenZeppelin pin](OPENZEPPELIN_PIN.md) |
| Compiler settings | the release profile | [`Cargo.toml`](../Cargo.toml) |

`scripts/wasm-build.test.mjs` fails if `rust-toolchain.toml` and the image name different Rust
versions, if the image is not pinned by digest and platform, or if CI and the image install different
CLI archives.

Each built contract also records its compiler and CLI in its own metadata (`rsver` and `cliver`):

```bash
stellar contract info meta --wasm target/wasm32v1-none/release/token.wasm
```

## Why the platform is pinned

Cargo mixes the compiler's host triple (the `host:` line of `rustc -vV`) into the metadata hash of
every crate it builds. Those hashes become part of symbol names, and the linked WASM orders its
functions by them. The same source, compiler and CLI therefore give different bytes on different
build hosts. Checked on 25 November 2026 with the contracts of `8cf1ac5`:

| Build host | Result |
| --- | --- |
| macOS on Apple silicon (`aarch64-apple-darwin`), native | The hashes production and dev.tribes.build run |
| Linux arm64 container | Different bytes for all eight contracts |
| Linux amd64 container | Different bytes again. This is the canonical build |
| Linux container with another source directory and Cargo home | Identical to the same platform's build: paths do not change the bytes |

The release build is fixed to `linux/amd64`, which is also what GitHub's runners use. Docker on Apple
silicon runs it under emulation; a build takes about three minutes there.

Any change to `Cargo.lock` inside the contracts' dependency graph also changes every contract's
bytes, even for a crate used only at compile time. Updating `serde_with` from 3.20.0 to 3.21.0, a
dependency of the SDK's macros, did this. Contract dependency updates therefore ship with a contract
release ([dependencies](DEPENDENCIES.md)).

## Build and publish a release

1. Commit the contract changes and the version bumps in `releases/contracts.json`
   ([contract upgrades](CONTRACT_UPGRADES.md), step 1).
2. Build the checked-out commit in the container and record its hashes:

   ```bash
   node scripts/build-wasm.mjs --write-hashes
   ```

   The script builds a `git archive` of the commit, so uncommitted files never reach the build. It
   writes `target/wasm-build/<commit>/` (`wasm/<crate>.wasm`, `SHA256SUMS` and `hashes.json`) and
   `releases/hashes.json`. It refuses `--write-hashes` while the build inputs have uncommitted changes.
3. Commit `releases/hashes.json` and tag that commit: `release-<n>`, `contracts-<name>` or
   `audit-<n>-freeze`. The hash file does not affect the WASM, so the tag rebuilds to the same hashes.
4. Pushing the tag (an outward-facing step: get sign-off first) runs the
   [Contract release build](../.github/workflows/contracts-release.yml) workflow. It rebuilds the tag
   in the container and, separately, natively on the runner with the pinned compiler and CLI, and fails
   unless both match the published hashes. The container build's WASM files get a signed build
   provenance attestation, the run summary lists the hashes, and the files are kept as a workflow
   artifact. The workflow writes nothing to the repository.
5. Upload the files built in step 2 from the tagged checkout ([contract upgrades](CONTRACT_UPGRADES.md),
   step 5). `<commit>` is the commit step 2 built:

   ```bash
   WASM_DIR=target/wasm-build/<commit>/wasm node scripts/upgrade-contract.mjs <module> ...
   ```

### `releases/hashes.json`

```json
{
  "schema": 1,
  "toolchain": {
    "rustc": "1.95.0",
    "stellarCli": "28.0.0",
    "image": "rust:1.95.0-slim-trixie@sha256:e14e8734…",
    "platform": "linux/amd64",
    "host": "x86_64-unknown-linux-gnu"
  },
  "contracts": {
    "token": { "sha256": "5a788466…", "bytes": 51117 }
  }
}
```

The file describes the last release. On `dev` it can trail the contracts: a contract change merged
since the release builds to new hashes, and the upload script refuses those until a new release
publishes them.

## What the upload script checks

Before any network call, [`scripts/upgrade-contract.mjs`](../scripts/upgrade-contract.mjs) refuses:

- uncommitted or untracked changes in the build inputs: `contracts/`, `Cargo.toml`, `Cargo.lock`,
  `rust-toolchain.toml`, `.cargo/`, `docker/wasm-build/` and `releases/`;
- a WASM whose sha256 is not the one `releases/hashes.json` publishes for that contract at `HEAD`.

The upgrade plan it writes for a live tribe records the source commit. `scripts/deploy-manager.mjs`
does not run these checks yet.

## Verify a release

Members checking an upgrade proposal and auditors checking a frozen tag run the same command. It needs
git, Node 24 and Docker, and no keys:

```bash
git clone https://github.com/BuilderOSS/builder-stellar.git
cd builder-stellar
node scripts/verify-wasm.mjs <tag>
```

It rebuilds the tag with the toolchain the tag pins, prints each contract's published and rebuilt
hash, and exits with status 0 only when every contract matches. A proposal's `to_hash` should appear
in that table.

To check files you already have, such as a workflow artifact or code fetched from the network, put
them in one folder as `<crate>.wasm` and pass `--wasm-dir`:

```bash
mkdir -p fetched
stellar contract fetch --wasm-hash <to_hash> --network testnet --out-file fetched/token.wasm
node scripts/verify-wasm.mjs <tag> --wasm-dir fetched
```

A file from the release workflow can also be checked against its attestation:

```bash
gh attestation verify token.wasm --repo BuilderOSS/builder-stellar
```

## The deployed code (release 0.5.0)

The contracts tribes.build and dev.tribes.build run were built before this pin, natively on macOS on
Apple silicon with rustc 1.95.0 and stellar-cli 28.0.0; their metadata records both. They reproduce on
that platform. With this checkout:

```bash
pnpm contracts:build
cargo test -p dao-e2e release_0_5_0 -- --include-ignored
```

`release_build_matches_production_and_dev` compares all eight builds with the deployed hashes.
`releases/hashes.json` publishes the canonical container build of the same source, which no network
runs yet. The next contract release is the first to deploy container-built code.

## Verification record

| Date | Machine | Check | Result |
| --- | --- | --- | --- |
| 25 November 2026 | macOS 26 on Apple silicon, Docker 28.1.1 (`linux/amd64` under emulation) | Container build of the same contracts twice, from `8cf1ac5` and from `f3adbc0` | Identical, all eight contracts |
| 25 November 2026 | same | Fresh clone, local tag on `bea1fbe`, build image removed, `node scripts/verify-wasm.mjs <tag>` | All eight match `releases/hashes.json`, in 2 min 55 s |
| 25 November 2026 | same | Native build, `release_0_5_0 --include-ignored` | All eight match the deployed hashes |

Not yet done: a rebuild on a second machine. The release workflow's native job on GitHub's runner is
the second environment; record its result here when the first tag runs it.

## Change the toolchain

Change these together, in one pull request, and publish a release with new hashes:

1. `channel` in `rust-toolchain.toml`.
2. The `FROM` line in `docker/wasm-build/Dockerfile`: the tag and its index digest, from
   `docker buildx imagetools inspect rust:<version>-slim-trixie`.
3. For a new Stellar CLI, the archive URL and sha256 in the Dockerfile and in `ci.yml`. GitHub lists
   each release archive's sha256 in the release's assets.

`node --test scripts/wasm-build.test.mjs` checks that the files agree. Dependabot does not update the
build image, because its Rust version must move with `rust-toolchain.toml`.
