'use client';

import { Stack } from 'styled-system/jsx';

import { Button, Card, Heading, Text } from '@/components/ui';

export type AuctionAutoPauseAction = 'payment-token' | 'reserve-price';

interface AuctionAutoPauseDialogProps {
  open: boolean;
  action: AuctionAutoPauseAction;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function AuctionAutoPauseDialog({
  open,
  action,
  onConfirm,
  onCancel,
  isLoading = false
}: AuctionAutoPauseDialogProps) {
  const actionLabel = action === 'payment-token' ? 'Update payment token' : 'Update reserve price';

  if (!open) return null;

  return (
    <div className="proposal-consent-backdrop" role="presentation" onClick={isLoading ? undefined : onCancel}>
      <Card
        className="proposal-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auction-auto-pause-title"
        onClick={(event) => event.stopPropagation()}
        p="5"
      >
        <Stack gap="4">
          <Stack gap="2">
            <Heading id="auction-auto-pause-title" style={{ fontSize: '1.125rem' }}>
              Pause auctions to make changes
            </Heading>
            <Text style={{ margin: 0 }}>
              Auctions are currently active. To update the{' '}
              {action === 'payment-token' ? 'payment token' : 'reserve price'}, the auctions must be paused first.
            </Text>
            <Text style={{ margin: 0, marginTop: '0.5rem' }}>The following actions will be executed together:</Text>
            <ol style={{ margin: '0.5rem 0 0 1.5rem', paddingLeft: 0 }}>
              <li style={{ marginBottom: '0.25rem' }}>
                <strong>Pause auctions</strong> - Stop all auction activity
              </li>
              <li>
                <strong>{actionLabel}</strong> - Apply your configuration change
              </li>
            </ol>
            <Text style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              The configuration change will apply to the next auction after it resumes.
            </Text>
          </Stack>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={isLoading}>
              {isLoading ? 'Processing...' : 'Pause and update'}
            </Button>
          </div>
        </Stack>
      </Card>
    </div>
  );
}
