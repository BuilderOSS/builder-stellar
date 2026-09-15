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
    accent: 'rgba(96, 165, 250, 0.7)',
    border: 'rgba(96, 165, 250, 0.42)',
    background: 'rgba(15, 23, 42, 0.72)',
    badgeBorder: 'rgba(96, 165, 250, 0.32)',
    badgeBackground: 'rgba(37, 99, 235, 0.22)',
    badgeColor: '#bfdbfe'
  },
  warning: {
    badge: 'Warning',
    accent: 'rgba(245, 158, 11, 0.74)',
    border: 'rgba(245, 158, 11, 0.48)',
    background: 'rgba(41, 28, 8, 0.54)',
    badgeBorder: 'rgba(245, 158, 11, 0.32)',
    badgeBackground: 'rgba(245, 158, 11, 0.18)',
    badgeColor: '#fde68a'
  },
  error: {
    badge: 'Error',
    accent: 'rgba(248, 113, 113, 0.78)',
    border: 'rgba(248, 113, 113, 0.52)',
    background: 'rgba(45, 12, 12, 0.58)',
    badgeBorder: 'rgba(248, 113, 113, 0.34)',
    badgeBackground: 'rgba(239, 68, 68, 0.18)',
    badgeColor: '#fecaca'
  },
  success: {
    badge: 'Success',
    accent: 'rgba(74, 222, 128, 0.68)',
    border: 'rgba(74, 222, 128, 0.44)',
    background: 'rgba(10, 38, 24, 0.54)',
    badgeBorder: 'rgba(74, 222, 128, 0.3)',
    badgeBackground: 'rgba(34, 197, 94, 0.18)',
    badgeColor: '#bbf7d0'
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
        boxShadow: `inset 3px 0 0 ${style.accent}, 0 24px 72px rgba(2, 6, 23, 0.42)`
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
        <Text className="lede" style={{ margin: 0, color: '#f8fafc', fontWeight: 700 }}>
          {title}
        </Text>
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
