'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { OpenPoolDraft } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AmountInput, Button, ButtonLink, Callout, Field, FieldLabel, Input } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { formatMarketplaceAmount, marketplaceId, parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel } from '@/lib/marketplace/asset-label';
import { marketplaceGovernanceAction, marketplaceSettingHandlers } from '@/lib/marketplace/governance';
import { useDaoMarketplace } from '@/lib/marketplace/hooks';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ActionHandler } from '@/lib/proposal-actions/types';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace-styles';
import { TreasuryPurchase } from './treasury-purchase';

export function AdminMarketplaceView({ daoId }: { daoId: string }) {
  const { daoConfig, routeId } = useDaoContext();
  const proposal = useAdminProposalDraft();
  const { data, error, isLoading } = useDaoMarketplace(daoId, 'kind=pool&status=open');
  const address = useAuthSessionStore((s) => s.address);
  const authenticated = useAuthSessionStore((s) => s.authStatus === 'authenticated');
  const router = useRouter();
  const [pool, setPool] = useState({
    price: '',
    size: '',
    maxPerBuyer: '1',
    maxSoldPerPeriod: '',
    periodHours: '24',
    expiresAt: ''
  });
  const [poolId, setPoolId] = useState('');
  const [message, setMessage] = useState('');
  const enabled = Boolean(authenticated && address && data?.launched && data.config);
  function queue(kind: 'open' | 'close' | 'sweep') {
    setMessage('');
    if (!enabled || !data)
      return setMessage('Authenticate your wallet and wait for the marketplace launch to be indexed.');
    try {
      if (kind === 'open') {
        if (!data.config || !['XLM', 'USDC'].includes(marketplaceAssetLabel(data.network, data.config.paymentAsset))) {
          throw new Error('Configure XLM or USDC as the market asset before pricing a pool.');
        }
        const amount = parseMarketplaceAmount(pool.price);
        const expiry = new Date(pool.expiresAt).getTime();
        if (!Number.isFinite(expiry) || expiry <= Date.now())
          throw new Error('Choose a closing time in the future, allowing time for the vote and execution.');
        const draft: OpenPoolDraft = { ...pool, asset: data.config.paymentAsset };
        // The pool reserves part of the marketplace's mint allowance: grant it first, in the same proposal.
        const allowance = getActionHandler('change-mint-allowance');
        const grantDraft = {
          module: data.community.marketplaceContract ?? '',
          amount: pool.size,
          direction: 'increase'
        };
        const context = { config: daoConfig, session: { address, kit: null } };
        const checked = allowance.validate(grantDraft, context);
        if (!checked.valid) throw new Error(checked.message ?? 'Enter how many tokens the pool holds.');
        const grant = { action: allowance.serialize(grantDraft, context) };
        const open = marketplaceGovernanceAction(daoConfig, address, getActionHandler('open-pool'), draft);
        const unit = marketplaceAssetLabel(data.network, data.config.paymentAsset);
        proposal.requestAddBatch({
          daoId,
          requests: [
            {
              daoId,
              action: { ...grant.action, targetRole: 'token' },
              metadata: {
                title: `Let the market mint ${pool.size} tokens`,
                description: `Raise the marketplace's mint allowance by ${pool.size} tokens for a quick-buy pool.`,
                url: ''
              },
              source: 'Marketplace administration'
            },
            {
              daoId,
              action: { ...open.action, targetRole: 'marketplace' },
              metadata: {
                title: 'Open a quick-buy pool',
                description: `Sell ${pool.size} new tokens at ${formatMarketplaceAmount(amount)} ${unit} each, at most ${pool.maxPerBuyer} per wallet and ${pool.maxSoldPerPeriod} every ${pool.periodHours}h, until ${new Date(expiry).toISOString()}. Proceeds go to the Treasury. Each token sold adds a vote: a pool larger than the voting supply could let buyers outvote today's members.`,
                url: ''
              },
              source: 'Marketplace administration'
            }
          ]
        });
        return;
      }
      marketplaceId(poolId, 'pool');
      const handler = getActionHandler(kind === 'close' ? 'close-pool' : 'sweep-pool');
      const { action } = marketplaceGovernanceAction(daoConfig, address, handler, { poolId });
      proposal.requestAdd({
        daoId,
        action: { ...action, targetRole: 'marketplace' },
        metadata: {
          title: `${kind === 'close' ? 'Close' : 'Sweep'} pool #${poolId}`,
          description:
            kind === 'close'
              ? `Stop pool #${poolId}'s sales now. Its unminted tokens go back to the marketplace allowance.`
              : `Move closed pool #${poolId}'s unsold tokens to the Treasury.`,
          url: ''
        },
        source: 'Marketplace administration'
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to prepare the proposal draft.');
    }
  }
  return (
    <div className={styles.scoped}>
      <div className={styles.stack}>
        <div>
          <ButtonLink href={daoRoute(routeId, 'marketplace')} variant="ghost" size="sm">
            <ChevronLeft aria-hidden="true" />
            Community market
          </ButtonLink>
        </div>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Governance administration</p>
          <h1>Manage the marketplace</h1>
          <p>
            After launch, the Treasury controls marketplace administration. These buttons add actions to a proposal
            draft; they never call former launch-admin setters or request a signature.
          </p>
        </section>
        {isLoading ? <p role="status">Verifying marketplace state…</p> : null}
        {error ? <Callout variant="error" title="The market didn't load" description={error.message} /> : null}
        {data ? (
          <section className={styles.notice}>
            <strong>
              {!data.launched
                ? 'Marketplace has not launched'
                : data.config?.paused
                  ? 'Marketplace paused'
                  : data.config
                    ? 'Marketplace open'
                    : 'Live state unavailable'}
            </strong>
            {data.config ? (
              <>
                <p>
                  Payment asset: {marketplaceAssetLabel(data.network, data.config.paymentAsset)} · Secondary fee:{' '}
                  {data.config.feeBps} bps
                </p>
                <p className={styles.address}>Treasury authority: {data.config.treasury}</p>
              </>
            ) : null}
            {!data.launched ? (
              <p>
                Launch is a Manager handoff, not a standalone marketplace admin action. Finish the DAO launch before
                proposing pools.
              </p>
            ) : null}
            {data.configError ? <p>{data.configError}</p> : null}
          </section>
        ) : null}
        <section className={styles.panel}>
          <div className={styles.stack}>
            <h2>Propose a quick-buy pool</h2>
            <p>
              A pool sells new tokens at a fixed price. Anyone can stock it once it opens; buyers take one token at a
              time, within the per-wallet and per-period limits. Choose a closing time that leaves room for the vote.
            </p>
            {data?.config?.paused ? (
              <p className={styles.notice}>
                The marketplace is paused. Add a resume-marketplace action before this one in the same proposal, or wait
                until a resume proposal executes.
              </p>
            ) : null}
            <div className={styles.formGrid}>
              <Field>
                <FieldLabel htmlFor="pool-price">Price per token</FieldLabel>
                <AmountInput
                  id="pool-price"
                  unit={data?.config ? marketplaceAssetLabel(data.network, data.config.paymentAsset) : '—'}
                  inputMode="decimal"
                  value={pool.price}
                  placeholder="10"
                  onChange={(e) => setPool({ ...pool, price: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pool-size">Tokens in the pool</FieldLabel>
                <Input
                  id="pool-size"
                  inputMode="numeric"
                  value={pool.size}
                  onChange={(e) => setPool({ ...pool, size: e.target.value.trim() })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pool-per-buyer">Most one wallet can buy</FieldLabel>
                <Input
                  id="pool-per-buyer"
                  inputMode="numeric"
                  value={pool.maxPerBuyer}
                  onChange={(e) => setPool({ ...pool, maxPerBuyer: e.target.value.trim() })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pool-rate">Most sales per period</FieldLabel>
                <Input
                  id="pool-rate"
                  inputMode="numeric"
                  value={pool.maxSoldPerPeriod}
                  onChange={(e) => setPool({ ...pool, maxSoldPerPeriod: e.target.value.trim() })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pool-period">Period (hours)</FieldLabel>
                <Input
                  id="pool-period"
                  inputMode="numeric"
                  value={pool.periodHours}
                  onChange={(e) => setPool({ ...pool, periodHours: e.target.value.trim() })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pool-expiry">Closes at (local time)</FieldLabel>
                <Input
                  id="pool-expiry"
                  type="datetime-local"
                  value={pool.expiresAt}
                  onChange={(e) => setPool({ ...pool, expiresAt: e.target.value })}
                />
              </Field>
            </div>
            <Callout
              variant="warning"
              title="Each token sold adds a vote"
              description="A pool larger than the current voting supply could let buyers outvote today's members. Keep pools small and the per-wallet limit low."
            />
            <div>
              <Button disabled={!enabled} onClick={() => queue('open')}>
                Add the pool to the proposal
              </Button>
            </div>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.stack}>
            <h2>Propose closing or sweeping a pool</h2>
            <Field>
              <FieldLabel htmlFor="pool-id">Pool</FieldLabel>
              <Input
                id="pool-id"
                inputMode="numeric"
                value={poolId}
                placeholder="Pool number"
                onChange={(e) => setPoolId(e.target.value)}
              />
            </Field>
            {data?.listings.length ? (
              <div className={styles.row}>
                {data.listings.map((l) => (
                  <Button
                    key={l.eventId}
                    variant="secondary"
                    size="sm"
                    aria-pressed={poolId === l.id}
                    onClick={() => setPoolId(l.id)}
                  >
                    Pool #{l.id}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className={styles.row}>
              <Button variant="secondary" disabled={!enabled} onClick={() => queue('close')}>
                Add closing to the proposal
              </Button>
              <Button variant="secondary" disabled={!enabled} onClick={() => queue('sweep')}>
                Add sweeping to the proposal
              </Button>
            </div>
          </div>
        </section>
        <TreasuryPurchase daoId={daoId} enabled={enabled} proposal={proposal} />
        <MarketplaceSettings
          daoId={daoId}
          enabled={enabled}
          onQueue={(handler, draft) => {
            try {
              if (!enabled || !data)
                throw new Error('Authenticate your wallet and wait for marketplace state to load.');
              const { call, action } = marketplaceGovernanceAction(daoConfig, address, handler, draft);
              if (call.target !== data?.community.marketplaceContract)
                throw new Error('This governance action does not target this marketplace.');
              proposal.requestAdd({
                daoId,
                action,
                metadata: {
                  title: handler.label,
                  description: `Propose ${handler.label.toLowerCase()} through the DAO Treasury. Target marketplace: ${call.target}.`,
                  url: ''
                },
                source: 'Marketplace administration'
              });
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Unable to queue marketplace setting.');
            }
          }}
        />
        {!authenticated ? (
          <p>
            Authenticate your wallet to create a proposal draft. Proposal eligibility is checked in the governance
            composer.
          </p>
        ) : null}
        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
        <AdminProposalDraftDialog
          pending={proposal.pending}
          onCancel={proposal.cancel}
          onResolve={(resolution) => {
            proposal.resolve(resolution);
            router.push(`/dao/${routeId}/proposals/create`);
          }}
        />
      </div>
    </div>
  );
}

// Render only actual registered handlers: no guessed action ABI or setter argument shapes.
function MarketplaceSettings({
  daoId,
  enabled,
  onQueue
}: {
  daoId: string;
  enabled: boolean;
  onQueue: (handler: ActionHandler, draft: unknown) => void;
}) {
  const { daoConfig, routeId } = useDaoContext();
  const handlers = marketplaceSettingHandlers(daoConfig);
  return (
    <section className={styles.panel}>
      <div className={styles.stack}>
        <h2>Payment, fee and pause changes</h2>
        <p>
          Settings are proposed through Treasury-executed governance. Existing listings keep their original asset and
          fee.
        </p>
        {handlers.length ? (
          handlers.map((handler) => (
            <MarketplaceSetting
              key={`${daoId}:${handler.type}`}
              handler={handler}
              enabled={enabled}
              network={daoConfig.name}
              onQueue={onQueue}
            />
          ))
        ) : (
          <p>
            The proposal registry does not yet offer these marketplace settings. Direct former-admin mutation is
            intentionally unavailable.
          </p>
        )}
        <div>
          <ButtonLink href={daoRoute(routeId, 'proposals')} variant="ghost" size="sm">
            View governance proposals
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function MarketplaceSetting({
  handler,
  enabled,
  network,
  onQueue
}: {
  handler: ActionHandler;
  enabled: boolean;
  network: 'local' | 'testnet' | 'public';
  onQueue: (handler: ActionHandler, draft: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => handler.getDefaultValues());
  const Form = handler.FormComponent;
  return (
    <div className={styles.notice}>
      <div className={styles.stack}>
        <h3>{handler.label}</h3>
        <Form value={draft} onChange={setDraft} disabled={!enabled} network={network} />
        <div>
          <Button variant="secondary" disabled={!enabled} onClick={() => onQueue(handler, draft)}>
            Review {handler.label.toLowerCase()} proposal
          </Button>
        </div>
      </div>
    </div>
  );
}
