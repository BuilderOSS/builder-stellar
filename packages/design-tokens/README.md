# @builder-stellar/design-tokens

The Warm Ink · Dusk Panda preset, shared by `apps/web` and `apps/docs`. `DESIGN.md` is the
specification; these values must match it.

| Export                                 | What                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `warmInkPreset` (`.`)                  | Tokens, semantic tokens (light is `base`, dark is `_dark`), the `dark` and `light` conditions, the `sm` breakpoint, text styles, keyframes, and recipes |
| `@builder-stellar/design-tokens/fonts` | The three `next/font/google` faces and their CSS variables (`--font-display`, `--font-ui`, `--font-mono`)                                               |
| `@builder-stellar/design-tokens/theme` | The theme preference both sites share: the `tribes-theme` cookie, the localStorage fallback, and the boot script                                        |

A consuming app lists the preset after
`@pandacss/preset-panda` and adds the package to `transpilePackages` in `next.config.mjs`
(the fonts module runs through the Next font loader).

```ts
import { warmInkPreset } from '@builder-stellar/design-tokens';
import { preset as presetPanda } from '@pandacss/preset-panda';

export default defineConfig({ presets: [presetPanda, warmInkPreset] /* … */ });
```

Changing a value here changes both sites. Check the change in the web app's `/design` catalogue in both themes.
