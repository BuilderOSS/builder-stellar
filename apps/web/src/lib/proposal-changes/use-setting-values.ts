'use client';

import { useMemo } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import { useGovernorSettings } from '@/lib/admin-queries';
import { paymentAssetCode } from '@/lib/assets-config';
import { useAuctionStatus } from '@/lib/auction-status';
import { useDaoMarketplace } from '@/lib/marketplace/hooks';
import { useMembershipState } from '@/lib/membership-state';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import type { SettingValues } from './catalog';

/**
 * The tribe's live settings, from the same reads its Manage pages use, so the composer can show
 * "Now: 3 days" beside a setting and start the form from it.
 */
export function useSettingValues(): { values: SettingValues; loading: boolean } {
  const { daoId, daoConfig: config } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const governor = useGovernorSettings(config, address || config.launchAdmin, true);
  const auction = useAuctionStatus(daoId, config);
  const membership = useMembershipState(config, address);
  const market = useDaoMarketplace(daoId, 'kind=pool&status=open', Boolean(config.marketplaceContractId));

  const values = useMemo<SettingValues>(
    () => ({
      governor: governor.data,
      auction: auction.data
        ? { ...auction.data, assetCode: paymentAssetCode(config.name, auction.data.config.payment_token) }
        : undefined,
      membership: membership.data,
      marketplace: config.marketplaceContractId ? market.data?.config : undefined
    }),
    [governor.data, auction.data, membership.data, market.data, config.name, config.marketplaceContractId]
  );
  return { values, loading: governor.isLoading || auction.isLoading || membership.isLoading };
}
