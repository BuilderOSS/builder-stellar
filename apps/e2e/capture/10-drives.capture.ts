import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { snap } from '../src/capture.ts';
import { createDriveTribe } from '../src/drive-fixture.ts';
import { expect, test } from '../src/fixtures.ts';
import { E2E_SITE_URL } from '../src/network.ts';
import { E2E_ROOT } from '../src/run.ts';
import {
  ART_DIR,
  COVER_IMAGE,
  FIXTURES,
  holdApi,
  holdConfirmation,
  showcaseIdentities,
  showcaseState
} from '../src/showcase.ts';
import { choose, mintFounders, openSetup, setCheckbox, setupStep, signIn, switchAccount } from '../src/tribe.ts';
import type { E2ESigner } from '../src/wallet/signer.ts';
import { waitForIndexed, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: setup/assurance-drives, claims/refund, and new takes of create/review-and-deploy/04 and 05
 * and setup/artwork/03. The two sibling tribes of docs/qa/SHOWCASE_TRIBE.md, on a timeline of
 * their own so they never sign alongside the main story (`E2E_TIMELINE=showb pnpm capture
 * capture/10-drives.capture.ts`):
 * - Lamplight Paper Studio is created through the create form, set up, and its launch drive is
 *   opened in the app. Two members claim and the goal is met; it is left unlaunched.
 * - Lamplight Lantern Walk gets a drive with a deadline minutes away, opened through the Manager
 *   (src/drive-fixture.ts: the app only offers whole days). One member claims, the deadline passes,
 *   and they take their payment back in the app.
 * Progress goes to fixtures/showcase/drives-state.json, so a re-run picks up where it stopped.
 */
const STATE_FILE = join(FIXTURES, 'drives-state.json');
type DrivesState = {
  walk?: { daoId: string; deadline: number; claimed?: boolean; refunded?: boolean };
  studio?: {
    daoId: string;
    artwork?: boolean;
    founders?: boolean;
    driveOpen?: boolean;
    claimedA?: boolean;
    claimedB?: boolean;
  };
};
const drives = (): DrivesState =>
  existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as DrivesState) : {};
function saveDrives(update: (state: DrivesState) => void) {
  const state = drives();
  update(state);
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

const LINKS = [{ label: 'Guides', url: 'https://docs.tribes.build' }];
const STUDIO = {
  name: 'Lamplight Paper Studio',
  symbol: 'PAPER',
  slug: 'lamplight-paper-studio',
  description:
    'Lamplight Paper Studio makes the paper for Lamplight lanterns. It opens with a launch drive and starts once two members have claimed a token.\n\nThis is an example tribe on Stellar testnet, used in the Tribe Builder guides.'
};
const WALK = {
  name: 'Lamplight Lantern Walk',
  symbol: 'WALK',
  slug: 'lamplight-lantern-walk',
  description:
    'Lamplight Lantern Walk plans an evening walk with paper lanterns. It opens with a launch drive and starts only if two members claim a token in time.\n\nThis is an example tribe on Stellar testnet, used in the Tribe Builder guides.'
};
/** The Lantern Walk price, in stroops: the refund guide says "Take back 30 XLM". */
const WALK_PRICE = 300_000_000n;
/** Long enough to index the drive and claim once; the Paper Studio test runs while it counts down. */
const WALK_WINDOW_S = 900;
/** Lamplight's own profile image (pinned by capture/01). */
const LAMPLIGHT_IMAGE = 'ipfs://bafkreiftxmabzw6eod34qkvezhrhjlgqwjlr3fueq4bv2agsglx2lzltl4';

type ClaimsBody = { lists: { assurance: { state: string } | null; claimers: number; escrowed?: string }[] };
const driveCard = (page: Page) => page.getByRole('region', { name: 'Launch drive' });
const claimsStatus = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

/** Pin a claim tree file the way the app's claim-list upload does, from this process (the key stays here). */
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
  return `ipfs://${body.IpfsHash}`;
}

/** Lamplight's artwork folder as deploy-dao.mjs takes it: the pinned CID and each layer's traits. */
function lamplightArtwork() {
  const artCid = showcaseState().artCid as string | undefined;
  if (!artCid) throw new Error('Pin the artwork first: node apps/e2e/fixtures/showcase/pin-art.mjs');
  const layers = ['0-backdrop', '1-glow', '2-lantern', '3-flame', '4-detail'];
  return {
    ipfs: { baseUri: `ipfs://${artCid}/`, extension: '.png' },
    properties: layers.map((name) => ({
      name,
      items: readdirSync(join(ART_DIR, name))
        .filter((file) => file.endsWith('.png'))
        .sort()
        .map((file) => file.replace(/\.png$/, ''))
    }))
  };
}

async function waitForDrive(page: Page, daoId: string, predicate: (body: ClaimsBody) => boolean, label: string) {
  return waitForIndexed<ClaimsBody>(
    page.request,
    { label, path: `/api/dao/${daoId}/claims`, predicate },
    { governingS: 0 }
  );
}

/** Claim one token from the drive with the Claim button (the list is on IPFS, so the page finds the proof). */
async function claimFromDrive(page: Page, wallet: E2ESigner, role: string, daoId: string) {
  await switchAccount(page, wallet, role, `/dao/${daoId}/claims`);
  const card = driveCard(page);
  await waitForVisible(card, 'drive card', { governingS: 30 });
  const claim = card.getByRole('button', { name: 'Claim 1 token' });
  await waitForVisible(claim, 'claim button', { governingS: 30 });
  await claim.click();
  const review = page.getByRole('region', { name: 'Claim transaction review' });
  await waitForVisible(review, 'claim review', { governingS: 30 });
  await review.getByRole('button', { name: 'Sign and claim' }).click();
  await waitForVisible(claimsStatus(page, 'Claim confirmed.'), 'claim confirmed', { governingS: 60 });
}

async function refresh(page: Page) {
  await page.getByRole('button', { name: 'Refresh' }).click();
}

test.describe.serial('Lamplight sibling tribes: launch drives', () => {
  test('Lantern Walk: a short drive opens and one member claims', async ({ page, wallet }) => {
    test.skip(Boolean(drives().walk?.claimed), 'The Lantern Walk claim is done (drives-state.json).');
    const ids = showcaseIdentities();
    test.setTimeout(15 * 60_000);
    if (!drives().walk) {
      const drive = await createDriveTribe({
        tribe: {
          ...WALK,
          profile: { description: WALK.description, links: LINKS, image: LAMPLIGHT_IMAGE },
          artwork: lamplightArtwork(),
          rendererBase: `${E2E_SITE_URL}/api/render`,
          founders: 1
        },
        claimers: [ids['e2e-member-a'], ids['e2e-member-b']],
        price: WALK_PRICE,
        windowS: WALK_WINDOW_S,
        threshold: 2,
        publish: (json) => pinJson(json, 'Lamplight Lantern Walk claim list')
      });
      console.info(`walk: ${drive.daoId}, deadline ${drive.deadline}`);
      saveDrives((state) => {
        state.walk = { daoId: drive.daoId, deadline: drive.deadline };
      });
    }
    const { daoId } = drives().walk!;
    await waitForDrive(
      page,
      daoId,
      (body) => body.lists.some((list) => list.assurance?.state === 'open'),
      'walk drive indexed'
    );
    await claimFromDrive(page, wallet, 'e2e-member-a', daoId);
    saveDrives((state) => {
      state.walk!.claimed = true;
    });
  });

  test('Paper Studio: create, set up, open the launch drive, two members claim', async ({ page, wallet }) => {
    test.skip(Boolean(drives().studio?.claimedB), 'Paper Studio is done (drives-state.json).');
    const ids = showcaseIdentities();
    test.setTimeout(45 * 60_000);

    // Create, through the form, with the confirmation and the Created panel held for their photos.
    if (!drives().studio) {
      await signIn(page, '/create');
      const name = page.getByLabel('Tribe name');
      await waitForVisible(name, 'Identity section');
      await name.fill(STUDIO.name);
      await expect(page.getByLabel('Link', { exact: true })).toHaveValue(STUDIO.slug);
      await page.getByLabel('Symbol').fill(STUDIO.symbol);
      await waitForUi('the link is checked', (timeout) =>
        expect(page.getByText(/available/i).first()).toBeVisible({ timeout })
      );
      await page.locator('section#identity input[type="file"]').setInputFiles(COVER_IMAGE);
      const upload = page.getByRole('button', { name: 'Upload image' });
      await waitForVisible(upload, 'image preview');
      await upload.click();
      const imageButton = page.getByRole('button', { name: 'Choose tribe image' });
      const refused = page.locator('section#identity').getByRole('alert');
      await waitForUi(
        'image pinned',
        (timeout) => expect(imageButton.getByText('Change image').or(refused)).toBeVisible({ timeout }),
        { governingS: 150 }
      );
      if (await refused.isVisible()) throw new Error(`Image upload refused: ${await refused.innerText()}`);
      await page.getByRole('textbox', { name: 'Description' }).fill(STUDIO.description);
      for (const [index, item] of LINKS.entries()) {
        await page.getByRole('button', { name: 'Add a link' }).click();
        await page.getByRole('textbox', { name: `Link ${index + 1} label` }).fill(item.label);
        await page.getByRole('textbox', { name: `Link ${index + 1} address` }).fill(item.url);
      }
      await page.getByRole('button', { name: 'Continue to Membership' }).click();
      await waitForVisible(page.getByRole('heading', { name: 'Membership', exact: true }), 'Membership section');
      await choose(page, 'How do people join?', 'Auction + resale');
      await choose(page, 'Who can hold a membership?', 'Open membership');
      const membership = page.locator('section#membership');
      await membership.getByRole('button', { name: 'Advanced settings' }).click();
      await setCheckbox(membership, /Let members claim tokens/, true);
      await page.getByRole('button', { name: 'Continue to Voting' }).click();
      await waitForVisible(page.getByRole('heading', { name: 'Voting', exact: true }), 'Voting section');
      await choose(page, 'How fast should decisions happen?', 'Super fast');
      await page.getByRole('button', { name: 'Continue to Review' }).click();
      await waitForVisible(page.getByRole('heading', { name: 'Review and create', exact: true }), 'Review section');

      const confirmation = await holdConfirmation(page);
      const directory = await holdApi(page, /^\/api\/dao\/C[A-Z2-7]{55}$/);
      await page.getByRole('button', { name: 'Create tribe' }).click();
      const progress = page.getByRole('region', { name: 'Creating your tribe' });
      await waitForUi(
        'confirming',
        (timeout) =>
          expect(progress.getByRole('heading', { name: /^Confirming on the network/ })).toBeVisible({ timeout }),
        { governingS: 60 }
      );
      await snap(page, 'create/review-and-deploy/04', { focus: progress });
      await confirmation.release();
      await waitForVisible(progress.getByRole('heading', { name: 'Created. Next, set it up' }), 'created', {
        governingS: 60
      });
      const continueSetup = page.getByRole('button', { name: 'Continue to setup' });
      await snap(page, 'create/review-and-deploy/05', {
        markers: [{ label: 'the Continue to setup button', locator: continueSetup }]
      });

      const daoId = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const value = localStorage.getItem(localStorage.key(i)!) ?? '';
          if (!value.includes('"drafts"')) continue;
          try {
            const state = JSON.parse(value)?.state;
            const active = state?.drafts?.find((draft: { id?: string }) => draft.id === state?.activeDraftId);
            const token = active?.deployment?.addresses?.token;
            if (typeof token === 'string' && /^C[A-Z2-7]{55}$/.test(token)) return token as string;
          } catch {
            /* not this key */
          }
        }
        return null;
      });
      expect(daoId, 'the created tribe id').toMatch(/^C[A-Z2-7]{55}$/);
      console.info(`studio: ${daoId}`);
      saveDrives((state) => {
        state.studio = { daoId: daoId! };
      });
      await directory.release();
      await continueSetup.click().catch(() => undefined);
      await page.waitForURL(new RegExp(`/dao/${daoId}`), { timeout: 120_000 });
    } else {
      await signIn(page, `/dao/${drives().studio!.daoId}/setup`);
    }
    const daoId = drives().studio!.daoId;
    await waitForIndexed<{ daoId: string }>(
      page.request,
      { label: 'studio in the directory', path: `/api/dao/${daoId}`, predicate: (body) => body.daoId === daoId },
      { governingS: 0 }
    );

    // Artwork: the pinned lantern folder, photographed once the layer preview has drawn.
    if (!drives().studio!.artwork) {
      await openSetup(page, daoId);
      const artworkStep = setupStep(page, 'Add your artwork');
      const addArtwork = artworkStep.getByRole('link', { name: 'Add artwork' });
      await waitForUi('artwork step loaded', (timeout) =>
        expect(addArtwork.or(artworkStep.getByText(/layers · /))).toBeVisible({ timeout })
      );
      if (await addArtwork.isVisible()) {
        await addArtwork.click();
        await waitForVisible(page.getByRole('button', { name: 'Choose a folder' }), 'artwork page');
        const artCid = showcaseState().artCid as string;
        await page.route('**/api/pinata/generate-jwt', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jwt: 'capture' }) })
        );
        await page.route('https://api.pinata.cloud/pinning/pinFileToIPFS', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ IpfsHash: artCid }) })
        );
        await page.locator('input[type="file"][webkitdirectory]').setInputFiles(ART_DIR);
        const uploadButton = page.getByRole('button', { name: /^Upload \d+ artwork files$/ });
        await waitForVisible(uploadButton, 'files selected');
        await uploadButton.click();
        const sign = page.getByRole('button', { name: /^Sign artwork batch 1/ });
        await waitForVisible(sign, 'artwork pinned', { governingS: 120 });
        await waitForVisible(
          page.getByText('Preview only. On-chain artwork is set by the signed batches below.'),
          'layer preview drawn',
          {
            governingS: 120
          }
        );
        const moveUp = page.getByRole('button', { name: /^Move .* earlier$/ }).nth(1);
        await snap(page, 'setup/artwork/03', {
          markers: [{ label: 'the Move up button', locator: moveUp }],
          focus: moveUp
        });
        await sign.click();
        await waitForVisible(page.getByText('All planned artwork batches are confirmed.'), 'artwork confirmed', {
          governingS: 90
        });
      }
      saveDrives((state) => {
        state.studio!.artwork = true;
      });
    }

    if (!drives().studio!.founders) {
      await mintFounders(page, daoId, [{ address: ids['e2e-founder'], tokens: 2 }]);
      saveDrives((state) => {
        state.studio!.founders = true;
      });
    }

    // The launch drive, opened in the app.
    const csv = `address,amount\n${ids['e2e-member-a']},1\n${ids['e2e-member-b']},1\n`;
    if (!drives().studio!.driveOpen) {
      await page.goto(`/dao/${daoId}/admin/claims`);
      const listType = page.getByRole('radiogroup', { name: 'List type' });
      await waitForVisible(listType, 'claim list form', { governingS: 30 });
      await listType.getByText('Launch drive', { exact: true }).click();
      const warning = page.getByText('Opening a drive transfers control of the tribe to its Treasury now');
      await waitForVisible(warning, 'drive warning');
      await snap(page, 'setup/assurance-drives/01', {
        markers: [
          { label: 'the Launch drive option', locator: listType.getByRole('radio', { name: 'Launch drive' }) },
          { label: 'the warning about passing control to the Treasury', locator: warning }
        ],
        focus: warning
      });

      await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
        name: 'paper-studio-members.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv)
      });
      const preview = page.getByRole('table', { name: 'The first wallets on the list' });
      await waitForVisible(preview, 'list preview');
      await snap(page, 'setup/assurance-drives/02', {
        markers: [
          { label: 'the loaded CSV file', locator: page.getByText('paper-studio-members.csv', { exact: true }) },
          { label: 'the preview of the wallets', locator: preview }
        ],
        focus: preview
      });

      const price = page.getByLabel('Price per token');
      await price.fill('1');
      await page.getByLabel('Claims stay open for (days)').fill('30');
      const needed = page.getByLabel('People who must claim before launch');
      await needed.fill('2');
      const length = page.getByLabel('The drive ends after (days)');
      await length.fill('14');
      await snap(page, 'setup/assurance-drives/03', {
        markers: [
          { label: 'the Price per token field', locator: price },
          { label: 'the People who must claim before launch field', locator: needed },
          { label: 'the drive length field', locator: length }
        ],
        focus: needed
      });

      const auction = page.getByRole('checkbox', { name: 'Start the auction at launch' });
      const market = page.getByRole('checkbox', { name: 'Open the marketplace at launch' });
      await expect(auction).toBeChecked();
      await expect(market).toBeChecked();
      await snap(page, 'setup/assurance-drives/04', {
        markers: [
          { label: 'the Start the auction at launch checkbox', locator: page.locator('label', { has: auction }) },
          { label: 'the Open the marketplace at launch checkbox', locator: page.locator('label', { has: market }) }
        ]
      });

      await page.getByRole('button', { name: 'Review the launch drive' }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Open the launch drive?' });
      await waitForVisible(dialog, 'drive confirm');
      const publish = dialog.getByRole('button', { name: 'Publish and open the drive' });
      await snap(page, 'setup/assurance-drives/05', {
        markers: [{ label: 'the Publish and open the drive button', locator: publish }]
      });
      // The signed upload URL the app asks for refuses JSON (pinata-service.ts gives claim lists the
      // directory policy), so the browser's upload of the list is pinned from here instead. The app's
      // own /api/uploads/complete still checks the CID on Pinata.
      await page.route('https://uploads.pinata.cloud/**', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
        const json = body.slice(body.indexOf('{"format"'), body.lastIndexOf('}') + 1);
        const uri = await pinJson(json, 'Lamplight Paper Studio claim list');
        await route.fulfill({ json: { data: { cid: uri.slice('ipfs://'.length) } } });
      });
      await publish.click();
      await waitForVisible(page.getByText('The launch drive is open, so no other list can open now.'), 'drive open', {
        governingS: 180
      });
      saveDrives((state) => {
        state.studio!.driveOpen = true;
      });
    }
    await waitForDrive(
      page,
      daoId,
      (body) => body.lists.some((list) => list.assurance?.state === 'open'),
      'studio drive indexed'
    );

    // One member claims: the founder follows the drive's progress on the Claims page.
    if (!drives().studio!.claimedA) {
      await claimFromDrive(page, wallet, 'e2e-member-a', daoId);
      saveDrives((state) => {
        state.studio!.claimedA = true;
      });
    }
    await waitForDrive(
      page,
      daoId,
      (body) => body.lists.some((list) => list.assurance && list.claimers >= 1),
      'first claim indexed'
    );
    if (!drives().studio!.claimedB) {
      await switchAccount(page, wallet, 'e2e-founder', `/dao/${daoId}/claims`);
      const card = driveCard(page);
      await waitForVisible(card.getByText(/^1 of 2 people needed by /), 'one of two claimed', { governingS: 60 });
      await snap(page, 'setup/assurance-drives/06', {
        markers: [
          {
            label: 'the progress bar of people who have claimed',
            locator: card.getByRole('progressbar', { name: 'People who have claimed' })
          }
        ],
        focus: card
      });

      await claimFromDrive(page, wallet, 'e2e-member-b', daoId);
      saveDrives((state) => {
        state.studio!.claimedB = true;
      });
    }
    await waitForDrive(page, daoId, (body) => body.lists.some((list) => list.assurance?.state === 'met'), 'goal met');
    await switchAccount(page, wallet, 'e2e-founder', `/dao/${daoId}/claims`);
    const card = driveCard(page);
    await waitForVisible(
      card.getByText('Enough people have claimed. Anyone can launch the tribe now.'),
      'goal met on the card',
      { governingS: 60 }
    );
    const launch = card.getByRole('button', { name: 'Launch the tribe' });
    await expect(launch).toBeEnabled();
    await snap(page, 'setup/assurance-drives/07', {
      markers: [{ label: 'the Launch the tribe button', locator: launch }],
      focus: card
    });
  });

  test('Lantern Walk: the drive fails and the member takes the payment back', async ({ page, wallet }) => {
    test.skip(Boolean(drives().walk?.refunded), 'The Lantern Walk refund is done (drives-state.json).');
    showcaseIdentities();
    const walk = drives().walk;
    if (!walk?.claimed) throw new Error('Run the Lantern Walk claim first.');
    test.setTimeout((WALK_WINDOW_S + 15 * 60) * 1000);
    await waitForLedgerTime(walk.deadline + 1, { governingS: WALK_WINDOW_S, label: 'walk deadline' });
    await waitForDrive(
      page,
      walk.daoId,
      // Signed out, so `escrowed` (per account) is not in the answer yet.
      (body) => body.lists.some((list) => list.assurance?.state === 'failed'),
      'walk drive failed'
    );
    await switchAccount(page, wallet, 'e2e-member-a', `/dao/${walk.daoId}/claims`);
    const card = driveCard(page);
    await waitForVisible(card.getByText('Failed', { exact: true }), 'failed badge', { governingS: 60 });
    const explanation = card.getByText(
      'The drive ended before the tribe launched. Everyone who paid can take their payment back.'
    );
    await expect(explanation).toBeVisible();
    await snap(page, 'claims/refund/01', {
      markers: [{ label: 'the explanation that payments can be taken back', locator: explanation }],
      focus: card
    });
    const takeBack = card.getByRole('button', { name: /^Take back 30(\.0+)? XLM$/ });
    await expect(takeBack).toBeEnabled();
    await snap(page, 'claims/refund/02', {
      markers: [{ label: 'the Take back 30 XLM button', locator: takeBack }],
      focus: card
    });
    await takeBack.click();
    const returned = card.getByText('Your payment has been returned.');
    await waitForUi(
      'payment returned',
      (timeout) =>
        expect(async () => {
          if (!(await returned.isVisible())) await refresh(page);
          await expect(returned).toBeVisible({ timeout: 5_000 });
        }).toPass({ timeout }),
      { governingS: 90 }
    );
    await snap(page, 'claims/refund/03', {
      markers: [{ label: 'the note that your payment has been returned', locator: returned }],
      focus: card
    });
    saveDrives((state) => {
      state.walk!.refunded = true;
    });
  });
});
