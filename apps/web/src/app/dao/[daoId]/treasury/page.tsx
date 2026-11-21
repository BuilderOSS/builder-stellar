'use client';

import { GlossaryTerm } from '@/components/help/glossary';
import { PageSection } from '@/components/page-section';
import { DraftDock } from '@/components/proposal-actions/draft-dock';
import { TreasuryWorkspace } from '@/components/treasury/treasury-workspace';
import { useDaoContext } from '@/contexts/dao-context';

export default function TreasuryPage() {
  const { daoId } = useDaoContext();
  return (
    <PageSection
      guide="concepts/treasury"
      title="Treasury"
      description="Funds the tribe holds together. They move only when a proposal passes."
      daoNote={
        <>
          An onchain DAO <GlossaryTerm term="treasury">treasury</GlossaryTerm>: every payment in and out is recorded
          onchain.
        </>
      }
    >
      <DraftDock daoId={daoId} />
      <TreasuryWorkspace />
    </PageSection>
  );
}
