'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as ClaimMinterClient } from '@builder-stellar/claim-minter-bindings';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { rpc } from '@stellar/stellar-sdk';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import { describeContractError } from '@/lib/contract-errors';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { marketplaceFetchKey, marketplaceKey } from '@/lib/marketplace/hooks';
import type { DaoMarketplace } from '@/lib/marketplace/types';

import { MAX_MODULES, type ModuleConfigs, type ModuleKind, specValue } from './kinds';
import type { PoolState } from './plans';
import type { ModuleFacts } from './readiness';

export type CheckResult = { state: 'ok' } | { state: 'fail'; message: string };

/** What a simulated call says went wrong, in words; null when it simulated fine. */
async function simulatedProblem(
  run: () => Promise<{ simulation?: unknown }>,
  contract: Parameters<typeof describeContractError>[1]
): Promise<string | null> {
  try {
    const tx = await run();
    const sim = tx.simulation as rpc.Api.SimulateTransactionResponse | undefined;
    if (sim && rpc.Api.isSimulationError(sim))
      return describeContractError(new Error(sim.error), contract) ?? 'The chain refused it when checked.';
    return null;
  } catch (error) {
    return describeContractError(error, contract) ?? (error instanceof Error ? error.message : 'Could not be checked.');
  }
}

/** The number and address the Manager gives the next module of a kind, and what the Token holds now. */
export type AttachReads = {
  /** How many modules of this kind the Manager has deployed so far: the number the next one gets. */
  moduleNumber: number;
  /** `predict_module_address` for that number. Never computed locally. */
  predicted: string;
  /** Modules registered with the Token now, of any kind. */
  registered: number;
  /** The tribe's current module of this kind, if any. */
  present: string | null;
};

export async function readAttach(
  config: DaoNetworkConfig,
  kind: ModuleKind,
  address?: string | null
): Promise<AttachReads> {
  const manager = new ManagerClient(adminReadOptions(config, getDeploymentConfig().managerAddress, address));
  const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
  const [count, modules, present] = await Promise.all([
    manager.module_count({ token: config.tokenContractId, kind }),
    token.modules(),
    token.module({ kind })
  ]);
  const moduleNumber = count.result;
  const predicted = (await manager.predict_module_address({ token: config.tokenContractId, kind, n: moduleNumber }))
    .result;
  return { moduleNumber, predicted, registered: modules.result.length, present: present.result ?? null };
}

export function useAttachReads(config: DaoNetworkConfig, kind: ModuleKind | null, address?: string | null) {
  return useSWR(
    kind && config.tokenContractId ? ['module-attach', config.tokenContractId, config.rpcUrl, kind] : null,
    () => readAttach(config, kind!, address),
    { revalidateOnFocus: false, refreshInterval: 0 }
  );
}

/**
 * The check behind the Add sheet. It runs the one step that touches the chain on its own (the
 * Manager's `create_module`) and checks the rest against what the chain says now: later steps depend
 * on earlier ones inside the same execution, so they cannot be simulated alone.
 */
export async function checkAttach<K extends ModuleKind>({
  config,
  address,
  kind,
  moduleConfig,
  reads
}: {
  config: DaoNetworkConfig;
  address?: string | null;
  kind: K;
  moduleConfig: ModuleConfigs[K];
  reads: AttachReads;
}): Promise<CheckResult> {
  const now = await readAttach(config, kind, address);
  if (now.present)
    return { state: 'fail', message: 'This tribe already has one of these. Remove it first to replace it.' };
  if (now.registered >= MAX_MODULES)
    return { state: 'fail', message: 'This tribe already has the most modules it can hold.' };
  if (now.moduleNumber !== reads.moduleNumber || now.predicted !== reads.predicted)
    return {
      state: 'fail',
      message: 'Another module was added while you were drafting. Reload this list, then add it again.'
    };
  const manager = new ManagerClient(adminReadOptions(config, getDeploymentConfig().managerAddress, address));
  const problem = await simulatedProblem(
    () =>
      manager.create_module({
        token: config.tokenContractId,
        spec: specValue(kind, moduleConfig) as never,
        expected_n: reads.moduleNumber
      }),
    'manager'
  );
  return problem ? { state: 'fail', message: problem } : { state: 'ok' };
}

/** The check behind the Remove sheet: the removal itself is the one call that can be run alone. */
export async function checkDetach({
  config,
  address,
  module
}: {
  config: DaoNetworkConfig;
  address?: string | null;
  module: string;
}): Promise<CheckResult> {
  const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
  const registered = (await token.modules()).result.some((entry) => entry.address === module);
  if (!registered) return { state: 'fail', message: 'This module has already been removed. Reload this list.' };
  const problem = await simulatedProblem(() => token.unregister_module({ address: module }), 'token');
  return problem ? { state: 'fail', message: problem } : { state: 'ok' };
}

const num = (value: bigint | number) => Number(value);

/** What the Remove sheet reads about one module: its holdings, pools, auction, lists and listings. */
export async function readModuleFacts(
  config: DaoNetworkConfig,
  module: { kind: ModuleKind; address: string; allowance: number; transferAgent: boolean },
  address?: string | null
): Promise<Omit<ModuleFacts, 'openListings'>> {
  const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
  const [balance, votes] = await Promise.all([
    token.balance({ account: module.address }),
    token.get_votes({ account: module.address })
  ]);
  const facts = {
    kind: module.kind,
    allowance: module.allowance,
    balance: balance.result,
    votes: votes.result,
    transferAgent: module.transferAgent,
    pools: [] as PoolState[],
    auctionRunning: false,
    openLists: null as number | null
  };
  if (module.kind === 'marketplace') {
    const market = new MarketplaceClient(adminReadOptions(config, module.address, address));
    const slots = (await market.open_pools()).result;
    const now = BigInt(Math.floor(Date.now() / 1000));
    facts.pools = await Promise.all(
      slots.map(async (slot): Promise<PoolState> => {
        const [pool, ...pages] = await Promise.all([
          market.get_pool({ pool_id: slot.pool_id }),
          ...Array.from({ length: slot.pages }, (_, page) => market.pool_stock({ pool_id: slot.pool_id, page }))
        ]);
        const live = pool.result;
        return {
          id: String(slot.pool_id),
          open: Boolean(live && !live.closed && live.expires_at > now),
          inStock: pages.reduce((sum, stock) => sum + stock.result.length, 0)
        };
      })
    );
  }
  if (module.kind === 'auction') {
    const auction = new AuctionClient(adminReadOptions(config, module.address, address));
    const state = (await auction.get_auction()).result;
    facts.auctionRunning = !state.settled && num(state.end_time) > 0;
  }
  if (module.kind === 'claims') {
    const claims = new ClaimMinterClient(adminReadOptions(config, module.address, address));
    const next = (await claims.next_list_id()).result;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const lists = await Promise.all(Array.from({ length: next }, (_, id) => claims.get_list({ list_id: id })));
    facts.openLists = lists.filter(
      (l) => l.result && l.result.expires_at > now && l.result.minted < l.result.total
    ).length;
  }
  return facts;
}

/** Facts for the Remove sheet, with the open resale listings from the index. */
export function useModuleFacts(
  config: DaoNetworkConfig,
  daoId: string,
  module: { kind: ModuleKind; address: string; allowance: number; transferAgent: boolean } | null,
  address?: string | null
) {
  const chain = useSWR(
    module ? ['module-facts', config.tokenContractId, config.rpcUrl, module.address] : null,
    () => readModuleFacts(config, module!, address),
    { revalidateOnFocus: false }
  );
  const wantsListings = module?.kind === 'marketplace';
  const listings = useSWR<DaoMarketplace>(
    wantsListings
      ? marketplaceKey(daoId, 'dao', `/api/dao/${encodeURIComponent(daoId)}/marketplace?kind=secondary&status=open`)
      : null,
    marketplaceFetchKey,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );
  // Another kind has no resale listings. For a market, `null` means the index could not be read.
  const openListings = !wantsListings
    ? 0
    : listings.error
      ? null
      : listings.data
        ? listings.data.listings.length
        : undefined;
  return {
    isLoading: chain.isLoading || openListings === undefined,
    error: chain.error as Error | undefined,
    facts:
      chain.data && openListings !== undefined ? ({ ...chain.data, openListings } satisfies ModuleFacts) : undefined,
    mutate: chain.mutate
  };
}
