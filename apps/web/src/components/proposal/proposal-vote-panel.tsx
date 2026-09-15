import { Stack } from 'styled-system/jsx';

import { Button, Callout, Card, Input, Text } from '@/components/ui';

const VOTE_OPTIONS = [
  { label: 'For', value: 1 },
  { label: 'Against', value: 0 },
  { label: 'Abstain', value: 2 }
];

const VOTE_STYLES: Record<number, { border: string; background: string; color: string; accent: string }> = {
  1: {
    border: 'rgba(74, 222, 128, 0.52)',
    background: 'rgba(10, 38, 24, 0.72)',
    color: '#dcfce7',
    accent: 'rgba(74, 222, 128, 0.82)'
  },
  0: {
    border: 'rgba(248, 113, 113, 0.52)',
    background: 'rgba(45, 12, 12, 0.72)',
    color: '#fee2e2',
    accent: 'rgba(248, 113, 113, 0.82)'
  },
  2: {
    border: 'rgba(148, 163, 184, 0.48)',
    background: 'rgba(30, 41, 59, 0.72)',
    color: '#e2e8f0',
    accent: 'rgba(148, 163, 184, 0.8)'
  }
};

type CurrentVote = {
  label: string;
  reason: string;
};

type ProposalVotePanelProps = {
  canVote: boolean;
  busy: boolean;
  voteReason: string;
  selectedVoteType: number | null;
  votingPower: string | null;
  votingPowerLoading: boolean;
  votingPowerError: string;
  unavailableReason?: string;
  onVoteReasonChange: (value: string) => void;
  onSelectedVoteTypeChange: (voteType: number) => void;
  onVote: (voteType: number) => void;
  currentVote: CurrentVote | null;
};

export function ProposalVotePanel({
  canVote,
  busy,
  voteReason,
  selectedVoteType,
  votingPower,
  votingPowerLoading,
  votingPowerError,
  unavailableReason,
  onVoteReasonChange,
  onSelectedVoteTypeChange,
  onVote,
  currentVote
}: ProposalVotePanelProps) {
  const selectedOption =
    selectedVoteType === null ? null : (VOTE_OPTIONS.find((option) => option.value === selectedVoteType) ?? null);
  const selectedVoteStyle = selectedVoteType === null ? null : (VOTE_STYLES[selectedVoteType] ?? null);

  return (
    <Stack gap="3">
      <Text className="label">Your vote</Text>
      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
        {votingPowerLoading
          ? 'Checking your voting power at this proposal snapshot...'
          : votingPowerError || `Voting power at snapshot: ${votingPower ?? '0'}`}
      </Text>
      {currentVote ? (
        <Card p="4">
          <Stack gap="2">
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              You already voted {currentVote.label}.
            </Text>
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              {currentVote.reason || 'No reason provided'}
            </Text>
          </Stack>
        </Card>
      ) : null}

      {unavailableReason && !currentVote ? <Callout variant="warning" title={unavailableReason} /> : null}

      {!currentVote && canVote ? (
        <>
          <Input
            value={voteReason}
            onChange={(event) => onVoteReasonChange(event.target.value)}
            placeholder="Vote reason"
            disabled={busy}
          />
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{ color: 'rgba(176,201,229,0.88)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '8px' }}
            >
              Select your vote
            </legend>
            <div role="radiogroup" aria-label="Vote type" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {VOTE_OPTIONS.map((option) => {
                const selected = selectedVoteType === option.value;
                const style = VOTE_STYLES[option.value];
                return (
                  <label
                    key={option.value}
                    style={{
                      borderRadius: '8px',
                      border: selected ? `1px solid ${style.border}` : '1px solid rgba(160, 194, 225, 0.28)',
                      background: selected ? style.background : 'transparent',
                      color: selected ? style.color : 'inherit',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '36px',
                      padding: '0 12px',
                      opacity: busy ? 0.7 : 1
                    }}
                  >
                    <input
                      type="radio"
                      name="proposal-vote-type"
                      value={option.value}
                      checked={selected}
                      onChange={() => onSelectedVoteTypeChange(option.value)}
                      disabled={busy}
                      style={{ inlineSize: 1, blockSize: 1, opacity: 0, margin: 0, pointerEvents: 'none' }}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {selectedOption && selectedVoteStyle ? (
            <Card
              p="3"
              style={{
                borderColor: selectedVoteStyle.border,
                background: `linear-gradient(180deg, ${selectedVoteStyle.background} 0%, rgba(9, 9, 10, 0.76) 100%)`
              }}
            >
              <Stack gap="1">
                <Text className="lede" style={{ margin: 0, fontSize: '0.84rem', color: selectedVoteStyle.color }}>
                  {selectedOption.label} · {votingPower ?? '0'} voting power
                </Text>
              </Stack>
            </Card>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              onClick={() => (selectedVoteType !== null ? onVote(selectedVoteType) : undefined)}
              disabled={busy || selectedVoteType === null}
            >
              {busy ? 'Submitting...' : 'Submit vote'}
            </Button>
          </div>
        </>
      ) : null}
    </Stack>
  );
}
