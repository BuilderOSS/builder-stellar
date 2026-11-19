import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { APIRequestContext, Browser, BrowserContext, Locator, Page, TestInfo } from '@playwright/test';

import { E2E_SIGN_BINDING } from '../../web/src/lib/e2e-wallet/protocol.ts';
import { signedTransactions, signInAs } from './connect.ts';
import { clientAddress, expect, THEME_KEY, type Theme, WALLET_INTRO_KEY } from './fixtures.ts';
import { type Identity, timelineKeyName } from './identities.ts';
import { TESTNET_RPC_URL } from './network.ts';
import { HORIZON_TESTNET, REPO_ROOT } from './preflight.ts';
import { E2E_ROOT } from './run.ts';
import { waitForIndexed, waitForUi, waitForVisible } from './waits.ts';
import { E2ESigner, rpcAccountSequence } from './wallet/signer.ts';

/**
 * The W07/W08 fixture tribe, "E2E Proposals" (docs/qa/WALKTHROUGHS.md, "The W07 and W08 proposals
 * fixture"): no auction or market, governance at the contract minimums (300s each), quorum 50% of
 * 7 votes (4 For or Abstain), and a proposal threshold of 3. e2e-founder holds 3 votes and is the
 * only one who can propose; e2e-member-a and e2e-member-b hold 2 each. The treasury holds XLM for
 * the payments W07 executes. `E2E_PROPOSALS_DAO_ARTIFACT` points at another deploy artifact.
 */
const CONFIG = 'configs/e2e-walk-w07-dao.json';
const ARTIFACT = process.env.E2E_PROPOSALS_DAO_ARTIFACT?.trim() || 'deploys/dev-testnet-dao-7.json';
export const NATIVE_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

type DaoArtifact = {
  network: string;
  addresses: { token: string; treasury: string; governor: string; metadata: string };
  config: {
    slug: string;
    token: { name: string };
    governance: {
      quorumBps: number;
      proposalThreshold: number;
      votingDelay: number;
      votingPeriod: number;
      queueDelay: number;
    };
    founders: { address: string; amount: number }[];
  };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T;
}

export function loadProposalsFixture() {
  const artifact = readJson<DaoArtifact>(ARTIFACT);
  const config = readJson<{ slug: string }>(CONFIG);
  if (artifact.network !== 'testnet') throw new Error(`${ARTIFACT} is for ${artifact.network}, not testnet`);
  if (artifact.config.slug !== config.slug) throw new Error(`${ARTIFACT} was not deployed from ${CONFIG}`);
  const { governance, founders } = artifact.config;
  const supply = founders.reduce((sum, founder) => sum + founder.amount, 0);
  return {
    slug: artifact.config.slug,
    name: artifact.config.token.name,
    /** The tribe id is its token contract. */
    daoId: artifact.addresses.token,
    token: artifact.addresses.token,
    treasury: artifact.addresses.treasury,
    governor: artifact.addresses.governor,
    /** ceil(supply × quorumBps / 10 000): For plus Abstain votes a proposal needs. */
    quorum: Math.ceil((supply * governance.quorumBps) / 10_000),
    threshold: governance.proposalThreshold,
    votingDelayS: governance.votingDelay,
    votingPeriodS: governance.votingPeriod,
    queueDelayS: governance.queueDelay,
    votesOf: (address: string) => founders.find((founder) => founder.address === address)?.amount ?? 0
  };
}
export type ProposalsFixture = ReturnType<typeof loadProposalsFixture>;

/* ---------- The app's own API ---------- */

export type ProposalBody = {
  proposalId: string;
  proposalNumber: number;
  title: string;
  proposer: string;
  state: number | null;
  stateSource: 'chain' | 'indexed';
  label: string;
  vote_start: number;
  vote_end: number;
  eta: number;
  expiresAt: number | null;
  for_votes: string;
  against_votes: string;
  abstain_votes: string;
  quorumVotes: string | null;
  executionReceiptStatus: string;
  targets: string[];
  functions: string[];
};
export type ProposalListBody = {
  items: {
    proposalId: string;
    proposalNumber: number;
    stateLabel: string;
    timestamp: number;
    metadata: { title: string };
  }[];
};
export type VotesBody = { items: { voter: string; support: number; weight: string; reason: string }[] };

export const ProposalState = {
  Pending: 0,
  Active: 1,
  Defeated: 2,
  Canceled: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7
} as const;
const STATE_NAMES = Object.fromEntries(Object.entries(ProposalState).map(([name, value]) => [value, name]));

/** Wait until the app's proposal route reports one of `states` from the live chain read. */
export function waitForProposalState(
  request: APIRequestContext,
  fixture: ProposalsFixture,
  proposalId: string,
  states: number[],
  governingS = 0
) {
  return waitForIndexed<ProposalBody>(
    request,
    {
      label: `proposal ${proposalId.slice(0, 8)} ${states.map((state) => STATE_NAMES[state]).join(' or ')}`,
      path: `/api/dao/${fixture.daoId}/proposals/${proposalId}`,
      predicate: (body) => body.stateSource === 'chain' && body.state !== null && states.includes(body.state)
    },
    { governingS }
  );
}

/** Wait until the indexed votes on a proposal include every `voter`. */
export function waitForVotes(
  request: APIRequestContext,
  fixture: ProposalsFixture,
  proposalId: string,
  voters: string[]
) {
  return waitForIndexed<VotesBody>(
    request,
    {
      label: `${voters.length} votes indexed on ${proposalId.slice(0, 8)}`,
      path: `/api/dao/${fixture.daoId}/proposals/${proposalId}/votes`,
      predicate: (body) => voters.every((voter) => body.items.some((item) => item.voter === voter))
    },
    { governingS: 0 }
  );
}

/* ---------- Run state (resumable, shared by the tests of one run) ---------- */

export type ProposalKey = 'lifecycle' | 'cancel' | 'defeated' | 'quorum' | 'expiry';
type RunState = {
  runId: string;
  proposals: Partial<Record<ProposalKey, string>>;
  /** Values read before a step, for the effect checks after it. */
  before?: Record<string, string>;
};

const timeline = process.env.E2E_TIMELINE?.trim() || 'default';
const STATE_FILE = join(E2E_ROOT, '.state', `${timeline}-proposals.json`);

/**
 * The proposals this run created, in apps/e2e/.state (gitignored). Tests run one at a time but a
 * failure restarts the worker, so ids live in a file, not in memory. A new run starts empty, unless
 * E2E_RESUME=1 picks up the last run's proposals (a failed run resumes instead of restarting the
 * 15-minute clock, §3.3).
 */
export function runState(): RunState {
  const runId = process.env.E2E_RUN_ID ?? 'local';
  const saved = existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as RunState) : null;
  if (saved && (saved.runId === runId || process.env.E2E_RESUME === '1')) return { ...saved, runId };
  return { runId, proposals: {} };
}

export function saveRunState(update: (state: RunState) => void) {
  const state = runState();
  update(state);
  mkdirSync(join(E2E_ROOT, '.state'), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function proposalOf(key: ProposalKey) {
  const id = runState().proposals[key];
  if (!id) throw new Error(`No "${key}" proposal in this run: the test that proposes it failed or didn't run.`);
  return id;
}

/* ---------- Members, each in their own browser ---------- */

export type Member = { name: string; address: string; page: Page; wallet: E2ESigner; context: BrowserContext };

/**
 * A browser of its own for another member, with its own E2E Wallet signer, so members vote at the
 * same time like real people do. Each signer holds a single account, so two never sign for one.
 */
export async function openMember(
  browser: Browser,
  identity: Identity,
  testInfo: TestInfo,
  theme: Theme
): Promise<Member> {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, baseURL } = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
    colorScheme: theme
  });
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': clientAddress(testInfo.workerIndex, `${testInfo.testId}:${identity.name}`)
  });
  await context.addInitScript(
    ({ themeKey, theme, introKey }) => {
      try {
        window.localStorage.setItem(themeKey, theme);
        window.localStorage.setItem(introKey, 'seen');
      } catch {
        /* storage denied */
      }
    },
    { themeKey: THEME_KEY, theme, introKey: WALLET_INTRO_KEY }
  );
  const wallet = new E2ESigner([identity], { accountSequence: rpcAccountSequence(TESTNET_RPC_URL) });
  wallet.use(identity.name);
  await context.exposeBinding(E2E_SIGN_BINDING, (_source, request) => wallet.handle(request));
  const page = await context.newPage();
  return { name: identity.name, address: identity.address, page, wallet, context };
}

/** Open a page and sign in there (SEP-53). */
export async function signInOn(page: Page, wallet: E2ESigner, identity: string, path: string) {
  await page.goto(path);
  await signInAs(page, wallet, identity);
}

/* ---------- Pages ---------- */

export const proposalPath = (fixture: ProposalsFixture, proposalId: string) =>
  `/dao/${fixture.slug}/proposals/${proposalId}`;

export async function openProposal(page: Page, fixture: ProposalsFixture, proposalId: string) {
  await page.goto(proposalPath(fixture, proposalId));
  await waitForVisible(page.getByRole('heading', { level: 1, name: /^Proposal \d+: / }), 'proposal page', {
    governingS: 30
  });
}

/** The status and voting column. */
export const statusColumn = (page: Page) => page.getByRole('complementary', { name: 'Status and voting' });
export const lifecycleHeading = (page: Page) => statusColumn(page).locator('#proposal-lifecycle');
/** The state chip in the header ("Voting", "Passed", "Didn't pass"...). */
export const stateChip = (page: Page) => page.getByRole('main').locator('header').first();

/**
 * After a send, the page either confirms (a toast) or shows the "unconfirmed transaction" recovery
 * state when the network is slow. The recovery state is exercised only when it happens naturally:
 * "Check again" until it confirms, and the test is annotated.
 */
export async function settleSend(page: Page, success: string, label: string, scope: Locator = page.locator('body')) {
  const toast = page.getByText(success, { exact: true });
  const unconfirmed = scope.getByText('Waiting for confirmation…');
  await waitForUi(
    `${label}: confirmed or waiting for confirmation`,
    (timeout) => expect(toast.or(unconfirmed).first()).toBeVisible({ timeout }),
    { governingS: 90 }
  );
  if (await unconfirmed.isVisible()) {
    test_annotate('unconfirmed-recovery', `${label}: the confirmation timed out; recovered with Check again`);
    await expect(scope.getByText("was sent, but the network hasn't confirmed it yet", { exact: false })).toBeVisible();
    for (let attempt = 0; attempt < 6 && (await unconfirmed.isVisible()); attempt++) {
      await scope.getByRole('button', { name: 'Check again' }).click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect(unconfirmed.or(toast).first()).toBeVisible();
    }
  }
}

let annotate: ((type: string, description: string) => void) | null = null;
/** Set by the spec so helpers can annotate the running test. */
export function setAnnotator(fn: typeof annotate) {
  annotate = fn;
}
function test_annotate(type: string, description: string) {
  annotate?.(type, description);
}

/* ---------- The composer ---------- */

export type ComposeAction =
  | { kind: 'pay'; to: string; amount: string; summary: RegExp }
  | { kind: 'toggle'; setting: string; summary: RegExp };

const visibleButton = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name }).filter({ visible: true }).first();

/** Add one action through the picker sheet: choose, fill, Add to proposal, confirm. */
async function addAction(page: Page, action: ComposeAction, count: number) {
  await page.getByRole('button', { name: 'Add an action' }).click();
  const picker = page.getByRole('dialog', { name: 'Add an action' });
  await waitForVisible(picker, 'action picker');
  if (action.kind === 'pay') {
    await picker.getByRole('button', { name: /^Pay someone/ }).click();
    const form = page.getByRole('dialog', { name: 'Set up the action' });
    await form.getByLabel('Asset').selectOption({ label: 'XLM (Native)' });
    await waitForVisible(form.getByText('Treasury balance:'), 'treasury balance shown');
    await form.getByLabel('Recipient').fill(action.to);
    await form.getByLabel('Amount').fill(action.amount);
    await form.getByRole('button', { name: 'Add to proposal' }).click();
  } else {
    await picker.getByRole('button', { name: new RegExp(`^${action.setting}`) }).click();
    const form = page.getByRole('dialog', { name: 'Set up the action' });
    await waitForVisible(form.getByRole('heading', { name: action.setting }), `${action.setting} form`);
    await form.getByRole('button', { name: 'Add to proposal' }).click();
  }
  // High-risk actions ask once more before they join the draft.
  const confirm = page.getByRole('dialog', { name: 'Add this to your proposal?' });
  const queue = page.getByRole('list', { name: 'Actions in this proposal' }).getByRole('listitem');
  await waitForUi('action added or confirmation asked', (timeout) =>
    expect(confirm.or(queue.nth(count - 1))).toBeVisible({ timeout })
  );
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: 'Add to proposal' }).click();
  await expect(queue).toHaveCount(count);
  await expect(queue.nth(count - 1).getByText(action.summary)).toBeVisible();
}

/** Write a proposal in the composer up to its review, as the signed-in member. */
export async function composeProposal(
  page: Page,
  fixture: ProposalsFixture,
  draft: { title: string; why: string; actions: ComposeAction[] }
) {
  await page.goto(`/dao/${fixture.slug}/proposals/create`);
  await waitForVisible(page.getByRole('textbox', { name: 'Title (required)' }), 'composer');
  for (const [index, action] of draft.actions.entries()) await addAction(page, action, index + 1);
  await expect(
    page.getByRole('heading', {
      name: `In this proposal (${draft.actions.length} action${draft.actions.length === 1 ? '' : 's'})`
    })
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Title (required)' }).fill(draft.title);
  await page.getByRole('textbox', { name: 'Why' }).fill(draft.why);
  await visibleButton(page, 'Next: review').click();
  const preview = page.getByRole('region', { name: 'Proposal preview' });
  await waitForVisible(preview, 'proposal review');
  await expect(preview.getByRole('heading', { name: draft.title })).toBeVisible();
  await expect(
    preview.getByText(draft.actions.length === 1 ? 'If it passes, this runs' : 'If it passes, these run in order')
  ).toBeVisible();
  return preview;
}

/** Submit the reviewed draft, sign, and return the new proposal's id from the page it opens. */
export async function submitProposal(page: Page, wallet: E2ESigner, identity: string, actionCount: number) {
  const before = signedTransactions(wallet, identity);
  await page.getByRole('button', { name: 'Submit proposal' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Submit this proposal?' });
  await waitForVisible(confirm, 'submit confirmation');
  await expect(
    confirm.getByText(`It goes to a vote with ${actionCount === 1 ? 'one action' : `${actionCount} actions`}.`, {
      exact: false
    })
  ).toBeVisible();
  await confirm.getByRole('button', { name: 'Submit proposal' }).click();

  const sentHeading = page.getByRole('heading', { name: 'Your proposal was sent' });
  const opened = page.waitForURL(/\/proposals\/[0-9a-f]{64}$/, { timeout: 150_000 });
  await waitForUi(
    'proposal confirmed or waiting for confirmation',
    (timeout) =>
      expect
        .poll(async () => /\/proposals\/[0-9a-f]{64}$/.test(page.url()) || (await sentHeading.isVisible()), { timeout })
        .toBe(true),
    { governingS: 120 }
  );
  if (await sentHeading.isVisible()) {
    test_annotate('unconfirmed-recovery', 'propose: the confirmation timed out; recovered with Check again');
    await expect(page.getByText("Don't submit it again before you check", { exact: false })).toBeVisible();
    for (let attempt = 0; attempt < 6 && (await sentHeading.isVisible()); attempt++) {
      await page.getByRole('button', { name: 'Check again' }).click();
      await expect(sentHeading.or(page.getByRole('heading', { name: 'Opening your proposal' }))).toBeVisible();
    }
  }
  await opened;
  expect(signedTransactions(wallet, identity) - before).toBe(1);
  return /\/proposals\/([0-9a-f]{64})$/.exec(page.url())![1]!;
}

/* ---------- Voting, queueing, executing, cancelling ---------- */

export type Choice = 'For' | 'Against' | 'Abstain';

/** Vote on the open proposal page: choose, give a reason, cast, and see it land. */
export async function castVote(
  member: Member,
  fixture: ProposalsFixture,
  proposalId: string,
  choice: Choice,
  reason: string
) {
  const { page, wallet, name } = member;
  await openProposal(page, fixture, proposalId);
  const column = statusColumn(page);
  const votes = fixture.votesOf(member.address);
  await waitForVisible(
    column.getByText(`You have ${votes} ${votes === 1 ? 'vote' : 'votes'} on this proposal`),
    `${name}'s voting power`
  );
  await column.getByRole('radio', { name: choice }).check({ force: true });
  await column.getByRole('textbox', { name: 'Why? (optional)' }).fill(reason);
  const before = signedTransactions(wallet, name);
  await column.getByRole('button', { name: `Cast ${votes} ${votes === 1 ? 'vote' : 'votes'} ${choice}` }).click();
  await settleSend(page, 'Vote cast', `${name} votes ${choice}`, column);
  expect(signedTransactions(wallet, name) - before).toBe(1);
  // The indexed vote replaces the form with "You voted …" and the reason.
  await waitForUi(
    `${name}'s vote shown`,
    (timeout) => expect(column.getByText(`You voted ${choice}`)).toBeVisible({ timeout }),
    { governingS: 180 }
  );
  await expect(column.getByText(reason).first()).toBeVisible();
}

/** XLM balance of an account (G…) from Horizon, in stroops. */
export async function accountStroops(address: string): Promise<bigint> {
  const response = await fetch(`${HORIZON_TESTNET}/accounts/${address}`);
  if (!response.ok) throw new Error(`Horizon ${response.status} reading ${address}`);
  const account = (await response.json()) as { balances: { asset_type: string; balance: string }[] };
  return xlmStroops(account.balances.find((entry) => entry.asset_type === 'native')?.balance ?? '0');
}

/** "6.5" → 65000000n (XLM has 7 decimals). */
export function xlmStroops(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 10_000_000n + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}

/* ---------- Direct contract reads and the fixture's upkeep (never the flow under test) ---------- */

function invoke(contract: string, source: string, args: string[], send: 'yes' | 'no') {
  const out = execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      contract,
      '--source-account',
      source,
      '--network',
      'testnet',
      '--send',
      send,
      '--',
      ...args
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  return out ? (JSON.parse(out) as unknown) : null;
}

/** The treasury's native XLM (SAC balance), in stroops. */
export function treasuryStroops(fixture: ProposalsFixture) {
  return BigInt(
    invoke(NATIVE_SAC, timelineKeyName('e2e-operator'), ['balance', '--id', fixture.treasury], 'no') as string
  );
}

export function membersOnlyDelegation(fixture: ProposalsFixture) {
  return invoke(fixture.token, timelineKeyName('e2e-operator'), ['members_only_delegation'], 'no') as boolean;
}

/** Keep enough XLM in the treasury for W07's payments: top it up from the founder when low. */
export function topUpTreasury(fixture: ProposalsFixture, minStroops: bigint, topUpStroops: bigint) {
  const founderKey = timelineKeyName('e2e-founder');
  const balance = treasuryStroops(fixture);
  if (balance >= minStroops) return null;
  invoke(
    NATIVE_SAC,
    founderKey,
    ['transfer', '--from', founderKey, '--to', fixture.treasury, '--amount', String(topUpStroops)],
    'yes'
  );
  return `treasury topped up from ${balance} to ${treasuryStroops(fixture)} stroops`;
}
