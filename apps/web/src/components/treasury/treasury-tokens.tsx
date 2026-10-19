'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { ChangeSubmit } from '@/components/proposal-changes/change-submit';
import { PendingValue, usePendingChanges } from '@/components/proposal-changes/pending-value';
import { Button, Callout, FieldHelperText, FieldLabel, Input, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { CHANGE_SOURCES } from '@/lib/proposal-changes/change-request';
import { useEditingChange } from '@/lib/proposal-changes/use-editing-change';
import { useProposeChange } from '@/lib/proposal-changes/use-propose-change';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type TreasuryTokensResponse = { items: Array<{ tokenId: string; owner: string }>; total: number };

const form = css({ display: 'grid', gap: '2', pt: '2', pb: '3' });
const formRow = css({ display: 'flex', gap: '2', flexWrap: 'wrap', alignItems: 'flex-start' });

const fetchTokens = async (url: string): Promise<TreasuryTokensResponse> => {
  const response = await fetch(url, { cache: 'no-store' });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || 'Treasury tokens are unavailable');
  return json;
};

/**
 * Membership tokens the treasury owns (a cancelled auction's token, a purchase…). Any of them can be
 * given away by vote; the action joins the proposal draft. Hidden when the treasury holds none.
 */
export function TreasuryTokens() {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const { propose } = useProposeChange();
  const pending = usePendingChanges('transfer-dao-token');
  const [giving, setGiving] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState('');
  const editing = useEditingChange({
    accepts: (action) => action.type === 'transfer-dao-token',
    onLoad: (action) => {
      setGiving(String(action.tokenId ?? ''));
      setRecipient(String(action.recipient ?? ''));
    }
  });
  const { data } = useSWR(
    config.treasuryContractId && config.status === 'operational'
      ? `/api/dao/${encodeURIComponent(daoId)}/tokens?owner=${config.treasuryContractId}&limit=50&offset=0`
      : null,
    fetchTokens
  );
  if (!data?.items.length) return null;

  const handler = getActionHandler('transfer-dao-token');
  const context = { config, session: { address: session.address, kit: StellarWalletsKit } };
  const add = (tokenId: string) => {
    const values = { tokenId, recipient };
    const result = handler.validate(values, context);
    if (!result.valid) return setError(result.message);
    const outcome = propose(
      {
        actions: [handler.serialize(values, context)],
        source: CHANGE_SOURCES.treasury,
        note: `Give token #${tokenId} from the treasury to ${recipient}.`,
        replaces: editing.editing?.tokenId === tokenId ? editing.replaces : undefined
      },
      {
        onAdded: () => {
          setGiving(null);
          setRecipient('');
          editing.done();
        }
      }
    );
    if (outcome.outcome === 'invalid') setError(outcome.message);
  };

  return (
    <Section
      title="Tokens the treasury holds"
      description="Members can vote to give any of these to someone, for example one from an auction nobody bid on."
    >
      <div>
        {data.items.map((item) => (
          <div key={item.tokenId}>
            <ListRow
              title={`Token #${item.tokenId}`}
              meta="Held by the treasury"
              trailing={
                giving === item.tokenId ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!session.address}
                    onClick={() => {
                      setGiving(item.tokenId);
                      setRecipient('');
                      setError('');
                    }}
                  >
                    Give to…
                  </Button>
                )
              }
            />
            <PendingValue pending={pending.find((action) => String(action.tokenId) === item.tokenId)} />
            {giving === item.tokenId ? (
              <div className={form}>
                <FieldLabel htmlFor={`give-${item.tokenId}`}>Give token #{item.tokenId} to</FieldLabel>
                <div className={formRow}>
                  <Input
                    id={`give-${item.tokenId}`}
                    value={recipient}
                    spellCheck={false}
                    placeholder="G… or C… address"
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(event) => {
                      setRecipient(event.target.value.trim());
                      setError('');
                    }}
                  />
                  <ChangeSubmit
                    direct={false}
                    size="sm"
                    editing={editing.editing?.tokenId === item.tokenId}
                    onClick={() => add(item.tokenId)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setGiving(null);
                      editing.done();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {error ? <FieldHelperText tone="error">{error}</FieldHelperText> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {!session.address ? <Callout variant="info" title="Connect a member wallet to propose a gift." /> : null}
    </Section>
  );
}
