'use client';

import { useCreateDaoStore } from '@/stores/create-dao-store';
import { formatDuration } from '@/lib/time-utils';

interface ReviewStepProps {
  connectedAddress?: string;
}

export function ReviewStep({ connectedAddress }: ReviewStepProps) {
  const basicInfo = useCreateDaoStore((s) => s.basicInfo);
  const purpose = useCreateDaoStore((s) => s.purpose);
  const governance = useCreateDaoStore((s) => s.governance);
  const launchAdmin = useCreateDaoStore((s) => s.launchAdmin);

  const governancePresets: Record<string, { votingDelay: number; votingPeriod: number; quorumBps: number; proposalThresholdBps: number }> = {
    testing: { votingDelay: 60, votingPeriod: 300, quorumBps: 1000, proposalThresholdBps: 100 },
    fast: { votingDelay: 3600, votingPeriod: 86400, quorumBps: 500, proposalThresholdBps: 100 },
    balanced: { votingDelay: 86400, votingPeriod: 259200, quorumBps: 1000, proposalThresholdBps: 100 },
    deliberate: { votingDelay: 172800, votingPeriod: 604800, quorumBps: 1500, proposalThresholdBps: 200 }
  };

  const getPresetName = () => {
    for (const [name, config] of Object.entries(governancePresets)) {
      if (
        config.votingDelay === governance.votingDelay &&
        config.votingPeriod === governance.votingPeriod &&
        config.quorumBps === governance.quorumBps &&
        config.proposalThresholdBps === governance.proposalThresholdBps
      ) {
        return name;
      }
    }
    return 'custom';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Review Your DAO</h2>
        <p className="text-text-secondary">Verify all settings before deployment. You can configure artwork, auctions, and marketplace after launch.</p>
      </div>

      {/* Basic Info Summary */}
      <div className="rounded-lg border border-border-strong bg-surface-1 p-6 space-y-4">
        <h3 className="font-semibold text-text-primary">Basic Information</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-text-secondary">DAO Name</p>
            <p className="font-medium text-text-primary">{basicInfo.tokenName}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Token Symbol</p>
            <p className="font-medium text-text-primary">{basicInfo.tokenSymbol}</p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-text-secondary">Description</p>
            <p className="text-text-primary">{basicInfo.description}</p>
          </div>
        </div>
      </div>

      {/* Purpose Summary */}
      <div className="rounded-lg border border-border-strong bg-surface-1 p-6 space-y-4">
        <h3 className="font-semibold text-text-primary">Purpose & Membership</h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-text-secondary">DAO Purpose</p>
            <p className="text-text-primary">{purpose.purpose}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Membership Model</p>
            <p className="font-medium text-text-primary capitalize">{purpose.membershipMode}</p>
            {purpose.membershipMode !== 'founders' && (
              <p className="text-xs text-text-secondary mt-2">
                {purpose.membershipMode === 'auctions' && 'Members will be allocated tokens through recurring auctions.'}
                {purpose.membershipMode === 'marketplace' && 'Members can trade tokens freely on the marketplace.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Governance Summary */}
      <div className="rounded-lg border border-border-strong bg-surface-1 p-6 space-y-4">
        <h3 className="font-semibold text-text-primary">Governance Parameters</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-text-secondary">Voting Delay</p>
            <p className="font-medium text-text-primary">{formatDuration(governance.votingDelay)}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Voting Period</p>
            <p className="font-medium text-text-primary">{formatDuration(governance.votingPeriod)}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Quorum</p>
            <p className="font-medium text-text-primary">{(governance.quorumBps / 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Proposal Threshold</p>
            <p className="font-medium text-text-primary">{(governance.proposalThresholdBps / 100).toFixed(1)}%</p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-text-secondary">Preset</p>
            <p className="font-medium text-text-primary capitalize">{getPresetName()}</p>
          </div>
        </div>
      </div>

      {/* Admin Address */}
      <div className="rounded-lg border border-border-strong bg-surface-1 p-6 space-y-4">
        <h3 className="font-semibold text-text-primary">Launch Admin</h3>
        <div>
          <p className="text-sm text-text-secondary">Address</p>
          <p className="font-mono text-sm text-text-primary break-all">{launchAdmin}</p>
          {launchAdmin === connectedAddress && (
            <p className="text-xs text-action mt-2">✓ You will be the launch admin</p>
          )}
        </div>
      </div>

      {/* Post-Launch Configuration Note */}
      <div className="rounded-lg border border-border-action bg-surface-2 p-6 space-y-3">
        <div className="flex gap-3">
          <span className="text-lg">ℹ️</span>
          <div>
            <h4 className="font-semibold text-text-primary">After Deployment</h4>
            <p className="text-sm text-text-secondary mt-1">
              The DAO will be created with these settings. You can then configure artwork, auctions, marketplace, and other features in the admin panel before launching.
            </p>
            <p className="text-xs text-text-secondary mt-2 space-y-1">
              <span className="block">• Setup artwork properties and IPFS metadata</span>
              <span className="block">• Configure auction parameters</span>
              <span className="block">• Setup marketplace payment tokens</span>
              <span className="block">• Allocate founder tokens (if applicable)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Ready to Deploy Message */}
      <div className="p-4 rounded-lg bg-action/10 border border-action text-action">
        <p className="text-sm font-medium">✓ Ready to deploy! Click "Create DAO" to proceed to wallet signing.</p>
      </div>
    </div>
  );
}
