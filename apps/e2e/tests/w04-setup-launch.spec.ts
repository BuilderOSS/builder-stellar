import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, expectNoHorizontalScroll, requireVerifiedManager, test, THEME_KEY } from '../src/fixtures.ts';
import { E2E_ROOT } from '../src/run.ts';
import {
  addStarterArtwork,
  createTribeThroughUi,
  launchFromSetup,
  mintFounders,
  openSetup,
  runTag,
  setupStep,
  signIn
} from '../src/tribe.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * W04 · Setup: artwork, founders, the link and contracts, then launch, including the blocker states
 * (§3.4). One @chain timeline: a tribe is created and walked through its required steps; a rival
 * tribe takes its link by launching first, so the first tribe has to pick a new link before it can
 * launch. The artwork folder upload is tried and refused (uploads are off in the walkthrough build),
 * then the starter collection is used. The contracts step needs a withdrawn release, which only the
 * platform operator can make, so it is not reached here.
 */

const ARTWORK_FOLDER = join(E2E_ROOT, 'fixtures/artwork');
/** A tribe W03 created and nobody set up (fixtures/w04-states.json). */
const PENDING = (JSON.parse(readFileSync(join(E2E_ROOT, 'fixtures/w04-states.json'), 'utf8')) as { pendingTribe: string })
  .pendingTribe;

test.describe('W04 setup states', { tag: '@matrix' }, () => {
  test('a visitor sees progress only', async ({ page }) => {
    await page.goto(`/dao/${PENDING}/setup`);
    await waitForVisible(page.getByRole('heading', { name: /is being set up$/ }), 'visitor setup view');
    await expect(page.getByText('0 of 2 required steps done')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Required to launch' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('the launch admin sees the steps in order and launch blocked', async ({ page, wallet }) => {
    expect(wallet.address).toBeTruthy();
    await signIn(page, `/dao/${PENDING}/setup`);
    await openSetup(page, PENDING);
    await expect(page.getByText('0 of 2 required steps done')).toBeVisible();
    await expect(setupStep(page, 'Add your artwork').getByRole('link', { name: 'Add artwork' })).toBeVisible();
    await expect(
      setupStep(page, 'Mint founder tokens').getByText('Add artwork first so founder tokens get traits.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Launch / })).toBeDisabled();
    await expect(page.getByText('Add your artwork first.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Artwork: a folder is checked in the browser; uploads are off in this build (BUG-W03-4).
    await page.goto(`/dao/${PENDING}/admin/artwork`);
    await waitForVisible(page.getByRole('button', { name: 'Choose a folder' }), 'artwork page');
    await page.locator('#artwork-directory').setInputFiles(ARTWORK_FOLDER);
    await expect(page.getByText('4 files selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload 4 artwork files' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Use Tribe Builder Demo Collection/ })).toBeEnabled();
    await expectNoHorizontalScroll(page);

    // Founders before artwork: the warning, and the review asks to acknowledge it.
    await page.goto(`/dao/${PENDING}/admin/founders`);
    await waitForVisible(page.getByRole('heading', { name: 'Who gets founder tokens' }), 'founder form');
    await expect(page.getByText('Add your artwork first')).toBeVisible();
    await page.getByRole('textbox', { name: 'Founder 1 wallet address' }).fill('not an address');
    await page.getByRole('textbox', { name: 'Founder 1 tokens' }).fill('1');
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('W04 setup and launch', { tag: '@chain' }, () => {
  test('required steps, a taken link, then launch', async ({ page, wallet, identities, browser, theme }) => {
    requireVerifiedManager();
    test.setTimeout(30 * 60_000);
    const tag = runTag();
    const slug = `e2e-w03-set-${tag}`;
    const name = `E2E W03 Setup ${tag}`;
    const founder = wallet.address!;
    const memberA = identities['e2e-member-a'].address;

    await signIn(page);
    const daoId = await createTribeThroughUi(page, wallet, { name, slug, type: 'auction', pace: 'super-fast' });
    test.info().annotations.push({ type: 'tribe', description: `setup ${daoId} ${slug}` });

    // Nothing done yet: artwork first, founders wait for it, launch is blocked.
    await openSetup(page, daoId);
    await expect(page.getByText('0 of 2 required steps done')).toBeVisible();
    await expect(setupStep(page, 'Add your artwork').getByRole('link', { name: 'Add artwork' })).toBeVisible();
    await expect(setupStep(page, 'Mint founder tokens').getByText('Add artwork first so founder tokens get traits.')).toBeVisible();
    await expect(page.getByRole('button', { name: `Launch ${name}` })).toBeDisabled();
    await expect(page.getByText('Add your artwork first.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // A visitor sees progress only, never the admin steps.
    const visitor = await browser.newContext({ colorScheme: theme });
    await visitor.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [THEME_KEY, theme] as const
    );
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/dao/${daoId}/setup`);
    await waitForVisible(visitorPage.getByRole('heading', { name: `${name} is being set up` }), 'visitor setup view');
    await expect(visitorPage.getByRole('heading', { name: 'Required to launch' })).toHaveCount(0);
    await visitor.close();

    // Artwork: a folder is checked in the browser, but uploads are off in this build.
    await page.goto(`/dao/${daoId}/admin/artwork`);
    await waitForVisible(page.getByRole('button', { name: 'Choose a folder' }), 'artwork page');
    await page.locator('#artwork-directory').setInputFiles(ARTWORK_FOLDER);
    await expect(page.getByText('4 files selected')).toBeVisible();
    // BUG-W03-4: the button says why it can't publish, instead of failing after a click.
    await expect(page.getByRole('button', { name: 'Upload 4 artwork files' })).toBeDisabled();
    await expect(
      page.getByText("Uploads are off on this deployment. You can check a folder here, but it can't be published.")
    ).toBeVisible();
    // A folder that doesn't follow collection/layer/item is refused in the browser.
    await page.locator('#artwork-directory').setInputFiles(join(ARTWORK_FOLDER, '0-backgrounds'));
    await expect(page.getByRole('alert').filter({ hasText: 'Use collection/layer/item.png directories' })).toBeVisible();
    await page.locator('#artwork-directory').setInputFiles(ARTWORK_FOLDER);
    await expect(page.getByText('4 files selected')).toBeVisible();
    await addStarterArtwork(page, daoId);

    // Founders: a mint before artwork would warn; with artwork it goes straight through.
    await openSetup(page, daoId);
    await expect(setupStep(page, 'Add your artwork').getByText('5 layers · 14 traits')).toBeVisible();
    await expect(page.getByText('Mint founder tokens first.')).toBeVisible();
    await mintFounders(page, daoId, [
      { address: founder, tokens: 1 },
      { address: memberA, tokens: 1 }
    ]);
    await openSetup(page, daoId);
    await waitForUi('founders counted', (timeout) =>
      expect(page.getByText('All required steps done')).toBeVisible({ timeout })
    );
    await expect(setupStep(page, 'Mint founder tokens').getByText('2 voting tokens minted')).toBeVisible();
    await expect(page.getByText('Ready to launch.')).toBeVisible();

    // A rival tribe launches first with the same link (pending tribes don't hold a link).
    const rivalName = `E2E W03 Rival ${tag}`;
    const rivalId = await createTribeThroughUi(page, wallet, {
      name: rivalName,
      slug,
      type: 'fixed-price',
      pace: 'super-fast'
    });
    test.info().annotations.push({ type: 'tribe', description: `rival ${rivalId} ${slug}` });
    await addStarterArtwork(page, rivalId);
    await mintFounders(page, rivalId, [{ address: founder, tokens: 1 }]);
    await openSetup(page, rivalId);
    await expect(page.getByRole('checkbox', { name: /^Open the market/ })).toBeChecked();
    await launchFromSetup(page, rivalId, rivalName);

    // The first tribe is now blocked on its link.
    await openSetup(page, daoId);
    const linkStep = setupStep(page, 'Pick a new link');
    await waitForVisible(linkStep, 'link blocker', { governingS: 30 });
    await expect(linkStep.getByText(`Another tribe launched first with "${slug}".`)).toBeVisible();
    await expect(page.getByText('Pick a new link first.')).toBeVisible();
    await expect(page.getByRole('button', { name: `Launch ${name}` })).toBeDisabled();
    await expectNoHorizontalScroll(page);

    // The rival's link is refused, then a free one is taken.
    await page.getByLabel('New link').fill(slug);
    await page.getByRole('button', { name: 'Change the link' }).click();
    await expect(page.getByText('This is your link now.')).toBeVisible();
    const renamed = `e2e-w03-set2-${tag}`;
    await page.getByLabel('New link').fill(renamed);
    await page.getByRole('button', { name: 'Change the link' }).click();
    await waitForUi('link blocker cleared', (timeout) => expect(linkStep).toHaveCount(0, { timeout }), {
      governingS: 60
    });

    // Launch with auctions on.
    await expect(page.getByRole('checkbox', { name: /^Start auctions/ })).toBeChecked();
    await expect(page.getByText(`Your link /dao/${renamed} is claimed. Changing it later takes a vote.`)).toBeVisible();
    await launchFromSetup(page, daoId, name);
    test.info().annotations.push({ type: 'tribe', description: `launched ${daoId} ${renamed}` });

    // Live: the link resolves to it, the first auction runs, and Setup hands over to Home.
    await waitForIndexed<{ claimedBy?: string | null }>(
      page.request,
      { label: 'link claimed', path: `/api/slugs/${renamed}`, predicate: (body) => body.claimedBy === daoId },
      { governingS: 0 }
    );
    await waitForIndexed<{ status: string }>(
      page.request,
      { label: 'first auction', path: `/api/dao/${daoId}/auctions`, predicate: (body) => body.status === 'active' },
      { governingS: 0 }
    );
    await page.goto(`/dao/${daoId}/setup`);
    await waitForUi('setup hands over to Home', (timeout) =>
      expect(page).not.toHaveURL(/\/setup$/, { timeout })
    );
  });
});
