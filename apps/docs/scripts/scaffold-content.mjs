// One-off: writes a placeholder content/<slug>.mdx for every nav page that has none.
// Existing files are never overwritten. Run: node scripts/scaffold-content.mjs
import fs from 'node:fs';
import path from 'node:path';

const nav = fs.readFileSync(new URL('../src/lib/nav.ts', import.meta.url), 'utf8');
const slugs = [
  ...[...nav.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]),
  ...[...nav.matchAll(/guide\('([^']+)', '([^']+)'/g)].map((m) => `guides/${m[1]}/${m[2]}`)
].filter((slug) => !slug.includes('${'));

const placeholder = '<Placeholder />\n';
const templates = {
  guides: `${placeholder}
## At the table

What you want to do, in one or two plain sentences.

## Before you start

Who can do this, which wallet you need, and anything else to have ready.

## Steps

Each step will have one screenshot from the app, in your theme.

## What happens on chain

<Disclosure title="Contracts, fees and waits">
Which contracts are called, what it costs, how long it takes, and who can see it.
</Disclosure>

## If something goes wrong

What to check, and how to recover.

## Related
`,
  concepts: `${placeholder}
## In plain words

The idea, for someone new to DAOs.

## The DAO term

The same idea, for people who know Nouns.

## Related
`,
  default: `${placeholder}
## Coming soon

This page is part of the docs plan.
`
};

let written = 0;
for (const slug of slugs) {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'content', `${slug}.mdx`);
  if (fs.existsSync(file)) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const kind = slug.split('/')[0];
  fs.writeFileSync(file, templates[kind] ?? templates.default);
  written += 1;
}
console.info(`Wrote ${written} placeholder pages.`);
