'use client';

import { GlossaryTerm } from '@/components/help/glossary';
import { PageSection } from '@/components/page-section';
import { DraftDock } from '@/components/proposal-changes/draft-dock';
import { TreasuryWorkspace } from '@/components/treasury/treasury-workspace';
import { useDaoContext } from '@/contexts/dao-context';

export default function TreasuryPage() {
  const { daoId } = useDaoContext();
  return (
    <PageSection
      title="Treasury"
      description="Money the tribe holds together. It only moves when members vote."
      daoNote={
        <>
          An onchain DAO <GlossaryTerm term="treasury">treasury</GlossaryTerm>: every coin in and out is on the record.
        </>
      }
    >
      <DraftDock daoId={daoId} />
      <TreasuryWorkspace />
    </PageSection>
  );
}
