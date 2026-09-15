import { Button } from '@/components/ui';

type ProposalQueuePanelProps = {
  busy: boolean;
  onQueue: () => void;
};

export function ProposalQueuePanel({ busy, onQueue }: ProposalQueuePanelProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button type="button" onClick={onQueue} disabled={busy}>
        {busy ? 'Queueing...' : 'Queue proposal'}
      </Button>
    </div>
  );
}
