import { Box, Stack } from 'styled-system/jsx';

import { Badge, Card, Text } from '@/components/ui';
import { proposalStateBadgeStyle } from '@/lib/proposal-state';

type ProposalQuorumProgressProps = {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  quorumVotes: bigint;
  totalVotes: bigint;
};

function formatBigInt(value: bigint) {
  return value.toString();
}

function formatPercent(value: bigint, quorumVotes: bigint) {
  if (quorumVotes <= 0n) return null;
  const pct = Number((value * 100n) / quorumVotes);
  return Number.isFinite(pct) ? pct : null;
}

export function ProposalQuorumProgress({
  forVotes,
  againstVotes,
  abstainVotes,
  quorumVotes,
  totalVotes
}: ProposalQuorumProgressProps) {
  if (totalVotes <= 0n || quorumVotes <= 0n) {
    return null;
  }

  const participationVotes = forVotes + abstainVotes;
  const quorumMet = participationVotes >= quorumVotes;
  const approvalMet = forVotes > againstVotes;
  const remaining = quorumMet ? 0n : quorumVotes - participationVotes;
  const fillPct = quorumMet ? 100 : Math.max(0, Math.min(Number((participationVotes * 100n) / quorumVotes), 100));
  const pct = formatPercent(participationVotes, quorumVotes);
  const footer = `${formatBigInt(participationVotes)} of ${formatBigInt(quorumVotes)} participating voting power (For + Abstain)`;

  return (
    <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
      <Stack gap="3">
        <Box display="flex" justifyContent="space-between" alignItems="center" gap="3">
          <Text className="label">Participation quorum</Text>
          <Badge style={proposalStateBadgeStyle(quorumMet ? 'Succeeded' : 'Pending')}>
            {quorumMet ? 'Reached' : `${formatBigInt(remaining)} to go`}
          </Badge>
        </Box>

        <Box display="flex" alignItems="baseline" gap="2">
          <Text style={{ fontSize: '1.75rem', lineHeight: 1, margin: 0, fontWeight: 700 }}>
            {formatBigInt(participationVotes)}
          </Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.95rem' }}>
            / {formatBigInt(quorumVotes)} needed
          </Text>
        </Box>

        {pct !== null ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
            {pct}% of quorum
          </Text>
        ) : null}

        <Box
          h="3"
          borderRadius="999px"
          position="relative"
          overflow="hidden"
          style={{ background: 'rgba(243, 244, 246, 0.9)' }}
          role="img"
          aria-label={footer}
        >
          <Box
            h="100%"
            w={`${fillPct}%`}
            minW={participationVotes > 0n ? '4px' : '0'}
            borderRadius="999px"
            style={{ background: 'linear-gradient(90deg, rgba(11, 105, 57, 1) 0%, rgba(22, 163, 74, 1) 100%)' }}
          />
          {!quorumMet ? (
            <Box
              aria-hidden="true"
              position="absolute"
              top="-0.75"
              left="100%"
              transform="translateX(-50%)"
              w="0.5"
              h="4.5"
              style={{ background: 'rgba(71, 85, 105, 0.95)' }}
            />
          ) : null}
        </Box>

        {!quorumMet ? (
          <Box position="relative" h="4">
            <Text
              className="lede"
              style={{ margin: 0, fontSize: '0.8rem', position: 'absolute', right: 0, whiteSpace: 'nowrap' }}
            >
              Quorum {formatBigInt(quorumVotes)}
            </Text>
          </Box>
        ) : null}

        <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
          {footer}
        </Text>
        <Box display="flex" justifyContent="space-between" alignItems="center" gap="3" flexWrap="wrap">
          <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
            Approval requires For votes to exceed Against votes.
          </Text>
          <Badge style={proposalStateBadgeStyle(approvalMet ? 'Succeeded' : 'Defeated')}>
            {approvalMet ? 'Approval met' : 'Approval not met'}
          </Badge>
        </Box>
      </Stack>
    </Card>
  );
}
