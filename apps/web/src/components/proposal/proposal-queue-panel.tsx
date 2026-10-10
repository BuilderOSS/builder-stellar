import { Button } from '@/components/ui';

type ProposalQueuePanelProps = {
  busy: boolean;
  disabled?: boolean;
  onQueue: () => void;
};

export function ProposalQueuePanel({ busy, disabled, onQueue }: ProposalQueuePanelProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button type="button" onClick={onQueue} disabled={busy || disabled}>
        {busy ? 'Queueing...' : 'Queue proposal'}
      </Button>
    </div>
  );
}
