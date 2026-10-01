'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Stack } from 'styled-system/jsx';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';

export default function FoundersAdminPage() {
  const { daoId } = useDaoContext();

  return (
    <PageSection title="Founders Setup" description="Manage founder token allocations">
      <Stack gap="4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href={`/dao/${daoId}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ChevronLeft size={18} />
            Back to dashboard
          </Link>
        </div>

        <AdminSectionNav
          sections={[
            { id: 'overview', label: 'Overview' },
            { id: 'allocations', label: 'Founder Allocations' }
          ]}
          current="overview"
        />

        <Card p="5">
          <Stack gap="4">
            <div>
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Founder Token Allocations</Heading>
              <Text style={{ color: 'var(--gray-11)', marginTop: '8px' }}>
                Manage the initial token allocations for your DAO's founders.
              </Text>
            </div>

            <Callout
              variant="info"
              title="Founders membership mode"
              description="You selected the 'Fixed Founders' membership mode during DAO creation. Founders receive a predetermined allocation of tokens."
            />

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Add Founder Allocations
              </Heading>
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1rem' }}>
                Specify founder addresses and their initial token amounts. Total allocation cannot exceed your DAO's maximum supply.
              </Text>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  disabled
                  title="Founder allocation configuration will be available after DAO launch"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                >
                  Add Founder Allocations
                </Button>
                <Badge variant="outline">Coming soon</Badge>
              </div>
            </div>

            <div style={{ padding: '2rem', backgroundColor: 'var(--gray-2)', borderRadius: '0.5rem' }}>
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                Current Allocations
              </Heading>
              <Text style={{ color: 'var(--gray-11)' }}>
                No founders have been allocated tokens yet. Configure founders above to get started.
              </Text>
            </div>

            <Callout
              variant="info"
              title="Next steps"
              description="After launching your DAO, you'll be able to allocate tokens to founders and mint their initial allocation."
            />
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
