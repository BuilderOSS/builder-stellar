import { css } from 'styled-system/css';

import { Address, Chip, Section } from '@/components/ui';
import { contractCallLabel } from '@/lib/contract-call-labels';
import type { ProposalExecutionReceipt as Receipt } from '@/lib/proposal-execution-receipt';

const list = css({ display: 'grid', gap: '3', listStyle: 'none', m: '0', p: '0' });
const call = css({ display: 'grid', gap: '1.5', p: '3', borderRadius: 'control', bg: 'hover' });
const fn = css({ textStyle: 'body', fontWeight: '600', color: 'ink', m: '0' });

export function ProposalExecutionReceipt({ receipt }: { receipt: Receipt }) {
  return (
    <Section
      title="Executed"
      description={receipt.source === 'indexed' ? 'From the indexed receipt' : 'Confirmed on-chain just now'}
      action={<Chip tone="success">Done</Chip>}
    >
      <Address value={receipt.transactionHash} label="Transaction" />
      <ol className={list}>
        {receipt.calls.map((item) => (
          <li key={item.index} className={call}>
            <p className={fn} title={item.function}>
              {contractCallLabel(item.function)}
            </p>
            <Address value={item.target} label="Contract" compact />
          </li>
        ))}
      </ol>
    </Section>
  );
}
