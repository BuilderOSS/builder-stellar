// components/create-dao/ReviewStep.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Badge, Card, Heading, Text } from '@/components/ui';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function ReviewStep({ connectedAddress }: { connectedAddress: string }) {
  const { basicInfo, artwork, auction, governance, founders } = useCreateDaoStore();

  return (
    <Stack gap="4">
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
              {basicInfo.projectUri && <DetailRow label="Project URI" value={basicInfo.projectUri} />}
              {basicInfo.tokenUri && <DetailRow label="Token URI" value={basicInfo.tokenUri} />}
              {basicInfo.contractImage && <DetailRow label="Contract Image" value={basicInfo.contractImage} />}
              {basicInfo.rendererBase && <DetailRow label="Renderer Base" value={basicInfo.rendererBase} />}
            </Stack>
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
                    value={`${auction.reservePrice} stroops (${(Number(auction.reservePrice) / 10000000).toFixed(2)} XLM)`}
                  />
                  <DetailRow
                    label="Time Buffer"
                    value={`${auction.timeBuffer} seconds (${(auction.timeBuffer / 60).toFixed(0)} minutes)`}
                  />
                  <DetailRow label="Payment Asset" value={auction.paymentAsset} mono />
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
                      <Badge>{founder.amount}%</Badge>
                    </div>
                  </Card>
                ))}
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                  Total: {founders.reduce((sum, f) => sum + f.amount, 0)}%
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
