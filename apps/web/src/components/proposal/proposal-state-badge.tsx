import { Ban, CircleCheck, CircleDot, Clock, Hourglass, Play, XCircle } from 'lucide-react';

import { Chip } from '@/components/ui';
import { proposalStateTone } from '@/lib/proposal-state';

const ICONS: Record<string, typeof Clock> = {
  Pending: Clock,
  Active: CircleDot,
  Succeeded: CircleCheck,
  Queued: Hourglass,
  Executed: Play,
  Defeated: XCircle,
  Canceled: Ban,
  Expired: Clock
};

/** Proposal state as a labelled chip: word, icon and tone together. */
export function ProposalStateBadge({ label }: { label: string }) {
  const Icon = ICONS[label] ?? CircleDot;
  return (
    <Chip tone={proposalStateTone(label)}>
      <Icon aria-hidden="true" />
      {label}
    </Chip>
  );
}
