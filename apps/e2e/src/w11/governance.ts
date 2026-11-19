import type { APIRequestContext, Page } from '@playwright/test';

import { signedTransactions } from '../connect.ts';
import { expect } from '../fixtures.ts';
import { MIN_GOVERNANCE_STEP_S } from '../network.ts';
import { waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../waits.ts';
import type { E2ESigner } from '../wallet/signer.ts';

/**
 * The proposal steps W11 drives through the app: submit the draft an "Add to proposal" button
 * built, then vote, queue and execute from the proposal page. Every wait is on ledger time, the
 * read model or the page; nothing sleeps.
 */

export type ProposalDetail = {
  proposalId: string;
  proposalNumber: number;
  state: number;
  label: string;
  vote_start: number;
  vote_end: number;
  eta: number;
  for_votes: string;
};

export const proposalApi = (daoId: string, id: string) => `/api/dao/${daoId}/proposals/${id}`;

export function proposalIndexed(
  request: APIRequestContext,
  daoId: string,
  id: string,
  label: string,
  predicate: (body: ProposalDetail) => boolean = () => true
) {
  return waitForIndexed<ProposalDetail>(request, { label, path: proposalApi(daoId, id), predicate }, { governingS: 0 });
}

/**
 * A high-risk action (a mint allowance, a Treasury authorisation) asks before it joins the draft:
 * check it names `expect`, then add it. The toast confirms it landed.
 */
export async function confirmAddition(page: Page, expectText: RegExp) {
  const dialog = page.getByRole('dialog', { name: 'Add this to your proposal?' });
  await waitForVisible(dialog, 'add-to-proposal check');
  await expect(dialog).toContainText(expectText);
  await dialog.getByRole('button', { name: 'Add to proposal' }).click();
  await expect(dialog).toBeHidden();
  await waitForVisible(page.getByText('Added to your proposal', { exact: true }), 'added toast');
}

/**
 * From a page with the draft dock ("Your proposal draft"), open the composer, write the title and
 * the "What this does" description, review, submit and sign. Returns the proposal id (hex, as in its URL).
 */
export async function submitDraft(
  page: Page,
  wallet: E2ESigner,
  identity: string,
  { title, expectActions }: { title: string; expectActions: number }
) {
  const dock = page.getByRole('region', { name: 'Your proposal draft' });
  await waitForVisible(dock, 'draft dock with the new actions');
  await dock.getByRole('button', { name: 'Review proposal' }).click();
  await waitForVisible(page.getByLabel('Title (required)'), 'composer');
  await expect(page.getByRole('heading', { name: `In this proposal (${expectActions} actions)` })).toBeVisible();
  await page.getByLabel('Title (required)').fill(title);
  await page.getByRole('button', { name: 'Add “What this does” from the actions' }).click();
  await page.getByRole('button', { name: 'Next: review' }).first().click();

  const preview = page.getByRole('region', { name: 'Proposal preview' });
  await waitForVisible(preview, 'proposal review');
  await expect(preview.getByRole('heading', { name: title })).toBeVisible();
  await expect(preview.getByText('If it passes, these run in order')).toBeVisible();
  const before = signedTransactions(wallet, identity);
  await page.getByRole('button', { name: 'Submit proposal' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Submit this proposal?' });
  await waitForVisible(confirm, 'submit confirmation');
  await confirm.getByRole('button', { name: 'Submit proposal' }).click();

  // Once confirmed, the composer clears the draft and opens the proposal at /proposals/<id>.
  await waitForUi(
    'proposal confirmed and opened',
    (timeout) => expect(page).toHaveURL(/\/proposals\/(?!create\b)[0-9a-fA-F]+$/, { timeout }),
    { governingS: 60 }
  );
  expect(signedTransactions(wallet, identity) - before).toBe(1);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  return id;
}

export async function openProposal(page: Page, slug: string, id: string) {
  await page.goto(`/dao/${slug}/proposals/${id}`);
  await waitForVisible(page.getByRole('link', { name: 'All proposals' }), `proposal ${id} page`);
}

/** Wait for voting to open on chain and in the read model. */
export async function waitForVoting(request: APIRequestContext, daoId: string, id: string) {
  const detail = await proposalIndexed(request, daoId, id, `proposal ${id} indexed`, (b) => b.vote_start > 0);
  await waitForLedgerTime(detail.vote_start + 1, {
    governingS: MIN_GOVERNANCE_STEP_S,
    label: `proposal ${id} voting opens`
  });
  return proposalIndexed(request, daoId, id, `proposal ${id} active`, (b) => b.label === 'Active');
}

/** Cast every vote the signed-in member holds, For. */
export async function voteFor(page: Page, wallet: E2ESigner, identity: string, slug: string, id: string) {
  await openProposal(page, slug, id);
  const choices = page.getByRole('radiogroup', { name: 'Your vote' });
  await waitForVisible(choices, `vote choices on proposal ${id}`, { governingS: 30 });
  await choices.getByText('For', { exact: true }).click();
  const cast = page.getByRole('button', { name: /^Cast \d+ votes? For$/ });
  await expect(cast).toBeEnabled();
  const before = signedTransactions(wallet, identity);
  await cast.click();
  await waitForVisible(page.getByText('You voted For'), `vote on proposal ${id} confirmed and indexed`, {
    governingS: 120
  });
  expect(signedTransactions(wallet, identity) - before).toBe(1);
}

export async function waitForSucceeded(request: APIRequestContext, daoId: string, id: string) {
  const detail = await proposalIndexed(request, daoId, id, `proposal ${id} end`, (b) => b.vote_end > 0);
  await waitForLedgerTime(detail.vote_end + 1, {
    governingS: MIN_GOVERNANCE_STEP_S,
    label: `proposal ${id} voting closes`
  });
  return proposalIndexed(request, daoId, id, `proposal ${id} succeeded`, (b) => b.label === 'Succeeded');
}

export async function queue(page: Page, wallet: E2ESigner, identity: string, slug: string, id: string) {
  await openProposal(page, slug, id);
  const button = page.getByRole('button', { name: 'Queue for execution' });
  await waitForUi(`queue enabled on proposal ${id}`, (timeout) => expect(button).toBeEnabled({ timeout }), {
    governingS: 60
  });
  const before = signedTransactions(wallet, identity);
  await button.click();
  await waitForVisible(
    page.getByRole('button', { name: /^(Execute now|Waiting for the safety delay)$/ }),
    `proposal ${id} queued`,
    {
      governingS: 120
    }
  );
  expect(signedTransactions(wallet, identity) - before).toBe(1);
}

export async function waitForExecutable(request: APIRequestContext, daoId: string, id: string) {
  const detail = await proposalIndexed(request, daoId, id, `proposal ${id} queued`, (b) => b.eta > 0);
  await waitForLedgerTime(detail.eta + 1, { governingS: MIN_GOVERNANCE_STEP_S, label: `proposal ${id} eta` });
}

export async function execute(page: Page, wallet: E2ESigner, identity: string, slug: string, id: string) {
  await openProposal(page, slug, id);
  const button = page.getByRole('button', { name: 'Execute now' });
  await waitForUi(`execute enabled on proposal ${id}`, (timeout) => expect(button).toBeEnabled({ timeout }), {
    governingS: 60
  });
  const before = signedTransactions(wallet, identity);
  await button.click();
  await waitForVisible(page.getByRole('heading', { name: 'Executed' }).first(), `proposal ${id} executed`, {
    governingS: 120
  });
  expect(signedTransactions(wallet, identity) - before).toBe(1);
}
