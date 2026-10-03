'use client';

import { useMemo } from 'react';

import { useAuthSessionStore } from '@/stores/auth-session-store';

/**
 * Hook to detect if the current user is the launch_admin for a DAO.
 * The launch_admin is loaded from the indexed DAO configuration.
 *
 * @param launchAdmin - The launch administrator address from the database
 * @returns true if the current user is the launch_admin, false otherwise
 */
export function useIsLaunchAdmin(launchAdmin: string): boolean {
  const address = useAuthSessionStore((state) => state.address);

  return useMemo(() => {
    return Boolean(address && launchAdmin && address.trim().toLowerCase() === launchAdmin.trim().toLowerCase());
  }, [address, launchAdmin]);
}
