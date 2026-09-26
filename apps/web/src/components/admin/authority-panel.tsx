'use client';

import { Stack } from 'styled-system/jsx';

import { AuthorityActionForm } from '@/components/admin/admin-action-forms';
import { Badge, Button, Card, Heading, ShortId, Skeleton, Text } from '@/components/ui';
import type { ProposalQueuedAction } from '@/stores/proposal-composer-store';

type AuthorityItem = {
  authority: string;
  last_updated_ledger?: number;
  ledger?: number;
  source?: 'owner' | 'goldsky';
};

export function AuthorityPanel({
  title,
  badge,
  description,
  items,
  value,
  onValueChange,
  onAllow,
  onRevoke,
  allowLabel,
  revokeLabel,
  busy,
  loading = false,
  editable = true,
  formEnabled = true,
  emptyLabel = 'No authorities indexed yet.',
  draftPreview
}: {
  title: string;
  badge: string;
  description: string;
  items: AuthorityItem[];
  value: string;
  onValueChange?: (value: string) => void;
  onAllow?: () => void;
  onRevoke?: () => void;
  allowLabel: string;
  revokeLabel: string;
  busy?: boolean;
  loading?: boolean;
  editable?: boolean;
  formEnabled?: boolean;
  emptyLabel?: string;
  draftPreview?: ProposalQueuedAction;
}) {
  return (
    <Card p="5">
      <Stack gap="3">
        <div>
          <Badge>{badge}</Badge>
        </div>
        <Heading style={{ fontSize: '1.2rem' }}>{title}</Heading>
        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
          {description}
        </Text>

        {editable ? (
          <AuthorityActionForm
            value={{ authority: value, enabled: formEnabled }}
            onChange={(nextValue) => onValueChange?.(nextValue.authority)}
            disabled={Boolean(busy)}
            showEnabled={false}
            draftPreview={draftPreview}
          />
        ) : null}

        {editable ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button type="button" onClick={() => onAllow?.()} disabled={busy}>
              {busy ? 'Saving...' : allowLabel}
            </Button>
            <Button type="button" variant="outline" onClick={() => onRevoke?.()} disabled={busy}>
              {busy ? 'Saving...' : revokeLabel}
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div role="status" aria-busy="true" className="skeleton-list">
            <span className="sr-only">Loading authorities</span>
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} p="3">
                <Stack gap="1">
                  <Skeleton style={{ width: '180px', height: '1em' }} />
                  <Skeleton style={{ width: '90px', height: '0.8em' }} />
                </Stack>
              </Card>
            ))}
          </div>
        ) : !items.length ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            {emptyLabel}
          </Text>
        ) : (
          <Stack gap="2">
            {items.map((item) => (
              <Card key={item.authority} p="3">
                <Stack gap="1">
                  <ShortId value={item.authority} label={item.source === 'owner' ? 'Owner' : 'Authority'} />
                  <Text className="lede" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Ledger {item.ledger ?? item.last_updated_ledger ?? '—'}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
