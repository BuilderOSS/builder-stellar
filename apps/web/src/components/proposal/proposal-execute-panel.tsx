import { Button } from '@/components/ui';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  onExecute: () => void;
};

export function ProposalExecutePanel({ busy, now, eta, onExecute }: ProposalExecutePanelProps) {
  const ready = now >= eta * 1000;

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button type="button" onClick={onExecute} disabled={busy || !ready}>
        {busy ? 'Executing...' : 'Execute proposal'}
      </Button>
    </div>
  );
}
