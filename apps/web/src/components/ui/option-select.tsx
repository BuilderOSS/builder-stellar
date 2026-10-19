'use client';

import { Portal } from '@ark-ui/react/portal';
import { createListCollection, Select } from '@ark-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useMemo } from 'react';
import { css } from 'styled-system/css';

import { floatingPanel } from './popover';

const trigger = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  width: '100%',
  minH: 'touch',
  px: '3.5',
  py: '2',
  borderRadius: 'control',
  borderWidth: '1px',
  borderColor: 'rule',
  bg: 'raised',
  color: 'ink',
  textStyle: 'body',
  textAlign: 'left',
  cursor: 'pointer',
  '& svg': { width: '4', height: '4', flexShrink: '0' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  _disabled: { opacity: '0.5', cursor: 'not-allowed' }
});
const list = css({ maxH: '80', overflowY: 'auto', width: 'var(--reference-width)', p: '1.5' });
const item = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  minH: 'touch',
  px: '3',
  py: '2',
  borderRadius: 'sm',
  textStyle: 'body',
  cursor: 'pointer',
  _highlighted: { bg: 'hover' },
  _selected: { color: 'signal' },
  '& svg': { width: '4', height: '4' }
});

/** Token-styled, scrollable choices with Ark's keyboard, focus, and touch behaviour. */
export function OptionSelect({
  id,
  label,
  options,
  value,
  onValueChange,
  disabled
}: {
  id?: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const fallbackId = useId();
  const collection = useMemo(() => createListCollection({ items: options }), [options]);
  return (
    <Select.Root
      id={id ?? fallbackId}
      collection={collection}
      value={[value]}
      disabled={disabled}
      onValueChange={({ value }) => {
        if (value[0]) onValueChange(value[0]);
      }}
      positioning={{ sameWidth: true, placement: 'bottom-start' }}
      lazyMount
      unmountOnExit
    >
      <Select.Control>
        <Select.Trigger className={trigger} aria-label={label}>
          <Select.ValueText placeholder="Choose an action" />
          <Select.Indicator>
            <ChevronDown aria-hidden="true" />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content className={`${floatingPanel} ${list}`}>
            {collection.items.map((option) => (
              <Select.Item key={option.value} item={option} className={item}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect aria-label={label} />
    </Select.Root>
  );
}
