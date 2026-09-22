# End-to-End Contract Tests

Cross-contract integration tests for token, governor, treasury, auction, and SAC flows. These tests use Soroban's in-memory test environment and do not require Docker or a deployed network.

Run them from the repository root:

```bash
pnpm dao:test:e2e
```

For unit tests of individual contracts, use `pnpm dao:test:unit`. To run both suites, use `pnpm dao:test:all`.
