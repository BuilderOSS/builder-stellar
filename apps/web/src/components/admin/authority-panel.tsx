'use client';

import { Stack } from 'styled-system/jsx';

import { Badge, Button, Card, Heading, Input, ShortId, Text } from '@/components/ui';

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
  editable = true,
  emptyLabel = 'No authorities indexed yet.'
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
  editable?: boolean;
  emptyLabel?: string;
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
          <Input
            value={value}
            onChange={(event) => onValueChange?.(event.target.value)}
            placeholder="Address or contract id"
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

        {!items.length ? (
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
