'use client';

import { ArrowRight, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Stack } from 'styled-system/jsx';

import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';

export default function FoundersAdminPage() {
  const { daoId } = useDaoContext();

  return (
    <PageSection title="Founders Setup" description="Mint tokens for your DAO's founders">
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
              <Heading style={{ fontSize: '1.35rem', margin: 0 }}>Mint Founder Tokens</Heading>
              <Text style={{ color: 'var(--gray-11)', marginTop: '8px' }}>
                Mint tokens directly to founder addresses using the token mint admin page.
              </Text>
            </div>

            <Callout
              variant="info"
              title="How to mint founder tokens"
              description="Click the button below to navigate to the token mint page. From there, you can mint tokens to individual founder addresses or batch mint to multiple addresses."
            />

            <div
              style={{
                padding: '2rem',
                backgroundColor: 'var(--blue-2)',
                borderRadius: '0.5rem',
                border: '1px solid var(--blue-6)'
              }}
            >
              <Heading style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Ready to mint founder tokens?</Heading>
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1.5rem' }}>Use the token mint admin page to:</Text>
              <ul style={{ color: 'var(--gray-11)', marginBottom: '1.5rem', paddingLeft: '1.5rem' }}>
                <li>Mint tokens individually to each founder</li>
                <li>Batch mint to multiple addresses at once</li>
                <li>View minting history and totals</li>
              </ul>
              <Link href={`/dao/${daoId}/admin/token`}>
                <Button style={{ width: '100%' }}>
                  Go to Token Mint Admin
                  <ArrowRight size={16} style={{ marginLeft: '8px' }} />
                </Button>
              </Link>
            </div>

            <Callout
              variant="success"
              title="Next steps"
              description="After minting founder tokens, return to the checklist to mark this step as complete and continue with other setup tasks."
            />
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
