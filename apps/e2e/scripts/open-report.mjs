#!/usr/bin/env node
// pnpm --dir apps/e2e report [run-id]  (default: the newest run)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reports = resolve(fileURLToPath(new URL('../reports', import.meta.url)));
const id = process.argv[2] || readdirSync(reports).sort().at(-1);
if (!id) throw new Error('No runs in apps/e2e/reports yet.');
spawnSync('pnpm', ['exec', 'playwright', 'show-report', resolve(reports, id, 'html')], { stdio: 'inherit' });
