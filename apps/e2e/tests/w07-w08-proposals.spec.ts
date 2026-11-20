import { shortId } from '../src/identities.ts';
import type { Page } from '@playwright/test';

import { signedTransactions } from '../src/connect.ts';
import { expect, expectNoHorizontalScroll, requireVerifiedManager, test } from '../src/fixtures.ts';
import {
  accountStroops,
  castVote,
  type Choice,
  type ComposeAction,
  composeProposal,
  lifecycleHeading,
  loadProposalsFixture,
  type Member,
  membersOnlyDelegation,
  openMember,
  openProposal,
  type ProposalBody,
  type ProposalKey,
  type ProposalListBody,
  proposalOf,
  ProposalState,
  runState,
  saveRunState,
  setAnnotator,
  settleSend,
  signInOn,
  stateChip,
  statusColumn,
  submitProposal,
  topUpTreasury,
  treasuryStroops,
  waitForProposalState,
  waitForVotes,
  xlmStroops
} from '../src/proposals.ts';
import { waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * W07 · Proposal lifecycle and W08 · Proposal edge cases (§3.4), as one timeline on the fixture
 * tribe "E2E Proposals" (src/proposals.ts). Every proposal is started in the same few minutes so
 * the 300s voting delay, voting period and safety delay are waited out once for all of them:
 *
 *   W08 cancel      propose, a member can't cancel it, the proposer cancels before voting opens
 *   W07 lifecycle   compose three actions, propose, vote For/Against/Abstain from three wallets,
 *                   queue, wait out the safety delay, execute, check every effect
 *   W08 defeated    quorum reached, but more Against than For
 *   W08 quorum      only For votes, but too few of them
 *   W08 expiry      passes and is never queued (the Governor expires it 14 days after voting ends)
 *
 * "Threshold not met" signs no transaction and runs at every viewport in w08-proposal-states.
 *
 * Tests run in order and share proposal ids through a run-state file (src/proposals.ts runState),
 * so a failure in one case doesn't stop the others. E2E_RESUME=1 resumes the last run's proposals.
 */

const fixture = loadProposalsFixture();
const RUN = process.env.E2E_RUN_ID ?? `local-${Date.now()}`;
/** A short tag that makes this run's titles (and so proposal ids) unique. */
const TAG = RUN.replace(/[^0-9]/g, '').slice(2, 14);
const PROPOSER = 'e2e-founder';
const MEMBER_A = 'e2e-member-a';
const MEMBER_B = 'e2e-member-b';
const PAY_A = '2';
const PAY_B = '1';

type Ids = Record<string, string>;

test.describe('W07 and W08 proposals', { tag: '@chain' }, () => {
  let ids: Ids = {};

  test.beforeAll(async ({ identities }) => {
    requireVerifiedManager();
    ids = Object.fromEntries(Object.values(identities).map(({ name, address }) => [name, address]));
    expect(fixture.votesOf(ids[PROPOSER]!), 'the founder holds the proposal threshold').toBeGreaterThanOrEqual(
      fixture.threshold
    );
    const toppedUp = topUpTreasury(fixture, xlmStroops('20'), xlmStroops('100'));
    if (toppedUp) console.info(`W07 fixture: ${toppedUp}`);
  });

  test.beforeEach(({}, testInfo) => {
    setAnnotator((type, description) => testInfo.annotations.push({ type, description }));
  });

  /** Open another member's browser, signed in, for the length of one test. */
  async function member(
    {
      browser,
      identities,
      theme
    }: {
      browser: import('@playwright/test').Browser;
      identities: Record<string, import('../src/identities.ts').Identity>;
      theme: 'light' | 'dark';
    },
    name: string,
    path: string
  ): Promise<Member> {
    const opened = await openMember(browser, identities[name]!, test.info(), theme);
    await signInOn(opened.page, opened.wallet, name, path);
    return opened;
  }

  async function propose(
    page: Page,
    wallet: import('../src/wallet/signer.ts').E2ESigner,
    key: ProposalKey,
    draft: { title: string; why: string; actions: ComposeAction[] }
  ) {
    const resumed = runState().proposals[key];
    if (resumed) {
      test.info().annotations.push({ type: 'resumed', description: `${key}: ${resumed}` });
      return resumed;
    }
    await composeProposal(page, fixture, draft);
    const id = await submitProposal(page, wallet, PROPOSER, draft.actions.length);
    saveRunState((state) => {
      state.proposals[key] = id;
    });
    return id;
  }

  const payA = (amount: string): ComposeAction => ({
    kind: 'pay',
    to: ids[MEMBER_A]!,
    amount,
    summary: new RegExp(`^Send ${amount.replace('.', '\\.')} XLM to ${shortId(ids[MEMBER_A]!)}`)
  });

  /* ---------- W08 · cancel by the proposer ---------- */

  test('W08 the proposer cancels a proposal before voting opens; a member cannot', async ({
    page,
    wallet,
    browser,
    identities,
    theme
  }) => {
    test.setTimeout(8 * 60_000);
    await signInOn(page, wallet, PROPOSER, `/dao/${fixture.slug}/proposals`);
    const id = await propose(page, wallet, 'cancel', {
      title: `W08 cancel ${TAG}`,
      why: 'Walkthrough W08: the proposer withdraws this before voting opens.',
      actions: [payA('0.1')]
    });

    // The page says "Loading your proposal" until the indexer has it.
    await waitForProposalState(page.request, fixture, id, Object.values(ProposalState));

    // A member who didn't propose it sees no Cancel.
    const other = await member({ browser, identities, theme }, MEMBER_A, `/dao/${fixture.slug}/proposals`);
    try {
      await openProposal(other.page, fixture, id);
      await expect(other.page.getByText(/^Proposed by G[A-Z2-7]{3}…/)).toBeVisible();
      await expect(other.page.getByRole('button', { name: 'Cancel proposal' })).toHaveCount(0);
    } finally {
      await other.context.close();
    }

    await openProposal(page, fixture, id);
    const current = await waitForProposalState(page.request, fixture, id, [
      ProposalState.Pending,
      ProposalState.Canceled
    ]);
    if (current.state === ProposalState.Pending) {
      await expect(page.getByText('You proposed this')).toBeVisible();
      await expect(lifecycleHeading(page)).toContainText('Opens in');
      const before = signedTransactions(wallet, PROPOSER);
      await statusColumn(page).getByRole('button', { name: 'Cancel proposal' }).click();
      const confirm = page.getByRole('dialog', { name: 'Cancel this proposal?' });
      await waitForVisible(confirm, 'cancel confirmation');
      await expect(confirm.getByText("It won't go to a vote and can't be reopened.", { exact: false })).toBeVisible();
      await confirm.getByRole('button', { name: 'Cancel proposal' }).click();
      await settleSend(page, 'Proposal cancelled', 'cancel', statusColumn(page));
      expect(signedTransactions(wallet, PROPOSER) - before).toBe(1);
    }
    await waitForProposalState(page.request, fixture, id, [ProposalState.Canceled]);
    await waitForUi('cancelled state shown', (timeout) =>
      expect(lifecycleHeading(page)).toHaveText('Cancelled', { timeout })
    );
    await expect(stateChip(page).getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(statusColumn(page).getByText('The proposer withdrew this proposal.')).toBeVisible();
    await expect(page.getByText('It was cancelled before anyone voted.')).toBeVisible();
    await expect(statusColumn(page).getByRole('button', { name: 'Cancel proposal' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  /* ---------- W07 · compose and propose ---------- */

  test('W07 composes a proposal with three actions and proposes it', async ({ page, wallet }) => {
    test.setTimeout(6 * 60_000);
    await signInOn(page, wallet, PROPOSER, `/dao/${fixture.slug}/proposals`);
    const delegationOn = membersOnlyDelegation(fixture);
    const fresh = !runState().proposals.lifecycle;
    const id = await propose(page, wallet, 'lifecycle', {
      title: `W07 lifecycle ${TAG}`,
      why: [
        'Walkthrough W07: pay two members from the treasury and change a membership rule, in one vote.',
        '',
        `- ${PAY_A} XLM to member A`,
        `- ${PAY_B} XLM to member B`,
        `- Members-only delegation ${delegationOn ? 'off' : 'on'}`
      ].join('\n'),
      actions: [
        payA(PAY_A),
        {
          kind: 'pay',
          to: ids[MEMBER_B]!,
          amount: PAY_B,
          summary: new RegExp(`^Send ${PAY_B} XLM to ${shortId(ids[MEMBER_B]!)}`)
        },
        { kind: 'toggle', setting: 'Members-only delegation', summary: /delegat/i }
      ]
    });
    // The rule as it was when proposed; a resumed run keeps the first reading.
    if (fresh)
      saveRunState((state) => {
        state.before = { ...state.before, delegationOn: String(delegationOn) };
      });

    await waitForProposalState(page.request, fixture, id, Object.values(ProposalState));
    await openProposal(page, fixture, id);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('W07 lifecycle ');
    await expect(page.getByText('You proposed this')).toBeVisible();
    if (fresh) {
      await expect(stateChip(page).getByText('Voting soon', { exact: true })).toBeVisible();
      await expect(lifecycleHeading(page)).toContainText('Opens in');
      await expect(page.getByText(`Needs ${fixture.quorum} For or Abstain votes to reach quorum`)).toBeVisible();
    }
    const body = await waitForProposalState(page.request, fixture, id, Object.values(ProposalState));
    expect(body.functions).toEqual(['transfer', 'transfer', 'set_members_only_delegation']);
    expect(body.vote_end - body.vote_start).toBe(fixture.votingPeriodS);
    await expectNoHorizontalScroll(page);
  });

  /* ---------- W08 · the proposals that wait ---------- */

  test('W08 proposes the defeated, quorum and expiry cases alongside', async ({ page, wallet }) => {
    test.setTimeout(10 * 60_000);
    await signInOn(page, wallet, PROPOSER, `/dao/${fixture.slug}/proposals`);
    const cases: [ProposalKey, string][] = [
      ['defeated', 'more Against than For, with quorum reached'],
      ['quorum', 'only For votes, but too few to reach quorum'],
      ['expiry', 'passes and is never queued, so it expires 14 days after voting ends']
    ];
    for (const [key, why] of cases) {
      await propose(page, wallet, key, {
        title: `W08 ${key} ${TAG}`,
        why: `Walkthrough W08: ${why}.`,
        actions: [payA('0.1')]
      });
    }
    for (const [key] of cases)
      await waitForProposalState(page.request, fixture, proposalOf(key), Object.values(ProposalState));
  });

  /* ---------- Voting: members vote at the same time, each in their own browser ---------- */

  /** Each member votes on their list in order; members vote in parallel. */
  async function voteAll(
    page: Page,
    wallet: import('../src/wallet/signer.ts').E2ESigner,
    others: {
      browser: import('@playwright/test').Browser;
      identities: Record<string, import('../src/identities.ts').Identity>;
      theme: 'light' | 'dark';
    },
    plan: Record<string, [ProposalKey, Choice][]>
  ) {
    // Voting opens voting-delay after each proposal; wait for the last of them on the ledger. A
    // resumed run may find some already closed: those are past voting and are skipped.
    const keys = [...new Set(Object.values(plan).flatMap((votes) => votes.map(([key]) => key)))];
    const bodies = await Promise.all(
      keys.map((key) =>
        waitForProposalState(page.request, fixture, proposalOf(key), [
          ProposalState.Pending,
          ProposalState.Active,
          ProposalState.Defeated,
          ProposalState.Succeeded,
          ProposalState.Queued,
          ProposalState.Executed,
          ProposalState.Expired
        ])
      )
    );
    const open = new Set(
      keys.filter((_, index) => [ProposalState.Pending, ProposalState.Active].includes(bodies[index]!.state as 0 | 1))
    );
    for (const key of keys)
      if (!open.has(key)) test.info().annotations.push({ type: 'resumed', description: `${key}: voting closed` });
    for (const name of Object.keys(plan)) plan[name] = plan[name]!.filter(([key]) => open.has(key));
    if (!open.size) return;
    const opens = bodies.filter((_, index) => open.has(keys[index]!)).map((body) => body.vote_start);
    await waitForLedgerTime(Math.max(...opens), { governingS: fixture.votingDelayS, label: 'voting opens' });

    const sessions: Member[] = [];
    try {
      const voters = await Promise.all(
        Object.keys(plan).map(async (name) => {
          if (name === PROPOSER) {
            await signInOn(page, wallet, PROPOSER, `/dao/${fixture.slug}/proposals`);
            return { name, address: wallet.address!, page, wallet } as Member;
          }
          const opened = await member(others, name, `/dao/${fixture.slug}/proposals`);
          sessions.push(opened);
          return opened;
        })
      );
      await Promise.all(
        voters.map(async (voter) => {
          for (const [key, choice] of plan[voter.name]!) {
            const id = proposalOf(key);
            const votes = await (await page.request.get(`/api/dao/${fixture.daoId}/proposals/${id}/votes`)).json();
            if ((votes as { items: { voter: string }[] }).items.some((item) => item.voter === voter.address)) {
              test.info().annotations.push({ type: 'resumed', description: `${voter.name} already voted on ${key}` });
              continue;
            }
            await castVote(voter, fixture, id, choice, `W0${key === 'lifecycle' ? 7 : 8} ${choice} from ${voter.name}`);
          }
        })
      );
    } finally {
      await Promise.all(sessions.map((session) => session.context.close()));
    }
  }

  test('W07 three wallets vote For, Against and Abstain', async ({ page, wallet, browser, identities, theme }) => {
    test.setTimeout(15 * 60_000);
    await voteAll(
      page,
      wallet,
      { browser, identities, theme },
      {
        [PROPOSER]: [['lifecycle', 'For']],
        [MEMBER_A]: [['lifecycle', 'Against']],
        [MEMBER_B]: [['lifecycle', 'Abstain']]
      }
    );
    const id = proposalOf('lifecycle');
    await waitForVotes(page.request, fixture, id, [ids[PROPOSER]!, ids[MEMBER_A]!, ids[MEMBER_B]!]);
    await openProposal(page, fixture, id);
    const column = statusColumn(page);
    // While voting is open the founder's own vote replaces the form (a resumed run may be past it).
    const now = await waitForProposalState(page.request, fixture, id, Object.values(ProposalState));
    if (
      now.state === ProposalState.Active &&
      (await page.getByRole('button', { name: /^You, connected as/ }).isVisible())
    )
      await expect(column.getByText('You voted For')).toBeVisible();
    // 3 For + 2 Abstain = 5 of the 4 needed; 3 For beat 2 Against.
    await waitForUi('tally shown', (timeout) =>
      expect(column.getByText(`Quorum reached: 5 votes, ${fixture.quorum} needed`)).toBeVisible({ timeout })
    );
    await expect(column.getByText('More For than Against')).toBeVisible();
    await expect(page.getByText('3 members voted').first()).toBeVisible();
    for (const [name, choice] of [
      [PROPOSER, 'For'],
      [MEMBER_A, 'Against'],
      [MEMBER_B, 'Abstain']
    ] as const)
      await expect(page.getByText(`W07 ${choice} from ${name}`).first()).toBeVisible();
  });

  test('W08 members vote on the defeated, quorum and expiry cases', async ({
    page,
    wallet,
    browser,
    identities,
    theme
  }) => {
    test.setTimeout(15 * 60_000);
    await voteAll(
      page,
      wallet,
      { browser, identities, theme },
      {
        // defeated: For 2 + Abstain 2 reaches quorum 4, Against 3 beats For 2.
        // quorum: For 3 alone is one short of 4. expiry: For 3 + For 2 passes.
        [PROPOSER]: [
          ['defeated', 'Against'],
          ['quorum', 'For'],
          ['expiry', 'For']
        ],
        [MEMBER_A]: [
          ['defeated', 'For'],
          ['expiry', 'For']
        ],
        [MEMBER_B]: [['defeated', 'Abstain']]
      }
    );
  });

  /* ---------- W07 · queue ---------- */

  test('W07 the vote passes and anyone can queue it', async ({ page, wallet }) => {
    test.setTimeout(15 * 60_000);
    const id = proposalOf('lifecycle');
    let body = await waitForProposalState(page.request, fixture, id, [
      ProposalState.Active,
      ProposalState.Succeeded,
      ProposalState.Queued,
      ProposalState.Executed
    ]);
    await waitForLedgerTime(body.vote_end, { governingS: fixture.votingPeriodS, label: 'W07 voting closes' });
    body = await waitForProposalState(page.request, fixture, id, [
      ProposalState.Succeeded,
      ProposalState.Queued,
      ProposalState.Executed
    ]);

    // Anyone can queue: member B, who abstained, does it.
    wallet.use(MEMBER_B);
    await signInOn(page, wallet, MEMBER_B, `/dao/${fixture.slug}/proposals`);
    await openProposal(page, fixture, id);
    if (body.state === ProposalState.Succeeded) {
      await waitForUi('passed state shown', (timeout) =>
        expect(lifecycleHeading(page)).toHaveText('The vote passed', { timeout })
      );
      await expect(stateChip(page).getByText('Passed', { exact: true })).toBeVisible();
      await expect(statusColumn(page).getByText('Next, anyone can queue it.', { exact: false })).toBeVisible();
      const before = signedTransactions(wallet, MEMBER_B);
      await statusColumn(page).getByRole('button', { name: 'Queue for execution' }).click();
      await settleSend(page, 'Proposal queued', 'queue', statusColumn(page));
      expect(signedTransactions(wallet, MEMBER_B) - before).toBe(1);
    } else test.info().annotations.push({ type: 'resumed', description: 'already queued' });

    body = await waitForProposalState(page.request, fixture, id, [ProposalState.Queued, ProposalState.Executed]);
    if (body.state === ProposalState.Queued) {
      await waitForUi('safety delay shown', (timeout) =>
        expect(lifecycleHeading(page)).toContainText('Can run in', { timeout })
      );
      await expect(stateChip(page).getByText('Queued', { exact: true })).toBeVisible();
      await expect(statusColumn(page).getByRole('button', { name: 'Waiting for the safety delay' })).toBeDisabled();
      expect(body.eta - body.vote_end).toBeGreaterThanOrEqual(fixture.queueDelayS);
    }
  });

  /* ---------- W08 · outcomes ---------- */

  async function closedProposal(page: Page, key: ProposalKey, states: number[]) {
    const id = proposalOf(key);
    const open = await waitForProposalState(page.request, fixture, id, [ProposalState.Active, ...states]);
    await waitForLedgerTime(open.vote_end, { governingS: fixture.votingPeriodS, label: `W08 ${key} voting closes` });
    const body = await waitForProposalState(page.request, fixture, id, states);
    await openProposal(page, fixture, id);
    return body;
  }

  test('W08 defeated: quorum reached, more Against than For', async ({ page }) => {
    test.setTimeout(12 * 60_000);
    const body = await closedProposal(page, 'defeated', [ProposalState.Defeated]);
    expect([body.for_votes, body.against_votes, body.abstain_votes]).toEqual(['2', '3', '2']);
    await expect(stateChip(page).getByText("Didn't pass", { exact: true })).toBeVisible();
    await expect(lifecycleHeading(page)).toHaveText("The vote didn't pass");
    const column = statusColumn(page);
    await expect(column.getByText(`Quorum reached: 4 votes, ${fixture.quorum} needed`)).toBeVisible();
    await expect(column.getByText('Not more For than Against')).toBeVisible();
    await expect(column.getByRole('button', { name: /Queue|Execute/ })).toHaveCount(0);
    await expect(page.getByText('3 members voted').first()).toBeVisible();
  });

  test('W08 quorum not met: only For votes, too few of them', async ({ page }) => {
    test.setTimeout(12 * 60_000);
    const body = await closedProposal(page, 'quorum', [ProposalState.Defeated]);
    expect([body.for_votes, body.against_votes, body.abstain_votes]).toEqual(['3', '0', '0']);
    await expect(stateChip(page).getByText("Didn't pass", { exact: true })).toBeVisible();
    await expect(lifecycleHeading(page)).toHaveText("The vote didn't pass");
    const column = statusColumn(page);
    await expect(column.getByText(`Missed quorum by ${fixture.quorum - 3} vote`)).toBeVisible();
    await expect(column.getByText('More For than Against')).toBeVisible();
    await expect(column.getByRole('button', { name: /Queue|Execute/ })).toHaveCount(0);
  });

  test('W08 expired: a passed proposal nobody queues', async ({ page }) => {
    test.setTimeout(12 * 60_000);
    // This run's probe passes and is left alone: the Governor expires it 14 days after voting ends.
    const body = await closedProposal(page, 'expiry', [ProposalState.Succeeded, ProposalState.Expired]);
    expect(body.expiresAt).toBe(body.vote_end + 14 * 24 * 3600);
    await expect(stateChip(page).getByText('Passed', { exact: true })).toBeVisible();
    await expect(lifecycleHeading(page)).toHaveText('The vote passed');

    // Probes from runs at least 14 days ago have expired by now: each must read as Expired.
    const list = (await (
      await page.request.get(`/api/dao/${fixture.daoId}/proposals?limit=100`)
    ).json()) as ProposalListBody;
    const old = list.items.filter(
      (item) => /^W08 expiry /.test(item.metadata.title) && item.timestamp < Date.now() / 1000 - 14 * 24 * 3600 - 900
    );
    test.info().annotations.push({
      type: 'expiry',
      description: old.length
        ? `${old.length} probe(s) from earlier runs checked as Expired`
        : `No probe is 14 days old yet; this run's expires at ${new Date((body.expiresAt ?? 0) * 1000).toISOString()}`
    });
    for (const item of old) {
      const detail = await waitForProposalState(page.request, fixture, item.proposalId, [ProposalState.Expired]);
      expect(detail.label).toBe('Expired');
      await openProposal(page, fixture, item.proposalId);
      await expect(stateChip(page).getByText('Expired', { exact: true })).toBeVisible();
      await expect(lifecycleHeading(page)).toHaveText('Expired');
      await expect(statusColumn(page).getByText('It passed, but nobody queued it before the deadline.')).toBeVisible();
      await expect(statusColumn(page).getByRole('button', { name: /Queue|Execute/ })).toHaveCount(0);
    }
  });

  /* ---------- W07 · execute and verify ---------- */

  test('W07 waits out the safety delay, executes, and every action takes effect', async ({ page, wallet }) => {
    test.setTimeout(15 * 60_000);
    const id = proposalOf('lifecycle');
    let body: ProposalBody = await waitForProposalState(page.request, fixture, id, [
      ProposalState.Queued,
      ProposalState.Executed
    ]);
    const delegationBefore = runState().before?.delegationOn === 'true';

    await signInOn(page, wallet, PROPOSER, `/dao/${fixture.slug}/proposals`);
    if (body.state === ProposalState.Queued) {
      await waitForLedgerTime(body.eta, { governingS: fixture.queueDelayS, label: 'W07 safety delay ends' });
      const before = {
        treasury: treasuryStroops(fixture),
        a: await accountStroops(ids[MEMBER_A]!),
        b: await accountStroops(ids[MEMBER_B]!)
      };
      await openProposal(page, fixture, id);
      const execute = statusColumn(page).getByRole('button', { name: 'Execute now' });
      await waitForUi('Execute now enabled', (timeout) => expect(execute).toBeEnabled({ timeout }), { governingS: 60 });
      await expect(
        statusColumn(page).getByText('Runs all 3 actions above through the treasury.', { exact: false })
      ).toBeVisible();
      const signed = signedTransactions(wallet, PROPOSER);
      await execute.click();
      await settleSend(page, 'Proposal executed', 'execute', statusColumn(page));
      expect(signedTransactions(wallet, PROPOSER) - signed).toBe(1);

      // The effects, read from the chain: two payments out of the treasury, the rule flipped.
      expect(before.treasury - treasuryStroops(fixture)).toBe(xlmStroops(PAY_A) + xlmStroops(PAY_B));
      await expect.poll(() => accountStroops(ids[MEMBER_A]!)).toBe(before.a + xlmStroops(PAY_A));
      await expect.poll(() => accountStroops(ids[MEMBER_B]!)).toBe(before.b + xlmStroops(PAY_B));
    } else test.info().annotations.push({ type: 'resumed', description: 'already executed' });
    expect(membersOnlyDelegation(fixture)).toBe(!delegationBefore);

    body = await waitForProposalState(page.request, fixture, id, [ProposalState.Executed]);
    await openProposal(page, fixture, id);
    await expect(stateChip(page).getByText('Executed', { exact: true })).toBeVisible();
    await expect(lifecycleHeading(page)).toHaveText('Executed');
    // The receipt lists each call the treasury made.
    const receipt = page
      .getByRole('heading', { name: 'Executed', level: 2 })
      .locator('xpath=ancestor::section[1]')
      .filter({ hasText: 'Transaction' });
    await waitForUi(
      'execution receipt',
      (timeout) => expect(receipt.getByRole('list').getByRole('listitem')).toHaveCount(3, { timeout }),
      {
        governingS: 180
      }
    );

    // And the app reads the new rule back: the composer's picker shows it.
    await page.goto(`/dao/${fixture.slug}/proposals/create`);
    await page.getByRole('button', { name: 'Add an action' }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Add an action' })
        .getByRole('button', { name: `Members-only delegation Now: ${delegationBefore ? 'Off' : 'On'}` })
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
