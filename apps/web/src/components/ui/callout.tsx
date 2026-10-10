import type { ReactNode } from 'react';
import { Stack } from 'styled-system/jsx';

import { Badge } from './badge';
import { Card } from './card';
import { Text } from './text';

type CalloutVariant = 'info' | 'warning' | 'error' | 'success';

const CALLOUT_STYLES: Record<
  CalloutVariant,
  {
    badge: string;
    accent: string;
    border: string;
    background: string;
    badgeBorder: string;
    badgeBackground: string;
    badgeColor: string;
  }
> = {
  info: {
    badge: 'Info',
    accent: 'var(--focus)',
    border: 'var(--accent-edge)',
    background: 'var(--accent-wash)',
    badgeBorder: 'var(--accent-edge)',
    badgeBackground: 'var(--accent-wash)',
    badgeColor: 'var(--accent)'
  },
  warning: {
    badge: 'Warning',
    accent: 'var(--warning)',
    border: 'var(--warning-edge)',
    background: 'var(--warning-wash)',
    badgeBorder: 'var(--warning-edge)',
    badgeBackground: 'var(--warning-wash)',
    badgeColor: 'var(--warning)'
  },
  error: {
    badge: 'Error',
    accent: 'var(--danger)',
    border: 'var(--danger-edge)',
    background: 'var(--danger-wash)',
    badgeBorder: 'var(--danger-edge)',
    badgeBackground: 'var(--danger-wash)',
    badgeColor: 'var(--danger)'
  },
  success: {
    badge: 'Success',
    accent: 'var(--positive)',
    border: 'var(--positive-edge)',
    background: 'var(--positive-wash)',
    badgeBorder: 'var(--positive-edge)',
    badgeBackground: 'var(--positive-wash)',
    badgeColor: 'var(--positive)'
  }
};

export function Callout({
  variant = 'info',
  title,
  description,
  children,
  badge
}: {
  variant?: CalloutVariant;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  badge?: ReactNode;
}) {
  const style = CALLOUT_STYLES[variant];

  return (
    <Card
      p="4"
      style={{
        borderColor: style.border,
        background: style.background,
        boxShadow: `inset 3px 0 0 ${style.accent}`
      }}
    >
      <Stack gap="2">
        <div>
          <Badge
            style={{
              borderColor: style.badgeBorder,
              background: style.badgeBackground,
              color: style.badgeColor
            }}
          >
            {badge ?? style.badge}
          </Badge>
        </div>
        <Text style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 700 }}>{title}</Text>
        {description ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            {description}
          </Text>
        ) : null}
        {children}
      </Stack>
    </Card>
  );
}
