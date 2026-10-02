// components/launch-checklist.tsx

'use client';

import { Check, ChevronRight, Rocket } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Box, Stack } from 'styled-system/jsx';

import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  link: Route;
};

function getChecklistItems(daoId: string, config: DaoNetworkConfig): ChecklistItem[] {
  return [
    {
      id: 'artwork',
      title: 'Configure Artwork',
      description: 'Upload or generate token artwork and traits',
      completed: Boolean(config.metadataContractId),
      link: `/dao/${daoId}/admin/artwork` as Route
    },
    {
      id: 'founders',
      title: 'Set Up Founders',
      description: 'Allocate initial tokens to founders (if using founders membership mode)',
      completed: false, // Will be tracked separately once we add this to database
      link: `/dao/${daoId}/admin/founders` as Route
    },
    {
      id: 'auctions',
      title: 'Configure Auctions',
      description: 'Set auction parameters, reserve price, and payment token',
      completed: config.auctionEnabled === true,
      link: `/dao/${daoId}/admin/auction` as Route
    },
    {
      id: 'marketplace',
      title: 'Set Up Marketplace',
      description: 'Configure marketplace settings for token trading (if needed)',
      completed: false, // Will be tracked separately once we add this to database
      link: `/dao/${daoId}/admin/marketplace` as Route
    }
  ];
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <Link href={item.link}>
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1rem',
          gap: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--gray-7)',
          transition: 'all 0.2s ease-in-out',
          cursor: 'pointer'
        }}
        className="hover:border-blue-9 hover:bg-blue-2"
      >
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            minWidth: '24px',
            borderRadius: '50%',
            backgroundColor: item.completed ? 'var(--green-9)' : 'var(--gray-6)',
            color: 'white'
          }}
        >
          {item.completed ? <Check size={16} aria-hidden="true" /> : <span>{''}</span>}
        </Box>

        <Box style={{ flex: 1 }}>
          <Text
            style={{
              fontWeight: 600,
              marginBottom: '0.25rem',
              color: item.completed ? 'var(--gray-11)' : 'var(--gray-12)'
            }}
          >
            {item.title}
          </Text>
          <Text
            style={{
              fontSize: '0.875rem',
              color: item.completed ? 'var(--gray-10)' : 'var(--gray-11)'
            }}
          >
            {item.description}
          </Text>
        </Box>

        <ChevronRight aria-hidden="true" size={20} style={{ color: 'var(--gray-9)' }} />
      </Box>
    </Link>
  );
}

export function LaunchChecklist({ daoId, config }: { daoId: string; config: DaoNetworkConfig }) {
  const router = useRouter();
  const items = getChecklistItems(daoId, config);
  const completedCount = items.filter((item) => item.completed).length;
  const isComplete = completedCount === items.length;
  const [isLaunching, setIsLaunching] = useState(false);

  const handleLaunchDao = async () => {
    setIsLaunching(true);
    try {
      // Call the launch_dao endpoint to finalize the DAO
      const response = await fetch(`/api/dao/${encodeURIComponent(daoId)}/launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to launch DAO');
      }

      // Update DAO status and redirect
      router.refresh();
    } catch (error) {
      console.error('Error launching DAO:', error);
      setIsLaunching(false);
    }
  };

  return (
    <Card p="5">
      <Stack gap="4">
        <Box>
          <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Launch Checklist
          </Heading>
          <Text style={{ color: 'var(--gray-11)', fontSize: '0.9375rem' }}>
            {completedCount} of {items.length} setup tasks completed. Complete these before launching your DAO.
          </Text>
        </Box>

        <Stack gap="2">
          {items.map((item) => (
            <ChecklistItemRow key={item.id} item={item} />
          ))}
        </Stack>

        {isComplete ? (
          <Callout
            variant="success"
            title="All setup complete!"
            description="Your DAO is ready to launch. Click the button below to finalize the setup and transition to operational status."
          />
        ) : (
          <Box
            style={{
              padding: '1rem',
              borderRadius: '0.5rem',
              backgroundColor: 'var(--gray-3)',
              borderLeft: '4px solid var(--blue-9)'
            }}
          >
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-12)' }}>
              <strong>Complete the setup</strong> by visiting each admin section above. Once all items are checked, you
              can launch your DAO.
            </Text>
          </Box>
        )}

        {isComplete && (
          <Button
            onClick={() => void handleLaunchDao()}
            disabled={isLaunching}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1rem',
              fontWeight: 600
            }}
          >
            <Rocket size={18} style={{ marginRight: '8px' }} aria-hidden="true" />
            {isLaunching ? 'Launching DAO...' : 'Launch DAO'}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
