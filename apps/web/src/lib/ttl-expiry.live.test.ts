/**
 * Read-only check of the TTLs of the testnet rehearsal DAO. It sends no transactions.
 *
 * Skipped unless TTL_LIVE_TEST=1, so CI never hits the network:
 *   TTL_LIVE_TEST=1 pnpm --dir apps/web exec vitest run src/lib/ttl-expiry.live.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Address } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { DAO_MODULES, readDaoTtlReport } from './ttl-expiry-rpc';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const DEPLOYS = fileURLToPath(new URL('../../../../deploys/', import.meta.url));

describe.skipIf(process.env.TTL_LIVE_TEST !== '1')('TTL live read (testnet rehearsal DAO, read-only)', () => {
  const dao = JSON.parse(readFileSync(`${DEPLOYS}builder-testnet-dao-0.json`, 'utf8')) as {
    addresses: Record<string, string>;
  };
  const manifest = JSON.parse(readFileSync(`${DEPLOYS}builder-testnet-manager.json`, 'utf8')) as {
    implementations: Record<string, string>;
  };

  it('reads the module code and artwork entries, and matches the deployed WASM hashes', async () => {
    const report = await readDaoTtlReport(RPC_URL, dao.addresses);

    console.info(
      JSON.stringify(
        {
          latestLedger: report.latestLedger,
          code: {
            status: report.code.assessment.status,
            remainingDays: report.code.assessment.remainingDays,
            liveUntilLedgerSeq: report.code.assessment.liveUntilLedgerSeq,
            limiting: report.code.assessment.limitingLabel,
            expiresAt: report.code.expiresAt,
            entries: report.code.entries,
            wasmHashes: report.code.wasmHashes
          },
          artwork: report.artwork && {
            status: report.artwork.assessment.status,
            remainingDays: report.artwork.assessment.remainingDays,
            liveUntilLedgerSeq: report.artwork.assessment.liveUntilLedgerSeq,
            limiting: report.artwork.assessment.limitingLabel,
            expiresAt: report.artwork.expiresAt,
            propertyCount: report.artwork.propertyCount,
            ipfsGroupCount: report.artwork.ipfsGroupCount,
            itemCounts: report.artwork.itemCounts,
            totalEntries: report.artwork.totalEntries,
            entryCount: report.artwork.entries.length,
            missing: report.artwork.assessment.missingLabels
          }
        },
        null,
        2
      )
    );

    // Hashes come from each module instance; they must be the hashes the manager deployed.
    for (const name of DAO_MODULES) {
      expect(report.code.wasmHashes[name], name).toBe(manifest.implementations[name]);
    }
    expect(report.code.unconfigured).toEqual([]);
    expect(report.code.assessment.missingLabels).toEqual([]);

    // Every artwork entry the contract should have is present, so the key encodings match.
    expect(report.artwork).not.toBeNull();
    const artwork = report.artwork!;
    expect(artwork.assessment.missingLabels).toEqual([]);
    expect(artwork.itemCounts.length).toBe(artwork.propertyCount);
    const itemTotal = artwork.itemCounts.reduce((sum, count) => sum + count, 0);
    expect(artwork.totalEntries).toBe(itemTotal + artwork.ipfsGroupCount);
    expect(artwork.entries.filter((entry) => entry.label.startsWith('Property(')).length).toBe(artwork.propertyCount);
    expect(artwork.entries.filter((entry) => entry.label.startsWith('Item(')).length).toBe(itemTotal);
    expect(artwork.entries.filter((entry) => entry.label.startsWith('IpfsGroup(')).length).toBe(artwork.ipfsGroupCount);
  }, 120_000);

  it('reports a missing metadata contract as expired, never healthy', async () => {
    // A contract address that was never deployed: its instance is absent, like an archived one.
    const absent = Address.contract(Buffer.alloc(32)).toString();
    const report = await readDaoTtlReport(RPC_URL, { ...dao.addresses, metadata: absent });

    expect(report.artwork?.assessment.status).toBe('expired');
    expect(report.artwork?.assessment.missingLabels).toEqual(['metadata instance']);
    expect(report.code.assessment.status).toBe('expired');
  }, 120_000);
});
