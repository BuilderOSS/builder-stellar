import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `tokenAttributes` reads metadata.token_seeds through raw SQL, which Prisma
 * cannot type-check. Pin its columns to the view definition so a renamed or
 * dropped column fails here instead of at request time.
 */
describe('onchain token metadata raw SQL', () => {
  it('names only columns metadata.token_seeds defines', () => {
    const source = readFileSync(path.join(__dirname, 'onchain-token-metadata.ts'), 'utf8');
    const sql = source.match(/SELECT selections FROM metadata\.token_seeds[\s\S]*?LIMIT 1/)?.[0];
    expect(sql).toBeDefined();
    const view = readFileSync(path.resolve(__dirname, '../../../../db/migrations/0006_metadata_views.sql'), 'utf8');
    const body = view.slice(view.indexOf('CREATE VIEW metadata.token_seeds'));
    const selectList = body.slice(body.indexOf('SELECT') + 6, body.indexOf('\nFROM'));
    const columns = selectList
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .filter(Boolean)
      .map((line) => line.match(/(\w+)$/)![1]);
    const used = [...sql!.matchAll(/\b([a-z_]+) = \$\{/g)].map((m) => m[1]);
    used.push('selections');
    for (const column of used) expect(columns, column).toContain(column);
    expect(sql).not.toContain('is_current');
  });
});
