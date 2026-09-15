import { ArrowUpRight } from 'lucide-react';

import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';

function shortenHash(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export function TxExplorerLink({ network, txHash }: { network: DaoNetworkName; txHash: string }) {
  return (
    <a
      href={getExplorerTxUrl(network, txHash)}
      target="_blank"
      rel="noreferrer"
      style={{
        alignItems: 'center',
        border: '1px solid rgba(160, 194, 225, 0.28)',
        borderRadius: '10px',
        color: 'inherit',
        display: 'inline-flex',
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
        fontSize: '0.85rem',
        fontWeight: 600,
        gap: '6px',
        padding: '0.45rem 0.65rem',
        textDecoration: 'none'
      }}
      title={txHash}
    >
      View tx {shortenHash(txHash)}
      <ArrowUpRight aria-hidden="true" size={15} strokeWidth={2.4} />
    </a>
  );
}
