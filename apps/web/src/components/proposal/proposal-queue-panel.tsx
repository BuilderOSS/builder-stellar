import { css } from 'styled-system/css';

import { Button } from '@/components/ui';

type ProposalQueuePanelProps = {
  busy: boolean;
  disabled?: boolean;
  onQueue: () => void;
};

const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '2' });

export function ProposalQueuePanel({ busy, disabled, onQueue }: ProposalQueuePanelProps) {
  return (
    <div>
      <Button block onClick={onQueue} disabled={disabled} loading={busy}>
        {busy ? 'Queueing' : 'Queue for execution'}
      </Button>
      <p className={note}>Queueing starts the safety delay. Anyone can do it; your wallet pays the network fee.</p>
    </div>
  );
}
