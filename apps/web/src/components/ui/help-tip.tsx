'use client';

import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Popover } from './popover';

const trigger = css({
  display: 'inline-grid',
  placeItems: 'center',
  verticalAlign: 'middle',
  width: '6',
  height: '6',
  p: '0',
  mx: '1',
  border: '0',
  borderRadius: 'full',
  bg: 'transparent',
  color: 'ink.muted',
  cursor: 'help',
  '& svg': { width: '4', height: '4' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { color: 'signal' } }
});

/** Help available on touch and keyboard, as well as with a pointer. */
export function HelpTip({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <Popover
      id={id}
      label={label}
      placement="top"
      trigger={
        <button type="button" className={trigger} aria-label={`About ${label.toLowerCase()}`}>
          <CircleHelp aria-hidden="true" />
        </button>
      }
    >
      <div className={css({ textStyle: 'caption', lineHeight: '1.6' })}>{children}</div>
    </Popover>
  );
}
