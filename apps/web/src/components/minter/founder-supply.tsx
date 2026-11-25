'use client';

import type { Route } from 'next';

import { ButtonLink, Callout, Text } from '@/components/ui';
import { founderSupplyText } from '@/lib/minter/display';
import { useOpenClaimLists } from '@/lib/minter/hooks';

/**
 * Founder supply where the app shows supply (the claims page, Manage → Membership): tokens left on
 * the free claim lists opened in Setup, which `total_supply` does not count until they are claimed.
 * Read from the index; nothing shows when there are none.
 */
export function FounderSupply({
  daoId,
  allowance,
  live,
  manageHref,
  showError = false
}: {
  daoId: string;
  /** The claims module's remaining mint allowance; null when it has none. */
  allowance: number | null;
  live: boolean;
  /** Where the lists are managed, when this is not that page. */
  manageHref?: Route;
  /** Say when the index can't be read (manage views); elsewhere nothing shows. */
  showError?: boolean;
}) {
  const open = useOpenClaimLists(daoId);
  if (open.error)
    return showError ? <Text size="sm">Founder supply could not be read from the index right now.</Text> : null;
  if (!open.data) return null;
  const text = founderSupplyText({
    unclaimed: open.data.setupUnclaimed,
    lists: open.data.setupLists,
    allowance,
    live
  });
  if (!text) return null;
  return (
    <Callout variant="info" title={text.title} description={text.description}>
      {manageHref ? (
        <div>
          <ButtonLink href={manageHref} variant="secondary" size="sm">
            See the claim lists
          </ButtonLink>
        </div>
      ) : null}
    </Callout>
  );
}
