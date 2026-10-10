import { css } from 'styled-system/css';

import { Button } from '@/components/ui';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  expiresAt: number | null;
  disabled?: boolean;
  onExecute: () => void;
};

const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '2' });

export function ProposalExecutePanel({ busy, now, eta, expiresAt, disabled, onExecute }: ProposalExecutePanelProps) {
  const ready = eta > 0 && now >= eta * 1000 && !!expiresAt && now < expiresAt * 1000;

  return (
    <div>
      <Button block onClick={onExecute} disabled={disabled || !ready} loading={busy}>
        {busy ? 'Executing' : 'Execute now'}
      </Button>
      <p className={note}>
        Runs every action above through the treasury. Anyone can do this; your wallet pays the network fee.
      </p>
    </div>
  );
}
