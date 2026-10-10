'use client';

import { ark } from '@ark-ui/react/factory';
import type { ComponentProps } from 'react';
import { styled } from 'styled-system/jsx';
import { button } from 'styled-system/recipes';

const ButtonBase = styled(ark.button, button);

export function Button({
  style,
  static: isStatic,
  ...props
}: ComponentProps<typeof ButtonBase> & { static?: boolean }) {
  return <ButtonBase {...props} data-static={isStatic ? '' : undefined} style={style} />;
}
