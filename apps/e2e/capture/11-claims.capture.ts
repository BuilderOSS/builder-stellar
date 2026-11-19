import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { snap } from '../src/capture.ts';
import { createSetupTribe } from '../src/drive-fixture.ts';
import { expect, test } from '../src/fixtures.ts';
import { E2E_SITE_URL } from '../src/network.ts';
import { E2E_ROOT } from '../src/run.ts';
import { ART_DIR, FIXTURES, holdConfirmation, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import { signIn, switchAccount } from '../src/tribe.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: claims/create and claims/claim. Lamplight Workshop Guests, a sibling tribe of
 * docs/qa/SHOWCASE_TRIBE.md in Setup (scripts/deploy-dao.mjs through src/drive-fixture.ts, with the
 * Lamplight art), so its launch admin can open a free list. The founder loads a CSV that names
 * member-b twice, combines the rows and opens the list in the app; member-b then claims 5 tokens.
 * Timeline `showb` (`E2E_TIMELINE=showb pnpm capture capture/11-claims.capture.ts`); progress goes
 * to fixtures/showcase/claims-state.json.
 */
const STATE_FILE = join(FIXTURES, 'claims-state.json');
type ClaimsState = { daoId?: string; listOpen?: boolean; claimed?: boolean };
const claimsState = (): ClaimsState =>
  existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as ClaimsState) : {};
function saveClaims(update: (state: ClaimsState) => void) {
  const state = claimsState();
  update(state);
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

const GUESTS = {
  name: 'Lamplight Workshop Guests',
  symbol: 'GUEST',
  slug: 'lamplight-workshop-guests',
  description:
    'Lamplight Workshop Guests welcomes people who come to a Lamplight lantern workshop. Each guest on the list can claim their tokens for free.\n\nThis is an example tribe on Stellar testnet, used in the Tribe Builder guides.'
};
const LAMPLIGHT_IMAGE = 'ipfs://bafkreiftxmabzw6eod34qkvezhrhjlgqwjlr3fueq4bv2agsglx2lzltl4';
const listCard = (page: Page) => page.getByRole('region', { name: 'Claim list 1' });

/** Pin a claim tree file from this process; the app's signed upload URL refuses JSON (pinata-service.ts). */
async function pinJson(json: string, name: string) {
  if (!process.env.PINATA_JWT && existsSync(join(E2E_ROOT, '.env.local')))
    process.loadEnvFile(join(E2E_ROOT, '.env.local'));
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT is missing from apps/e2e/.env.local');
  const form = new FormData();
  form.append('file', new Blob([json], { type: 'application/json' }), 'claim-list.json');
  form.append('pinataMetadata', JSON.stringify({ name }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    body: form
  });
  const body = (await response.json()) as { IpfsHash?: string };
  if (!response.ok || typeof body.IpfsHash !== 'string')
    throw new Error(`Pinata refused the claim list (${response.status})`);
  return body.IpfsHash;
}

function lamplightArtwork() {
  const artCid = showcaseState().artCid as string | undefined;
  if (!artCid) throw new Error('Pin the artwork first: node apps/e2e/fixtures/showcase/pin-art.mjs');
  return {
    ipfs: { baseUri: `ipfs://${artCid}/`, extension: '.png' },
    properties: ['0-backdrop', '1-glow', '2-lantern', '3-flame', '4-detail'].map((name) => ({
      name,
      items: readdirSync(join(ART_DIR, name))
        .filter((file) => file.endsWith('.png'))
        .sort()
        .map((file) => file.replace(/\.png$/, ''))
    }))
  };
}

test('Lamplight Workshop Guests: open a free claim list, then claim from it', async ({ page, wallet }) => {
  test.skip(Boolean(claimsState().claimed), 'Done (claims-state.json).');
  const ids = showcaseIdentities();
  test.setTimeout(30 * 60_000);
  if (!claimsState().daoId) {
    const { daoId } = createSetupTribe({
      ...GUESTS,
      profile: {
        description: GUESTS.description,
        links: [{ label: 'Guides', url: 'https://docs.tribes.build' }],
        image: LAMPLIGHT_IMAGE
      },
      artwork: lamplightArtwork(),
      rendererBase: `${E2E_SITE_URL}/api/render`,
      founders: 1
    });
    console.info(`guests: ${daoId}`);
    saveClaims((state) => {
      state.daoId = daoId;
    });
  }
  const daoId = claimsState().daoId!;
  await waitForIndexed<{ daoId: string }>(
    page.request,
    { label: 'guests in the directory', path: `/api/dao/${daoId}`, predicate: (body) => body.daoId === daoId },
    { governingS: 0 }
  );

  if (!claimsState().listOpen) {
    await signIn(page, `/dao/${daoId}/admin/claims`);
    const listType = page.getByRole('radiogroup', { name: 'List type' });
    await waitForVisible(listType, 'claim list form', { governingS: 30 });
    const free = listType.getByRole('radio', { name: 'Free list' });
    await expect(free).toBeChecked();
    await snap(page, 'claims/create/01', {
      markers: [{ label: 'the Free list option', locator: free }],
      focus: page.getByRole('heading', { name: 'Open a claim list' })
    });

    // member-b on two rows (3 and 2), so the preview flags it; combined, member-b gets 5.
    const csv = `address,amount\n${ids['e2e-member-b']},3\n${ids['e2e-member-a']},2\n${ids['e2e-member-b']},2\n`;
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
      name: 'workshop-guests.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv)
    });
    const fileName = page.getByText('workshop-guests.csv', { exact: true });
    await waitForVisible(fileName, 'CSV loaded');
    await snap(page, 'claims/create/02', {
      markers: [{ label: 'the loaded CSV file and its rows read', locator: fileName.locator('xpath=..') }],
      focus: fileName
    });
    const combine = page.getByRole('button', { name: 'Combine their amounts' });
    await waitForVisible(combine, 'duplicate notice');
    const notice = page.getByText('1 wallet is listed more than once');
    await snap(page, 'claims/create/03', {
      markers: [
        { label: 'the notice about a wallet listed twice', locator: notice },
        { label: 'the Combine their amounts button', locator: combine }
      ],
      focus: notice
    });
    await combine.click();
    await expect(combine).toHaveCount(0);

    const days = page.getByLabel('Claims stay open for (days)');
    await days.fill('30');
    await snap(page, 'claims/create/04', { markers: [{ label: 'the Claims stay open for field', locator: days }] });

    await page.route('https://uploads.pinata.cloud/**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
      const json = body.slice(body.indexOf('{"format"'), body.lastIndexOf('}') + 1);
      await route.fulfill({ json: { data: { cid: await pinJson(json, 'Lamplight Workshop Guests claim list') } } });
    });
    const confirmation = await holdConfirmation(page);
    await page.getByRole('button', { name: 'Publish the list and open it' }).click();
    const published = page.getByRole('link', { name: /See the published list/ });
    await waitForVisible(published, 'list published', { governingS: 120 });
    await waitForUi(
      'first signature confirming',
      (timeout) => expect.poll(() => confirmation.held(), { timeout }).toBe(true),
      { governingS: 60 }
    );
    await snap(page, 'claims/create/05', {
      markers: [{ label: 'the publish steps', locator: page.getByRole('list', { name: 'Publishing the claim list' }) }],
      focus: published
    });
    await confirmation.release();
    const card = listCard(page);
    await waitForVisible(card, 'list card', { governingS: 120 });
    await waitForVisible(card.getByText('Open', { exact: true }), 'list open', { governingS: 60 });
    await snap(page, 'claims/create/06', {
      markers: [{ label: 'the Open label on the new list', locator: card.getByText('Open', { exact: true }) }],
      focus: card
    });
    saveClaims((state) => {
      state.listOpen = true;
    });
  }

  // member-b claims their 5 tokens.
  // A fresh load clears the open-list toasts, which cover the You button.
  await page.goto(`/dao/${daoId}/claims`);
  await switchAccount(page, wallet, 'e2e-member-b', `/dao/${daoId}/claims`);
  await waitForVisible(page.getByRole('heading', { name: 'Claim your tokens', level: 1 }), 'claims page');
  const card = listCard(page);
  const claim = card.getByRole('button', { name: 'Claim 5 tokens' });
  await waitForVisible(claim, 'claim button', { governingS: 60 });
  await snap(page, 'claims/claim/01', { top: true });
  await snap(page, 'claims/claim/02', {
    markers: [
      { label: 'your allocation on the list', locator: card.getByText(/^5 tokens for you · 0 claimed/) },
      { label: 'the Claim 5 tokens button', locator: claim }
    ],
    focus: card
  });
  await claim.click();
  const checks = page.getByRole('status').filter({ hasText: 'Checks passed. Nothing is signed or sent yet.' });
  await waitForVisible(checks, 'checks passed', { governingS: 60 });
  await snap(page, 'claims/claim/03', { markers: [{ label: 'the Checks passed message', locator: checks }] });
  const review = page.getByRole('region', { name: 'Claim transaction review' });
  await waitForVisible(review, 'claim review');
  await snap(page, 'claims/claim/04', {
    markers: [{ label: 'the Sign and claim button', locator: review.getByRole('button', { name: 'Sign and claim' }) }],
    focus: review
  });
  await review.getByRole('button', { name: 'Sign and claim' }).click();
  await waitForVisible(page.getByRole('status').filter({ hasText: 'Claim confirmed.' }), 'claim confirmed', {
    governingS: 60
  });
  const past = page.getByText(/^5 tokens from Claim list 1/).first();
  await waitForUi(
    'claim in Past claims',
    (timeout) =>
      expect(async () => {
        if (!(await past.isVisible())) await page.getByRole('button', { name: 'Refresh' }).click();
        await expect(past).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout }),
    { governingS: 120 }
  );
  await snap(page, 'claims/claim/05', {
    markers: [{ label: 'the claim under Past claims', locator: past }],
    focus: page.getByRole('heading', { name: 'Past claims' })
  });
  saveClaims((state) => {
    state.claimed = true;
  });
});
