import type { ComponentProps } from 'react';
import { css, cx } from 'styled-system/css';
import { styled } from 'styled-system/jsx';
import { field } from 'styled-system/recipes';

export const Field = styled('div', field);

const labelClass = css({ display: 'block', textStyle: 'label', color: 'ink' });
// Help and errors often quote an address or a URL: `anywhere` lets one break, so a long one can't
// widen the form past a phone's screen (BUG-W07-2). `break-word` breaks it but keeps the width.
const helperClass = css({ textStyle: 'caption', color: 'ink.muted', margin: '0', overflowWrap: 'anywhere' });
const errorClass = css({
  textStyle: 'caption',
  color: 'danger',
  margin: '0',
  fontWeight: '600',
  overflowWrap: 'anywhere'
});

export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  return <label {...props} className={cx(labelClass, className)} />;
}

/** Help under a field; `tone="error"` turns it into the field's error message. */
export function FieldHelperText({ className, tone, ...props }: ComponentProps<'p'> & { tone?: 'error' }) {
  return tone === 'error' ? (
    <p role="alert" {...props} className={cx(errorClass, className)} />
  ) : (
    <p {...props} className={cx(helperClass, className)} />
  );
}

export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return <p role="alert" {...props} className={cx(errorClass, className)} />;
}
