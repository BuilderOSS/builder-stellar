// components/launch-checklist.tsx

'use client';

import { Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { Box, Stack } from 'styled-system/jsx';

import { Card, Heading, Text } from '@/components/ui';
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
  const items = getChecklistItems(daoId, config);
  const completedCount = items.filter((item) => item.completed).length;

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

        <Box
          style={{
            padding: '1rem',
            borderRadius: '0.5rem',
            backgroundColor: 'var(--gray-3)',
            borderLeft: '4px solid var(--blue-9)'
          }}
        >
          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-12)' }}>
            <strong>Ready to launch?</strong> Once you've completed the setup, visit the Admin page to finalize your DAO launch.
          </Text>
        </Box>
      </Stack>
    </Card>
  );
}
