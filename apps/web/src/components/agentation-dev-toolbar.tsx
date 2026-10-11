'use client';

import { Agentation } from 'agentation';

// Dev-only, opt-in. Both values are inlined by Next, so the branch is
// dead-code in production builds.
const enabled = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AGENTATION_ENABLED === 'true';

export function AgentationDevToolbar() {
  if (!enabled) return null;
  // Global shortcuts are off so the toolbar never intercepts keys the app or
  // wallet dialogs use; it is driven from its own buttons instead.
  return <Agentation endpoint="http://localhost:4747" appName="Builder" enableKeyboardShortcuts={false} />;
}
