'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { normalizeProposalCallArgs } from '@/lib/proposal-call';

import { kindFromSpecTag, type ModuleKind } from './kinds';

/** A `Manager.create_module` call a proposal makes for this DAO. */
export type CreateCall = { kind: ModuleKind; moduleNumber: number };

/**
 * The `create_module` calls in a proposal's call vectors: the kind from the `ModuleSpec` union's case
 * and the module number from the last argument. A call that does not name this DAO or has a shape it
 * does not recognise is left out, so nothing it targets is ever treated as a pending module.
 */
export function createCallsIn(
  targets: readonly string[],
  functions: readonly string[],
  args: readonly (readonly unknown[])[],
  tokenContractId: string,
  managerAddress = getDeploymentConfig().managerAddress
): CreateCall[] {
  const calls: CreateCall[] = [];
  functions.forEach((fn, index) => {
    if (fn !== 'create_module' || targets[index] !== managerAddress) return;
    const [token, spec, number] = args[index] ?? [];
    const tag = Array.isArray(spec)
      ? spec[0]
      : spec && typeof spec === 'object'
        ? (spec as { tag?: unknown }).tag
        : null;
    const kind = kindFromSpecTag(tag);
    const moduleNumber = Number(number);
    if (token !== tokenContractId || !kind || !Number.isInteger(moduleNumber) || moduleNumber < 0) return;
    calls.push({ kind, moduleNumber });
  });
  return calls;
}

/**
 * Where each of those modules will live, as the Manager says (`predict_module_address`): the only
 * source of "pending" targets, never a guess. A proposal can then call a module it creates itself.
 */
export async function resolvePendingModules(
  config: DaoNetworkConfig,
  calls: readonly CreateCall[]
): Promise<Record<string, ModuleKind>> {
  if (!calls.length) return {};
  const manager = new ManagerClient(adminReadOptions(config, getDeploymentConfig().managerAddress));
  const entries = await Promise.all(
    calls.map(async ({ kind, moduleNumber }) => {
      const predicted = (await manager.predict_module_address({ token: config.tokenContractId, kind, n: moduleNumber }))
        .result;
      return [predicted, kind] as const;
    })
  );
  return Object.fromEntries(entries);
}

/** The same, for a proposal's indexed calls, shared by everything on its page. */
export function usePendingModules(
  config: DaoNetworkConfig,
  targets: readonly string[],
  functions: readonly string[],
  args: unknown
) {
  let calls: CreateCall[] = [];
  try {
    calls = createCallsIn(targets, functions, normalizeProposalCallArgs(args), config.tokenContractId);
  } catch {
    /* Arguments that do not normalise are reported where they are encoded. */
  }
  const key = calls.length
    ? ['pending-modules', config.tokenContractId, config.rpcUrl, ...calls.map((c) => `${c.kind}:${c.moduleNumber}`)]
    : null;
  const resolved = useSWR(key, () => resolvePendingModules(config, calls), {
    revalidateOnFocus: false,
    shouldRetryOnError: false
  });
  return {
    /** Empty until resolved; always empty for a proposal that creates no module. */
    pendingModules: resolved.data ?? ({} as Record<string, ModuleKind>),
    loading: calls.length > 0 && resolved.isLoading,
    error: resolved.error as Error | undefined
  };
}
