'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Buffer } from 'buffer';
import { useDeferredValue, useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Field,
  FieldHelperText,
  FieldLabel,
  Input,
  SegmentedControl
} from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { claimListChange } from '@/lib/minter/allocation-proposal';
import { claimEntries, parseClaimCsv } from '@/lib/minter/claim-csv';
import { claimMinterClient } from '@/lib/minter/client';
import { sendAndConfirm, walletClientOptions } from '@/lib/minter/direct';
import { claimAmountLabel, claimAssetCode, formatClaimDate } from '@/lib/minter/display';
import { claimFetch } from '@/lib/minter/hooks';
import { type ClaimListDraft, validateClaimListDraft } from '@/lib/minter/proposal-actions';
import { buildClaimTree, type ClaimEntry, claimTreeJson, MAX_TREE_CLAIMS } from '@/lib/minter/tree';
import type { ClaimState } from '@/lib/minter/types';
import { useProposeChange } from '@/lib/proposal-changes/use-propose-change';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { uploadFile } from '@/lib/upload-image';
import { combineDuplicates, walletRowsCsv } from '@/lib/wallet-csv';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { ClaimCsvInput, type ClaimListSource } from './claim-csv-input';
import { ClaimListPreview } from './claim-list-preview';
import { ClaimPublishSteps, type StepState } from './claim-publish-steps';

const DAY = 86_400;
const form = css({ display: 'grid', gap: '5', '& h2': { textStyle: 'heading', m: '0' } });
const intro = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const terms = css({ m: '0', pl: '5', display: 'grid', gap: '1.5', textStyle: 'body', color: 'ink' });
const fields = css({
  display: 'grid',
  gap: '4',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  alignItems: 'start'
});
/** The Manager refuses a drive deadline further out than this (MAX_ASSURANCE_WINDOW). */
const MAX_DRIVE_DAYS = 90;

function wholeDays(value: string, max: number, label: string) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > max) throw new Error(`${label} must be 1 to ${max} days.`);
  return days;
}

/** How this list opens: the launch admin directly in Setup (free, or a launch drive), or a proposal once Live. */
type Mode = 'free' | 'drive' | 'proposal';
type Stage = 'tree' | 'ipfs' | 'open';
type Stages = Record<Stage, StepState>;
const IDLE: Stages = { tree: 'idle', ipfs: 'idle', open: 'idle' };
/** A list already on IPFS: a retry after a failed signature reuses it instead of uploading again. */
type Published = { root: string; list: number; treeUri: string; gatewayUrl: string };

/**
 * Prepare a claim list: read a CSV (or pasted rows), check every row, build the tree here,
 * publish the full list to IPFS, then open it.
 * - Setup, free: the launch admin grants the claims module an allowance and opens the list.
 * - Setup, launch drive: the launch admin opens it through the Manager, which hands every
 *   contract to the Treasury; the community launches once enough people claim.
 * - Live: the allowance grant and the list go into a proposal.
 */
export function ClaimListDraftForm({ state, onOpened }: { state?: ClaimState; onOpened: () => void }) {
  const { daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const address = session.authStatus === 'authenticated' ? session.address : null;
  const { propose } = useProposeChange();
  const tx = useTransactionFeedback(config.name);
  const launchAdmin = Boolean(state && address && !state.live && state.admin === address);
  const governed = Boolean(state?.live && state.admin === config.treasuryContractId);
  const [setupMode, setSetupMode] = useState<'free' | 'drive'>('free');
  const mode: Mode = governed ? 'proposal' : setupMode;
  const [text, setText] = useState('');
  const [source, setSource] = useState<ClaimListSource | null>(null);
  const [price, setPrice] = useState('0');
  const [days, setDays] = useState('30');
  const [threshold, setThreshold] = useState('');
  const [driveDays, setDriveDays] = useState('30');
  const [launchAuction, setLaunchAuction] = useState(Boolean(config.auctionContractId));
  const [launchMarketplace, setLaunchMarketplace] = useState(Boolean(config.marketplaceContractId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [stages, setStages] = useState<Stages | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [root, setRoot] = useState('');
  const [confirmDrive, setConfirmDrive] = useState<DriveSummary | null>(null);
  const deferredText = useDeferredValue(text);
  const parsed = useMemo(() => (deferredText.trim() ? parseClaimCsv(deferredText) : null), [deferredText]);
  const entries = parsed ? claimEntries(parsed) : null;
  const asset = state?.paymentAsset ?? '';
  // Once a drive opens, the Treasury holds every module and nothing else opens until launch.
  const driveOpen = Boolean(state && !state.live && state.lists.some((list) => list.assurance));
  const ready = Boolean(
    state?.claimsContractId &&
    state.claimsContractId === config.claimsContractId &&
    asset &&
    address &&
    !session.walletNetworkIssue &&
    (launchAdmin || governed)
  );

  function stage(id: Stage, value: StepState) {
    setStages((current) => ({ ...(current ?? IDLE), [id]: value }));
  }

  function changeList(next: string, nextSource: ClaimListSource | null) {
    setText(next);
    setSource(nextSource);
    setStages(null);
    setMessage('');
  }

  /** Build the tree, and publish it unless this exact list is already on IPFS. */
  async function publish(current: ClaimState, list: ClaimEntry[]): Promise<ClaimListDraft> {
    const priceUnits = mode === 'free' ? 0n : parseMarketplaceAmount(price.trim() || '0', true);
    const expiresAt = Math.floor(Date.now() / 1000) + wholeDays(days, 365, 'Claims stay open') * DAY;
    stage('tree', 'active');
    const tree = buildClaimTree(list, {
      network: config.passphrase,
      token: config.tokenContractId,
      list: current.nextListId
    });
    const draft: ClaimListDraft = {
      type: 'open-claim-list',
      root: tree.merkleRoot,
      treeUri: 'ipfs://pending',
      asset,
      price: priceUnits.toString(),
      expiresAt,
      total: Number(tree.tokenTotal)
    };
    validateClaimListDraft(draft);
    setRoot(tree.merkleRoot);
    stage('tree', 'done');
    stage('ipfs', 'active');
    let upload = published?.root === tree.merkleRoot && published.list === tree.list ? published : null;
    if (!upload) {
      const file = new File([claimTreeJson(tree)], `claim-list-${tree.list}.json`, { type: 'application/json' });
      const { ipfsUri, gatewayUrl } = await uploadFile(file, 'claim-list');
      upload = { root: tree.merkleRoot, list: tree.list, treeUri: ipfsUri, gatewayUrl };
      setPublished(upload);
    }
    stage('ipfs', 'done');
    return { ...draft, treeUri: upload.treeUri };
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

  /** Check the drive's terms here, before anything is published, so the confirm can say exactly what opens. */
  function reviewDrive() {
    setMessage('');
    try {
      if (!entries) throw new Error('Fix the list first.');
      const people = entries.length;
      const needed = Number(threshold);
      if (!Number.isInteger(needed) || needed < 1) throw new Error('Say how many people must claim before launch.');
      if (needed > people)
        throw new Error(
          `The list has ${people} ${people === 1 ? 'person' : 'people'}, so at most ${people} can claim.`
        );
      const priceUnits = parseMarketplaceAmount(price.trim() || '0', true);
      const now = Math.floor(Date.now() / 1000);
      const closes = now + wholeDays(days, 365, 'Claims stay open') * DAY;
      const deadline = now + wholeDays(driveDays, MAX_DRIVE_DAYS, 'The drive') * DAY;
      if (deadline > closes) throw new Error('Claims must stay open at least until the drive ends.');
      setConfirmDrive({ people, needed, tokens: parsed!.total, price: priceUnits, deadline });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the list and the drive terms.');
    }
  }

  async function submit() {
    if (!ready || !state || !entries || busy) return;
    setBusy(true);
    setMessage('');
    setStages(IDLE);
    let at: Stage = 'tree';
    try {
      const fresh = await claimFetch<ClaimState>(`/api/dao/${encodeURIComponent(config.tokenContractId)}/claims`);
      if (
        fresh.deploymentId !== DEPLOYMENT_ID ||
        fresh.address !== address ||
        fresh.claimsContractId !== state.claimsContractId ||
        fresh.live !== state.live ||
        fresh.admin !== state.admin
      )
        throw new Error('The tribe or your account changed. Refresh and try again.');
      const draft = await publish(fresh, entries);
      at = 'open';
      stage('open', 'active');
      if (mode === 'proposal') {
        const result = propose(claimListChange(draft, fresh, config, DEPLOYMENT_ID, entries.length), {
          onAdded: () => stage('open', 'done')
        });
        if (result.outcome === 'invalid') throw new Error(result.message);
        return;
      }
      if (mode === 'free') await openFree(draft, fresh.claimsContractId!);
      else await openDrive(draft);
      stage('open', 'done');
      changeList('', null);
      setPublished(null);
      onOpened();
    } catch (error) {
      setStages((current) => {
        const base = current ?? IDLE;
        const failedAt: Stage = base.ipfs === 'active' ? 'ipfs' : base.tree === 'active' ? 'tree' : at;
        return { ...base, [failedAt]: 'error' };
      });
      tx.fail(error, 'The claim list was not opened', mode === 'drive' ? 'manager' : 'minter');
      setMessage(error instanceof Error ? error.message : 'The claim list was not opened.');
    } finally {
      setBusy(false);
    }
  }

  if (driveOpen)
    return (
      <div className={form}>
        <h2>Open a claim list</h2>
        <p className={intro}>
          The launch drive is open, so no other list can open now. Once the tribe launches, new lists go through a
          proposal.
        </p>
      </div>
    );

  const priced = mode !== 'free';
  const code = asset ? claimAssetCode(config.name, asset) : null;
  const rows = parsed ? parsed.rows.length + parsed.problems.filter((problem) => problem.line).length : 0;
  const openLabel =
    mode === 'proposal'
      ? 'Add it to your proposal draft'
      : mode === 'drive'
        ? 'Sign to open the launch drive'
        : 'Sign twice: let the claims module mint, then open the list';

  return (
    <div className={form}>
      <div className={css({ display: 'grid', gap: '2' })}>
        <h2>Open a claim list</h2>
        <p className={intro}>
          {mode === 'free'
            ? 'Listed wallets claim their tokens for free, before and after launch.'
            : mode === 'drive'
              ? 'People claim, and pay the price if there is one, while the tribe is still in setup. Once enough of them have claimed, anyone can launch it. If the drive ends first, everyone can take their payment back.'
              : 'Listed wallets claim their tokens themselves, paying the price if there is one. The list goes into a proposal members vote on.'}{' '}
          Up to {MAX_TREE_CLAIMS.toLocaleString()} wallets. The full list is published to IPFS so anyone can check it.
        </p>
      </div>
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
      {mode === 'drive' ? (
        <Callout
          variant="warning"
          title="Opening a drive hands the tribe to its Treasury now"
          description="Add your artwork and mint founder tokens first: after this you can't change settings, artwork, founder tokens or modules. The tribe launches once enough people claim, with the launch choices below, or it never launches and everyone who paid can take it back."
        />
      ) : null}

      <ClaimCsvInput text={text} source={source} rows={rows} disabled={busy} onChange={changeList} />
      {parsed ? (
        <ClaimListPreview
          parsed={parsed}
          disabled={busy}
          onCombine={() => changeList(walletRowsCsv(combineDuplicates(parsed.rows)), source)}
        />
      ) : null}

      <div className={fields}>
        {priced ? (
          <Field>
            <FieldLabel htmlFor="claim-list-price">Price per token</FieldLabel>
            <Input
              id="claim-list-price"
              inputMode="decimal"
              value={price}
              disabled={busy}
              onChange={(event) => setPrice(event.target.value.trim())}
            />
            <FieldHelperText>
              In {code ?? 'the tribe payment asset'}, up to 7 decimal places. 0 makes it free.
            </FieldHelperText>
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
          <FieldHelperText>1 to 365 days.</FieldHelperText>
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
          </>
        ) : null}
      </div>
      {mode === 'drive' && (config.auctionContractId || config.marketplaceContractId) ? (
        <div className={css({ display: 'grid', gap: '2' })}>
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
        </div>
      ) : null}

      {!ready ? (
        <p className={intro}>
          {state?.live
            ? 'Connect and sign in with a wallet to draft a proposal. The Treasury must be the tribe admin.'
            : 'Connect and sign in with the launch admin wallet to open a list.'}
        </p>
      ) : null}
      <div>
        <Button
          disabled={!ready || !entries}
          loading={busy}
          onClick={() => (mode === 'drive' ? reviewDrive() : void submit())}
        >
          {mode === 'proposal'
            ? 'Publish the list and add to proposal'
            : mode === 'drive'
              ? 'Review the launch drive'
              : 'Publish the list and open it'}
        </Button>
      </div>
      {stages ? (
        <ClaimPublishSteps
          steps={[
            {
              id: 'tree',
              label: 'Build the claim tree',
              state: stages.tree,
              detail: stages.tree === 'done' && root ? `Root ${root.slice(0, 8)}…${root.slice(-8)}` : undefined
            },
            {
              id: 'ipfs',
              label: 'Publish the full list to IPFS',
              state: stages.ipfs,
              detail:
                stages.ipfs === 'done' && published ? (
                  <a href={published.gatewayUrl} target="_blank" rel="noreferrer">
                    See the published list ↗
                  </a>
                ) : undefined
            },
            { id: 'open', label: openLabel, state: stages.open }
          ]}
        />
      ) : null}
      {message ? (
        <p role="status" aria-live="polite" className={intro}>
          {message}
        </p>
      ) : null}
      <Dialog
        open={Boolean(confirmDrive)}
        onOpenChange={(open) => (open ? null : setConfirmDrive(null))}
        role="alertdialog"
        title="Open the launch drive?"
        description="This can't be undone. You won't be able to change anything about the tribe after you sign."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDrive(null)}>
              Not yet
            </Button>
            <Button
              onClick={() => {
                setConfirmDrive(null);
                void submit();
              }}
            >
              Publish and open the drive
            </Button>
          </>
        }
      >
        {confirmDrive ? (
          <ul className={terms}>
            <li>
              {confirmDrive.people.toLocaleString()} {confirmDrive.people === 1 ? 'person' : 'people'} can claim{' '}
              {confirmDrive.tokens.toLocaleString()} {confirmDrive.tokens === 1n ? 'token' : 'tokens'},{' '}
              {confirmDrive.price === 0n
                ? 'for free'
                : `paying ${claimAmountLabel(config.name, asset, confirmDrive.price)} per token`}
              .
            </li>
            <li>
              The tribe launches once {confirmDrive.needed.toLocaleString()} of them claim, by{' '}
              {formatClaimDate(confirmDrive.deadline)}
              {launchAuction || launchMarketplace
                ? `, and then ${[launchAuction ? 'auctions start' : null, launchMarketplace ? 'the market opens' : null].filter(Boolean).join(' and ')}`
                : ''}
              .
            </li>
            <li>
              If that many don&apos;t claim in time, it never launches
              {confirmDrive.price === 0n ? '.' : ' and everyone who paid can take their payment back.'}
            </li>
            <li>The tribe, its settings and its modules pass to its Treasury now. You sign one transaction.</li>
          </ul>
        ) : null}
      </Dialog>
    </div>
  );
}

type DriveSummary = { people: number; needed: number; tokens: bigint; price: bigint; deadline: number };
