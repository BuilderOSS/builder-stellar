import { Card, ShortId, Text } from '@/components/ui';
import type { ProposalExecutionReceipt as Receipt } from '@/lib/proposal-execution-receipt';

export function ProposalExecutionReceipt({ receipt }: { receipt: Receipt }) {
  return (
    <Card p="5">
      <Text className="label">
        {receipt.source === 'indexed' ? 'Indexed execution receipt' : 'Confirmed execution receipt'}
      </Text>
      <ShortId value={receipt.transactionHash} label={`Transaction · ledger ${receipt.ledger}`} />
      <ol>
        {receipt.calls.map((call) => (
          <li key={call.index}>
            <Text>{call.function}</Text>
            <ShortId value={call.target} label="Target" />
          </li>
        ))}
      </ol>
    </Card>
  );
}
