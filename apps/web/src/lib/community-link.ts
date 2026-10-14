import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { isValidSlug } from '@/lib/create-dao-schema';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { restoreArchivedState } from '@/lib/restore-archived-client';

/** `change_slug` (a launched community's link, by vote) arrived in Manager 0.2.0. */
export function managerClient(
  config: DaoNetworkConfig,
  publicKey?: string,
  signTransaction?: ConstructorParameters<typeof ManagerClient>[0]['signTransaction']
) {
  return new ManagerClient({
    contractId: getDeploymentConfig().managerAddress,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey,
    allowHttp: config.rpcUrl.startsWith('http://'),
    ...restoreArchivedState,
    signTransaction
  });
}

/** The link as the Manager has it: claimed once launched, else the pending request. */
export function useManagerLink(config: DaoNetworkConfig, daoId: string, readSource?: string) {
  return useSWR(['community-link', daoId, config.rpcUrl], async () => {
    const manager = managerClient(config, readSource);
    const [claimed, pending] = await Promise.all([
      manager.get_slug({ token_address: daoId }),
      manager.get_pending_dao({ token_address: daoId })
    ]);
    return {
      slug: claimed.result ?? pending.result?.slug ?? null,
      claimed: Boolean(claimed.result)
    };
  });
}

export type LinkAvailability = { valid: boolean; claimedBy?: string | null; message?: string };

/** Debounced `/api/slugs` lookup; undefined while the typed value hasn't settled. */
export function useLinkAvailability(link: string) {
  const [debounced, setDebounced] = useState(link);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(link), 350);
    return () => clearTimeout(timer);
  }, [link]);
  const { data } = useSWR<LinkAvailability>(isValidSlug(debounced) ? `/api/slugs/${debounced}` : null, (url: string) =>
    fetch(url, { cache: 'no-store' }).then((response) => response.json())
  );
  return debounced === link ? data : undefined;
}

export type LinkCheck = { state: 'idle' | 'checking' | 'ok' | 'bad'; text: string };

export const LINK_FORMAT = 'Use 4-63 lowercase letters, numbers or single hyphens.';

/** Whether a new link can be used: format, sameness, then the availability lookup. */
export function checkNewLink(
  value: string,
  current: string | null,
  daoId: string,
  availability: LinkAvailability | undefined
): LinkCheck {
  if (!value) return { state: 'idle', text: LINK_FORMAT };
  if (!isValidSlug(value)) return { state: 'bad', text: LINK_FORMAT };
  if (value === current) return { state: 'idle', text: 'This is your link now.' };
  if (!availability) return { state: 'checking', text: 'Checking…' };
  if (availability.message) return { state: 'bad', text: "Couldn't check this link. Try again in a moment." };
  if (availability.claimedBy && availability.claimedBy !== daoId)
    return { state: 'bad', text: 'Another tribe has this link.' };
  return { state: 'ok', text: `/dao/${value} is available.` };
}
