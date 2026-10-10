'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import { formatMarketplaceAmount, marketplaceId, parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel } from '@/lib/marketplace/asset-label';
import { marketplaceGovernanceAction, marketplaceSettingHandlers } from '@/lib/marketplace/governance';
import { useDaoMarketplace } from '@/lib/marketplace/hooks';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ActionHandler, ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { type PendingAdminProposal, useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace.module.css';
import { TreasuryPurchase } from './treasury-purchase';

export function AdminMarketplaceView({ daoId }: { daoId: string }) {
  const { daoConfig } = useDaoContext();
  const proposal = useAdminProposalDraft();
  const { data, error, isLoading } = useDaoMarketplace(daoId, 'kind=primary&status=open');
  const address = useAuthSessionStore((s) => s.address);
  const authenticated = useAuthSessionStore((s) => s.authStatus === 'authenticated');
  const router = useRouter();
  const [price, setPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [listingId, setListingId] = useState('');
  const [message, setMessage] = useState('');
  const enabled = Boolean(authenticated && address && data?.launched && data.config);
  function queue(kind: 'create' | 'cancel') {
    setMessage('');
    if (!enabled || !data)
      return setMessage('Authenticate your wallet and wait for the marketplace launch to be indexed.');
    try {
      let action: ProposalQueuedAction;
      let title: string;
      let description: string;
      if (kind === 'create') {
        if (!data.config || !['XLM', 'USDC'].includes(marketplaceAssetLabel(data.network, data.config.paymentAsset))) {
          throw new Error(
            'Configure a verified XLM or USDC SAC before pricing a primary offer. Unknown token decimals are not inferred.'
          );
        }
        const amount = parseMarketplaceAmount(price);
        const expiry = new Date(expiresAt).getTime();
        if (!Number.isFinite(expiry) || expiry <= Date.now())
          throw new Error('Choose a future expiry, allowing time for governance and execution.');
        action = marketplaceGovernanceAction(daoConfig, address, getActionHandler('create-primary-listing'), {
          price,
          expiresAt
        }).action;
        title = 'Create primary marketplace listing';
        description = `Create a lazy primary sale for ${formatMarketplaceAmount(amount)} ${marketplaceAssetLabel(data.network, data.config!.paymentAsset)}. Expires ${new Date(expiry).toISOString()}. Nothing is minted until purchase; proceeds go to the Treasury. The asset configured at execution is snapshotted.`;
      } else {
        marketplaceId(listingId, 'primary');
        action = marketplaceGovernanceAction(daoConfig, address, getActionHandler('cancel-primary-listing'), {
          listingId
        }).action;
        title = `Cancel primary listing #${listingId}`;
        description = `Cancel unsold primary listing #${listingId}. Primary listing identifiers are not token identifiers; nothing was minted or escrowed.`;
      }
      proposal.requestAdd({
        daoId,
        action: { ...action, targetRole: 'marketplace' },
        metadata: { title, description, url: '' },
        source: 'Marketplace administration'
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to prepare the proposal draft.');
    }
  }
  return (
    <div className={styles.scoped}>
      <div className={styles.stack}>
        <Link href={`/dao/${daoId}/marketplace`}>← Community marketplace</Link>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Governance administration</p>
          <h1>Manage the marketplace</h1>
          <p>
            After launch, the Treasury controls marketplace administration. These buttons add actions to a proposal
            draft; they never call former launch-admin setters or request a signature.
          </p>
        </section>
        {isLoading ? <p role="status">Verifying marketplace state…</p> : null}
        {error ? <p role="alert">{error.message}</p> : null}
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
                proposing primary offers.
              </p>
            ) : null}
            {data.configError ? <p>{data.configError}</p> : null}
          </section>
        ) : null}
        <section className={styles.panel}>
          <div className={styles.stack}>
            <h2>Propose a primary sale</h2>
            <p>
              A new token is minted only when the listing is bought. Choose an expiry that leaves time for voting,
              queueing and proposal execution.
            </p>
            {data?.config?.paused ? (
              <p className={styles.notice}>
                The marketplace is paused. Add a resume-marketplace action before this create-listing action in the same
                proposal, or wait until a resume proposal executes.
              </p>
            ) : null}
            <div className={styles.formGrid}>
              <label>
                Price ({data?.config ? marketplaceAssetLabel(data.network, data.config.paymentAsset) : 'payment SAC'})
                <input
                  inputMode="decimal"
                  value={price}
                  placeholder="10.0000000"
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label>
                Expiry (local time)
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </label>
            </div>
            <button type="button" className={styles.primary} disabled={!enabled} onClick={() => queue('create')}>
              Add create-listing action to proposal
            </button>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.stack}>
            <h2>Propose cancelling a primary listing</h2>
            <label>
              Primary listing ID
              <input
                inputMode="numeric"
                value={listingId}
                placeholder="Listing ID, not a token ID"
                onChange={(e) => setListingId(e.target.value)}
              />
            </label>
            {data?.listings.length ? (
              <div className={styles.row}>
                {data.listings.map((l) => (
                  <button type="button" key={l.eventId} onClick={() => setListingId(l.id)}>
                    Select listing #{l.id}
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" disabled={!enabled} onClick={() => queue('cancel')}>
              Add cancellation action to proposal
            </button>
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
        {message ? <p role="alert">{message}</p> : null}
        {proposal.pending ? (
          <MarketplaceDraftReview
            pending={proposal.pending}
            onCancel={proposal.cancel}
            onResolve={(resolution) => {
              proposal.resolve(resolution);
              router.push(`/dao/${daoId}/proposals/create`);
            }}
          />
        ) : null}
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
  const { daoConfig } = useDaoContext();
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
        <Link href={`/dao/${daoId}/proposals`}>View governance proposals</Link>
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
        <button type="button" disabled={!enabled} onClick={() => onQueue(handler, draft)}>
          Review {handler.label.toLowerCase()} proposal
        </button>
      </div>
    </div>
  );
}

function MarketplaceDraftReview({
  pending,
  onCancel,
  onResolve
}: {
  pending: PendingAdminProposal;
  onCancel: () => void;
  onResolve: (resolution: 'add' | 'replace' | 'keep') => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const duplicate = pending.findings.some((f) => f.kind === 'duplicate');
  const conflict = pending.findings.some((f) => f.kind === 'conflict');
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="draft-review-title" onCancel={onCancel}>
      <div className={styles.stack}>
        <h2 id="draft-review-title">Review proposal draft</h2>
        <p>{pending.metadata.description}</p>
        <p>This changes only a local proposal draft. No signature or direct admin transaction is requested.</p>
        <p className={styles.address}>Target role: marketplace · DAO {pending.daoId}</p>
        {pending.summaries.map((summary) => (
          <p key={summary}>{summary}</p>
        ))}
        {pending.findings.map((finding, index) => (
          <p key={`${finding.kind}:${index}`}>{finding.message}</p>
        ))}
        <div className={styles.row}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          {conflict ? (
            <button type="button" onClick={() => onResolve('replace')}>
              Replace conflicting action
            </button>
          ) : null}
          {!duplicate && !conflict ? (
            <button type="button" className={styles.primary} onClick={() => onResolve('add')}>
              Add to draft & open composer
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
