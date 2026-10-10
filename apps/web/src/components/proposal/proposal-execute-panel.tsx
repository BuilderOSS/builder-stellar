import { Button } from '@/components/ui';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  expiresAt: number | null;
  disabled?: boolean;
  onExecute: () => void;
};

export function ProposalExecutePanel({ busy, now, eta, expiresAt, disabled, onExecute }: ProposalExecutePanelProps) {
  const ready = eta > 0 && now >= eta * 1000 && !!expiresAt && now < expiresAt * 1000;

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button type="button" onClick={onExecute} disabled={busy || disabled || !ready}>
        {busy ? 'Executing...' : 'Execute proposal'}
      </Button>
    </div>
  );
}
