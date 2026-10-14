import { css } from 'styled-system/css';

import { GlossaryTerm } from '@/components/help/glossary';
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
      <p className={note}>
        Queueing starts the <GlossaryTerm term="safety-delay">safety delay</GlossaryTerm>. Anyone can do it; your wallet
        pays the network fee.
      </p>
    </div>
  );
}
