/**
 * Upload authorization store and utilities
 * Handles in-memory authorization tracking for upload permissions
 */

/**
 * In-memory authorization store for tracking upload permissions
 * TODO: Move to database for production
 */
const authorizationStore = new Map<string, { authorization: any; expiresAt: number }>();

/**
 * Store an authorization and clean up expired ones
 */
export function storeAuthorization(uploadId: string, authorization: any): void {
  // Clean up expired authorizations
  const now = Date.now();
  for (const [id, record] of authorizationStore.entries()) {
    if (record.expiresAt < now) {
      authorizationStore.delete(id);
    }
  }

  // Store new authorization
  authorizationStore.set(uploadId, {
    authorization,
    expiresAt: authorization.expiresAt.getTime()
  });
}

/**
 * Retrieve a stored authorization
 */
export function getAuthorization(uploadId: string): any | null {
  const record = authorizationStore.get(uploadId);
  if (!record) return null;

  // Check if expired
  if (record.expiresAt < Date.now()) {
    authorizationStore.delete(uploadId);
    return null;
  }

  return record.authorization;
}
