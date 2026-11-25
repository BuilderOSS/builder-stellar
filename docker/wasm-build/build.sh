#!/bin/sh
# Runs inside the wasm-build image. stdin: a tar of the source tree (`git archive <commit>`).
# stdout: a tar holding wasm/*.wasm and SHA256SUMS. Everything else is logged to stderr, so stdout
# carries only the archive.
set -eu

tar -x -C /build
cd /build

# --locked: refuse to build if Cargo.lock would change, so the build uses exactly the committed
# dependency versions. The CLI sets the spec-shaking flag itself.
env -u SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2 \
  stellar contract build --locked --out-dir /out/wasm 1>&2

cd /out
sha256sum wasm/*.wasm > SHA256SUMS
cat SHA256SUMS 1>&2
tar -c -f - wasm SHA256SUMS
