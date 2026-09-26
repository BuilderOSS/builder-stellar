'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Stack } from 'styled-system/jsx';

import { Badge, Button, Card, Text } from '@/components/ui';
import { daoAdminRoute } from '@/lib/dao-routes';
import { ProposalActionQueue } from '@/lib/proposal-actions';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const ITEMS: Array<{ section: string; label: string }> = [
  { section: '', label: 'Dashboard' },
  { section: '/owner', label: 'Owner' },
  { section: '/token', label: 'Token Admin' },
  { section: '/governance', label: 'Governance Admin' },
  { section: '/auction', label: 'Auction Admin' }
];

export function AdminSectionNav({
  daoId,
  active,
  showDraftTray = true
}: {
  daoId: string;
  active: string;
  showDraftTray?: boolean;
}) {
  const router = useRouter();
  const address = useDaoSessionStore((state) => state.address);
  const draft = useProposalComposerStore(selectDraft(address || null, daoId));

  return (
    <Stack gap="3">
      <nav className="admin-section-nav" aria-label="Administration sections">
        {ITEMS.map((item) => (
          <Link
            key={item.section}
            href={daoAdminRoute(daoId, item.section)}
            className="nav-link"
            aria-current={active === item.section ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {showDraftTray && draft.queuedActions.length > 0 ? (
        <Card p="4" className="admin-proposal-tray">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <Badge>Proposal draft</Badge>
              <Text style={{ marginTop: '6px', fontWeight: 600 }}>
                {draft.queuedActions.length} {draft.queuedActions.length === 1 ? 'action' : 'actions'} queued
              </Text>
            </div>
            <Button type="button" size="sm" onClick={() => router.push(`/dao/${daoId}/proposals/create`)}>
              Review draft
            </Button>
          </div>
          <div style={{ marginTop: '12px' }}>
            <ProposalActionQueue daoId={daoId} editable={false} />
          </div>
        </Card>
      ) : null}
    </Stack>
  );
}
