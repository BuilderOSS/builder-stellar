'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Buffer } from 'buffer';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import {
  Button,
  Callout,
  Checkbox,
  Field,
  FieldHelperText,
  FieldLabel,
  Input,
  SegmentedControl,
  Textarea
} from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { claimListQueueActions } from '@/lib/minter/allocation-proposal';
import { claimMinterClient } from '@/lib/minter/client';
import { sendAndConfirm, walletClientOptions } from '@/lib/minter/direct';
import { claimAssetCode } from '@/lib/minter/display';
import { claimFetch } from '@/lib/minter/hooks';
import { type ClaimListDraft, validateClaimListDraft } from '@/lib/minter/proposal-actions';
import { buildClaimTree, type ClaimEntry, claimTreeJson, MAX_TREE_CLAIMS } from '@/lib/minter/tree';
import type { ClaimState } from '@/lib/minter/types';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { uploadFile } from '@/lib/upload-image';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './claims-styles';

const DAY = 86_400;
/** The Manager refuses a drive deadline further out than this (MAX_ASSURANCE_WINDOW). */
const MAX_DRIVE_DAYS = 90;

/** One recipient per line: an address and a whole-token amount, separated by a comma, space or tab. */
export function parseAllocationLines(text: string): ClaimEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      const parts = line.split(/[\s,;]+/).filter(Boolean);
      if (parts.length !== 2) throw new Error(`Line ${index + 1}: use an address and an amount.`);
      return { address: parts[0]!, amount: parts[1]! };
    });
}

function wholeDays(value: string, max: number, label: string) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > max) throw new Error(`${label} must be 1 to ${max} days.`);
  return days;
}

/** How this list opens: the launch admin directly in Setup (free, or a launch drive), or a proposal once Live. */
type Mode = 'free' | 'drive' | 'proposal';

/**
 * Prepare a claim list: build the tree here, publish the full list to IPFS, then open it.
 * - Setup, free: the launch admin grants the claims module an allowance and opens the list.
 * - Setup, launch drive: the launch admin opens it through the Manager, which hands every
 *   contract to the Treasury; the community launches once enough people claim.
 * - Live: the allowance grant and the list go into a proposal.
 */
export function ClaimListDraftForm({ state, onOpened }: { state?: ClaimState; onOpened: () => void }) {
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const proposal = useAdminProposalDraft();
  const tx = useTransactionFeedback(config.name);
  const launchAdmin = Boolean(state && address && !state.live && state.admin === address);
  const governed = Boolean(state?.live && state.admin === config.treasuryContractId);
  const [setupMode, setSetupMode] = useState<'free' | 'drive'>('free');
  const mode: Mode = governed ? 'proposal' : setupMode;
  const [text, setText] = useState('');
  const [price, setPrice] = useState('0');
  const [days, setDays] = useState('30');
  const [threshold, setThreshold] = useState('');
  const [driveDays, setDriveDays] = useState('30');
  const [launchAuction, setLaunchAuction] = useState(Boolean(config.auctionContractId));
  const [launchMarketplace, setLaunchMarketplace] = useState(Boolean(config.marketplaceContractId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const asset = state?.paymentAsset ?? '';
  const ready = Boolean(
    state?.claimsContractId &&
    state.claimsContractId === config.claimsContractId &&
    asset &&
    address &&
    !session.walletNetworkIssue &&
    (launchAdmin || governed)
  );

  /** Build and publish the tree, then return the list as a draft. */
  async function publish(current: ClaimState): Promise<ClaimListDraft> {
    const entries = parseAllocationLines(text);
    if (!entries.length) throw new Error('Add at least one person.');
    const priceUnits = mode === 'free' ? 0n : parseMarketplaceAmount(price.trim() || '0', true);
    const expiresAt = Math.floor(Date.now() / 1000) + wholeDays(days, 365, 'Claims stay open') * DAY;
    const tree = buildClaimTree(entries, {
      network: config.passphrase,
      token: config.tokenContractId,
      list: current.nextListId
    });
    const total = Number(tree.tokenTotal);
    const draft: ClaimListDraft = {
      type: 'open-claim-list',
      root: tree.merkleRoot,
      treeUri: 'ipfs://pending',
      asset,
      price: priceUnits.toString(),
      expiresAt,
      total
    };
    validateClaimListDraft(draft);
    setMessage(`Publishing the claim list (${entries.length} people, ${tree.tokenTotal} tokens)…`);
    const file = new File([claimTreeJson(tree)], `claim-list-${tree.list}.json`, { type: 'application/json' });
    const { ipfsUri } = await uploadFile(file, 'claim-list');
    return { ...draft, treeUri: ipfsUri };
  }

  async function openFree(draft: ClaimListDraft, claims: string) {
    const token = new TokenClient(walletClientOptions(config, address!, config.tokenContractId));
    const minter = claimMinterClient(walletClientOptions(config, address!, claims));
    tx.start('Let the claims module mint');
    await sendAndConfirm(await token.increase_mint_allowance({ module: claims, amount: draft.total }), config.rpcUrl);
    tx.start('Open the claim list');
    const hash = await sendAndConfirm(
      await minter.open_list({
        root: Buffer.from(draft.root, 'hex'),
        tree_uri: draft.treeUri,
        asset: draft.asset,
        price: 0n,
        expires_at: BigInt(draft.expiresAt),
        total: draft.total,
        assurance: null
      }),
      config.rpcUrl
    );
    tx.success('Claim list open', hash);
  }

  async function openDrive(draft: ClaimListDraft) {
    const needed = Number(threshold);
    if (!Number.isInteger(needed) || needed < 1) throw new Error('Say how many people must claim before launch.');
    const deadline = Math.floor(Date.now() / 1000) + wholeDays(driveDays, MAX_DRIVE_DAYS, 'The drive') * DAY;
    if (deadline > draft.expiresAt) throw new Error('Claims must stay open at least until the drive ends.');
    const manager = new ManagerClient(walletClientOptions(config, address!, getDeploymentConfig().managerAddress));
    tx.start('Open the launch drive');
    const hash = await sendAndConfirm(
      await manager.open_assurance({
        token_address: config.tokenContractId,
        list: {
          root: Buffer.from(draft.root, 'hex'),
          tree_uri: draft.treeUri,
          price: BigInt(draft.price),
          expires_at: BigInt(draft.expiresAt),
          total: draft.total,
          threshold_claimers: needed,
          deadline: BigInt(deadline)
        },
        launch_config: { launch_auction: launchAuction, launch_marketplace: launchMarketplace }
      }),
      config.rpcUrl
    );
    tx.success('Launch drive open', hash);
  }

  async function submit() {
    if (!ready || !state || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const fresh = await claimFetch<ClaimState>(`/api/dao/${encodeURIComponent(config.tokenContractId)}/claims`);
      if (
        fresh.deploymentId !== DEPLOYMENT_ID ||
        fresh.address !== address ||
        fresh.claimsContractId !== state.claimsContractId ||
        fresh.live !== state.live ||
        fresh.admin !== state.admin
      )
        throw new Error('The community or your account changed. Refresh and try again.');
      const draft = await publish(fresh);
      if (mode === 'proposal') {
        const actions = claimListQueueActions(draft, fresh, config, DEPLOYMENT_ID);
        const title = `Open a claim list for ${draft.total} tokens`;
        proposal.requestAddBatch({
          daoId,
          requests: actions.map((action) => ({
            daoId,
            action,
            source: 'claims/lists',
            metadata: {
              title,
              description:
                'Lets the claims module mint the list total, then opens the list. The full list is published so anyone can check who can claim and how much.',
              url: ''
            }
          })),
          onAdded: () => setMessage(`${title}: added to the proposal draft.`)
        });
        return;
      }
      if (mode === 'free') await openFree(draft, fresh.claimsContractId!);
      else await openDrive(draft);
      setText('');
      setMessage('');
      onOpened();
    } catch (error) {
      tx.fail(error, 'The claim list was not opened', mode === 'drive' ? 'manager' : 'minter');
      setMessage(error instanceof Error ? error.message : 'The claim list was not opened.');
    } finally {
      setBusy(false);
    }
  }

  const priced = mode !== 'free';
  const code = asset ? claimAssetCode(config.name, asset) : null;
  const priceHint = `Per token, in ${code ?? 'the community payment asset'}, up to 7 decimal places. Use 0 for a free list.`;

  return (
    <div className={styles.review}>
      <h2>Open a claim list</h2>
      {!state?.live ? (
        <SegmentedControl
          label="List type"
          value={setupMode}
          onValueChange={(value) => {
            setSetupMode(value as 'free' | 'drive');
            setMessage('');
          }}
          options={[
            { value: 'free', label: 'Free list' },
            { value: 'drive', label: 'Launch drive' }
          ]}
        />
      ) : null}
      <p>
        {mode === 'free'
          ? 'Listed people claim their tokens for free before and after launch. You sign two transactions: one lets the claims module mint the list total, one opens the list.'
          : mode === 'drive'
            ? 'People claim, and pay the price if there is one, while the community is still in setup. Once enough of them have claimed, anyone can launch it. If the drive ends first, everyone can take their payment back.'
            : 'Listed people claim their tokens themselves, paying the price if there is one. Nothing is signed here: the list goes into a proposal members vote on.'}{' '}
        Up to {MAX_TREE_CLAIMS.toLocaleString()} people. The full list is published to IPFS so anyone can check it.
      </p>
      {mode === 'drive' ? (
        <Callout
          variant="warning"
          title="Opening a drive hands the community to its Treasury now"
          description="You can't change settings, artwork or modules after this. The community launches once enough people claim, with the launch choices below, or it never launches and refunds everyone."
        />
      ) : null}
      <Field>
        <FieldLabel htmlFor="claim-list-recipients">People</FieldLabel>
        <Textarea
          id="claim-list-recipients"
          className={css({ textStyle: 'mono', fontSize: '0.8125rem' })}
          rows={8}
          value={text}
          disabled={busy}
          placeholder={'GABC… 5\nGDEF… 2'}
          onChange={(event) => setText(event.target.value)}
        />
        <FieldHelperText>One per line: a Stellar address and how many tokens it can claim.</FieldHelperText>
      </Field>
      {priced ? (
        <Field>
          <FieldLabel htmlFor="claim-list-price">Price</FieldLabel>
          <Input
            id="claim-list-price"
            inputMode="decimal"
            value={price}
            disabled={busy}
            onChange={(event) => setPrice(event.target.value.trim())}
          />
          <FieldHelperText>{priceHint}</FieldHelperText>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="claim-list-days">Claims stay open for (days)</FieldLabel>
        <Input
          id="claim-list-days"
          inputMode="numeric"
          value={days}
          disabled={busy}
          onChange={(event) => setDays(event.target.value.trim())}
        />
      </Field>
      {mode === 'drive' ? (
        <>
          <Field>
            <FieldLabel htmlFor="claim-drive-threshold">People who must claim before launch</FieldLabel>
            <Input
              id="claim-drive-threshold"
              inputMode="numeric"
              value={threshold}
              disabled={busy}
              onChange={(event) => setThreshold(event.target.value.trim())}
            />
            <FieldHelperText>Each person counts once, however many tokens they claim.</FieldHelperText>
          </Field>
          <Field>
            <FieldLabel htmlFor="claim-drive-days">The drive ends after (days)</FieldLabel>
            <Input
              id="claim-drive-days"
              inputMode="numeric"
              value={driveDays}
              disabled={busy}
              onChange={(event) => setDriveDays(event.target.value.trim())}
            />
            <FieldHelperText>At most {MAX_DRIVE_DAYS} days, and no later than claims close.</FieldHelperText>
          </Field>
          {config.auctionContractId ? (
            <Checkbox
              label="Start the auction at launch"
              checked={launchAuction}
              disabled={busy}
              onCheckedChange={setLaunchAuction}
            />
          ) : null}
          {config.marketplaceContractId ? (
            <Checkbox
              label="Open the marketplace at launch"
              checked={launchMarketplace}
              disabled={busy}
              onCheckedChange={setLaunchMarketplace}
            />
          ) : null}
        </>
      ) : null}
      {!ready ? (
        <p>
          {state?.live
            ? 'Connect a wallet to draft a proposal. The Treasury must be the community admin.'
            : 'Connect the launch admin wallet to open a list.'}
        </p>
      ) : null}
      <div>
        <Button disabled={!ready || !!proposal.pending} loading={busy} onClick={() => void submit()}>
          {mode === 'proposal'
            ? 'Publish the list and add to a proposal'
            : mode === 'drive'
              ? 'Publish the list and open the drive'
              : 'Publish the list and open it'}
        </Button>
      </div>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <AdminProposalDraftDialog pending={proposal.pending} onCancel={proposal.cancel} onResolve={proposal.resolve} />
    </div>
  );
}
