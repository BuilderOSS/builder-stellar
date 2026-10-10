import { Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

/** Signatures change envelope XDR, not the exact transaction body/hash. */
export function matchesSep10Transaction(challengeXdr: string, signedXdr: string, passphrase: string): boolean {
  try {
    const challenge = TransactionBuilder.fromXDR(challengeXdr, passphrase);
    const signed = TransactionBuilder.fromXDR(signedXdr, passphrase);
    return (
      challenge instanceof Transaction &&
      signed instanceof Transaction &&
      Buffer.from(challenge.hash()).equals(Buffer.from(signed.hash()))
    );
  } catch {
    return false;
  }
}
