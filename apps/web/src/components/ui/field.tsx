import type { ComponentProps } from 'react';
import { styled } from 'styled-system/jsx';
import { field } from 'styled-system/recipes';

export const Field = styled('div', field);

export function FieldLabel(props: ComponentProps<'label'>) {
  return (
    <label
      {...props}
      style={{
        display: 'block',
        color: 'var(--text-secondary)',
        fontSize: '0.88rem',
        fontWeight: 650,
        ...(props.style ?? {})
      }}
    />
  );
}

export function FieldHelperText(props: ComponentProps<'p'>) {
  return (
    <p
      {...props}
      style={{
        color: 'var(--text-tertiary)',
        fontSize: '0.82rem',
        lineHeight: 1.5,
        marginTop: '4px',
        ...(props.style ?? {})
      }}
    />
  );
}
