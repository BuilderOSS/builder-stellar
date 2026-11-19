import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { signInAs } from '../src/connect.ts';
import { expect, test } from '../src/fixtures.ts';
import { snap } from '../src/capture.ts';
import { FIXTURES, lamplight, SHOWCASE, showcaseIdentities, showcaseState } from '../src/showcase.ts';
import {
  openProposal,
  pressAndSettle,
  ProposalState,
  statusColumn,
  voteFor,
  waitForProposalState
} from '../src/w09/proposals.ts';
import { latestLedger, waitForLedgerTime, waitForUi, waitForVisible } from '../src/waits.ts';

/**
 * The founder's side of the story, run in a process of its own next to the story specs:
 *   E2E_SKIP_PREFLIGHT=1 pnpm --dir apps/e2e capture capture/90-drive.capture.ts
 * It votes For on every proposal the story makes as soon as voting opens, then queues and executes
 * it, so a ten-minute voting window never closes while a story spec is still drafting. Proposal 1 is
 * photographed passed, queued and executed (docs: proposals/queue-and-execute). It stops when every
 * proposal is executed and the story has set `storyDone` in state.json, or after three hours.
 * The cancelled and the open proposal ("cancel", "walk") are left alone.
 */
const SKIP = new Set(['cancel', 'walk']);
const DRIVE_FILE = join(FIXTURES, 'drive-state.json');
type Drive = { voted: Record<string, boolean>; executed: Record<string, boolean>; shots: Record<string, boolean> };
const drive = (): Drive =>
  existsSync(DRIVE_FILE)
    ? (JSON.parse(readFileSync(DRIVE_FILE, 'utf8')) as Drive)
    : { voted: {}, executed: {}, shots: {} };
const saveDrive = (update: (d: Drive) => void) => {
  const d = drive();
  update(d);
  writeFileSync(DRIVE_FILE, `${JSON.stringify(d, null, 2)}\n`);
};

test('Lamplight: the founder votes, queues and executes', async ({ page, wallet }) => {
  const tribe = lamplight();
  showcaseIdentities();
  test.setTimeout(3 * 60 * 60_000);
  await page.goto(`/dao/${SHOWCASE.slug}/proposals`);
  await signInAs(page, wallet, 'e2e-founder');

  for (;;) {
    const proposals = showcaseState().proposals ?? {};
    const left = Object.keys(proposals).filter((key) => !SKIP.has(key) && !drive().executed[key]);
    if (!left.length && showcaseState().storyDone) break;
    let acted = false;
    const due: number[] = [];
    const { closeTime: now } = await latestLedger();
    for (const key of left) {
      const id = proposals[key]!;
      const body = await waitForProposalState(page, tribe, id, Object.values(ProposalState), 60);
      switch (body.state) {
        case ProposalState.Pending:
          due.push(body.vote_start + 1);
          break;
        case ProposalState.Active:
          if (drive().voted[key]) due.push(body.vote_end + 1);
          else {
            await voteFor(page, wallet, 'e2e-founder', tribe, id);
            saveDrive((d) => {
              d.voted[key] = true;
            });
            console.info(`drive: ${key} voted For`);
            acted = true;
          }
          break;
        case ProposalState.Succeeded:
          if (key === 'workshop' && !drive().shots.passed) {
            await openProposal(page, tribe, id);
            const queue = statusColumn(page).getByRole('button', { name: 'Queue for execution' });
            await waitForVisible(queue, 'queue button');
            await snap(page, 'proposals/queue-and-execute/01', { top: true });
            await snap(page, 'proposals/queue-and-execute/02', {
              markers: [{ label: 'the Queue for execution button', locator: queue }]
            });
            saveDrive((d) => {
              d.shots.passed = true;
            });
          }
          await pressAndSettle(page, wallet, 'e2e-founder', tribe, id, 'Queue for execution', 'Proposal queued');
          console.info(`drive: ${key} queued`);
          acted = true;
          break;
        case ProposalState.Queued:
          if (now >= body.eta) {
            if (key === 'workshop' && !drive().shots.ready) {
              await openProposal(page, tribe, id);
              const execute = statusColumn(page).getByRole('button', { name: 'Execute now' });
              await waitForUi('execute enabled', (timeout) => expect(execute).toBeEnabled({ timeout }), {
                governingS: 60
              });
              await snap(page, 'proposals/queue-and-execute/04', {
                markers: [{ label: 'the Execute now button', locator: execute }]
              });
              saveDrive((d) => {
                d.shots.ready = true;
              });
            }
            await pressAndSettle(page, wallet, 'e2e-founder', tribe, id, 'Execute now', 'Proposal executed');
            await waitForProposalState(page, tribe, id, [ProposalState.Executed], 60);
            if (key === 'workshop') {
              await openProposal(page, tribe, id);
              const executed = page.getByRole('heading', { name: /^Executed/ }).first();
              await waitForVisible(executed, 'executed section', { governingS: 60 });
              await snap(page, 'proposals/queue-and-execute/05', { focus: executed });
            }
            saveDrive((d) => {
              d.executed[key] = true;
            });
            console.info(`drive: ${key} executed`);
            acted = true;
          } else {
            if (key === 'workshop' && !drive().shots.queued) {
              await openProposal(page, tribe, id);
              const waiting = statusColumn(page).getByRole('button', { name: /^Waiting for the safety delay/ });
              await waitForVisible(waiting, 'safety delay button');
              await snap(page, 'proposals/queue-and-execute/03', { focus: waiting });
              saveDrive((d) => {
                d.shots.queued = true;
              });
            }
            due.push(body.eta + 1);
          }
          break;
        case ProposalState.Executed:
          saveDrive((d) => {
            d.executed[key] = true;
          });
          break;
        default:
          throw new Error(`${key} (${id}) is in state ${body.state}, not on its way to Executed`);
      }
    }
    // New proposals can arrive at any time: look again within 30 seconds.
    if (!acted) {
      const target = Math.min(now + 30, ...due);
      await waitForLedgerTime(target, { governingS: Math.max(60, target - now), label: 'next proposal step' });
    }
  }
});
