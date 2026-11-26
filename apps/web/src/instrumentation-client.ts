/**
 * Runs in the browser before the app's own code (Next's instrumentation-client hook).
 *
 * Zod compiles object schemas into a faster parser with `new Function`, after probing whether it
 * may. The page Content-Security-Policy has no 'unsafe-eval', so the probe and the compile each
 * raised a violation report on every page. Jitless mode skips both; parsing gives the same results.
 */
import { z } from 'zod';

z.config({ jitless: true });
