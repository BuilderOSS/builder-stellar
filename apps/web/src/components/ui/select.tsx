import { ark } from '@ark-ui/react/factory';
import { ChevronDown } from 'lucide-react';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { styled } from 'styled-system/jsx';
import { select } from 'styled-system/recipes';

const SelectBase = styled(ark.select, select);

export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<typeof ark.select>>(function Select(
  { children, style, ...props },
  ref
) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <SelectBase
        ref={ref}
        {...props}
        style={{
          appearance: 'none',
          paddingRight: '3rem',
          ...style
        }}
      >
        {children}
      </SelectBase>
      <ChevronDown
        aria-hidden="true"
        size={16}
        style={{
          position: 'absolute',
          right: '0.95rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'rgba(160,194,225,0.92)'
        }}
      />
    </div>
  );
});
