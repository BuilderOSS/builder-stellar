import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadsDisabledResponse } from './uploads-disabled-response';
import { uploadsEnabled } from './uploads-enabled';

describe('uploadsEnabled (BUG-W03-4)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is on only for the exact string "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_UPLOADS_ENABLED', 'true');
    expect(uploadsEnabled()).toBe(true);
    for (const value of ['false', '', '1', 'TRUE']) {
      vi.stubEnv('NEXT_PUBLIC_PINATA_UPLOADS_ENABLED', value);
      expect(uploadsEnabled()).toBe(false);
    }
  });

  it('answers 404 FEATURE_DISABLED while off', async () => {
    const response = uploadsDisabledResponse();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'File uploads are not enabled', code: 'FEATURE_DISABLED' });
  });
});
