'use client';

import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { HStack } from 'styled-system/jsx';

import { CopyIconButton, IconLinkButton, Text } from '@/components/ui';
import { getDefaultDaoNetwork } from '@/lib/dao-config';
import { getExplorerAccountUrl, getExplorerContractUrl } from '@/lib/explorer-links';

function shorten(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function getExplorerUrl(value: string) {
  const network = getDefaultDaoNetwork();

  if (value.startsWith('C')) {
    return getExplorerContractUrl(network, value);
  }

  if (value.startsWith('G')) {
    return getExplorerAccountUrl(network, value);
  }

  return '';
}

export function ShortId({ value, label, explorerUrl }: { value: string; label?: string; explorerUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const displayValue = shorten(value);
  const resolvedExplorerUrl = explorerUrl ?? getExplorerUrl(value);

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
    <HStack gap="2" justify="space-between">
      <div style={{ minWidth: 0 }}>
        {label ? <Text className="label">{label}</Text> : null}
        <Text
          className="mono"
          style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={value}
        >
          {displayValue}
        </Text>
      </div>
      <HStack gap="1">
        {resolvedExplorerUrl ? (
          <IconLinkButton href={resolvedExplorerUrl} label="Open in Stellar Expert">
            <ArrowUpRight size={12} />
          </IconLinkButton>
        ) : null}
        <CopyIconButton copied={copied} onClick={copyValue} label="Copy address" />
      </HStack>
    </HStack>
  );
}
