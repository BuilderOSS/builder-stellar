'use client';
import { ArrowRight } from 'lucide-react';

import { draftStatus, useLocalDrafts } from '@/components/local-workspace/local-drafts';
import { ButtonLink, ListRow, Section } from '@/components/ui';
import { relativeTime } from '@/lib/activity-feed';

const SHOWN = 3;

/** DAOs you started creating on this browser. Hidden until there is one, so Home never shows an empty "draft" box. */
export function HomeDrafts() {
  const { drafts: all, hydrated } = useLocalDrafts();
  // Opening the create form saves an empty draft; only list ones someone actually started.
  const drafts = all.filter((draft) => draft.deployment || draft.configuration.basicInfo.tokenName.trim());
  if (!hydrated || !drafts.length) return null;
  return (
    <Section
      title="DAOs you're starting"
      description="Saved on this browser as you fill them in. Pick up where you left off."
      action={
        drafts.length > SHOWN ? (
          <ButtonLink href="/drafts" variant="ghost" size="sm">
            All {drafts.length}
            <ArrowRight aria-hidden="true" />
          </ButtonLink>
        ) : null
      }
    >
      <div>
        {drafts.slice(0, SHOWN).map((draft) => (
          <ListRow
            key={draft.id}
            href={`/create?draft=${encodeURIComponent(draft.id)}`}
            title={draft.configuration.basicInfo.tokenName || 'Untitled DAO'}
            meta={`${draftStatus(draft)} · saved ${relativeTime(Math.floor(draft.updatedAt / 1000))}`}
            trailing={<ArrowRight aria-hidden="true" size={16} />}
          />
        ))}
      </div>
    </Section>
  );
}
