'use client';

import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { type AuthNode, Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { useState } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import { readSource } from '@/lib/dao-config';
import { formatMarketplaceAmount, marketplaceFee } from '@/lib/marketplace/amount';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { authNodeSpecValue, describeAuthNodes, treasuryPurchaseAuthNodes } from '@/lib/treasury-authorize';
import type { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';

import styles from './marketplace-styles';

/**
 * Proposes that the Treasury buys an escrowed secondary listing. The purchase
 * pulls payment from the Treasury inside the Marketplace, so the proposal needs
 * an `authorize` action (the exact SAC transfers) right before `buy`. The tree is
 * validated by simulating Treasury.check_authorization before it is drafted.
 */
export function TreasuryPurchase({
  daoId,
  enabled,
  proposal
}: {
  daoId: string;
  enabled: boolean;
  proposal: ReturnType<typeof useAdminProposalDraft>;
}) {
  const { daoConfig: config } = useDaoContext();
  const [tokenId, setTokenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function prepare() {
    setMessage('');
    if (!enabled || busy) return;
    if (!/^\d+$/.test(tokenId)) return setMessage('Enter the listed token id.');
    setBusy(true);
    try {
      const options = {
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: readSource(config.launchAdmin),
        allowHttp: config.rpcUrl.startsWith('http://')
      };
      const marketplace = new MarketplaceClient({ ...options, contractId: config.marketplaceContractId });
      const listing = (await marketplace.get_listing({ token_id: Number(tokenId) })).result;
      if (!listing) throw new Error(`Token #${tokenId} has no open secondary listing.`);
      if (listing.expires_at <= BigInt(Math.floor(Date.now() / 1000)))
        throw new Error('This listing has expired and cannot be bought.');
      if (listing.seller === config.treasuryContractId) throw new Error('The Treasury cannot buy its own listing.');
      const price = BigInt(listing.price);
      const nodes = treasuryPurchaseAuthNodes({
        treasury: config.treasuryContractId,
        paymentAsset: listing.payment_asset,
        seller: listing.seller,
        price,
        fee: marketplaceFee(price.toString(), listing.fee_bps)
      });
      const treasury = new TreasuryClient({ ...options, contractId: config.treasuryContractId });
      const checked = await treasury.check_authorization({
        nodes: nodes.map(authNodeSpecValue) as unknown as AuthNode[]
      });
      if (checked.result !== nodes.length) throw new Error('The Treasury rejected this authorization tree.');

      const context = { config, session: { address: null, kit: null } };
      const authorize = getActionHandler('treasury-authorize');
      const buy = getActionHandler('treasury-buy-listing');
      const amount = formatMarketplaceAmount(price);
      proposal.requestAddBatch({
        daoId,
        requests: [
          {
            daoId,
            action: authorize.serialize({ nodes }, context),
            source: 'Marketplace administration',
            metadata: {
              title: `Treasury buys listed token #${tokenId}`,
              description: `Authorize the Treasury payment, then buy token #${tokenId} for at most ${amount} (listing price). Authorized calls: ${describeAuthNodes(nodes).join('; ')}. The purchase fails if the price rises or the listing closes before execution.`,
              url: ''
            }
          },
          {
            daoId,
            action: buy.serialize({ tokenId, maxPrice: price.toString() }, context),
            source: 'Marketplace administration',
            metadata: { title: `Treasury buys listed token #${tokenId}`, description: '', url: '' }
          }
        ]
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to prepare the Treasury purchase.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.stack}>
        <h2>Propose a Treasury purchase</h2>
        <p>
          The Treasury can buy an escrowed secondary listing through governance. The proposal gets two actions: an
          authorization for exactly the listing&apos;s payment transfers, then the purchase at no more than the current
          price.
        </p>
        <label>
          Listed token ID
          <input
            inputMode="numeric"
            value={tokenId}
            placeholder="Token ID"
            onChange={(e) => setTokenId(e.target.value)}
          />
        </label>
        <button type="button" disabled={!enabled || busy} onClick={() => void prepare()}>
          {busy ? 'Checking listing…' : 'Add Treasury purchase to proposal'}
        </button>
        {message ? <p role="alert">{message}</p> : null}
      </div>
    </section>
  );
}
