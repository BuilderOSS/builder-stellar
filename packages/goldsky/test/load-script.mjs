import { readFileSync } from 'node:fs';

/** The pipeline's `invoke(data)` from one of the transform scripts in src/. */
export function loadInvoke(name) {
  const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
  return new Function(`${source}\nreturn invoke;`)();
}
