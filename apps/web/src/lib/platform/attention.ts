import type { PlatformState } from '@/lib/platform/registry';
import { PLATFORM_CLASS_LABELS, type PlatformClassSummary } from '@/lib/platform/storage';
import type { TribeRow } from '@/lib/platform/tribes';

export type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'warning' | 'danger';
  /** The section to jump to. */
  section: 'storage' | 'tribes' | 'registry' | 'factory';
};

/**
 * What the operator should look at first, worst first. Empty when everything is healthy, so the
 * page shows no attention section at all.
 */
export function attentionItems(input: {
  state: Pick<PlatformState, 'factoryPaused' | 'pendingAdmin' | 'errors'> | undefined;
  storage: PlatformClassSummary[] | undefined;
  tribes: TribeRow[] | null;
  pendingManagerUpgrade: string | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const summary of input.storage ?? []) {
    if (summary.status === 'healthy' || summary.status === 'unknown') continue;
    const label = PLATFORM_CLASS_LABELS[summary.cls];
    items.push(
      summary.status === 'soon'
        ? {
            id: `storage-${summary.cls}`,
            title: `${label}: renew soon`,
            detail: 'Expires within 60 days.',
            tone: 'warning',
            section: 'storage'
          }
        : {
            id: `storage-${summary.cls}`,
            title: summary.status === 'expired' ? `${label}: archived` : `${label}: renew now`,
            detail:
              summary.status === 'expired'
                ? 'Some of it is archived; tribes that need it fail until it is restored.'
                : 'Expires within 14 days.',
            tone: 'danger',
            section: 'storage'
          }
    );
  }
  const rows = input.tribes ?? [];
  const urgent = rows.filter(
    (r) => r.state === 'ready' && (r.health.status === 'critical' || r.health.status === 'expired')
  ).length;
  const soon = rows.filter((r) => r.state === 'ready' && r.health.status === 'soon').length;
  const unread = rows.filter((r) => r.state === 'error').length;
  const tribes = (n: number) => `${n} ${n === 1 ? 'tribe' : 'tribes'}`;
  if (urgent)
    items.push({
      id: 'tribes-urgent',
      title: `${tribes(urgent)} expiring or archived`,
      detail: 'Their storage needs renewing now.',
      tone: 'danger',
      section: 'tribes'
    });
  if (soon)
    items.push({
      id: 'tribes-soon',
      title: `${tribes(soon)} to renew soon`,
      detail: 'Within 45 days.',
      tone: 'warning',
      section: 'tribes'
    });
  if (unread)
    items.push({
      id: 'tribes-unread',
      title: `${tribes(unread)} couldn't be checked`,
      detail: 'Retry them in the list.',
      tone: 'warning',
      section: 'tribes'
    });
  if (input.state?.factoryPaused)
    items.push({
      id: 'factory-paused',
      title: 'New tribes are paused',
      detail: 'No tribe can be created, launched or renamed.',
      tone: 'warning',
      section: 'factory'
    });
  if (input.pendingManagerUpgrade)
    items.push({
      id: 'manager-upgrade',
      title: 'A Tribe Builder upgrade is pending',
      detail: input.pendingManagerUpgrade,
      tone: 'warning',
      section: 'factory'
    });
  if (input.state?.pendingAdmin)
    items.push({
      id: 'pending-admin',
      title: 'An admin handover is pending',
      detail: 'The proposed admin has not accepted yet.',
      tone: 'warning',
      section: 'factory'
    });
  const rank = { danger: 0, warning: 1 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
