'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';

type ModuleView = {
  kind: string;
  /** The index lists it as this DAO's module of its kind: the Manager deployed it. */
  vouched: boolean;
  address: string;
  nonVoting: boolean;
  allowance: number;
  agent: boolean;
  /** Votes the module holds, its own and delegated to it (review 2 C3: modules can be delegates). */
  votes: bigint;
};
export type MembershipState = {
  admin: string;
  live: boolean;
  settings: { transfersLocked: boolean; membersOnlyDelegation: boolean; daoRecovery: boolean };
  modules: ModuleView[];
};

/** Live reads: the switches, every registered module with its allowance, and the transfer agents. */
export function useMembershipState(config: DaoNetworkConfig, address?: string | null) {
  return useSWR(
    config.tokenContractId ? ['membership-state', config.tokenContractId, config.rpcUrl, address || ''] : null,
    async (): Promise<MembershipState> => {
      const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
      const [admin, live, settings, modules, agents] = await Promise.all([
        token.admin(),
        token.is_live(),
        token.settings(),
        token.modules(),
        token.transfer_agents()
      ]);
      const [allowances, votes] = await Promise.all([
        Promise.all(
          modules.result.map((entry) => token.mint_allowance({ module: entry.address }).then((tx) => tx.result))
        ),
        Promise.all(modules.result.map((entry) => token.get_votes({ account: entry.address }).then((tx) => tx.result)))
      ]);
      return {
        admin: admin.result,
        live: live.result,
        settings: {
          transfersLocked: settings.result.transfers_locked,
          membersOnlyDelegation: settings.result.members_only_delegation,
          daoRecovery: settings.result.dao_recovery
        },
        modules: modules.result.map((entry, index) => ({
          kind: entry.kind,
          vouched: [config.auctionContractId, config.marketplaceContractId, config.claimsContractId].includes(
            entry.address
          ),
          address: entry.address,
          nonVoting: entry.non_voting,
          allowance: allowances[index] ?? 0,
          agent: agents.result.includes(entry.address),
          votes: votes[index] ?? 0n
        }))
      };
    }
  );
}
