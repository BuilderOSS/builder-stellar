/**
 * RPC-only DAO renewal sweep (docs/STORAGE_DIET.md § 7): the Renewal tab's
 * logic on the command line, from network settings, a token address and a signer.
 *
 *   node scripts/renew-dao.mjs --token C… [--network testnet] [--days 180] [--source <identity>] [--dao <dao artifact>] [--asset C…]... [--dry-run]
 *
 * --network reads deploys/builder-<network>-manager.json for the Manager, RPC and passphrase
 * (--artifact overrides the path). --source is a `stellar keys` identity; it signs and pays.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Account, Keypair, type Transaction } from '@stellar/stellar-sdk';
import { Api, Server } from '@stellar/stellar-sdk/rpc';

import {
  buildDaoInventory,
  CLASS_LABELS,
  estimateDate,
  extendToLedgers,
  prepareExtendBatches,
  prepareRestoredExtend,
  readArchivalSettings,
  rentRate,
  restoredExtendEstimate,
  restoredExtendLimit,
  restoreTransaction,
  rpcLedgerRead,
  rpcModuleRenewal,
  sorobanWriteBytes,
  summarizeInventory
} from '../lib/chain-reads/renewal';

const xlm = (stroops: bigint) => `${Number(stroops) / 1e7} XLM`;

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

  // --dao <deploys/...-dao-N.json> supplies the module addresses so an evicted DAO can be restored;
  // --asset <C...> (repeatable) adds asset contracts whose DAO balances to renew.
  const daoArtifact = flag('dao');
  const modules = daoArtifact
    ? Object.values(
        (JSON.parse(readFileSync(daoArtifact, 'utf8')) as { addresses?: Record<string, string> }).addresses ?? {}
      )
    : [];
  const assets = process.argv.flatMap((a, i, all) => (a === '--asset' && all[i + 1] ? [all[i + 1]!] : []));
  const inventory = await buildDaoInventory(rpcLedgerRead(server), {
    manager: flag('manager', artifact.manager)!,
    token,
    nowSeconds: Math.floor(Date.now() / 1000),
    modules,
    assets,
    renewalKeys: rpcModuleRenewal(server, artifact.config.networkPassphrase)
  });
  if (inventory.bootstrap)
    console.info(
      `The DAO's contract instances are archived; restoring ${inventory.missing.length} of them first. Run again afterwards to renew the rest.`
    );
  console.info(`DAO ${token} at ledger ${inventory.latestLedger}`);
  for (const address of inventory.uncovered)
    console.warn(`  Module ${address} lists no renewal keys: only its instance is renewed.`);
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
  const passphrase = artifact.config.networkPassphrase;
  const { maxEntryTtl, minPersistentTtl } = await readArchivalSettings(server);
  const extendTo = extendToLedgers(days, maxEntryTtl);
  const missing = inventory.missing.map((k) => k.key);

  // 1. Restore archived keys. 2. Extend present ones. 3. Extend what the restore brought back:
  // restored entries return with the network's minimum TTL, and they cannot be simulated until the
  // restore lands, so step 3 is estimated now and prepared once the steps before it confirm (§ 7).
  const restore = missing.length
    ? await server.prepareTransaction(restoreTransaction(account, missing, passphrase))
    : null;
  const extensions = await prepareExtendBatches({
    rpc: server,
    account,
    keys: inventory.present,
    extendTo,
    days,
    passphrase
  });
  const extendFee = extensions.reduce((sum, { tx }) => sum + BigInt(tx.fee), 0n);
  const restoredEstimate = restore
    ? restoredExtendEstimate({
        bytes: sorobanWriteBytes(restore),
        minPersistentTtl,
        extendTo,
        restoreFee: BigInt(restore.fee),
        rate: rentRate(inventory, extendTo, extendFee)
      })
    : 0n;
  const prepared = [...(restore ? [restore] : []), ...extensions.map(({ tx }) => tx)];
  const fee = prepared.reduce((sum, tx) => sum + BigInt(tx.fee), 0n) + restoredEstimate;
  if (restore) console.info(`  Restore archived items: ${missing.length} keys, ${xlm(BigInt(restore.fee))}`);
  if (extensions.length)
    console.info(
      `  Extend: ${inventory.present.length} keys in ${extensions.length} transaction(s), ${xlm(extendFee)}`
    );
  if (restoredEstimate > 0n)
    console.info(
      `  Extend restored items: ${missing.length} keys, about ${xlm(restoredEstimate)} (estimated; prepared after the restore, stops above ${xlm(restoredExtendLimit(restoredEstimate))})`
    );
  console.info(
    `Renew ${inventory.present.length + missing.length} keys for ${days} days: about ${xlm(fee)}, paid by ${keypair.publicKey()}`
  );
  if (dryRun) return;

  let sent = 0;
  const submit = async (tx: Transaction) => {
    tx.sign(keypair);
    const result = await server.sendTransaction(tx);
    if (result.status === 'ERROR' || result.status === 'TRY_AGAIN_LATER')
      throw new Error(`Transaction ${sent + 1} was not accepted (${result.status}).`);
    for (;;) {
      const status = await server.getTransaction(result.hash);
      if (status.status === Api.GetTransactionStatus.SUCCESS) break;
      if (status.status === Api.GetTransactionStatus.FAILED) throw new Error(`Transaction ${result.hash} failed.`);
      await new Promise((r) => setTimeout(r, 2_000));
    }
    sent += 1;
    console.info(`  ${sent} confirmed: ${result.hash}`);
  };
  for (const tx of prepared) await submit(tx);

  if (restoredEstimate > 0n) {
    const restored = await prepareRestoredExtend({
      rpc: server,
      source: keypair.publicKey(),
      restored: missing,
      extendTo,
      days,
      estimatedFee: restoredEstimate,
      passphrase
    });
    console.info(`  Extend restored items: ${xlm(restored.fee)}`);
    for (const tx of restored.transactions) await submit(tx);
  }
  console.info(`Renewed in ${sent} transaction(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
