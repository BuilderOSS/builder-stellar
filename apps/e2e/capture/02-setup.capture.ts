import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import {
  ART_DIR,
  requireDao,
  saveShowcaseState,
  SHOWCASE,
  showcaseIdentities,
  showcaseState
} from '../src/showcase.ts';
import { openSetup, setupStep, signIn } from '../src/tribe.ts';
import { waitForIndexed, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: setup/artwork, setup/founders, setup/slug, setup/contracts, setup/launch and
 * start/build-your-first-tribe/02 to 04. The founder adds Lamplight's lantern artwork (uploaded and
 * pinned), mints the founder tokens and launches (docs/qa/SHOWCASE_TRIBE.md).
 */
test('Lamplight: set up and launch', async ({ page, wallet }) => {
  test.skip(Boolean(showcaseState().launched), 'Lamplight is already live.');
  const daoId = requireDao();
  const ids = showcaseIdentities();
  test.setTimeout(30 * 60_000);
  await signIn(page, `/dao/${daoId}/setup`);
  await openSetup(page, daoId);

  // Artwork.
  const artworkStep = setupStep(page, 'Add your artwork');
  const addArtwork = artworkStep.getByRole('link', { name: 'Add artwork' });
  await waitForUi('artwork step loaded', (timeout) =>
    expect(addArtwork.or(artworkStep.getByText(/layers · /))).toBeVisible({ timeout })
  );
  if (await addArtwork.isVisible()) {
    await snap(page, 'setup/artwork/01', {
      markers: [{ label: 'the Add artwork button', locator: artworkStep.getByRole('link', { name: 'Add artwork' }) }]
    });
    await artworkStep.getByRole('link', { name: 'Add artwork' }).click();
    const choose = page.getByRole('button', { name: 'Choose a folder' });
    await waitForVisible(choose, 'artwork page');
    await snap(page, 'setup/artwork/02', {
      markers: [
        {
          label: 'the demo collection button',
          locator: page.getByRole('button', { name: /^Use Tribe Builder Demo Collection/ })
        },
        { label: 'the Choose a folder button', locator: choose }
      ],
      focus: choose
    });
    // The folder is pinned by fixtures/showcase/pin-art.mjs: this deployment's Pinata key can't mint
    // the short-lived upload key the browser asks for. The browser's upload is answered with the
    // pinned folder's CID; the app's own pin check (/api/pinata/pin-cid) still runs on the server.
    const artCid = showcaseState().artCid as string | undefined;
    if (!artCid) throw new Error('Pin the artwork first: node apps/e2e/fixtures/showcase/pin-art.mjs');
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
    const moveUp = page.getByRole('button', { name: /^Move .* earlier$/ }).nth(1);
    await snap(page, 'setup/artwork/03', {
      markers: [{ label: 'the Move up button', locator: moveUp }],
      focus: moveUp
    });
    await sign.click();
    await waitForVisible(page.getByText('All planned artwork batches are confirmed.'), 'artwork confirmed', {
      governingS: 90
    });
    await openSetup(page, daoId);
  }
  await waitForUi(
    'artwork done',
    (timeout) => expect(artworkStep.getByText(/5 layers · 22 traits/)).toBeVisible({ timeout }),
    {
      governingS: 60
    }
  );
  await snap(page, 'setup/artwork/05', { focus: artworkStep });

  // Founder tokens: the founder 3, the workshop lead 2.
  const founderStep = setupStep(page, 'Mint founder tokens');
  const mint = founderStep.getByRole('link', { name: /Mint founder tokens/ });
  await waitForUi('founder step loaded', (timeout) =>
    expect(mint.or(founderStep.getByText(/voting tokens minted/))).toBeVisible({ timeout })
  );
  if (await mint.isVisible()) {
    await snap(page, 'setup/founders/01', { markers: [{ label: 'the Mint founder tokens button', locator: mint }] });
    await snap(page, 'start/build-your-first-tribe/02', { focus: founderStep });
    await mint.click();
    await waitForVisible(page.getByRole('heading', { name: 'Who gets founder tokens' }), 'founder form');
    const founders = [
      { address: ids['e2e-founder'], tokens: 3 },
      { address: ids['e2e-member-a'], tokens: 2 }
    ];
    for (const [index, founder] of founders.entries()) {
      if (index > 0) await page.getByRole('button', { name: 'Add a founder' }).click();
      await page.getByRole('textbox', { name: `Founder ${index + 1} wallet address` }).fill(founder.address);
      await page.getByRole('textbox', { name: `Founder ${index + 1} tokens` }).fill(String(founder.tokens));
    }
    const table = page.getByRole('heading', { name: 'Who gets founder tokens' });
    await snap(page, 'setup/founders/02', { focus: table });
    const review = page.getByRole('button', { name: 'Review', exact: true });
    await snap(page, 'setup/founders/03', { markers: [{ label: 'the Review button', locator: review }] });
    await review.click();
    const check = page.getByRole('heading', { name: 'Check before you sign' });
    await waitForVisible(check, 'founder review');
    await snap(page, 'setup/founders/04', { focus: check });
    await page.getByRole('button', { name: 'Sign and mint 5 tokens' }).click();
    const minted = page.getByRole('main').getByText('Founder tokens minted');
    await waitForVisible(minted, 'founder mint confirmed', { governingS: 60 });
    await snap(page, 'setup/founders/05', { focus: minted });
    await openSetup(page, daoId);
  }
  await waitForUi(
    'both steps done',
    (timeout) => expect(page.getByText('All required steps done')).toBeVisible({ timeout }),
    {
      governingS: 60
    }
  );
  await snap(page, 'setup/founders/06', { top: true });
  await snap(page, 'setup/launch/01', { top: true });

  // Optional review: contracts, auctions and voting rules.
  const optional = page.getByRole('region', { name: 'Review (optional)' });
  await snap(page, 'setup/launch/02', { focus: optional });
  const contracts = optional.getByRole('listitem').filter({ hasText: 'Contract upgrades' });
  if (await contracts.count()) {
    await snap(page, 'setup/contracts/01', {
      markers: [{ label: 'the Contract upgrades Review button', locator: contracts.getByRole('link').first() }]
    });
    await contracts.getByRole('link').first().click();
    await waitForVisible(page.getByRole('heading', { name: /Contracts/ }).first(), 'contracts page');
    await snap(page, 'setup/contracts/02', { top: true });
    const upToDate = page.getByText('Everything is up to date');
    if (await upToDate.isVisible().catch(() => false)) await snap(page, 'setup/contracts/05', { focus: upToDate });
    await openSetup(page, daoId);
  }

  // The link, from the tribe profile page.
  await page.goto(`/dao/${daoId}/admin/profile`);
  const link = page.getByLabel('Link', { exact: true });
  await waitForVisible(link, 'profile link field');
  await snap(page, 'setup/slug/01', { markers: [{ label: 'the Link field', locator: link }] });
  await link.fill('lamplight-circle');
  await waitForUi('link checked', (timeout) =>
    expect(page.getByText(/is available/i).first()).toBeVisible({ timeout })
  );
  await snap(page, 'setup/slug/02', { markers: [{ label: 'the Link field', locator: link }] });
  const apply = page.getByRole('button', { name: /^Apply 1 change now/ }).first();
  await snap(page, 'setup/slug/03', { markers: [{ label: 'the Apply 1 change now button', locator: apply }] });
  await link.fill(SHOWCASE.slug);

  // Launch.
  await openSetup(page, daoId);
  const launch = page.getByRole('button', { name: `Launch ${SHOWCASE.name}` });
  await waitForUi('launch enabled', (timeout) => expect(launch).toBeEnabled({ timeout }), { governingS: 30 });
  const auctions = page.getByRole('checkbox', { name: /^Start auctions/ });
  await snap(page, 'setup/launch/03', {
    markers: [
      { label: 'the Start auctions switch', locator: auctions },
      { label: 'the Launch button', locator: launch }
    ],
    focus: launch
  });
  await snap(page, 'start/build-your-first-tribe/03', {
    markers: [{ label: 'the Launch button', locator: launch }],
    focus: launch
  });
  await snap(page, 'setup/launch/04', { focus: page.getByText(/What launching does/i).first() });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: `Launch ${SHOWCASE.name}?` });
  await waitForVisible(dialog, 'launch confirm');
  await snap(page, 'setup/launch/05', {
    markers: [{ label: 'the Sign and launch button', locator: dialog.getByRole('button', { name: 'Sign and launch' }) }]
  });
  await dialog.getByRole('button', { name: 'Sign and launch' }).click();
  const live = page.getByRole('heading', { name: `${SHOWCASE.name} is live` });
  await waitForVisible(live, 'launch confirmed', { governingS: 60 });
  await snap(page, 'setup/launch/06', { focus: live });
  await waitForIndexed<{ status: string }>(
    page.request,
    { label: 'Lamplight live', path: `/api/dao/${daoId}`, predicate: (body) => body.status === 'operational' },
    { governingS: 0 }
  );
  saveShowcaseState((state) => {
    state.launched = true;
  });

  await page.goto(`/dao/${SHOWCASE.slug}/proposals`);
  const newProposal = page.getByRole('button', { name: 'New proposal' }).first();
  await waitForVisible(newProposal, 'proposals page');
  await snap(page, 'start/build-your-first-tribe/04', {
    markers: [{ label: 'the New proposal button', locator: newProposal }]
  });
});
