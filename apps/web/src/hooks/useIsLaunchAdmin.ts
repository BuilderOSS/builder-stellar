'use client';

import { useMemo } from 'react';

import { useAuthSessionStore } from '@/stores/auth-session-store';

/**
 * Hook to detect if the current user is the launch_admin for a DAO.
 * The launch_admin is stored in localStorage when the DAO is created.
 *
 * @param daoId - The token contract address (DAO ID)
 * @returns true if the current user is the launch_admin, false otherwise
 */
export function useIsLaunchAdmin(daoId: string): boolean {
  const address = useAuthSessionStore((state) => state.address);

  return useMemo(() => {
    if (!address) return false;

    try {
      const storageKey = `dao_launch_admin_${daoId}`;
      const storedLaunchAdmin = localStorage.getItem(storageKey);

      return storedLaunchAdmin ? storedLaunchAdmin.toLowerCase() === address.toLowerCase() : false;
    } catch (error) {
      console.error('Failed to check launch admin status:', error);
      return false;
    }
  }, [daoId, address]);
}
