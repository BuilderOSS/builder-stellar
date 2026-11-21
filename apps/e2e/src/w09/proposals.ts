import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

import { signedTransactions, signInAs } from '../connect.ts';
import { E2E_ROOT } from '../run.ts';
import { latestLedger, waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../waits.ts';
import type { E2ESigner } from '../wallet/signer.ts';
import type { Tribe } from './fixture.ts';

/* ---------- Run state: resumable, shared by the tests of one run ---------- */

export type ProposalRecord = {
  id: string;
  title: string;
  actions: number;
  /** What the checks after execution compare against, read before the proposal was made. */
  before: Record<string, unknown>;
  voted?: boolean;
};

type RunState = { runId: string; proposals: Record<string, ProposalRecord>; notes: Record<string, unknown> };

const STATE_FILE = (spec: string) =>
  join(E2E_ROOT, '.state', `${process.env.E2E_TIMELINE?.trim() || 'default'}-${spec}.json`);

/**
 * The proposals this run made, in apps/e2e/.state (gitignored). A failed test restarts the worker,
 * so ids live in a file. A new run starts empty unless E2E_RESUME=1 picks up the last run's
 * proposals, so a failure late in a 20-minute timeline resumes instead of starting the clock again.
 */
export function runState(spec: string): RunState {
  const runId = process.env.E2E_RUN_ID ?? 'local';
  const file = STATE_FILE(spec);
  const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as RunState) : null;
  if (saved && (saved.runId === runId || process.env.E2E_RESUME === '1')) return { ...saved, runId };
  return { runId, proposals: {}, notes: {} };
}

export function saveRunState(spec: string, update: (state: RunState) => void) {
  const state = runState(spec);
  update(state);
  mkdirSync(join(E2E_ROOT, '.state'), { recursive: true });
  writeFileSync(STATE_FILE(spec), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function proposalOf(spec: string, key: string): ProposalRecord {
  const record = runState(spec).proposals[key];
  if (!record) throw new Error(`No "${key}" proposal in this run: the test that proposes it failed or didn't run.`);
  return record;
}

/** A short tag for this run, so its titles and values can't be mistaken for an earlier run's. */
export function runTag() {
  const id = process.env.E2E_RUN_ID ?? new Date().toISOString();
  return id.replace(/[^0-9]/g, '').slice(2, 12);
}

/* ---------- The composer ---------- */

export const composerPath = (tribe: Tribe) => tribe.path('proposals/create');
const titleBox = (page: Page) => page.getByRole('textbox', { name: 'Title (required)' });
export const queueItems = (page: Page) =>
  page.getByRole('list', { name: 'Actions in this proposal' }).getByRole('listitem');

/** How many actions the draft holds, from "In this proposal (3 actions)" (a related pair nests in one row). */
export async function draftCount(page: Page) {
  const heading = page.getByRole('heading', { name: /^In this proposal/ });
  if (!(await heading.count())) return 0;
  const text = (await heading.first().textContent()) ?? '';
  return Number(/\((\d+) actions?\)/.exec(text)?.[1] ?? 0);
}
const addDialog = (page: Page) =>
  page.getByRole('dialog', { name: /^(Add this to your proposal\?|Replace the action already in your proposal\?)$/ });

export async function openComposer(page: Page, tribe: Tribe) {
  await page.goto(composerPath(tribe));
  await waitForVisible(titleBox(page), 'composer');
}

/**
 * After an Add to proposal press: the action joins the draft at once, or a confirmation asks first
 * ("Add this to your proposal?" for a high-risk action or a bundle, "Replace…?" when it changes the
 * same thing as one already in the draft). A bundle whose pause is already in the draft offers "Add
 * the new ones"; a second change of one setting is meant (on, then off), so keep both.
 */
export async function confirmAdd(page: Page, before?: number) {
  const dialog = addDialog(page);
  const start = before ?? (await draftCount(page));
  const added = page.getByText('Added to your proposal', { exact: true });
  // A confirmation, when there is one, comes first; give it a moment before trusting a toast that may
  // be left from the previous add.
  await expect
    .poll(async () => (await dialog.isVisible()) || (await draftCount(page)) > start, { timeout: 6_000 })
    .toBe(true)
    .catch(() => undefined);
  if (await dialog.isVisible()) {
    await dialog
      .getByRole('button', { name: /^(Keep both|Add the new ones|Add to proposal)$/ })
      .first()
      .click();
    await expect(dialog).toBeHidden();
  }
  if (before === undefined) await waitForVisible(added.first(), 'Added to your proposal');
}

/**
 * Add one action from the composer's picker: open it, choose `entry`, fill the form, Add to
 * proposal, and confirm. Returns once the draft holds `count` actions.
 */
export async function pickAction(
  page: Page,
  entry: RegExp,
  fill: (form: Locator) => Promise<void>,
  { advanced = false }: { advanced?: boolean } = {}
) {
  const before = await draftCount(page);
  await page.getByRole('button', { name: 'Add an action' }).click();
  const picker = page.getByRole('dialog', { name: 'Add an action' });
  await waitForVisible(picker, 'action picker');
  if (advanced) await picker.getByRole('button', { name: 'Advanced' }).click();
  const choice = picker.getByRole('button', { name: entry });
  await waitForUi(`${entry} offered and enabled`, (timeout) => expect(choice).toBeEnabled({ timeout }));
  await choice.click();
  const form = page.getByRole('dialog', { name: 'Set up the action' });
  await waitForVisible(form, `${entry} form`);
  await fill(form);
  await form.getByRole('button', { name: 'Add to proposal' }).click();
  await confirmAdd(page, before);
  // One action, or a bundle (a paused-auction change brings its pause and resume).
  await waitForUi(`${entry} added to the draft`, (timeout) =>
    expect.poll(() => draftCount(page), { timeout }).toBeGreaterThan(before)
  );
}

/** A duration form ("Days / Hours / Minutes / Seconds"): set whole minutes. */
export async function setMinutes(form: Locator, minutes: number) {
  for (const unit of ['Days', 'Hours', 'Seconds']) {
    const box = form.getByRole('spinbutton', { name: unit });
    if (await box.count()) await box.fill('0');
  }
  await form.getByRole('spinbutton', { name: 'Minutes' }).fill(String(minutes));
}

/** Title, why, review: the draft as it goes to the vote. */
export async function writeAndReview(page: Page, draft: { title: string; why: string; actions: number }) {
  await openComposerIfNeeded(page);
  await expect(
    page.getByRole('heading', { name: `In this proposal (${draft.actions} action${draft.actions === 1 ? '' : 's'})` })
  ).toBeVisible();
  await titleBox(page).fill(draft.title);
  await page.getByRole('textbox', { name: 'Why' }).fill(draft.why);
  await page.getByRole('button', { name: 'Next: review' }).filter({ visible: true }).first().click();
  const preview = page.getByRole('region', { name: 'Proposal preview' });
  await waitForVisible(preview, 'proposal review');
  await expect(preview.getByRole('heading', { name: draft.title })).toBeVisible();
  return preview;
}

async function openComposerIfNeeded(page: Page) {
  if (!/\/proposals\/create/.test(page.url())) {
    const url = new URL(page.url());
    const match = /^\/dao\/([^/]+)/.exec(url.pathname);
    await page.goto(`/dao/${match![1]}/proposals/create`);
  }
  await waitForVisible(titleBox(page), 'composer');
}

/** Submit the reviewed draft, sign once, and return the new proposal's id from the page it opens. */
export async function submitProposal(page: Page, wallet: E2ESigner, identity: string, actions: number) {
  const before = signedTransactions(wallet, identity);
  await page.getByRole('button', { name: 'Submit proposal' }).filter({ visible: true }).first().click();
  const confirm = page.getByRole('alertdialog', { name: 'Submit this proposal?' });
  await waitForVisible(confirm, 'submit confirmation');
  await expect(
    confirm.getByText(`It goes to a vote with ${actions === 1 ? 'one action' : `${actions} actions`}.`, {
      exact: false
    })
  ).toBeVisible();
  await confirm.getByRole('button', { name: 'Submit proposal' }).click();
  const sent = page.getByRole('heading', { name: 'Your proposal was sent' });
  await waitForUi(
    'proposal confirmed or waiting for confirmation',
    (timeout) =>
      expect
        .poll(async () => /\/proposals\/[0-9a-f]{64}$/.test(page.url()) || (await sent.isVisible()), { timeout })
        .toBe(true),
    { governingS: 120 }
  );
  for (let attempt = 0; attempt < 6 && (await sent.isVisible()); attempt++) {
    await page.getByRole('button', { name: 'Check again' }).click();
    await page.waitForTimeout(0);
    await expect(sent.or(page.getByRole('heading', { name: 'Opening your proposal' }))).toBeVisible();
  }
  await page.waitForURL(/\/proposals\/[0-9a-f]{64}$/, { timeout: 150_000 });
  expect(signedTransactions(wallet, identity) - before).toBe(1);
  return /\/proposals\/([0-9a-f]{64})$/.exec(page.url())![1]!;
}

/* ---------- The proposal page: vote, queue, execute ---------- */

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
const STATE_NAME = Object.fromEntries(Object.entries(ProposalState).map(([name, value]) => [value, name]));

export type ProposalBody = {
  proposalId: string;
  title: string;
  state: number | null;
  stateSource: string;
  vote_start: number;
  vote_end: number;
  eta: number;
  for_votes: string;
  targets: string[];
  functions: string[];
};

export async function proposalBody(page: Page, tribe: Tribe, id: string): Promise<ProposalBody | null> {
  const response = await page.request.get(tribe.api(`proposals/${id}`), { failOnStatusCode: false });
  if (!response.ok()) return null;
  return (await response.json()) as ProposalBody;
}

export function waitForProposalState(page: Page, tribe: Tribe, id: string, states: number[], governingS = 0) {
  return waitForIndexed<ProposalBody>(
    page.request,
    {
      label: `proposal ${id.slice(0, 8)} ${states.map((state) => STATE_NAME[state]).join(' or ')}`,
      path: tribe.api(`proposals/${id}`),
      predicate: (body) => body.stateSource === 'chain' && body.state !== null && states.includes(body.state)
    },
    { governingS }
  );
}

export const statusColumn = (page: Page) => page.getByRole('complementary', { name: 'Status and voting' });

export async function openProposal(page: Page, tribe: Tribe, id: string) {
  await page.goto(tribe.path(`proposals/${id}`));
  await waitForVisible(page.getByRole('heading', { level: 1, name: /^Proposal \d+: / }), 'proposal page');
}

/** A send from the status column: its toast, or the "waiting for confirmation" recovery and Check again. */
async function settleSend(page: Page, success: string, label: string) {
  const column = statusColumn(page);
  const toast = page.getByText(success, { exact: true });
  const unconfirmed = column.getByText('Waiting for confirmation…');
  await waitForUi(
    `${label}: confirmed or waiting for confirmation`,
    (timeout) => expect(toast.or(unconfirmed).first()).toBeVisible({ timeout }),
    { governingS: 90 }
  );
  for (let attempt = 0; attempt < 6 && (await unconfirmed.isVisible()); attempt++) {
    await column.getByRole('button', { name: 'Check again' }).click();
    await expect(unconfirmed.or(toast).first()).toBeVisible();
  }
}

export async function voteFor(page: Page, wallet: E2ESigner, identity: string, tribe: Tribe, id: string) {
  await openProposal(page, tribe, id);
  const column = statusColumn(page);
  const cast = column.getByRole('button', { name: /^Cast \d+ votes? For$/ });
  await column.getByRole('radio', { name: 'For' }).check({ force: true });
  await waitForUi('Cast … For enabled', (timeout) => expect(cast).toBeEnabled({ timeout }), { governingS: 60 });
  const before = signedTransactions(wallet, identity);
  await cast.click();
  await settleSend(page, 'Vote cast', `vote on ${id.slice(0, 8)}`);
  expect(signedTransactions(wallet, identity) - before).toBe(1);
}

export async function pressAndSettle(
  page: Page,
  wallet: E2ESigner,
  identity: string,
  tribe: Tribe,
  id: string,
  button: string,
  success: string
) {
  await openProposal(page, tribe, id);
  const press = statusColumn(page).getByRole('button', { name: button });
  await waitForUi(`${button} enabled`, (timeout) => expect(press).toBeEnabled({ timeout }), { governingS: 90 });
  const before = signedTransactions(wallet, identity);
  await press.click();
  await settleSend(page, success, `${button} on ${id.slice(0, 8)}`);
  expect(signedTransactions(wallet, identity) - before).toBe(1);
}

/**
 * Take every proposal to Executed through the proposal page, one member voting For, queueing and
 * executing. Waits overlap: on each pass every proposal whose next step is due gets it, then the
 * driver waits for the earliest ledger time any of them needs (voting opens, voting ends, the safety
 * delay ends). A proposal that is Defeated, Canceled or Expired fails the drive.
 */
export async function driveToExecuted(
  page: Page,
  wallet: E2ESigner,
  identity: string,
  tribe: Tribe,
  spec: string,
  keys: string[],
  log: (line: string) => void = () => undefined,
  /** Proposals that must run after others: key → the keys it waits for. */
  after: Record<string, string[]> = {}
) {
  await page.goto(tribe.path('proposals'));
  // A test that just proposed is signed in already.
  const you = page.getByRole('button', { name: /^You, connected as/ });
  await expect(you.or(page.getByRole('button', { name: 'Connect wallet' }).first())).toBeVisible();
  if (!(await you.isVisible())) await signInAs(page, wallet, identity);
  const left = new Set(keys);
  while (left.size) {
    let acted = false;
    const due: number[] = [];
    const { closeTime: now } = await latestLedger();
    for (const key of [...left]) {
      const record = proposalOf(spec, key);
      const body = await waitForProposalState(page, tribe, record.id, Object.values(ProposalState));
      switch (body.state) {
        case ProposalState.Pending:
          due.push(body.vote_start + 1);
          break;
        case ProposalState.Active:
          if (record.voted) due.push(body.vote_end + 1);
          else {
            await voteFor(page, wallet, identity, tribe, record.id);
            saveRunState(spec, (state) => {
              state.proposals[key]!.voted = true;
            });
            log(`${key}: voted For`);
            acted = true;
          }
          break;
        case ProposalState.Succeeded:
          await pressAndSettle(page, wallet, identity, tribe, record.id, 'Queue for execution', 'Proposal queued');
          log(`${key}: queued`);
          acted = true;
          break;
        case ProposalState.Queued:
          if ((after[key] ?? []).some((other) => left.has(other))) due.push(now + 15);
          else if (now >= body.eta) {
            await pressAndSettle(page, wallet, identity, tribe, record.id, 'Execute now', 'Proposal executed');
            await waitForProposalState(page, tribe, record.id, [ProposalState.Executed]);
            log(`${key}: executed`);
            left.delete(key);
            acted = true;
          } else due.push(body.eta + 1);
          break;
        case ProposalState.Executed:
          left.delete(key);
          break;
        default:
          throw new Error(
            `${key} (${record.id}) is ${STATE_NAME[body.state ?? -1] ?? body.state}, not on its way to Executed`
          );
      }
    }
    if (!acted && left.size && due.length) {
      const target = Math.min(...due);
      await waitForLedgerTime(target, {
        governingS: Math.max(60, target - now),
        label: `next proposal step (${[...left].join(', ')})`
      });
    }
  }
}
