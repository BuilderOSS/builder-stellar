'use client';

import { css } from 'styled-system/css';

import { Button, Callout, shortenId } from '@/components/ui';
import type { ParsedWalletList } from '@/lib/wallet-csv';

const SHOWN_PROBLEMS = 8;
const SHOWN_ROWS = 6;

const stats = css({ display: 'flex', flexWrap: 'wrap', gap: '6', m: '0' });
const stat = css({
  display: 'grid',
  gap: '0.5',
  '& dt': { textStyle: 'caption', color: 'ink.muted' },
  '& dd': { m: '0' }
});
const statValue = css({ textStyle: 'title', fontSize: '1.375rem', fontVariantNumeric: 'tabular-nums', color: 'ink' });
const issues = css({ m: '0', mt: '2', pl: '4', display: 'grid', gap: '1', textStyle: 'caption', color: 'ink' });
const table = css({
  width: '100%',
  borderCollapse: 'collapse',
  textStyle: 'caption',
  '& th': { textAlign: 'left', color: 'ink.muted', fontWeight: '600', pb: '2' },
  '& td': { py: '2', borderTopWidth: '1px', borderColor: 'rule', color: 'ink' },
  '& th:last-child, & td:last-child': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
});
const mono = css({ textStyle: 'mono', fontSize: '0.8125rem' });

function lineLabel(lines: number[]) {
  return lines.length === 2 ? `lines ${lines[0]} and ${lines[1]}` : `lines ${lines.join(', ')}`;
}

/** What the list will hold, and everything to fix before it can be published. */
export function ClaimListPreview({
  parsed,
  disabled,
  onCombine
}: {
  parsed: ParsedWalletList;
  disabled: boolean;
  onCombine: () => void;
}) {
  const wallets = new Set(parsed.rows.map((row) => row.address)).size;
  const { problems, duplicates } = parsed;
  return (
    <div className={css({ display: 'grid', gap: '4' })} aria-live="polite">
      <dl className={stats}>
        <div className={stat}>
          <dt>Wallets</dt>
          <dd className={statValue}>{wallets.toLocaleString()}</dd>
        </div>
        <div className={stat}>
          <dt>Tokens</dt>
          <dd className={statValue}>{parsed.total.toLocaleString()}</dd>
        </div>
      </dl>

      {problems.length ? (
        <Callout
          variant="error"
          title={`${problems.length.toLocaleString()} ${problems.length === 1 ? 'row needs' : 'rows need'} fixing`}
          description="Fix them in the file and upload it again. Nothing is published until every row reads cleanly."
        >
          <ul className={issues}>
            {problems.slice(0, SHOWN_PROBLEMS).map((problem, index) => (
              <li key={`${problem.line}:${index}`}>
                {problem.line ? `Line ${problem.line}: ` : ''}
                {problem.message}
              </li>
            ))}
            {problems.length > SHOWN_PROBLEMS ? (
              <li>And {(problems.length - SHOWN_PROBLEMS).toLocaleString()} more.</li>
            ) : null}
          </ul>
        </Callout>
      ) : null}

      {duplicates.length ? (
        <Callout
          variant="warning"
          title={`${duplicates.length.toLocaleString()} ${duplicates.length === 1 ? 'wallet is' : 'wallets are'} listed more than once`}
          description="Each wallet gets one entry. Combine them to add up their amounts, or fix the file if a row is a mistake."
        >
          <ul className={issues}>
            {duplicates.slice(0, SHOWN_PROBLEMS).map((duplicate) => (
              <li key={duplicate.address}>
                <span className={mono} title={duplicate.address}>
                  {shortenId(duplicate.address)}
                </span>{' '}
                on {lineLabel(duplicate.lines)}
              </li>
            ))}
            {duplicates.length > SHOWN_PROBLEMS ? (
              <li>And {(duplicates.length - SHOWN_PROBLEMS).toLocaleString()} more.</li>
            ) : null}
          </ul>
          <div className={css({ mt: '3' })}>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={onCombine}>
              Combine their amounts
            </Button>
          </div>
        </Callout>
      ) : null}

      {parsed.rows.length ? (
        <table className={table}>
          <caption className="sr-only">The first wallets on the list</caption>
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.slice(0, SHOWN_ROWS).map((row) => (
              <tr key={row.line}>
                <td className={mono} title={row.address}>
                  {shortenId(row.address)}
                </td>
                <td>{BigInt(row.amount).toLocaleString()}</td>
              </tr>
            ))}
            {parsed.rows.length > SHOWN_ROWS ? (
              <tr>
                <td colSpan={2} className={css({ color: 'ink.muted!' })}>
                  And {(parsed.rows.length - SHOWN_ROWS).toLocaleString()} more
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
