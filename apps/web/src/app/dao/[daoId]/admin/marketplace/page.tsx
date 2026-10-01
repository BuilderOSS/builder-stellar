'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Stack } from 'styled-system/jsx';

import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';

export default function MarketplaceAdminPage() {
  const { daoId } = useDaoContext();

  return (
    <PageSection title="Marketplace Configuration" description="Manage secondary token trading">
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
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Marketplace Configuration</Heading>
              <Text style={{ color: 'var(--gray-11)', marginTop: '8px' }}>
                Configure settings for secondary token trading on your DAO's marketplace.
              </Text>
            </div>

            <Callout
              variant="info"
              title="Marketplace membership mode"
              description="You selected the 'Marketplace' membership mode during DAO creation. Members can buy and sell tokens on the marketplace."
            />

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Marketplace Parameters
              </Heading>
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1rem' }}>
                Configure marketplace fees, payment tokens, and trading parameters.
              </Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  disabled
                  title="Marketplace configuration will be available after DAO launch"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                >
                  Configure Marketplace
                </Button>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-10)' }}>Coming soon</Text>
              </div>
            </div>

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Fee Structure
              </Heading>
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1rem' }}>
                Define marketplace fee percentages and fee recipient addresses.
              </Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  disabled
                  title="Fee configuration will be available after DAO launch"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                >
                  Configure Fees
                </Button>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-10)' }}>Coming soon</Text>
              </div>
            </div>

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Trading Tokens
              </Heading>
              <Text style={{ color: 'var(--gray-11)' }}>
                No trading tokens have been configured yet.
              </Text>
            </div>

            <Callout
              variant="info"
              title="Next steps"
              description="After launching your DAO, you'll be able to configure marketplace parameters, set trading fees, and enable token trading."
            />
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
