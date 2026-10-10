import type { ComponentProps } from 'react';
import { css, cx } from 'styled-system/css';
import { styled } from 'styled-system/jsx';
import { field } from 'styled-system/recipes';

export const Field = styled('div', field);

const labelClass = css({ display: 'block', textStyle: 'label', color: 'ink' });
const helperClass = css({ textStyle: 'caption', color: 'ink.muted', margin: '0' });
const errorClass = css({ textStyle: 'caption', color: 'danger', margin: '0', fontWeight: '600' });

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
