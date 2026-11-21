import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressSteps } from './progress-steps';

const steps = [
  { id: 'allow', label: 'Allow the market to hold your token' },
  { id: 'list', label: 'List it for sale' }
];

describe('ProgressSteps', () => {
  beforeEach(() => vi.stubGlobal('React', React));

  it('names the current step on phones', () => {
    expect(renderToStaticMarkup(<ProgressSteps steps={steps} current={1} />)).toContain(
      'Step 2 of 2 · List it for sale'
    );
  });

  it('says every step is done past the last one, never "Step 3 of 2" (BUG-CAP-6)', () => {
    const html = renderToStaticMarkup(<ProgressSteps steps={steps} current={2} />);
    expect(html).toContain('All 2 steps done');
    expect(html).not.toMatch(/Step .*3.* of/);
  });
});
