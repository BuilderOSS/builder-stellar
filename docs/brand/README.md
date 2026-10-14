# Tribes Builder press kit

The rules for using these files are in the Brand and Logo section of [DESIGN.md](../../DESIGN.md). In short: flat blue is the master, the Dusk tile is the app icon, brass means "yours", and the glyph never gets a gradient.

| File | Use |
|---|---|
| `tribes-builder-mark-blue.svg` | Master mark, flat blue `#0068D6`, empty seat |
| `tribes-builder-mark-ink.svg` | One colour on light grounds, ink `#221E19` |
| `tribes-builder-mark-paper.svg` | One colour on dark grounds, paper `#F3EDE5` |
| `tribes-builder-lockup-light.svg` | Mark and wordmark for light backgrounds |
| `tribes-builder-lockup-dark.svg` | Mark and wordmark for dark backgrounds |
| `tribes-builder-tile-dusk.svg` | Dusk tile, vector source of the app icon |
| `tribes-builder-tile-dusk-1024.png` | Dusk tile at 1024px for avatars and stores |
| `tribes-builder-favicon-16.svg` | The dedicated 16px drawing; use it for anything under 32px |

The wordmark in the lockups is Bricolage Grotesque (SIL Open Font License), converted to outlines: "Tribes" at 700 and "Builder" at 500, muted. Keep one head's diameter of clear space on every side.

The app draws the same mark in code: `apps/web/src/components/shell/brand-mark.tsx` (mark and lockup), `apps/web/src/app/icon.svg` (favicon), `apps/web/src/lib/brand-tile.tsx` (Dusk tile for the Apple and manifest icons). Change those first, then export this kit again.
