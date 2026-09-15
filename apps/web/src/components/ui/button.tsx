'use client';

import { ark } from '@ark-ui/react/factory';
import type { ComponentProps } from 'react';
import { styled } from 'styled-system/jsx';
import { button } from 'styled-system/recipes';

const ButtonBase = styled(ark.button, button);

export function Button({ style, ...props }: ComponentProps<typeof ButtonBase>) {
  return <ButtonBase {...props} style={{ borderRadius: '8px', ...style }} />;
}
