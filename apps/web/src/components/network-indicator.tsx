interface NetworkIndicatorProps {
  networkLabel: string;
  isConnected?: boolean;
}

export function NetworkIndicator({ networkLabel, isConnected = true }: NetworkIndicatorProps) {
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
