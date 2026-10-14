import { css, cx } from 'styled-system/css';

const mark = css({ display: 'block', flexShrink: '0', color: 'signal' });
const joinedSeat = css({ fill: 'brass' });
const lockup = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2.5',
  color: 'ink',
  textDecoration: 'none',
  fontFamily: 'display',
  fontWeight: '700',
  fontSize: '1.125rem',
  letterSpacing: '-0.01em'
});
const wordmarkMuted = css({ fontWeight: '500', color: 'ink.muted' });

/**
 * Tribes Builder's mark, "the lens is the table": three people around a single Nouns lens,
 * with the seat nearest you left empty. When `joined`, that seat fills in brass ("yours").
 * Flat only: below 32px the favicon uses its own 16px drawing (app/icon.svg).
 */
export function BrandMark({
  size = 32,
  joined = false,
  className
}: {
  size?: number;
  joined?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={cx(mark, className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" fillRule="evenodd" d="M9 9h14v14H9zM11 11v10h5V11z" />
      <g fill="currentColor">
        <circle cx="16" cy="3.75" r="3.25" />
        <circle cx="28.25" cy="16" r="3.25" />
        <circle cx="3.75" cy="16" r="3.25" />
      </g>
      {joined ? (
        <circle className={joinedSeat} cx="16" cy="28.25" r="3.75" />
      ) : (
        <circle cx="16" cy="28.25" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** "Tribes" bold with a muted "Builder", in the display face. Inherits size from its parent. */
export function BrandWordmark() {
  return (
    <span>
      Tribes <span className={wordmarkMuted}>Builder</span>
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cx(lockup, className)}>
      <BrandMark size={30} />
      <BrandWordmark />
    </span>
  );
}

const BUILDER_DAO_URL = 'https://nouns.build/dao/base/0xe8af882f2f5c79580230710ac0e2344070099432';

/** Credit line linking to Builder DAO on nouns.build. Inherits the surrounding text style. */
export function BuilderDaoCredit({ className }: { className?: string }) {
  return (
    <a href={BUILDER_DAO_URL} target="_blank" rel="noopener noreferrer" className={className}>
      Built by Builder DAO
    </a>
  );
}
