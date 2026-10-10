import { Check, Minus, X } from 'lucide-react';
import { css } from 'styled-system/css';

import {
  Button,
  Callout,
  Chip,
  ChoiceGroup,
  Field,
  FieldHelperText,
  FieldLabel,
  Skeleton,
  Textarea
} from '@/components/ui';

const VOTE_OPTIONS = [
  { label: 'For', value: 1, tone: 'success', icon: Check },
  { label: 'Against', value: 0, tone: 'danger', icon: X },
  { label: 'Abstain', value: 2, tone: 'neutral', icon: Minus }
] as const;

const forIcon = css({ color: 'success' });
const againstIcon = css({ color: 'danger' });
const abstainIcon = css({ color: 'ink.muted' });
const ICON_CLASS: Record<number, string> = { 1: forIcon, 0: againstIcon, 2: abstainIcon };

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

const stack = css({ display: 'grid', gap: '4' });
const power = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const powerValue = css({ color: 'ink', fontWeight: '600', fontVariantNumeric: 'tabular-nums' });
const voted = css({ display: 'grid', gap: '2', p: '3.5', borderRadius: 'control', bg: 'brass.wash' });
const votedReason = css({ textStyle: 'body', color: 'ink', m: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });

/**
 * Cast a vote: three visible, keyboard-friendly choices, an optional reason
 * members will see, and a button that names exactly what you're doing.
 */
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
  const selected = VOTE_OPTIONS.find((option) => option.value === selectedVoteType) ?? null;
  const votes = votingPower ?? '0';

  if (currentVote) {
    return (
      <div className={voted}>
        <div>
          <Chip tone="yours">You voted {currentVote.label}</Chip>
        </div>
        <p className={votedReason}>{currentVote.reason || 'No reason given.'}</p>
      </div>
    );
  }

  return (
    <div className={stack}>
      <p className={power}>
        {votingPowerLoading ? (
          <Skeleton className={css({ display: 'inline-block', width: '40', height: '4' })} />
        ) : votingPowerError ? (
          votingPowerError
        ) : (
          <>
            You have <span className={powerValue}>{votes}</span> {votes === '1' ? 'vote' : 'votes'} on this proposal
          </>
        )}
      </p>

      {unavailableReason ? <Callout variant="warning" title={unavailableReason} /> : null}

      {canVote ? (
        <>
          <ChoiceGroup
            label="Your vote"
            name="proposal-vote-type"
            value={selectedVoteType === null ? null : String(selectedVoteType)}
            onValueChange={(value) => onSelectedVoteTypeChange(Number(value))}
            disabled={busy}
            options={VOTE_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
              tone: option.tone,
              icon: <option.icon aria-hidden="true" className={ICON_CLASS[option.value]} strokeWidth={2.5} />
            }))}
          />
          <Field>
            <FieldLabel htmlFor="vote-reason">Why? (optional)</FieldLabel>
            <Textarea
              id="vote-reason"
              rows={2}
              value={voteReason}
              onChange={(event) => onVoteReasonChange(event.target.value)}
              disabled={busy}
            />
            <FieldHelperText>Members see your reason next to your vote.</FieldHelperText>
          </Field>
          <Button
            block
            onClick={() => (selectedVoteType !== null ? onVote(selectedVoteType) : undefined)}
            disabled={selectedVoteType === null}
            loading={busy}
          >
            {busy
              ? 'Casting your vote'
              : selected
                ? `Cast ${votes} ${votes === '1' ? 'vote' : 'votes'} ${selected.label}`
                : 'Choose For, Against or Abstain'}
          </Button>
        </>
      ) : null}
    </div>
  );
}
