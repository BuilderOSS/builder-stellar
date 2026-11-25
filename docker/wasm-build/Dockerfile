# The reproducible contract build (docs/REPRODUCIBLE_BUILDS.md).
#
# Every input is pinned: the Rust image by digest (the same compiler, rustc 1.95.0, as
# rust-toolchain.toml), the Stellar CLI by version and sha256, and the platform. `scripts/build-wasm.mjs`
# streams a `git archive` of one commit in on stdin and reads a tar of the built WASM back on stdout, so
# nothing from the host's working tree, target directory or Cargo home reaches the build.
#
# The platform is fixed because Cargo mixes the compiler's host triple (`rustc -vV`) into every crate's
# metadata hash, which orders the functions in the WASM: the same source and compiler give different
# bytes on linux/amd64, linux/arm64 and macOS. linux/amd64 matches the CI runners; Docker on Apple
# silicon runs it under emulation. Source paths and the Cargo home do not change the bytes.

# Stellar CLI 28.0.0 for x86_64 Linux, checked against the sha256 GitHub publishes for the archive.
FROM scratch AS stellar-cli
ADD --checksum=sha256:207544486734fccb4df1afc4a7745478f9f1e21688b2f9506f0ef36f60ce3fdc \
    https://github.com/stellar/stellar-cli/releases/download/v28.0.0/stellar-cli-28.0.0-x86_64-unknown-linux-gnu.tar.gz \
    /stellar-cli.tar.gz

# rust:1.95.0-slim-trixie (multi-platform index digest; the linux/amd64 image is selected).
FROM --platform=linux/amd64 rust:1.95.0-slim-trixie@sha256:e14e87345b4d5964ddcc3491d27ee046a0f23820f340c3c1e24da6880141f7c0

COPY --from=stellar-cli /stellar-cli.tar.gz /tmp/stellar-cli.tar.gz
# libdbus and libudev are shared libraries the CLI binary loads at start (for the OS keyring and
# hardware wallets). They are not compiler inputs, so they do not affect the WASM bytes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libdbus-1-3 libudev1 \
    && rm -rf /var/lib/apt/lists/*
RUN tar -xzf /tmp/stellar-cli.tar.gz -C /usr/local/bin stellar \
    && rm /tmp/stellar-cli.tar.gz \
    && rustup target add wasm32v1-none \
    && rustup component add rustfmt clippy \
    && rustc -vV \
    && stellar --version

COPY build.sh /usr/local/bin/build-wasm
RUN chmod 0755 /usr/local/bin/build-wasm

WORKDIR /build
ENTRYPOINT ["/usr/local/bin/build-wasm"]
