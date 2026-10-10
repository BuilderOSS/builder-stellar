import { getNetworkConfig, type NetworkName } from '@/config/networks';

/** The deployment's network, from NEXT_PUBLIC_NETWORK (inlined at build). */
export function activeNetworkName(): NetworkName {
  return (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName;
}

export function activeNetworkLabel(): string {
  return getNetworkConfig(activeNetworkName()).label;
}
