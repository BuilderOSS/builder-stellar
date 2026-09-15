import type { ReactNode } from 'react';
import { Stack } from 'styled-system/jsx';

import { Card, Heading, Text } from '@/components/ui';

export function PageSection({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="4">
      <Card p="6">
        <Stack gap="2">
          <Text className="label" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {eyebrow}
          </Text>
          <Heading style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2.4rem)' }}>{title}</Heading>
          <Text className="lede" style={{ margin: 0, maxWidth: '72ch' }}>
            {description}
          </Text>
        </Stack>
      </Card>
      {children}
    </Stack>
  );
}
