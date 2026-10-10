'use client';

import { Search, X } from 'lucide-react';
import { type ComponentProps, forwardRef } from 'react';
import { css, cx } from 'styled-system/css';
import { input } from 'styled-system/recipes';

import { IconButton } from './button';

const wrap = css({ position: 'relative', width: '100%' });
const icon = css({
  position: 'absolute',
  left: '3.5',
  top: '50%',
  translate: '0 -50%',
  width: '4',
  height: '4',
  color: 'ink.muted',
  pointerEvents: 'none'
});
const field = css({ pl: '10', pr: '11', '&::-webkit-search-cancel-button': { display: 'none' } });
const clear = css({ position: 'absolute', right: '0.5', top: '50%', translate: '0 -50%' });

type SearchInputProps = Omit<ComponentProps<'input'>, 'type' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, label, className, ...props },
  ref
) {
  return (
    <div className={wrap}>
      <Search aria-hidden="true" className={icon} />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cx(input(), field, className)}
        {...props}
      />
      {value ? (
        <span className={clear}>
          <IconButton label="Clear search" size="sm" onClick={() => onValueChange('')}>
            <X aria-hidden="true" />
          </IconButton>
        </span>
      ) : null}
    </div>
  );
});
