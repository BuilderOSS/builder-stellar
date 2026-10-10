import { css, cx } from 'styled-system/css';

const mark = css({ display: 'block', flexShrink: '0', color: 'primary' });
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

/**
 * Builder's mark: a rounded tile with two square lenses joined by a bridge.
 * A quiet nod to the Nouns noggles that Builder grew from.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cx(mark, className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <g fill="none" stroke="var(--colors-primary-fg)" strokeWidth="2.25" strokeLinejoin="round">
        <rect x="7" y="11.5" width="8" height="8" rx="1.5" />
        <rect x="17.5" y="11.5" width="8" height="8" rx="1.5" />
        <path d="M15 15.5h2.5M7 15.5H4.5v3.5" strokeLinecap="round" />
      </g>
      <rect x="11" y="13.5" width="3" height="4" rx="0.75" fill="var(--colors-primary-fg)" />
      <rect x="21.5" y="13.5" width="3" height="4" rx="0.75" fill="var(--colors-primary-fg)" />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cx(lockup, className)}>
      <BrandMark size={30} />
      Builder
    </span>
  );
}
