// components/create-dao/ReviewStep.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Badge, Callout, Card, Heading, Text } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';
import { decimalToStroops, formatStroops, getConfiguredAuctionNetwork } from '@/lib/auction-values';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function ReviewStep({ connectedAddress }: { connectedAddress: string }) {
  const { basicInfo, artwork, auction, governance, founders, validationErrors } = useCreateDaoStore();
  const paymentAsset = getTreasuryAssets(getConfiguredAuctionNetwork()).find(
    (asset) => asset.contractId === auction.paymentAsset
  );
  const errors = Object.entries(validationErrors);

  return (
    <Stack gap="4">
      {errors.length > 0 && (
        <Callout
          variant="error"
          title="Please fix the highlighted fields before creating your DAO"
          description="Use the wizard steps above to jump to a section, then return here to try again."
        >
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }} aria-live="polite">
            {errors.map(([field, message]) => (
              <li key={field}>
                <Text style={{ fontSize: '0.875rem' }}>{message}</Text>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <Card p="5">
        <Stack gap="4">
          <Heading as="h2" style={{ fontSize: '1.25rem' }}>
            Review Configuration
          </Heading>

          {/* Basic Info */}
          <div>
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '8px', fontWeight: 600 }}>
              Token Information
            </Text>
            <Stack gap="2">
              <DetailRow label="Name" value={basicInfo.tokenName} />
              <DetailRow label="Symbol" value={basicInfo.tokenSymbol} />
              <DetailRow label="Description" value={basicInfo.description} />
            </Stack>
            <Text style={{ fontSize: '0.75rem', color: 'var(--gray-11)', marginTop: '8px', fontStyle: 'italic' }}>
              Note: Token URI and metadata endpoints will be configured automatically using your DAO&apos;s contract
              address after deployment.
            </Text>
          </div>

          {/* Artwork */}
          <div>
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '8px', fontWeight: 600 }}>
              Artwork Configuration
            </Text>
            <Stack gap="2">
              <DetailRow label="IPFS Base URI" value={artwork.ipfs.baseUri} />
              <DetailRow label="File Extension" value={artwork.ipfs.extension} />
              <div>
                <Text style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '4px' }}>
                  Properties ({artwork.properties.length})
                </Text>
                {artwork.properties.map((property, i) => (
                  <div key={i} style={{ marginLeft: '1rem', marginBottom: '8px' }}>
                    <Text style={{ fontSize: '0.875rem' }}>
                      <strong>{property.name}</strong>: {property.items.length} items
                    </Text>
                  </div>
                ))}
              </div>
            </Stack>
          </div>

          {/* Auction */}
          <div>
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '8px', fontWeight: 600 }}>
              Auction Settings
            </Text>
            <Stack gap="2">
              <DetailRow label="Enabled" value={auction.enabled ? 'Yes' : 'No'} />
              {auction.enabled && (
                <>
                  <DetailRow
                    label="Duration"
                    value={`${auction.duration} seconds (${(auction.duration / 3600).toFixed(1)} hours)`}
                  />
                  <DetailRow
                    label="Reserve Price"
                    value={`${auction.reservePrice} ${paymentAsset?.code ?? 'payment tokens'} (${formatStroops(
                      decimalToStroops(auction.reservePrice) ?? 0n
                    )} stroops)`}
                  />
                  <DetailRow
                    label="Time Buffer"
                    value={`${auction.timeBuffer} seconds (${(auction.timeBuffer / 60).toFixed(0)} minutes)`}
                  />
                  <DetailRow
                    label="Payment Asset"
                    value={`${paymentAsset?.code ?? 'Custom SAC'} · ${auction.paymentAsset}`}
                    mono
                  />
                </>
              )}
            </Stack>
          </div>

          {/* Governance */}
          <div>
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '8px', fontWeight: 600 }}>
              Governance Parameters
            </Text>
            <Stack gap="2">
              <DetailRow
                label="Voting Delay"
                value={`${governance.votingDelay} seconds (${(governance.votingDelay / 3600).toFixed(1)} hours)`}
              />
              <DetailRow
                label="Voting Period"
                value={`${governance.votingPeriod} seconds (${(governance.votingPeriod / 86400).toFixed(1)} days)`}
              />
              <DetailRow
                label="Quorum"
                value={`${governance.quorumBps} basis points (${(governance.quorumBps / 100).toFixed(2)}%)`}
              />
              <DetailRow
                label="Proposal Threshold"
                value={`${governance.proposalThresholdBps} basis points (${(governance.proposalThresholdBps / 100).toFixed(2)}%)`}
              />
            </Stack>
          </div>

          {/* Founders */}
          <div>
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)', marginBottom: '8px', fontWeight: 600 }}>
              Founder Allocations ({founders.length})
            </Text>
            {founders.length > 0 ? (
              <Stack gap="2">
                {founders.map((founder, i) => (
                  <Card key={i} p="3" style={{ background: 'var(--gray-2)', border: '1px solid var(--gray-6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{founder.address}</Text>
                      <Badge>{founder.amount} NFTs</Badge>
                    </div>
                  </Card>
                ))}
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                  Total: {founders.reduce((sum, f) => sum + f.amount, 0)} NFTs
                </Text>
              </Stack>
            ) : (
              <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>No founders added</Text>
            )}
          </div>
        </Stack>
      </Card>

      <Card p="5">
        <Stack gap="4">
          <div>
            <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              Launch Configuration
            </Heading>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Your connected wallet will be the admin during DAO launch
            </Text>
          </div>

          <DetailRow label="Launch Admin Address" value={connectedAddress} mono />
        </Stack>
      </Card>
    </Stack>
  );
}

// Helper component for displaying key-value pairs
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--gray-4)'
      }}
    >
      <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>{label}</Text>
      <Text
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          fontFamily: mono ? 'monospace' : 'inherit',
          textAlign: 'right',
          maxWidth: '60%',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {value}
      </Text>
    </div>
  );
}
