import { Badge } from '@/components/ui';
import { proposalStateBadgeStyle } from '@/lib/proposal-state';

type ProposalStateBadgeProps = {
  label: string;
};

export function ProposalStateBadge({ label }: ProposalStateBadgeProps) {
  return <Badge style={proposalStateBadgeStyle(label)}>{label}</Badge>;
}
