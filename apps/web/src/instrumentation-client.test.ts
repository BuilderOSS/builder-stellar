import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('instrumentation-client', () => {
  it('puts zod in jitless mode before the app builds any schema', async () => {
    await import('./instrumentation-client');
    expect(z.config().jitless).toBe(true);
    // Object schemas still parse, and refuse what they should.
    const schema = z.object({ cid: z.string().min(1) });
    expect(schema.parse({ cid: 'bafy' })).toEqual({ cid: 'bafy' });
    expect(schema.safeParse({ cid: '' }).success).toBe(false);
  });
});
