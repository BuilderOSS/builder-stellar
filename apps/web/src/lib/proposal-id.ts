import { Buffer } from 'buffer';

export function proposalIdFromBuffer(proposalId: Buffer | Uint8Array) {
  return Buffer.from(proposalId).toString('hex');
}

export function proposalIdToRouteId(proposalId: Buffer | Uint8Array) {
  return proposalIdFromBuffer(proposalId);
}

export function proposalIdToBuffer(proposalId: string) {
  const normalized = proposalId.startsWith('0x') ? proposalId.slice(2) : proposalId;
  const decoded =
    /^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0
      ? Buffer.from(normalized, 'hex')
      : Buffer.from(proposalId, 'base64');

  if (decoded.length === 32) {
    return decoded;
  }

  const decodedText = decoded.toString('utf8').trim();
  const decodedNormalized = decodedText.startsWith('0x') ? decodedText.slice(2) : decodedText;

  if (/^[0-9a-fA-F]+$/.test(decodedNormalized) && decodedNormalized.length % 2 === 0) {
    const twiceDecoded = Buffer.from(decodedNormalized, 'hex');
    if (twiceDecoded.length === 32) {
      return twiceDecoded;
    }

    return twiceDecoded;
  }

  return decoded;
}

/**
 * The id of the proposal a simulated `Governor.propose` would create. The bindings return a contract
 * failure as an `Err` holding the error's name, not bytes; that becomes an error carrying
 * "Error(Contract, #N)" so the usual messages apply ("This proposal already exists."), instead of a
 * Buffer TypeError (BUG-W02-6).
 */
export function simulatedProposalId(result: unknown, errors: Record<number, { message: string }>): string {
  if (result instanceof Uint8Array) return proposalIdToRouteId(result);
  const name = (result as { error?: { message?: unknown } } | null | undefined)?.error?.message;
  if (typeof name === 'string') {
    const code = Object.entries(errors).find(([, error]) => error.message === name)?.[0];
    throw new Error(code ? `Error(Contract, #${code}): ${name}` : name);
  }
  return '';
}
