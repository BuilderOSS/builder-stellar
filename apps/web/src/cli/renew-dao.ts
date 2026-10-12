/**
 * RPC-only DAO renewal sweep (docs/STORAGE_DIET.md § 7): the Renewal tab's
 * logic on the command line, from network settings, a token address and a signer.
 *
 *   node scripts/renew-dao.mjs --token C… [--network testnet] [--days 90] [--source <identity>] [--dry-run]
 *
 * --network reads deploys/builder-<network>-manager.json for the Manager, RPC and passphrase
 * (--artifact overrides the path). --source is a `stellar keys` identity; it signs and pays.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Account, Keypair } from '@stellar/stellar-sdk';
import { Api, Server } from '@stellar/stellar-sdk/rpc';

import {
  buildDaoInventory,
  CLASS_LABELS,
  estimateDate,
  extendToLedgers,
  extendTransaction,
  planBatches,
  restoreTransaction,
  rpcLedgerRead,
  summarizeInventory
} from '../lib/chain-reads/renewal';

const FALLBACK_MAX_ENTRY_TTL = 3_110_400;

function flag(name: string, fallback?: string) {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

async function main() {
  const root = resolve(process.cwd(), '../..');
  const network = flag('network', 'testnet')!;
  const artifactPath = flag('artifact', resolve(root, `deploys/builder-${network}-manager.json`))!;
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    manager: string;
    config: { rpcUrl: string; networkPassphrase: string };
  };
  const token = flag('token');
  if (!token) throw new Error('Pass --token <DAO token contract>.');
  const days = Number(flag('days', '90'));
  const dryRun = process.argv.includes('--dry-run');
  const server = new Server(artifact.config.rpcUrl, { allowHttp: artifact.config.rpcUrl.startsWith('http://') });

  const inventory = await buildDaoInventory(rpcLedgerRead(server), {
    manager: flag('manager', artifact.manager)!,
    token,
    nowSeconds: Math.floor(Date.now() / 1000)
  });
  console.info(`DAO ${token} at ledger ${inventory.latestLedger}`);
  for (const summary of summarizeInventory(inventory)) {
    const first =
      summary.earliestLiveUntil === null
        ? 'archived'
        : estimateDate(summary.earliestLiveUntil, inventory.latestLedger, Date.now()).toISOString();
    console.info(
      `  ${CLASS_LABELS[summary.cls].padEnd(16)} ${String(summary.keys).padStart(4)} keys ${String(summary.bytes).padStart(7)} bytes  first expiry ${first}${summary.missing ? `  (${summary.missing} archived)` : ''}`
    );
  }

  const source = flag('source', process.env.DEPLOY_IDENTITY || `${network}-admin`)!;
  const secret = execFileSync('stellar', ['keys', 'show', source], { encoding: 'utf8' }).trim();
  const keypair = Keypair.fromSecret(secret);
  const loaded = await server.getAccount(keypair.publicKey());
  const account = new Account(keypair.publicKey(), loaded.sequenceNumber());
  const extendTo = extendToLedgers(days, FALLBACK_MAX_ENTRY_TTL);
  const unsigned = [
    ...(inventory.missing.length
      ? [
          restoreTransaction(
            account,
            inventory.missing.map((k) => k.key),
            artifact.config.networkPassphrase
          )
        ]
      : []),
    ...planBatches(inventory.present).map((batch) =>
      extendTransaction(
        account,
        batch.map((k) => k.key),
        extendTo,
        artifact.config.networkPassphrase
      )
    )
  ];
  const prepared = [];
  for (const tx of unsigned) prepared.push(await server.prepareTransaction(tx));
  const fee = prepared.reduce((sum, tx) => sum + BigInt(tx.fee), 0n);
  console.info(
    `${prepared.length} transaction(s) to renew ${inventory.present.length} keys for ${days} days: about ${Number(fee) / 1e7} XLM, paid by ${keypair.publicKey()}`
  );
  if (dryRun) return;

  for (const [index, tx] of prepared.entries()) {
    tx.sign(keypair);
    const sent = await server.sendTransaction(tx);
    if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER')
      throw new Error(`Transaction ${index + 1} was not accepted (${sent.status}).`);
    for (;;) {
      const result = await server.getTransaction(sent.hash);
      if (result.status === Api.GetTransactionStatus.SUCCESS) break;
      if (result.status === Api.GetTransactionStatus.FAILED) throw new Error(`Transaction ${sent.hash} failed.`);
      await new Promise((r) => setTimeout(r, 2_000));
    }
    console.info(`  ${index + 1}/${prepared.length} confirmed: ${sent.hash}`);
  }
  console.info('Renewed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
