interface NetworkIndicatorProps {
  isConnected?: boolean;
}
import { getNetworkConfig, type NetworkName } from '@/config/networks';

export function NetworkIndicator({ isConnected = true }: NetworkIndicatorProps) {
  const { label: networkLabel } = getNetworkConfig((process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName);

  if (!isConnected) {
    return null;
  }

  return (
    <div className="network-chip" title={`Connected to ${networkLabel}`}>
      <span className="network-dot" aria-hidden="true" />
      {networkLabel}
    </div>
  );
}
