import { definePreset } from '@pandacss/dev';

import { breakpoints, conditions } from './conditions';
import { keyframes } from './keyframes';
import { recipes } from './recipes';
import { semanticTokens } from './semantic-tokens';
import { textStyles } from './text-styles';
import { tokens } from './tokens';

/**
 * Warm Ink · Dusk for Panda. List it after `@pandacss/preset-panda`; it only
 * extends, so Panda's own scales (spacing, sizes, colours) stay available.
 */
export const warmInkPreset = definePreset({
  name: 'warm-ink',
  conditions: { extend: conditions },
  theme: {
    extend: { breakpoints, tokens, semanticTokens, textStyles, keyframes, recipes }
  }
});

export { breakpoints, conditions, keyframes, recipes, semanticTokens, textStyles, tokens };
