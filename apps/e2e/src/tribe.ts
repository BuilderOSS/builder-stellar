import { expect, type Locator, type Page } from '@playwright/test';

import type { E2ESigner } from './wallet/signer.ts';
import { waitForIndexed, waitForUi, waitForVisible } from './waits.ts';

/**
 * Shared steps for the tribe walkthroughs (W03 create, W04 setup and launch, W05 launch drives).
 * Every tribe a walkthrough makes is named "E2E W03 …" with a slug starting `e2e-w03`, so they are
 * easy to tell apart on dev.tribes.build (docs/qa/WALKTHROUGHS.md, "The dev Manager").
 */

/** A short tag unique to this run, so launched slugs (claimed for good) never collide between runs. */
export function runTag(now = Date.now()) {
  return now.toString(36).slice(-6);
}

export const connectButton = (page: Page) => page.getByRole('button', { name: 'Connect wallet' }).first();
export const youButton = (page: Page) => page.getByRole('button', { name: /^You, connected as/ });

/** Connect the E2E Wallet through the real modal and sign in with SEP-53 (W01 covers the details). */
export async function signIn(page: Page, path = '/') {
  await page.goto(path);
  await waitForVisible(connectButton(page), 'Connect wallet in the top bar');
  await connectButton(page).click();
  const option = page.getByText('E2E Wallet', { exact: true });
  await waitForVisible(option, 'E2E Wallet listed in the wallet modal');
  await option.click();
  await waitForVisible(youButton(page), 'signed-in top bar');
}

export const MEMBERSHIP_TYPES = {
  auction: 'Daily auction',
  'auction-resale': 'Auction + resale',
  'fixed-price': 'Fixed-price sales',
  invite: 'Invite only'
} as const;
export type MembershipType = keyof typeof MEMBERSHIP_TYPES;

export const MEMBERSHIP_RULES = { open: 'Open membership', club: 'Members-only club' } as const;
export const VOTING_PACES = {
  'super-fast': 'Super fast',
  fast: 'Fast',
  balanced: 'Balanced',
  deliberate: 'Deliberate'
} as const;

/** Pick a card in a ChoiceGroup by its group label and option title. */
export async function choose(page: Page, group: string, option: string) {
  const radios = page.getByRole('radiogroup', { name: group });
  await radios.getByText(option, { exact: true }).click();
  await expect(radios.getByRole('radio', { name: new RegExp(`^${escapeRegExp(option)}`) })).toBeChecked();
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type TribeForm = {
  name: string;
  slug: string;
  type: MembershipType;
  rules?: keyof typeof MEMBERSHIP_RULES;
  pace?: keyof typeof VOTING_PACES;
};

/** The Create page's "Continue to …" button for the section that is open last. */
const continueButton = (page: Page) => page.getByRole('button', { name: /^Continue to / });

/** Fill Identity, Membership and Voting, and stop on Review (nothing is signed). */
export async function fillCreateForm(page: Page, form: TribeForm) {
  await page.goto('/create');
  await waitForVisible(page.getByRole('heading', { name: 'Build a tribe', level: 1 }), 'Create page');
  // Create reopens the latest draft; after a deploy that's the created one, so start another from Drafts.
  const nameField = page.getByLabel('Tribe name');
  const created = page.getByRole('region', { name: 'Creating your tribe' });
  await waitForUi('a draft opens', (timeout) => expect(nameField.or(created)).toBeVisible({ timeout }));
  if (await created.isVisible()) {
    await page.goto('/drafts');
    await page.getByRole('link', { name: 'Build another tribe' }).click();
  }
  await waitForVisible(nameField, 'Identity section');
  await expect(nameField).toHaveValue('');
  await page.getByLabel('Tribe name').fill(form.name);
  // The link follows the name until you type your own.
  await page.getByLabel('Link', { exact: true }).fill(form.slug);
  await expect(page.getByText(`/dao/${form.slug}`, { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Description' }).fill(`${form.name}: a walkthrough tribe on testnet.`);
  await continueButton(page).click();

  await waitForVisible(page.getByRole('heading', { name: 'Membership', exact: true }), 'Membership section');
  await choose(page, 'How do people join?', MEMBERSHIP_TYPES[form.type]);
  await choose(page, 'Who can hold a membership?', MEMBERSHIP_RULES[form.rules ?? 'open']);
  await continueButton(page).click();

  await waitForVisible(page.getByRole('heading', { name: 'Voting', exact: true }), 'Voting section');
  await choose(page, 'How fast should decisions happen?', VOTING_PACES[form.pace ?? 'super-fast']);
  await continueButton(page).click();

  await waitForVisible(page.getByRole('heading', { name: 'Review and create', exact: true }), 'Review section');
}

/** The Review section's summary row for a label. */
export function reviewRow(page: Page, label: string) {
  return page.locator('dl dt', { hasText: new RegExp(`^${escapeRegExp(label)}$`) }).locator('xpath=following-sibling::dd[1]');
}

const CONTRACT_ID = /C[A-Z2-7]{55}/;

/**
 * Create the filled-in tribe: one signature, then the app waits for the directory and opens the
 * tribe. Returns the tribe's id (its token contract). Polls the index past the app's own 30s wait,
 * so a slow indexer reads as `indexer-late`, not a UI failure.
 */
export async function createTribe(page: Page, wallet: E2ESigner): Promise<string> {
  const signedBefore = wallet.calls.filter((call) => call.method === 'signTransaction').length;
  await page.getByRole('button', { name: 'Create tribe' }).click();
  // Signed and confirmed: the page swaps the form for the deployment record.
  const created = page.getByRole('heading', { name: 'Created. Next, set it up' });
  await waitForVisible(created, 'creation confirmed', { governingS: 60 });
  expect(wallet.calls.filter((call) => call.method === 'signTransaction').length).toBe(signedBefore + 1);

  // The token address is in the deployment record's technical details.
  const daoId = await page.evaluate((pattern) => {
    for (let i = 0; i < localStorage.length; i++) {
      const value = localStorage.getItem(localStorage.key(i)!) ?? '';
      if (!value.includes('"drafts"')) continue;
      type Draft = { id?: string; deployment?: { addresses?: { token?: string } } };
      let state: { drafts?: Draft[]; activeDraftId?: string } | undefined;
      try {
        state = JSON.parse(value)?.state;
      } catch {
        continue;
      }
      // The draft just created is the active one; earlier tribes' drafts stay in the list.
      const active = state?.drafts?.find((draft) => draft.id === state?.activeDraftId);
      const token = active?.deployment?.addresses?.token;
      if (token && new RegExp(pattern).test(token)) return token;
    }
    return null;
  }, CONTRACT_ID.source);
  expect(daoId, 'the created tribe id in the saved draft').toMatch(CONTRACT_ID);

  await waitForIndexed<{ daoId: string; status: string }>(
    page.request,
    { label: 'new tribe in the directory', path: `/api/dao/${daoId}`, predicate: (body) => body.daoId === daoId },
    { governingS: 0 }
  );
  // The app opens the tribe once the directory has it; if its own wait ran out first, continue by hand.
  await waitForUi(
    'opens the new tribe',
    async (timeout) => {
      const opened = page.waitForURL(new RegExp(`/dao/${daoId}`), { timeout });
      const button = page.getByRole('button', { name: 'Continue to setup' });
      if (await button.isVisible().catch(() => false)) await button.click();
      await opened;
    },
    { governingS: 30 }
  );
  return daoId!;
}

/** Fill the form and create the tribe; returns its id. */
export async function createTribeThroughUi(page: Page, wallet: E2ESigner, form: TribeForm) {
  await fillCreateForm(page, form);
  return createTribe(page, wallet);
}

/** The setup page as its launch admin sees it. */
export async function openSetup(page: Page, daoId: string) {
  await page.goto(`/dao/${daoId}/setup`);
  await waitForVisible(page.getByRole('heading', { name: 'Set up and launch' }), 'setup page');
  await waitForVisible(page.getByRole('heading', { name: 'Required to launch' }), 'launch admin view');
}

/** A required step's row on the setup page. */
export function setupStep(page: Page, title: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: new RegExp(`^${escapeRegExp(title)} :`) }) });
}

/** Artwork from the starter collection: one batch, signed by the launch admin (no upload). */
export async function addStarterArtwork(page: Page, daoId: string) {
  await page.goto(`/dao/${daoId}/admin/artwork`);
  const starter = page.getByRole('button', { name: /^Use Tribe Builder Demo Collection/ });
  await waitForVisible(starter, 'starter collection');
  await starter.click();
  await page.getByRole('button', { name: 'Sign artwork batch 1' }).click();
  await waitForVisible(page.getByText('All planned artwork batches are confirmed.'), 'artwork confirmed', {
    governingS: 60
  });
}

/** Founder tokens: one row per recipient, review, then one signature. */
export async function mintFounders(page: Page, daoId: string, founders: { address: string; tokens: number }[]) {
  await page.goto(`/dao/${daoId}/admin/founders`);
  await waitForVisible(page.getByRole('heading', { name: 'Who gets founder tokens' }), 'founder form');
  for (const [index, founder] of founders.entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Add a founder' }).click();
    await page.getByRole('textbox', { name: `Founder ${index + 1} wallet address` }).fill(founder.address);
    await page.getByRole('textbox', { name: `Founder ${index + 1} tokens` }).fill(String(founder.tokens));
  }
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await waitForVisible(page.getByRole('heading', { name: 'Check before you sign' }), 'founder review');
  const total = founders.reduce((sum, founder) => sum + founder.tokens, 0);
  await page.getByRole('button', { name: `Sign and mint ${total} ${total === 1 ? 'token' : 'tokens'}` }).click();
  await waitForVisible(page.getByRole('main').getByText('Founder tokens minted'), 'founder mint confirmed', { governingS: 60 });
}

/** Launch from the setup page's Launch card and wait for the directory to show it live. */
export async function launchFromSetup(page: Page, daoId: string, name: string) {
  const launch = page.getByRole('button', { name: `Launch ${name}` });
  await waitForUi('launch enabled', (timeout) => expect(launch).toBeEnabled({ timeout }), { governingS: 30 });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: `Launch ${name}?` });
  await waitForVisible(dialog, 'launch confirm');
  await expect(dialog.getByText("This can't be undone.")).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign and launch' }).click();
  await waitForVisible(page.getByRole('heading', { name: `${name} is live` }), 'launch confirmed', { governingS: 60 });
  await waitForIndexed<{ status: string }>(
    page.request,
    { label: 'tribe live in the directory', path: `/api/dao/${daoId}`, predicate: (body) => body.status === 'operational' },
    { governingS: 0 }
  );
}

/** Click an Ark checkbox by its visible label (its hidden input can't take a click) and check the result. */
export async function setCheckbox(scope: Locator, name: RegExp, checked: boolean) {
  const box = scope.getByRole('checkbox', { name });
  if ((await box.isChecked()) !== checked) await scope.locator('label', { has: scope.page().getByRole('checkbox', { name }) }).click();
  if (checked) await expect(box).toBeChecked();
  else await expect(box).not.toBeChecked();
}

/** Sign out from the You sheet, switch the wallet's account, and sign in again as that account. */
export async function switchAccount(page: Page, wallet: E2ESigner, role: string, path = '/') {
  if (await youButton(page).isVisible().catch(() => false)) {
    await youButton(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
    await waitForVisible(connectButton(page), 'signed out');
  }
  wallet.use(role);
  await signIn(page, path);
}
