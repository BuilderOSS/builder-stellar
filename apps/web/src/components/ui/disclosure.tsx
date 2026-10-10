'use client';

import { Collapsible } from '@ark-ui/react/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { sva } from 'styled-system/css';

const disclosure = sva({
  slots: ['root', 'trigger', 'icon', 'content', 'inner'],
  base: {
    root: { borderTopWidth: '1px', borderColor: 'rule' },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2',
      width: '100%',
      minH: 'touch',
      py: '2',
      bg: 'transparent',
      border: '0',
      color: 'ink.muted',
      textStyle: 'label',
      cursor: 'pointer',
      textAlign: 'left',
      _hover: { color: 'ink' },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' }
    },
    icon: {
      width: '4',
      height: '4',
      transitionProperty: 'rotate',
      transitionDuration: 'pop',
      transitionTimingFunction: 'out',
      '[data-state=open] > &': { rotate: '180deg' }
    },
    content: {
      overflow: 'hidden',
      _open: { animation: 'fadeIn 180ms token(easings.out)' }
    },
    inner: { display: 'grid', gap: '3', pb: '4' }
  }
});

/**
 * Progressive disclosure. The house use is "Technical details": contract ids,
 * hashes, ledgers and raw parameters live here, not in member-facing copy.
 */
export function Disclosure({
  title = 'Technical details',
  children,
  defaultOpen = false
}: {
  title?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const classes = disclosure();
  return (
    <Collapsible.Root className={classes.root} defaultOpen={defaultOpen} lazyMount>
      <Collapsible.Trigger className={classes.trigger}>
        {title}
        <ChevronDown aria-hidden="true" className={classes.icon} />
      </Collapsible.Trigger>
      <Collapsible.Content className={classes.content}>
        <div className={classes.inner}>{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
