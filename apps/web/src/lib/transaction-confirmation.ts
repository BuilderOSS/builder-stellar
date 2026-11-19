import { type Api, Server } from '@stellar/stellar-sdk/rpc';

export type TransactionConfirmationOptions = {
  /**
   * Maximum time to wait for confirmation in milliseconds
   * @default 60000 (60 seconds)
   */
  timeout?: number;

  /**
   * Polling interval in milliseconds
   * @default 2000 (2 seconds)
   */
  pollInterval?: number;
};

/**
 * The wait ran out before the network reported an outcome. The transaction may still confirm, so
 * this is a recovery state, not a failure: show the hash, let the person check again, and never
 * sign the same action a second time without checking.
 */
export class ConfirmationUnknownError extends Error {
  readonly hash: string;

  constructor(hash: string, timeout: number) {
    super(`Transaction ${hash} is not confirmed yet (confirmation timeout after ${timeout}ms).`);
    this.name = 'ConfirmationUnknownError';
    this.hash = hash;
  }
}

export function isConfirmationUnknown(error: unknown): error is ConfirmationUnknownError {
  return error instanceof ConfirmationUnknownError;
}

/**
 * Wait for a transaction to be confirmed on the Stellar network
 *
 * @param hash - Transaction hash to wait for
 * @param rpcUrl - Stellar RPC server URL
 * @param options - Configuration options
 * @throws Error if the transaction fails, ConfirmationUnknownError if it is still unconfirmed at the timeout
 */
export async function waitForConfirmation(
  hash: string,
  rpcUrl: string,
  options: TransactionConfirmationOptions = {}
): Promise<Api.GetSuccessfulTransactionResponse> {
  const { timeout = 60000, pollInterval = 2000 } = options;

  if (!hash) {
    throw new Error('Transaction hash is required');
  }

  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    let response;
    try {
      response = await server.getTransaction(hash);
    } catch (error) {
      // If error is NOT_FOUND, continue polling
      // Otherwise, it might be a network error - still continue for now
      if (error instanceof Error && !error.message.includes('404')) {
        console.warn('Error checking transaction status:', error);
      }
    }

    // Terminal results must not be swallowed by the transport retry handler.
    if (response?.status === 'SUCCESS') return response;
    if (response?.status === 'FAILED') throw new Error(`Transaction ${hash} failed on-chain`);

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached: the outcome is unknown, not failed.
  throw new ConfirmationUnknownError(hash, timeout);
}
