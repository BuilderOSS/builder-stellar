# Contract test coverage

Line, region and function coverage of the contract crates, measured with
[`cargo llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov) over the whole Cargo test suite. The
output is meant for the audit package.

## Run it

```bash
cargo install cargo-llvm-cov --locked   # once
pnpm contracts:coverage                 # or: bash scripts/coverage.sh [output-dir]
```

[`scripts/coverage.sh`](../scripts/coverage.sh) builds the WASM first (the e2e tests load it), runs
every test with instrumentation, and writes to `coverage/contracts/` (ignored by git):

| File | Contents |
| --- | --- |
| `summary.txt`, `summary.json` | Per file and in total |
| `lcov.info` | For coverage tools and editors |
| `html/index.html` | Browsable report, line by line |
| `README.txt` | The commit, the toolchain, and what the report leaves out |

The report covers contract source only. It leaves out the e2e harness, the test-only vote adapter
mock, each crate's test modules (`src/test.rs`) and `common/src/testutils.rs`. Dependencies,
OpenZeppelin's crates included, are outside the workspace and never counted.

Code that runs inside the Soroban VM is not instrumented: the e2e tests that drive the built WASM add
assurance that these numbers do not show. The figures count each crate's native test runs.

## Latest run

25 November 2026, contract source as of `8cf1ac5` (the release 0.5.0 source), rustc 1.95.0,
cargo-llvm-cov 0.9.2, on macOS on Apple silicon.

| Crate | Lines | Regions | Functions |
| --- | ---: | ---: | ---: |
| auction | 97.9% (644 of 658) | 95.6% | 85.5% |
| common | 92.8% (233 of 251) | 92.1% | 70.2% |
| governor | 91.9% (711 of 774) | 89.6% | 84.5% |
| manager | 97.3% (1,530 of 1,573) | 95.9% | 85.0% |
| marketplace | 96.5% (806 of 835) | 95.6% | 82.1% |
| metadata | 96.7% (920 of 951) | 96.0% | 88.6% |
| minter | 98.2% (445 of 453) | 97.5% | 87.5% |
| token | 99.2% (760 of 766) | 99.1% | 98.9% |
| treasury | 98.0% (251 of 256) | 97.4% | 90.6% |
| **Total** | **96.7% (6,300 of 6,517)** | **95.6%** | **86.5%** |

Rerun the script for the commit you send to auditors; these figures change with every contract change.
