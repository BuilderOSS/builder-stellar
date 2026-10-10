import type { FeeBumpTransaction, Transaction } from '@stellar/stellar-sdk';

type Envelope = Transaction | FeeBumpTransaction;

export function assertMarketplaceWallet(
  address: string,
  networkPassphrase: string,
  expectedAddress: string,
  expectedPassphrase: string,
  networkLabel: string
) {
  if (address !== expectedAddress)
    throw new Error('The wallet account changed. Reconnect and authenticate before trading.');
  if (networkPassphrase !== expectedPassphrase)
    throw new Error(`Switch your wallet to ${networkLabel} before signing.`);
}

export function assertMarketplaceTransaction(
  transaction: Envelope,
  expectedAddress: string,
  now = Math.floor(Date.now() / 1000)
) {
  if (!('source' in transaction) || transaction.source !== expectedAddress)
    throw new Error('Unexpected transaction source.');
  if (Number(transaction.timeBounds?.maxTime ?? 0) <= now)
    throw new Error('The prepared transaction expired. Simulate again before signing.');
}

function hashHex(transaction: Envelope) {
  return Array.from(transaction.hash(), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function assertUnchangedMarketplaceEnvelope(unsigned: Envelope, signed: Envelope) {
  if (hashHex(unsigned) !== hashHex(signed))
    throw new Error('The wallet changed the transaction. Nothing was submitted.');
  return hashHex(signed);
}

export async function confirmMarketplaceTransaction<T extends { status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND' }>(
  server: { getTransaction: (hash: string) => Promise<T> },
  hash: string,
  options: { timeout?: number; interval?: number } = {}
) {
  const start = Date.now();
  while (Date.now() - start < (options.timeout ?? 90_000)) {
    const status = await server.getTransaction(hash);
    if (status.status === 'FAILED')
      throw new Error('The transaction failed on-chain. No marketplace purchase or transfer was applied.');
    if (status.status === 'SUCCESS') return status;
    await new Promise((resolve) => setTimeout(resolve, options.interval ?? 2000));
  }
  throw new Error(
    'Confirmation is still pending. Check this transaction hash before retrying; do not submit a duplicate.'
  );
}
