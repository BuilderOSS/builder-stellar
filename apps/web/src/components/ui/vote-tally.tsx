import type { CSSProperties } from 'react';
import { css, sva } from 'styled-system/css';

const tally = sva({
  slots: ['root', 'bar', 'for', 'against', 'abstain', 'quorum', 'legend', 'item', 'swatch', 'value', 'note'],
  base: {
    root: { display: 'grid', gap: '2' },
    bar: {
      position: 'relative',
      display: 'flex',
      height: '2',
      borderRadius: 'full',
      bg: 'hover',
      overflow: 'hidden'
    },
    for: {
      bg: 'success',
      transitionProperty: 'flex-basis',
      transitionDuration: '420ms',
      transitionTimingFunction: 'out'
    },
    against: {
      bg: 'danger',
      transitionProperty: 'flex-basis',
      transitionDuration: '420ms',
      transitionTimingFunction: 'out'
    },
    abstain: {
      bg: 'ink.faint',
      transitionProperty: 'flex-basis',
      transitionDuration: '420ms',
      transitionTimingFunction: 'out'
    },
    quorum: {
      position: 'absolute',
      top: '-1',
      bottom: '-1',
      width: '2px',
      bg: 'ink',
      borderRadius: 'full',
      left: 'var(--quorum)'
    },
    legend: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: '4',
      rowGap: '1',
      textStyle: 'caption',
      color: 'ink.muted'
    },
    item: { display: 'inline-flex', alignItems: 'center', gap: '1.5' },
    swatch: { width: '2', height: '2', borderRadius: 'full' },
    value: { color: 'ink', fontWeight: '600', fontVariantNumeric: 'tabular-nums' },
    note: { ml: 'auto' }
  },
  variants: {
    compact: { true: { bar: { height: '1.5' } } }
  }
});

const swatchFor = css({ bg: 'success' });
const swatchAgainst = css({ bg: 'danger' });
const swatchAbstain = css({ bg: 'ink.faint' });

function toNumber(value: bigint | number | string) {
  const parsed = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * For / Against / Abstain as one bar with a labelled legend. Colour is never
 * the only cue: every segment has its word and count. Optional quorum marker.
 */
export function VoteTally({
  forVotes,
  againstVotes,
  abstainVotes,
  quorum,
  note,
  compact,
  formatValue = (value) => value.toLocaleString()
}: {
  forVotes: bigint | number | string;
  againstVotes: bigint | number | string;
  abstainVotes: bigint | number | string;
  /** Votes needed (For + Abstain usually count); draws a marker on the bar. */
  quorum?: bigint | number | string | null;
  note?: React.ReactNode;
  compact?: boolean;
  formatValue?: (value: number) => string;
}) {
  const classes = tally({ compact });
  const values = { for: toNumber(forVotes), against: toNumber(againstVotes), abstain: toNumber(abstainVotes) };
  const total = values.for + values.against + values.abstain;
  const quorumValue = quorum == null ? 0 : toNumber(quorum);
  const scale = Math.max(total, quorumValue, 1);
  const percent = (value: number) => `${(value / scale) * 100}%`;
  const summary = `For ${formatValue(values.for)}, Against ${formatValue(values.against)}, Abstain ${formatValue(values.abstain)}${
    quorumValue ? `, quorum ${formatValue(quorumValue)}` : ''
  }`;

  return (
    <div className={classes.root}>
      <div className={classes.bar} role="img" aria-label={summary}>
        <span className={classes.for} style={{ flexBasis: percent(values.for) }} />
        <span className={classes.against} style={{ flexBasis: percent(values.against) }} />
        <span className={classes.abstain} style={{ flexBasis: percent(values.abstain) }} />
        {quorumValue ? (
          <span className={classes.quorum} style={{ '--quorum': percent(quorumValue) } as CSSProperties} />
        ) : null}
      </div>
      <div className={classes.legend} aria-hidden="true">
        <span className={classes.item}>
          <span className={`${classes.swatch} ${swatchFor}`} />
          For <span className={classes.value}>{formatValue(values.for)}</span>
        </span>
        <span className={classes.item}>
          <span className={`${classes.swatch} ${swatchAgainst}`} />
          Against <span className={classes.value}>{formatValue(values.against)}</span>
        </span>
        <span className={classes.item}>
          <span className={`${classes.swatch} ${swatchAbstain}`} />
          Abstain <span className={classes.value}>{formatValue(values.abstain)}</span>
        </span>
        {note ? <span className={classes.note}>{note}</span> : null}
      </div>
    </div>
  );
}
