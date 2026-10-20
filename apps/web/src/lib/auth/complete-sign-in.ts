import type { KeyedMutator } from 'swr';

import type { AuthSessionResponse } from './types';

/** Seed the verified session before local auth; a failed background read must not fail sign-in. */
export async function completeSignIn(
  session: AuthSessionResponse,
  mutate: KeyedMutator<AuthSessionResponse>,
  onAuthenticated: () => void
) {
  await mutate(session, { revalidate: false });
  onAuthenticated();
  void mutate().catch(() => undefined);
}
