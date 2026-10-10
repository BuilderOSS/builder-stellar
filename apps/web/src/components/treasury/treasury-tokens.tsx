'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { Button, Callout, FieldHelperText, FieldLabel, Input, ListRow, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
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
  const draft = useAdminProposalDraft();
  const [giving, setGiving] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState('');
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
    draft.requestAdd({
      daoId,
      action: handler.serialize(values, context),
      source: 'treasury/transfer-dao-token',
      metadata: {
        title: `Give token #${tokenId}`,
        description: `Give token #${tokenId} from the treasury to ${recipient}.`,
        url: ''
      },
      onAdded: () => {
        setGiving(null);
        setRecipient('');
      }
    });
  };

  return (
    <Section
      title="Tokens the treasury holds"
      description="Members can vote to give any of these to someone, for example a token left from a cancelled auction."
    >
      <AdminProposalDraftDialog pending={draft.pending} onCancel={draft.cancel} onResolve={draft.resolve} />
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
                  <Button size="sm" onClick={() => add(item.tokenId)}>
                    Add to your proposal
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setGiving(null)}>
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
