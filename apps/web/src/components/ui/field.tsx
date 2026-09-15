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
        color: 'rgba(176,201,229,0.88)',
        fontSize: '0.9rem',
        fontWeight: 500,
        ...(props.style ?? {})
      }}
    />
  );
}

export function FieldHelperText(props: ComponentProps<'p'>) {
  return (
    <p
      {...props}
      style={{ color: 'rgba(132,156,186,0.92)', fontSize: '0.85rem', marginTop: '2px', ...(props.style ?? {}) }}
    />
  );
}
