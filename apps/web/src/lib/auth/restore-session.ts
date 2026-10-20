import type { AuthSessionResponse } from './types';

/** An unavailable wallet probe is not proof that the server session ended. */
export function restoredSessionAddress(session: AuthSessionResponse | undefined, wallet: string | null | undefined) {
  if (!session) return undefined;
  if (!session.authenticated || !session.address || wallet === null) return null;
  if (wallet && wallet !== session.address) return null;
  return session.address;
}
