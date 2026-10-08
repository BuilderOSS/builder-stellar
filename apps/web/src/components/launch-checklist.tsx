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
import { useDaoDeployment } from '@/lib/use-dao-deployment';

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
      title: 'Mint Founder Tokens',
      description: 'Batch mint tokens to founder addresses (optional)',
      completed: false, // Optional step - can be completed anytime
      link: `/dao/${daoId}/admin/founders` as Route
    },
    {
      id: 'auctions',
      title: 'Configure Auctions',
      description: 'Set auction parameters, reserve price, and payment token',
      completed: config.auctionEnabled === true,
      link: `/dao/${daoId}/admin/auction` as Route
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
  const requiredItems = items.filter((item) => item.id !== 'founders'); // Founders is optional
  const requiredCompletedCount = requiredItems.filter((item) => item.completed).length;
  const isComplete = requiredCompletedCount === requiredItems.length;
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  // Requires the Manager admin to have registered a platform minter; otherwise launch fails with PlatformMinterNotSet.
  const [enableMinter, setEnableMinter] = useState(false);

  // Get network from config
  const networkName = config.name;
  // Get launch_admin from the indexed DaoCreated event.
  const launchAdminAddress = config.launchAdmin;

  const { launchDao } = useDaoDeployment(launchAdminAddress || '', networkName);

  const handleLaunchDao = async () => {
    if (!launchAdminAddress) {
      setLaunchError('Launch admin address not found');
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);

    try {
      // Call on-chain launch_dao with all modules enabled. Payment assets are fixed at create_dao and
      // asserted at launch, so launch fails if the auction/marketplace payment asset was changed in setup.
      await launchDao(daoId, { launch_auction: true, launch_marketplace: true, enable_minter: enableMinter });

      // Wait a bit for transaction to settle, then refresh
      await new Promise((resolve) => setTimeout(resolve, 2000));
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to launch DAO';
      console.error('Error launching DAO:', error);
      setLaunchError(message);
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
            {requiredCompletedCount} of {requiredItems.length} required setup tasks completed. Complete these before
            launching your DAO.
          </Text>
        </Box>

        <Stack gap="2">
          {items.map((item) => (
            <ChecklistItemRow key={item.id} item={item} />
          ))}
        </Stack>

        {launchError && <Callout variant="error" title="Launch failed" description={launchError} />}

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
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={enableMinter}
              onChange={(event) => setEnableMinter(event.target.checked)}
              disabled={isLaunching}
            />
            Enable the platform minter at launch (requires a platform minter registered by the Manager admin)
          </label>
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
