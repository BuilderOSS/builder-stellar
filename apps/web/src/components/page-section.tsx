import type { ReactNode } from 'react';
import { Stack } from 'styled-system/jsx';

export function PageSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Stack className="page-section" gap="4">
      <header className="page-intro">
        <h1 className="page-title">{title}</h1>
        <p className="lede">{description}</p>
      </header>
      {children}
    </Stack>
  );
}
