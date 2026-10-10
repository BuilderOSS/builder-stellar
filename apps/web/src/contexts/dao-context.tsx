'use client';

import { createContext, type ReactNode, useContext } from 'react';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRouteId } from '@/lib/dao-routes';

interface DaoContextValue {
  /**
   * URL parameter for this DAO (e.g., "testnet/builder" or "builder")
   */
  daoId: string;

  /**
   * The id to put in links: the claimed slug once launched, otherwise the token address.
   * Use it with daoRoute(); keep daoId for data lookups.
   */
  routeId: string;

  /**
   * Token contract address - this is the dao_id used in database queries
   * Example: "CBGLIC3VDPNSXRQTHIHADJVL3WVM54ZIO7FV23SDC3DQTTDLO2NMYUK7"
   */
  daoTokenAddress: string;

  /**
   * Complete DAO configuration including all contract addresses
   */
  daoConfig: DaoNetworkConfig;
}

const DaoContext = createContext<DaoContextValue | null>(null);

interface DaoProviderProps {
  daoId: string;
  daoConfig: DaoNetworkConfig;
  children: ReactNode;
}

export function DaoProvider({ daoId, daoConfig, children }: DaoProviderProps) {
  return (
    <DaoContext.Provider
      value={{
        daoId,
        routeId: daoRouteId({ daoId, slug: daoConfig.slug }),
        daoTokenAddress: daoConfig.tokenContractId,
        daoConfig
      }}
    >
      {children}
    </DaoContext.Provider>
  );
}

export function useDaoContext(): DaoContextValue {
  const context = useContext(DaoContext);
  if (!context) {
    throw new Error('useDaoContext must be used within a DaoProvider');
  }
  return context;
}

/** DAO context when rendered inside a DAO route, otherwise null. */
export function useOptionalDaoContext(): DaoContextValue | null {
  return useContext(DaoContext);
}
