import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['prisma', 'generate', '--schema', 'prisma/schema.prisma'], {
  cwd: new URL('../apps/web', import.meta.url),
  env: {
    ...process.env,
    // Prisma generate validates the URL but does not connect to the database.
    APP_DATABASE_URL: process.env.APP_DATABASE_URL || 'postgresql://localhost/neondb'
  },
  stdio: 'inherit'
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
