import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

import { writeRunJson } from './run.ts';

type Row = {
  id: string;
  title: string;
  project: string;
  status: string;
  durationMs: number;
  failureKind?: string;
  error?: string;
};

/**
 * Writes reports/<run-id>/summary.json: one row per test with the project (viewport × theme) and,
 * for failures, the wait class (`ledger-late`, `indexer-late`, `ui-timeout`) or `assertion`.
 */
export default class SummaryReporter implements Reporter {
  private rows: Row[] = [];
  private started = Date.now();

  onTestEnd(test: TestCase, result: TestResult) {
    // eslint-disable-next-line no-control-regex
    const message = (result.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '');
    const kind = /^(?:\w*Error: )?\[(ledger-late|indexer-late|ui-timeout)\]/.exec(message)?.[1];
    this.rows.push({
      id: test.title.match(/\bW\d{2}\b/)?.[0] ?? test.parent.title.match(/\bW\d{2}\b/)?.[0] ?? '',
      title: test.titlePath().slice(2).join(' › '),
      project: test.parent.project()?.name ?? '',
      status: result.status,
      durationMs: result.duration,
      ...(result.status === 'passed' || result.status === 'skipped'
        ? {}
        : { failureKind: kind ?? 'assertion', error: message.split('\n').slice(0, 4).join('\n') })
    });
  }

  onEnd(result: FullResult) {
    const count = (status: string) => this.rows.filter((row) => row.status === status).length;
    writeRunJson('summary.json', {
      runId: process.env.E2E_RUN_ID,
      status: result.status,
      startedAt: new Date(this.started).toISOString(),
      durationMs: Date.now() - this.started,
      totals: {
        passed: count('passed'),
        failed: count('failed') + count('timedOut'),
        skipped: count('skipped'),
        flaky: 0
      },
      tests: this.rows
    });
  }
}
