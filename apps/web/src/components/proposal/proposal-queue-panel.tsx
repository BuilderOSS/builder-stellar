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
      <p className={note}>Anyone can do this once the vote passes. Your wallet pays the network fee.</p>
    </div>
  );
}
