import { ark } from '@ark-ui/react/factory';
import { ChevronDown } from 'lucide-react';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { css } from 'styled-system/css';
import { styled } from 'styled-system/jsx';
import { select } from 'styled-system/recipes';

const SelectBase = styled(ark.select, select);

const wrap = css({ position: 'relative', width: '100%' });
const nativeSelect = css({ appearance: 'none' });
const chevron = css({
  position: 'absolute',
  right: '3.5',
  top: '50%',
  translate: '0 -50%',
  pointerEvents: 'none',
  color: 'ink.muted',
  width: '4',
  height: '4'
});

/** Native select, styled. Native keeps mobile pickers and form behaviour. */
export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<typeof ark.select>>(function Select(
  { children, className, ...props },
  ref
) {
  return (
    <div className={wrap}>
      <SelectBase ref={ref} {...props} className={[nativeSelect, className].filter(Boolean).join(' ')}>
        {children}
      </SelectBase>
      <ChevronDown aria-hidden="true" className={chevron} />
    </div>
  );
});
