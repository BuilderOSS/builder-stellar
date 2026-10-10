'use client';

import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { MAX_PROPOSAL_ACTIONS } from '@/lib/governance-limits';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import type { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';

type UnseededResponse = { tokenIds: string[]; hasMore?: boolean; message?: string };

/**
 * Tokens minted before any artwork existed have no traits (the Metadata hook
 * seeds at mint time). `metadata.regenerate(token_id)` seeds them: directly by
 * the Metadata admin during setup, by governance proposal after launch.
 */
export function UnseededTokens({
  daoId,
  config,
  address,
  direct,
  canPropose,
  hasArtwork,
  proposal
}: {
  daoId: string;
  config: DaoNetworkConfig;
  address: string | null;
  direct: boolean;
  canPropose: boolean;
  hasArtwork: boolean;
  proposal: ReturnType<typeof useAdminProposalDraft>;
}) {
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { data, mutate } = useSWR<UnseededResponse>(`/api/dao/${daoId}/tokens/unseeded`, (url: string) =>
    fetch(url, { cache: 'no-store' }).then((response) => response.json())
  );
  const ids = data?.tokenIds ?? [];
  if (!ids.length) return null;

  async function seedDirectly() {
    if (!address || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const client = new MetadataClient({
        ...adminReadOptions(config, config.metadataContractId, address),
        signTransaction: (xdr, opts) => signWithWallet(xdr, { ...opts, address, networkPassphrase: config.passphrase })
      });
      // One transaction per token: regenerate seeds a single token id.
      for (const id of ids) {
        tx.start(`Seed traits for token #${id}`);
        const assembled = await client.regenerate({ token_id: Number(id) });
        const sent = await assembled.signAndSend();
        const hash = sent.sendTransactionResponse?.hash ?? '';
        await waitForConfirmation(hash, config.rpcUrl);
        tx.success(`Seeded token #${id}`, hash);
      }
      await mutate();
    } catch (error) {
      tx.fail(error, 'Seeding needs attention', 'metadata');
      setMessage(error instanceof Error ? error.message : 'Seeding failed');
    } finally {
      setBusy(false);
    }
  }

  function propose() {
    const handler = getActionHandler('regenerate-token-traits');
    const context = { config, session: { address, kit: null } };
    const batch = ids.slice(0, MAX_PROPOSAL_ACTIONS);
    proposal.requestAddBatch({
      daoId,
      requests: batch.map((tokenId) => ({
        daoId,
        action: handler.serialize({ tokenId }, context),
        source: 'admin/artwork/regenerate',
        metadata: {
          title: 'Seed traits for unseeded tokens',
          description: `Assign traits to tokens minted before the artwork existed: ${batch.map((id) => `#${id}`).join(', ')}.`,
          url: ''
        }
      }))
    });
  }

  return (
    <Card p="5">
      <Stack gap="3">
        <Heading size="heading">Tokens without traits</Heading>
        <Text>
          {ids.length}
          {data?.hasMore ? '+' : ''} token{ids.length === 1 ? '' : 's'} were minted before any artwork existed and have
          no traits: {ids.map((id) => `#${id}`).join(', ')}.
        </Text>
        {!hasArtwork ? (
          <Callout variant="warning" title="Upload the artwork first; seeding needs at least one property." />
        ) : null}
        {direct ? (
          <Button type="button" disabled={busy || !hasArtwork} onClick={() => void seedDirectly()}>
            {busy ? 'Seeding…' : `Seed ${ids.length} token${ids.length === 1 ? '' : 's'} (one signature each)`}
          </Button>
        ) : canPropose ? (
          <Button type="button" disabled={busy || !hasArtwork} onClick={propose}>
            Add seeding to proposal (up to {MAX_PROPOSAL_ACTIONS} tokens per proposal)
          </Button>
        ) : (
          <Text>The Metadata admin can seed them (governance after launch).</Text>
        )}
        {message ? <Callout variant="warning" title={message} /> : null}
      </Stack>
    </Card>
  );
}
