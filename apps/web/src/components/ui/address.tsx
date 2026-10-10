'use client';

import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { useOptionalDaoContext } from '@/contexts/dao-context';
import { activeNetworkName } from '@/lib/active-network';
import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerAccountUrl, getExplorerContractUrl, getExplorerTxUrl } from '@/lib/explorer-links';

import { CopyIconButton } from './copy-icon-button';
import { IconLinkButton } from './icon-link-button';

export function shortenId(value: string, head = 6, tail = 6) {
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function explorerUrlFor(value: string, network: DaoNetworkName) {
  if (value.startsWith('C') && value.length === 56) return getExplorerContractUrl(network, value);
  if (value.startsWith('G') && value.length === 56) return getExplorerAccountUrl(network, value);
  if (/^[0-9a-f]{64}$/i.test(value)) return getExplorerTxUrl(network, value);
  return '';
}

const root = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2', minW: '0' });
const body = css({ minW: '0', display: 'grid', gap: '0.5' });
const labelClass = css({ textStyle: 'caption', color: 'ink.muted' });
const valueClass = css({
  textStyle: 'mono',
  color: 'ink',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});
const actions = css({ display: 'flex', alignItems: 'center', gap: '0.5', flexShrink: '0' });

/**
 * A Stellar address, contract id or transaction hash: shortened in mono,
 * with copy and explorer actions. The full value stays in the title.
 */
export function Address({
  value,
  label,
  explorerUrl,
  compact = false,
  copyLabel
}: {
  value: string;
  label?: string;
  explorerUrl?: string;
  compact?: boolean;
  copyLabel?: string;
}) {
  const dao = useOptionalDaoContext();
  const [copied, setCopied] = useState(false);
  const network = dao?.daoConfig.name ?? activeNetworkName();
  const resolvedExplorerUrl = explorerUrl ?? explorerUrlFor(value, network);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={root}>
      <div className={body}>
        {label ? <span className={labelClass}>{label}</span> : null}
        <span className={valueClass} title={value}>
          {shortenId(value)}
        </span>
      </div>
      <div className={actions}>
        {resolvedExplorerUrl ? (
          <IconLinkButton href={resolvedExplorerUrl} label="Open in Stellar Expert" compact={compact}>
            <ArrowUpRight aria-hidden="true" />
          </IconLinkButton>
        ) : null}
        <CopyIconButton copied={copied} onClick={copyValue} label={copyLabel ?? 'Copy'} compact={compact} />
      </div>
    </div>
  );
}
