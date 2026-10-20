'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';

import type { OpenPoolDraft } from '@/components/admin/admin-action-forms';
import { actionAuthorityText, ActionSubmit } from '@/components/proposal-actions/action-submit';
import { EditingActionNotice } from '@/components/proposal-actions/editing-action-notice';
import { PendingValue, usePendingActions } from '@/components/proposal-actions/pending-value';
import {
  Address,
  AmountInput,
  Button,
  ButtonLink,
  Callout,
  Field,
  FieldHelperText,
  FieldLabel,
  Input
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { adminReadOptions } from '@/lib/admin-surfaces';
import { daoRoute } from '@/lib/dao-routes';
import { expiryInputValue } from '@/lib/expiry-time';
import { formatMarketplaceAmount, marketplaceId, parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel } from '@/lib/marketplace/asset-label';
import { marketplaceGovernanceAction, marketplaceSettingHandlers } from '@/lib/marketplace/governance';
import { useDaoMarketplace } from '@/lib/marketplace/hooks';
import { largestBuyerShare } from '@/lib/marketplace/pool-share';
import { ACTION_SOURCES, planBundle } from '@/lib/proposal-actions/action-request';
import { ACTION_CATALOG, getActionMeta, type SettingValues } from '@/lib/proposal-actions/catalog';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ActionHandler, ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { useEditingAction } from '@/lib/proposal-actions/use-editing-action';
import { useProposeAction } from '@/lib/proposal-actions/use-propose-action';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace-styles';
import { TreasuryPurchase } from './treasury-purchase';

const POOL_TYPES = new Set(['open-pool', 'close-pool', 'sweep-pool']);

export function AdminMarketplaceView({ daoId }: { daoId: string }) {
  const { daoConfig, routeId } = useDaoContext();
  const { propose } = useProposeAction();
  const pendingPools = usePendingActions((action) => POOL_TYPES.has(action.type));
  const { data, error, isLoading } = useDaoMarketplace(daoId, 'kind=pool&status=open');
  // Closing needs a pool that is still open; sweeping one that has closed. List both to pick from.
  const allPools = useDaoMarketplace(daoId, 'kind=pool&status=all');
  const pools = allPools.data?.listings.filter((listing) => listing.kind === 'pool') ?? [];
  const address = useAuthSessionStore((s) => s.address);
  const authenticated = useAuthSessionStore((s) => s.authStatus === 'authenticated');
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
  const editing = useEditingAction({
    accepts: (action) =>
      action.type === 'open-pool' || (action.type === 'change-mint-allowance' && Boolean(action.bundleId)),
    onLoad: (_action, bundle) => {
      const open = bundle.find((step: ProposalQueuedAction) => step.type === 'open-pool');
      if (!open) return;
      setPool({
        price: String(open.price ?? ''),
        size: String(open.size ?? ''),
        maxPerBuyer: String(open.maxPerBuyer ?? '1'),
        maxSoldPerPeriod: String(open.maxSoldPerPeriod ?? ''),
        periodHours: String(open.periodHours ?? '24'),
        expiresAt: expiryInputValue(String(open.expiresAt ?? ''))
      });
    }
  });
  const votingSupply = useSWR(['voting-supply', daoConfig.tokenContractId, daoConfig.rpcUrl], async () => {
    const token = new TokenClient(adminReadOptions(daoConfig, daoConfig.tokenContractId, address));
    return (await token.voting_supply_at_previous_ledger()).result;
  });
  const share =
    votingSupply.data === undefined ? null : largestBuyerShare(votingSupply.data, pool.size, pool.maxPerBuyer);
  const shareText = share
    ? `The largest vote share one wallet could buy is ${share.percent}%: ${share.bought} ${share.bought === 1 ? 'token' : 'tokens'}, if nobody else buys (${votingSupply.data} votes today).`
    : '';
  const picked = pools.find((listing) => listing.id === poolId.trim());
  const pickedClosed = picked?.status === 'closed';
  const pickedUnsold = picked?.pool?.inStock ?? 0;
  const enabled = Boolean(authenticated && address && data?.launched && data.config);
  function queue(kind: 'open' | 'close' | 'sweep') {
    setMessage('');
    if (!enabled || !data) return setMessage('Connect your wallet. Pools can be proposed once the tribe has launched.');
    try {
      if (kind === 'open') {
        if (!data.config || !['XLM', 'USDC'].includes(marketplaceAssetLabel(data.network, data.config.paymentAsset))) {
          throw new Error('The market has to take XLM or USDC before a pool can be priced.');
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
        // The allowance and the pool only work together: one item, removed as one.
        const result = propose(
          {
            actions: [
              { ...grant.action, targetRole: 'token' },
              { ...open.action, targetRole: 'marketplace' }
            ],
            bundle: planBundle('Open a quick-buy pool', 2),
            source: ACTION_SOURCES.marketplace,
            note: `Sell ${pool.size} new tokens at ${formatMarketplaceAmount(amount)} ${unit} each, at most ${pool.maxPerBuyer} per wallet and ${pool.maxSoldPerPeriod} every ${pool.periodHours}h, until ${new Date(expiry).toISOString()}. The market may mint them first. Proceeds go to the treasury. Each token sold adds a vote: a pool larger than the voting supply could let buyers outvote today's members.${shareText ? ` ${shareText}` : ''}`,
            replaces: editing.replaces
          },
          { onAdded: () => editing.done() }
        );
        if (result.outcome === 'invalid') setMessage(result.message);
        return;
      }
      marketplaceId(poolId, 'pool');
      const handler = getActionHandler(kind === 'close' ? 'close-pool' : 'sweep-pool');
      const { action } = marketplaceGovernanceAction(daoConfig, address, handler, { poolId });
      const result = propose({
        actions: [{ ...action, targetRole: 'marketplace' }],
        source: ACTION_SOURCES.marketplace,
        note:
          kind === 'close'
            ? `Stop pool #${poolId}'s sales now. Tokens it never minted go back to the market's mint allowance.`
            : `Move closed pool #${poolId}'s unsold tokens to the treasury.`
      });
      if (result.outcome === 'invalid') setMessage(result.message);
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
            Tribe market
          </ButtonLink>
        </div>
        <section className={styles.hero}>
          <h1>Manage the marketplace</h1>
          <p>
            Once the tribe has launched, members change the market by vote. Each button here adds an action to your
            proposal draft. Nothing is signed on this page.
          </p>
        </section>
        {isLoading ? <p role="status">Verifying marketplace state…</p> : null}
        {error ? <Callout variant="error" title="The market didn't load" description={error.message} /> : null}
        {data ? (
          <section className={styles.notice}>
            <strong>
              {!data.launched
                ? 'The market opens at launch'
                : data.config?.paused
                  ? 'The market is paused'
                  : data.config
                    ? 'The market is open'
                    : 'We could not read the market right now'}
            </strong>
            {data.config ? (
              <>
                <p>
                  Prices in {marketplaceAssetLabel(data.network, data.config.paymentAsset)} · Resale fee{' '}
                  {(data.config.feeBps / 100).toLocaleString()}%, paid by the seller
                </p>
                <Address value={data.config.treasury} label="Run by the treasury" compact />
              </>
            ) : null}
            {!data.launched ? <p>Pools and market settings can be proposed once the tribe has launched.</p> : null}
            {data.configError ? <p>{data.configError}</p> : null}
          </section>
        ) : null}
        <section className={styles.panel}>
          <div className={styles.stack}>
            <h2>Propose a quick-buy pool</h2>
            <EditingActionNotice editing={editing.editing} bundle={editing.bundle} onCancel={editing.done} />
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
              description={`A pool larger than the current voting supply could let buyers outvote today's members. Keep pools small and the per-wallet limit low.${shareText ? ` ${shareText}` : ' Enter the pool size and per-wallet limit to see the largest share one wallet could buy.'}`}
            />
            <div className={styles.stack}>
              <div>
                <ActionSubmit
                  direct={false}
                  what="the pool"
                  editing={Boolean(editing.editing)}
                  disabled={!enabled}
                  onClick={() => queue('open')}
                />
              </div>
              <FieldHelperText>{actionAuthorityText(false)}</FieldHelperText>
            </div>
            {!enabled ? (
              <FieldHelperText>
                {data && !data.launched
                  ? 'Available once the tribe has launched.'
                  : 'Connect your wallet to add this to a proposal.'}
              </FieldHelperText>
            ) : null}
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
            {pools.length ? (
              <div className={styles.row}>
                {pools.map((l) => (
                  <Button
                    key={l.eventId}
                    variant="secondary"
                    size="sm"
                    aria-pressed={poolId === l.id}
                    onClick={() => setPoolId(l.id)}
                  >
                    Pool #{l.id} ·{' '}
                    {l.status === 'closed'
                      ? (l.pool?.inStock ?? 0) > 0
                        ? `closed, ${l.pool?.inStock} unsold`
                        : 'closed'
                      : l.status === 'awaiting-expiry'
                        ? 'ended'
                        : `${((l.pool?.size ?? 0) - (l.pool?.sold ?? 0)).toLocaleString()} left`}
                  </Button>
                ))}
              </div>
            ) : null}
            <p className={styles.muted}>
              Closing stops sales now and hands back the tokens it never minted. Sweeping a closed pool moves its unsold
              tokens to the treasury.
            </p>
            {pendingPools.map((action) => (
              <PendingValue key={action.id} pending={action} />
            ))}
            <div className={styles.row}>
              <ActionSubmit
                direct={false}
                what="closing"
                variant="secondary"
                disabled={!enabled || pickedClosed}
                onClick={() => queue('close')}
              />
              <ActionSubmit
                direct={false}
                what="sweeping"
                variant="secondary"
                disabled={!enabled || Boolean(picked && (!pickedClosed || pickedUnsold === 0))}
                onClick={() => queue('sweep')}
              />
            </div>
            {picked && !pickedClosed ? (
              <FieldHelperText>Pool #{picked.id} is still open: close it first, then sweep it.</FieldHelperText>
            ) : picked && pickedUnsold === 0 ? (
              <FieldHelperText>Pool #{picked.id} has no unsold tokens to sweep.</FieldHelperText>
            ) : null}
          </div>
        </section>
        <TreasuryPurchase daoId={daoId} enabled={enabled} propose={propose} />
        <MarketplaceSettings
          daoId={daoId}
          enabled={enabled}
          values={{ marketplace: data?.config ?? undefined }}
          onQueue={(handler, draft, replaces) => {
            try {
              if (!enabled || !data) throw new Error('Connect your wallet and wait for the market to load.');
              const { call, action } = marketplaceGovernanceAction(daoConfig, address, handler, draft);
              if (call.target !== data?.community.marketplaceContract)
                throw new Error('This governance action does not target this marketplace.');
              const result = propose({
                actions: [action],
                source: ACTION_SOURCES.marketplace,
                note: `${handler.label}. The treasury makes the change on the market when the proposal runs.`,
                replaces
              });
              if (result.outcome === 'invalid') setMessage(result.message);
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Unable to queue marketplace setting.');
            }
          }}
        />
        {!authenticated ? (
          <p>Connect your wallet to add these to a proposal. Whether you can submit it is checked when you do.</p>
        ) : null}
        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
      </div>
    </div>
  );
}

// Render only actual registered handlers: no guessed action ABI or setter argument shapes.
function MarketplaceSettings({
  daoId,
  enabled,
  values,
  onQueue
}: {
  daoId: string;
  enabled: boolean;
  values: SettingValues;
  onQueue: (handler: ActionHandler, draft: unknown, replaces?: string[]) => void;
}) {
  const { daoConfig, routeId } = useDaoContext();
  const handlers = marketplaceSettingHandlers(daoConfig);
  return (
    <section className={styles.panel}>
      <div className={styles.stack}>
        <h2>Payment, fee and pause changes</h2>
        <p>Each action runs when its proposal passes. Listings already open keep their asset and fee.</p>
        {handlers.length ? (
          handlers.map((handler) => (
            <MarketplaceSetting
              key={`${daoId}:${handler.type}`}
              handler={handler}
              enabled={enabled}
              network={daoConfig.name}
              values={values}
              onQueue={onQueue}
            />
          ))
        ) : (
          <p>These settings can't be proposed from here yet.</p>
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
  values,
  onQueue
}: {
  handler: ActionHandler;
  enabled: boolean;
  network: 'local' | 'testnet' | 'public';
  values: SettingValues;
  onQueue: (handler: ActionHandler, draft: unknown, replaces?: string[]) => void;
}) {
  const current = getActionMeta(handler.type).currentValue?.(values) ?? null;
  const [draft, setDraft] = useState<unknown>(null);
  const pending = usePendingActions(handler.type).at(-1);
  const editing = useEditingAction({
    accepts: (action) => action.type === handler.type,
    onLoad: (action) => setDraft(handler.deserialize(action))
  });
  // The same form the composer shows for this setting, starting from the market's live value.
  const Form = ACTION_CATALOG[handler.type].Form ?? handler.FormComponent;
  return (
    <div className={styles.notice}>
      <div className={styles.stack}>
        <h3>{handler.label}</h3>
        <EditingActionNotice editing={editing.editing} onCancel={editing.done} />
        <PendingValue now={current?.text} pending={editing.editing ? undefined : pending} />
        <Form
          value={draft ?? current?.draft ?? handler.getDefaultValues()}
          onChange={setDraft}
          disabled={!enabled}
          network={network}
        />
        <div>
          <ActionSubmit
            direct={false}
            variant="secondary"
            editing={Boolean(editing.editing)}
            disabled={!enabled}
            onClick={() => {
              onQueue(handler, draft ?? current?.draft ?? handler.getDefaultValues(), editing.replaces);
              setDraft(null);
              editing.done();
            }}
          />
        </div>
      </div>
    </div>
  );
}
