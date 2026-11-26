# The docs site (docs.tribes.build)

`apps/docs` is the user documentation for Tribe Builder: concepts, a guide for each flow,
and reference pages. It is a static Next.js site with MDX, on the same Warm Ink · Dusk
system as the app. The plan and its design decisions are in
`docs/plans/walkthroughs-and-docs.md` (§5, and the decisions in §12 and §14).

Every page in the information architecture is written: no page still uses `<Placeholder>`.
Screenshots come from the capture pipeline (`docs/qa/SHOWCASE_TRIBE.md`).

## Commands

| Command | What it does |
|---|---|
| `pnpm docs:dev` | Generates the Panda styles, then runs `next dev` on port 4320 |
| `pnpm docs:build` | Generates styles, runs `next build` (a static export to `apps/docs/out`, lint included), then `pagefind --site out` |
| `pnpm docs:check` | Serves `out/` and checks every page at 375, 768, and 1440px in light and dark, then walks the interactive states. Run `docs:build` first. |
| `pnpm --dir apps/docs search:dev` | Builds the site and copies its search index to `public/pagefind`, so search works in `next dev` |
| `pnpm --dir apps/docs start` | Serves `out/` on port 4321, the way the static host does |
| `pnpm --dir apps/docs lint`, `typecheck`, and `test` | The same checks CI runs |

`docs:check` launches Chromium through `playwright-core`. In CI, the workflow installs
Chromium with `playwright-core install --with-deps chromium`. Locally you can do the same,
or point `PLAYWRIGHT_CHROMIUM_PATH` at a Chromium you already have. `--only=/a/,/b/`
checks a subset of pages.

Next dev and next build share `apps/docs/.next`, so stop the dev server before you build.

## How it fits together

```
packages/design-tokens  ─┬─> apps/web    (panda.config.ts presets, fonts, theme runtime)
  preset, recipes,       └─> apps/docs
  fonts, theme runtime
packages/glossary       ─┬─> apps/web    (GlossaryTerm popovers)
                         └─> apps/docs   (/reference/glossary)
apps/web/src/components/ui ──> apps/docs (package export @builder-stellar/web/ui/*)
```

- **One design system.** `packages/design-tokens` holds the Panda preset (tokens,
  semantic tokens, the `dark` and `light` conditions, text styles, keyframes, and the
  primitive recipes), the three `next/font` faces, and the theme runtime. Both apps list
  the preset after `@pandacss/preset-panda`.
- **The app's primitives, not copies.** The docs import Button, Callout, Dialog,
  Disclosure, ListRow, SearchInput, Sheet, and ThemeSwitch (with its SegmentedControl) from
  `apps/web` through its `./ui/*` package export, plus `BrandMark` through `./brand-mark`.
  Those files import `styled-system/*`, which the docs resolve to their own generated
  system (the webpack alias in `next.config.mjs` and `paths` in `tsconfig.json`). The docs
  Panda config scans those files, so their styles are generated here too. Only import
  primitives that don't reach into the app (`@/lib`, contexts), directly or through another
  primitive: today that's every file in `components/ui` except `address`, `avatar`,
  `countdown`, `crest`, `duration-input`, `FallbackImage`, `guide-link`, `markdown`,
  `markdown-field`, `page-header`, and `short-id`.
- **Static.** `output: 'export'` with trailing slashes: `/guides/proposals/vote/` is
  `out/guides/proposals/vote/index.html`. There is no server and no API.

## Content model

- **The information architecture is `apps/docs/src/lib/nav.ts`.** It is the one list of
  sections and pages, in reading order. It drives the sidebar, the mobile nav sheet,
  Previous and Next, the home page paths, search suggestions, and the static params.
- **Each page is `apps/docs/content/<slug>.mdx`.** The route `src/app/[...slug]/page.tsx`
  renders the title and summary from `nav.ts`, then the MDX body. `nav.test.ts` fails if a
  nav page has no file or a file has no nav entry.
- **Adding a page:** add it to `nav.ts`, then run `node apps/docs/scripts/scaffold-content.mjs`,
  which writes a placeholder for every nav page that has no file (it never overwrites).
- **MDX components** (`src/mdx-components.tsx`): headings, paragraphs, lists, links, and
  code get the docs prose styles. Pages can also use `<Shot>`, `<Callout>`,
  `<Disclosure>`, `<GlossaryList>`, and `<Placeholder>` (the "not written yet" notice that
  `scaffold-content.mjs` writes). Internal links that start with `/` use Next links, links
  that start with `#` stay on the page, and others open in a new tab.
- **Guides use the page template** (plan §5.3): Overview, Before you start, Steps,
  What happens on chain (in a Disclosure), If something goes wrong, Related.
- **The table of contents** comes from the page's h2 and h3 headings, read from the MDX
  at build time (`src/lib/toc.ts`) with the same slugger rehype-slug uses for the ids.

## Layout and design

- **Read mode** (decision 1A). The home page is an index: the headline, two paths as
  ListRows, the core ideas, and one tribe's story with one framed shot. There's no hero
  art, card grid, or call-to-action button.
- **Columns.** From 1280px: nav, content, and an "On this page" aside. From 768px: nav and
  content, with the table of contents in a Disclosure above the content. Under 768px: one
  column. The nav is in a bottom Sheet from the header's Menu button (it opens at the
  current section with the current page in view, and closes when you navigate), and a
  sticky "On this page" control opens the table of contents in a Sheet.
- **Type** (decision 4A). The docs body is 17px Figtree at line-height 1.6 with a 68ch
  measure. Nav, table of contents, and labels keep the app's 15px body and 13px label.
  Headings use the `title` and `heading` text styles with more space above than below.
- **Browser surfaces** (decision 5A), in `src/app/globals.css` and `src/components/prose.ts`:
  links in `signal` with a 1px underline at a 0.2em offset; visited links mix `signal`
  70/30 with `ink.muted`; selection is `signal` at 25%; focus rings are 2px `signal` with
  a 2px offset; scrollbars are thin, in `rule` on `canvas`. The plan proposes these as
  shared DESIGN.md tokens, which hasn't happened yet.
- **Accessibility** (decision 6A). "Skip to content" is first in the tab order. Landmarks
  are `header`, `nav` ("Docs"), `main`, and `aside` ("On this page"), and the current page
  has `aria-current="page"`. Touch targets are at least 44px under a coarse pointer, and
  hover effects apply only under `(hover: hover) and (pointer: fine)`.
- **Contrast exceptions.** Two places use `ink` or `primary` where the plan said `signal`:
  the current nav page (`ink` on `signal.wash`), and the marker disc (`primary` behind white
  digits). In both cases `signal` misses AA in the dark theme.

## Theme

Dark, Light, and System, with the app's ThemeSwitch (the same SegmentedControl as the You
sheet): in the header from 768px, and in the nav sheet below that. The runtime is
`packages/design-tokens/src/theme.ts`, shared with the app.

- **Storage.** Choosing a theme writes the app's localStorage key
  `builder.warm-ink.theme.v1` and a `tribes-theme` cookie. On `tribes.build` and its
  subdomains the cookie is scoped to `.tribes.build`, so a choice made on one site carries
  to the other (plan §13.1, E3). Elsewhere, such as localhost and previews, it is
  host-only.
- **First paint.** The boot script in `<head>` reads the cookie, then localStorage, then
  falls back to the site default, before the body paints, so there's no flash. The docs
  default to System; the app defaults to Dark. Denied storage or cookies fall through to
  the next source.
- **Live changes.** System changes, other tabs (the storage event), and the other site
  (the cookie, re-read when the window regains focus) all update `[data-theme]`, with
  transitions suppressed for that frame.

## Search

Pagefind indexes the static export after `next build`. Only `[data-pagefind-body]` is
indexed: the article on each page and the home page, never the nav, table of contents, or
pager. The 404 and the component preview are excluded.

- ⌘K, Ctrl K, or `/` opens the dialog from anywhere. It opens instantly, with no motion.
  Focus is trapped, arrow keys move through results, Enter opens one, and Escape closes it
  and returns focus to the search button.
- **States** (plan §5.4a). Results appear as you type, with no spinner. No matches shows
  "No pages match", the glossary, and three popular guides (`POPULAR` in `nav.ts`). If
  the index fails to load, it says "Search isn't available right now" with a link to the
  guides. This is also what you see in `next dev` until you run `search:dev`.

## Screenshots: `<Shot>`

```mdx
<Shot id="create/identity/01" alt="The identity step with the tribe name filled in" />
```

- **Capture.** The images come from the real app on the dev deployment, following one
  example tribe, Lamplight. `docs/qa/SHOWCASE_TRIBE.md` has the story, the commands
  (`pnpm --dir apps/e2e build:capture`, then `capture-story.sh` beside the `90-drive` spec;
  `pnpm docs:capture` runs the story script), and the shots that can't be captured. Desktop
  is 1440 × 900 and mobile 375 × 812, both at 2x, saved as WebP.
- **Files.** `public/shots/<id>/{desktop,mobile}-{light,dark}.webp` and
  `public/shots/<id>/manifest.json`, written by the capture pipeline (P6, plan §5.6). The
  manifest shape is `ShotManifest` in `src/lib/shots.ts`: the app commit, ledger, capture
  time, each variant's pixel size and viewport, and the markers.
- **Theme.** Each device renders a light and a dark image, and CSS shows the one that
  matches `[data-theme]`. The images are lazy, and browsers defer lazy images that are
  hidden, so a reader normally downloads only the one they see.
- **Device** (decision 7A). Under 768px readers see the mobile capture; wider screens see
  desktop. A small muted "Show mobile" (or "Show desktop") under each figure switches every
  figure for the session (sessionStorage). Most readers never need it, so it is the size of
  a caption. A device is used only when both its theme images exist.
- **Markers** (decision 3A). Each manifest marker has a box per device, as fractions of
  the image. `<Shot>` draws a 2px `signal` ring 4px outside the box, at the control radius
  plus 4px, and a numbered 20px disc. Screen readers get "Step 2: the New proposal button"
  in the caption. The ring's geometry is passed as CSS variables in a `style` attribute:
  it's data from the manifest, and that's the only inline style in the docs.
- **States.** The image area is the `raised` colour at a fixed aspect ratio while it
  loads, with no shimmer and no layout shift. A shot with no manifest shows "Screenshot
  coming", and the step text must read correctly without it. A marker box outside the
  image, or a manifest filed under the wrong id, fails the build.
- **Preview.** `/preview/shot/` (no-index, not in the nav or search) shows a captured shot
  and a missing one. Its fixture, `public/shots/_preview/design-catalogue`, is the app's
  `/design` catalogue captured once by hand with the marker on "Open dialog".

## Glossary

`packages/glossary` holds each term's plain definition, its DAO term, and a slug. The app's
`GlossaryTerm` popover and the docs page `/reference/glossary` both read it, so the words
can't drift. `glossaryHref(key, origin)` links a term to its anchor on the docs site.

## Checks

- **Unit tests** (`pnpm --dir apps/docs test`): nav and content stay in step, the table of
  contents matches rehype-slug ids, manifest rules, the theme boot order, and glossary
  anchors. The app's `warm-ink-theme.test.ts` covers the shared cookie.
- **`pnpm docs:check`** (in CI after the build): every page at 3 widths × 2 themes with
  no horizontal scroll, no console errors, the right `data-theme`, and no serious or
  critical axe issues. Then, in both themes: the skip link, search by keyboard (Ctrl K,
  typing, Tab staying in the dialog, arrows, and Enter), the no-match and index-failure
  states, Escape returning focus, the nav sheet on a phone (current page marked and in
  view, closing on navigation), 44px touch targets, and the screenshot device toggle.

## Deploy

docs.tribes.build is the Vercel project `builder-stellar-docs`: root directory `apps/docs`,
build `pnpm build` (codegen, `next build`, Pagefind), output `out`, and production branch
`dev`. It is one site for both the dev and the production app. Its settings are in
[DEV_DEPLOYMENT.md](DEV_DEPLOYMENT.md), section 5. `NEXT_PUBLIC_DOCS_URL` overrides the
canonical origin (`metadataBase` in `src/app/layout.tsx`), so set it on previews to make
canonical and Open Graph URLs point at the preview.
