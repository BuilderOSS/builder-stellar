'use client';

import { createToaster } from '@ark-ui/react/toast';

// Top placement keeps toasts clear of the phone tab bar and action bar.
export const toaster = createToaster({
  placement: 'top-end',
  overlap: true,
  gap: 12,
  max: 4,
  offsets: { top: 'calc(env(safe-area-inset-top) + 12px)', right: '12px', bottom: '12px', left: '12px' }
});
