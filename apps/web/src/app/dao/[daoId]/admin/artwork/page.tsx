'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Stack } from 'styled-system/jsx';

import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';

export default function ArtworkAdminPage() {
  const { daoId, daoConfig: config } = useDaoContext();

  return (
    <PageSection title="Artwork Configuration" description="Configure token artwork and metadata">
      <Stack gap="4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href={`/dao/${daoId}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ChevronLeft size={18} />
            Back to dashboard
          </Link>
        </div>

        <Card p="5">
          <Stack gap="4">
            <div>
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Artwork Configuration</Heading>
              <Text style={{ color: 'var(--gray-11)', marginTop: '8px' }}>
                Configure token artwork settings, properties, and metadata for your DAO's NFTs.
              </Text>
            </div>

            {config.metadataContractId ? (
              <Callout
                variant="success"
                title="Metadata contract deployed"
                description={`Contract: ${config.metadataContractId.slice(0, 16)}...`}
              />
            ) : (
              <Callout
                variant="info"
                title="Metadata contract not yet deployed"
                description="The metadata contract will be deployed during the DAO launch process."
              />
            )}

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Artwork Properties
              </Heading>
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1rem' }}>
                Define the traits and properties that will be used to generate your DAO's token artwork.
              </Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  disabled
                  title="Artwork configuration will be available after DAO launch"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                >
                  Configure Properties
                </Button>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-10)' }}>Coming soon</Text>
              </div>
            </div>

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Artwork Renderer
              </Heading>
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1rem' }}>
                Configure the IPFS-hosted renderer that generates artwork for each token based on its properties.
              </Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  disabled
                  title="Renderer configuration will be available after DAO launch"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                >
                  Configure Renderer
                </Button>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-10)' }}>Coming soon</Text>
              </div>
            </div>

            <Callout
              variant="info"
              title="Next steps"
              description="After launching your DAO, you'll be able to configure artwork properties and upload your artwork renderer to IPFS."
            />
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
