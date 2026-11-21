'use client';
import { ArrowRight } from 'lucide-react';

import { DraftRow } from '@/components/drafts/draft-row';
import { useAllDrafts } from '@/components/drafts/use-all-drafts';
import { ButtonLink, Section } from '@/components/ui';

const SHOWN = 3;

/** Proposals and tribes you started on this browser. Hidden until there is one. */
export function HomeDrafts() {
  const { items, hydrated, discard } = useAllDrafts();
  if (!hydrated || !items.length) return null;
  return (
    <Section
      title="Your drafts"
      description="Saved on this browser automatically. Open a draft to continue."
      action={
        items.length > SHOWN ? (
          <ButtonLink href="/drafts" variant="ghost" size="sm">
            All {items.length}
            <ArrowRight aria-hidden="true" />
          </ButtonLink>
        ) : null
      }
    >
      <div>
        {items.slice(0, SHOWN).map((item) => (
          <DraftRow key={`${item.kind}:${item.id}`} item={item} onDiscard={discard} />
        ))}
      </div>
    </Section>
  );
}
