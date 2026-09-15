// src/lib/proposal-actions/context.tsx

'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyMintAuthorities } from '@/lib/goldsky-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';

import type { FormContext } from './types';

const ActionFormContext = createContext<FormContext | null>(null);

export interface ActionFormProviderProps {
  children: ReactNode;
  config: DaoNetworkConfig;
  session: FormContext['session'];
}

/**
 * Provider for shared action form data
 * Wraps the entire action editor to avoid prop drilling
 */
export function ActionFormProvider({ children, config, session }: ActionFormProviderProps) {
  const { data: balances, isLoading: balancesLoading } = useTreasuryBalances(config);
  const { data: mintAuthoritiesData, isLoading: mintAuthoritiesLoading } = useGoldskyMintAuthorities();

  const contextValue = useMemo<FormContext>(
    () => ({
      config,
      session,
      balances,
      balancesLoading,
      mintAuthorities: mintAuthoritiesData?.items,
      mintAuthoritiesLoading
    }),
    [config, session, balances, balancesLoading, mintAuthoritiesData, mintAuthoritiesLoading]
  );

  return <ActionFormContext.Provider value={contextValue}>{children}</ActionFormContext.Provider>;
}

/**
 * Hook to access shared action form context
 */
export function useActionFormContext(): FormContext {
  const context = useContext(ActionFormContext);
  if (!context) {
    throw new Error('useActionFormContext must be used within ActionFormProvider');
  }
  return context;
}
