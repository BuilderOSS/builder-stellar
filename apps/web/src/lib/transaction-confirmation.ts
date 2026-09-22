import { Server } from '@stellar/stellar-sdk/rpc';

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
 * Wait for a transaction to be confirmed on the Stellar network
 *
 * @param hash - Transaction hash to wait for
 * @param rpcUrl - Stellar RPC server URL
 * @param options - Configuration options
 * @throws Error if transaction fails or times out
 */
export async function waitForConfirmation(
  hash: string,
  rpcUrl: string,
  options: TransactionConfirmationOptions = {}
): Promise<void> {
  const { timeout = 60000, pollInterval = 2000 } = options;

  if (!hash) {
    throw new Error('Transaction hash is required');
  }

  const server = new Server(rpcUrl);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await server.getTransaction(hash);

      // Check transaction status
      if (response.status === 'SUCCESS') {
        return;
      }

      if (response.status === 'FAILED') {
        throw new Error('Transaction failed on-chain');
      }

      // Status is NOT_FOUND - transaction is still pending
      // Continue polling
    } catch (error) {
      // If error is NOT_FOUND, continue polling
      // Otherwise, it might be a network error - still continue for now
      if (error instanceof Error && !error.message.includes('404')) {
        console.warn('Error checking transaction status:', error);
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
}
