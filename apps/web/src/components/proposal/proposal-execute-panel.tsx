import { css } from 'styled-system/css';

import { Button } from '@/components/ui';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  expiresAt: number | null;
  disabled?: boolean;
  actionCount: number;
  onExecute: () => void;
};

const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '2' });

export function ProposalExecutePanel({
  busy,
  now,
  eta,
  expiresAt,
  disabled,
  actionCount,
  onExecute
}: ProposalExecutePanelProps) {
  const closed = !!expiresAt && now >= expiresAt * 1000;
  const ready = eta > 0 && now >= eta * 1000 && !!expiresAt && !closed;
  const label = busy
    ? 'Executing'
    : ready
      ? 'Execute now'
      : closed
        ? 'Execution window closed'
        : 'Waiting for the safety delay';

  return (
    <div>
      <Button block onClick={onExecute} disabled={disabled || !ready} loading={busy}>
        {label}
      </Button>
      <p className={note}>
        {actionCount === 1 ? 'Runs the action above' : `Runs all ${actionCount} actions above`} through the treasury.
        Anyone can do this; your wallet pays the network fee.
      </p>
    </div>
  );
}
