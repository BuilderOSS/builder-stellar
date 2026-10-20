import { describe, expect, it } from 'vitest';

import { reviewGapText, reviewReadiness } from './review-readiness';
import { action } from './test-fixtures';

const filled = { title: 'Fund the tool library', description: 'Winter is coming.', url: '' };
const empty = { title: '', description: '', url: '' };

describe('reviewReadiness', () => {
  it('lists what is still empty, in page order', () => {
    expect(reviewReadiness(empty, []).missing).toEqual(['title', 'why', 'change']);
    expect(reviewReadiness({ ...filled, title: ' ' }, [action('pause-auction')]).missing).toEqual(['title']);
    expect(reviewReadiness(filled, []).missing).toEqual(['change']);
  });

  it('is ready with a title, a why and a change, whichever came first', () => {
    expect(reviewReadiness(filled, [action('pause-auction')])).toEqual({ ready: true, missing: [], problem: null });
  });

  it('reports a problem with filled-in text once nothing is missing', () => {
    const result = reviewReadiness({ ...filled, url: 'not a link' }, [action('pause-auction')]);
    expect(result.ready).toBe(false);
    expect(result.problem).toBeTruthy();
  });
});

describe('reviewGapText', () => {
  it('says what to add in one line', () => {
    expect(reviewGapText(reviewReadiness(empty, []))).toBe('Add a title, why and at least one change to review.');
    expect(reviewGapText(reviewReadiness(filled, []))).toBe('Add at least one change to review.');
    expect(reviewGapText(reviewReadiness({ ...filled, description: '' }, []))).toBe(
      'Add why and at least one change to review.'
    );
    expect(reviewGapText(reviewReadiness(filled, [action('pause-auction')]))).toBe('');
  });
});
