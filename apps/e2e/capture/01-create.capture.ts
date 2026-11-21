import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import {
  COVER_IMAGE,
  holdApi,
  holdConfirmation,
  saveShowcaseState,
  SHOWCASE,
  showcaseIdentities,
  showcaseState
} from '../src/showcase.ts';
import { choose, setCheckbox, signIn } from '../src/tribe.ts';
import { waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * Docs: create/identity, create/membership, create/voting, create/review-and-deploy and
 * start/build-your-first-tribe/01. The founder fills in the create form for Lamplight and creates it,
 * the first step of the showcase story (docs/qa/SHOWCASE_TRIBE.md).
 */
const section = (page: import('@playwright/test').Page, id: string) => page.locator(`section#${id}`);
const continueTo = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('button', { name: `Continue to ${name}` });

test('Lamplight: the create form, then create', async ({ page, wallet }) => {
  test.skip(Boolean(showcaseState().daoId), 'Lamplight already exists (fixtures/showcase/state.json).');
  showcaseIdentities();
  test.setTimeout(20 * 60_000);
  await signIn(page, '/create');
  const name = page.getByLabel('Tribe name');
  await waitForVisible(name, 'Identity section');
  await expect(name).toHaveValue('');

  await snap(page, 'create/identity/01', { top: true });
  await snap(page, 'start/build-your-first-tribe/01', { top: true });

  await name.fill(SHOWCASE.name);
  await expect(page.getByLabel('Link', { exact: true })).toHaveValue(SHOWCASE.slug);
  await snap(page, 'create/identity/02', { markers: [{ label: 'the Tribe name field', locator: name }] });

  const symbol = page.getByLabel('Symbol');
  await symbol.fill(SHOWCASE.symbol);
  await snap(page, 'create/identity/03', { markers: [{ label: 'the Symbol field', locator: symbol }] });

  const link = page.getByLabel('Link', { exact: true });
  await waitForUi('the link is checked', (timeout) =>
    expect(page.getByText(/available/i).first()).toBeVisible({ timeout })
  );
  await snap(page, 'create/identity/04', { markers: [{ label: 'the Link field', locator: link }] });

  await page.locator('section#identity input[type="file"]').setInputFiles(COVER_IMAGE);
  const upload = page.getByRole('button', { name: 'Upload image' });
  await waitForVisible(upload, 'image preview');
  await snap(page, 'create/identity/05', {
    markers: [
      { label: 'the tribe image preview', locator: page.getByRole('button', { name: 'Choose tribe image' }) },
      { label: 'the Upload image button', locator: upload }
    ]
  });
  page.on('response', (response) => {
    if (/\/api\/uploads\/|pinata/.test(response.url()))
      console.info(`upload: ${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', (request) => {
    if (/\/api\/uploads\/|pinata/.test(request.url()))
      console.info(`upload failed: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`);
  });
  await upload.click();
  // Pinned: the preview gives way to the saved image. A refusal shows an alert instead.
  const imageButton = page.getByRole('button', { name: 'Choose tribe image' });
  const refused = page.locator('section#identity').getByRole('alert');
  await waitForUi(
    'image pinned',
    (timeout) => expect(imageButton.getByText('Change image').or(refused)).toBeVisible({ timeout }),
    { governingS: 150 }
  );
  if (await refused.isVisible()) throw new Error(`Image upload refused: ${await refused.innerText()}`);

  const description = page.getByRole('textbox', { name: 'Description' });
  await description.fill(SHOWCASE.description);
  await snap(page, 'create/identity/06', { markers: [{ label: 'the Description field', locator: description }] });

  for (const [index, item] of SHOWCASE.links.entries()) {
    await page.getByRole('button', { name: 'Add a link' }).click();
    await page.getByRole('textbox', { name: `Link ${index + 1} label` }).fill(item.label);
    await page.getByRole('textbox', { name: `Link ${index + 1} address` }).fill(item.url);
  }
  await snap(page, 'create/identity/07', {
    markers: [{ label: 'the Links editor', locator: page.getByRole('textbox', { name: 'Link 1 label' }) }]
  });

  await continueTo(page, 'Membership').click();
  const membership = page.getByRole('heading', { name: 'Membership', exact: true });
  await waitForVisible(membership, 'Membership section');
  await snap(page, 'create/identity/08', { focus: membership });

  const join = page.getByRole('radiogroup', { name: 'How do people join?' });
  await choose(page, 'How do people join?', 'Daily auction');
  await snap(page, 'create/membership/01', {
    markers: [{ label: 'the Daily auction choice', locator: join.getByRole('radio', { name: /^Daily auction/ }) }],
    focus: join
  });
  const rules = page.getByRole('radiogroup', { name: 'Who can hold a membership?' });
  await choose(page, 'Who can hold a membership?', 'Open membership');
  await snap(page, 'create/membership/02', {
    markers: [{ label: 'the Open membership choice', locator: rules.getByRole('radio', { name: /^Open membership/ }) }],
    focus: rules
  });

  // Lamplight also resells tokens and runs claim lists, for the market and claims guides.
  await choose(page, 'How do people join?', 'Auction + resale');
  await section(page, 'membership').getByRole('button', { name: 'Advanced settings' }).click();
  await setCheckbox(section(page, 'membership'), /Let members claim tokens/, true);
  await snap(page, 'create/membership/03', {
    focus: section(page, 'membership').getByRole('button', { name: 'Advanced settings' })
  });

  await continueTo(page, 'Voting').click();
  const voting = page.getByRole('heading', { name: 'Voting', exact: true });
  await waitForVisible(voting, 'Voting section');
  await snap(page, 'create/membership/04', { focus: voting });

  const counted = page.getByRole('radiogroup', { name: 'How are votes counted?' });
  await snap(page, 'create/voting/01', { focus: counted });
  const pace = page.getByRole('radiogroup', { name: 'How fast should decisions happen?' });
  await choose(page, 'How fast should decisions happen?', 'Balanced');
  await snap(page, 'create/voting/02', {
    markers: [{ label: 'the Balanced pace', locator: pace.getByRole('radio', { name: /^Balanced/ }) }],
    focus: pace
  });
  // The story needs votes that finish in minutes on testnet.
  await choose(page, 'How fast should decisions happen?', 'Super fast');
  await section(page, 'voting').getByRole('button', { name: 'Advanced settings' }).click();
  await snap(page, 'create/voting/03', {
    focus: section(page, 'voting').getByRole('button', { name: 'Advanced settings' })
  });

  await continueTo(page, 'Review').click();
  const review = page.getByRole('heading', { name: 'Review and create', exact: true });
  await waitForVisible(review, 'Review section');
  await snap(page, 'create/voting/04', { focus: review });
  await snap(page, 'create/review-and-deploy/01', { focus: review });

  await page.getByRole('button', { name: 'Advanced: metadata links' }).click();
  const renderer = page.getByLabel('Renderer base URL');
  await waitForVisible(renderer, 'metadata links');
  await snap(page, 'create/review-and-deploy/02', {
    markers: [{ label: 'the Renderer base URL field', locator: renderer }]
  });
  await page.getByRole('button', { name: 'Advanced: metadata links' }).click();

  const create = page.getByRole('button', { name: 'Create tribe' });
  await snap(page, 'create/review-and-deploy/03', { markers: [{ label: 'the Create tribe button', locator: create }] });

  const confirmation = await holdConfirmation(page);
  const directory = await holdApi(page, /^\/api\/dao\/C[A-Z2-7]{55}$/);
  await create.click();
  const progress = page.getByRole('region', { name: 'Creating your tribe' });
  await waitForUi(
    'confirming',
    (timeout) => expect(progress.getByRole('heading', { name: /^Confirming on the network/ })).toBeVisible({ timeout }),
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

  const addresses = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const value = localStorage.getItem(localStorage.key(i)!) ?? '';
      if (!value.includes('"drafts"')) continue;
      try {
        const state = JSON.parse(value)?.state;
        const active = state?.drafts?.find((draft: { id?: string }) => draft.id === state?.activeDraftId);
        const found = active?.deployment?.addresses as Record<string, string> | undefined;
        if (typeof found?.token === 'string' && /^C[A-Z2-7]{55}$/.test(found.token)) return found;
      } catch {
        /* not this key */
      }
    }
    return null;
  });
  const daoId = addresses?.token;
  expect(daoId, 'the created tribe id').toMatch(/^C[A-Z2-7]{55}$/);
  saveShowcaseState((state) => {
    state.daoId = daoId!;
    state.addresses = addresses!;
  });
  await directory.release();
  await continueSetup.click().catch(() => undefined);
  await page.waitForURL(new RegExp(`/dao/${daoId}`), { timeout: 120_000 });
});
