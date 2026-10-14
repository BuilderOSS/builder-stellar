import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  claimed: null as { daoId: string } | null,
  previous: null as { daoId: string } | null,
  requested: [] as Array<{ daoId: string }>,
  drive: null as { deadline: { toString(): string } } | null
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    managerDao: {
      findFirst: vi.fn(async () => db.claimed),
      findMany: vi.fn(async () => db.requested)
    },
    managerDaoPreviousSlug: { findFirst: vi.fn(async () => db.previous) },
    managerAssuranceDrive: { findFirst: vi.fn(async () => db.drive) }
  }
}));

import { getAssuranceDeadlineFromDatabase, resolveDaoId } from './dao-db';

describe('resolveDaoId', () => {
  beforeEach(() => {
    db.claimed = null;
    db.previous = null;
    db.requested = [];
  });

  it('passes a contract id through', async () => {
    const id = `C${'A'.repeat(55)}`;
    await expect(resolveDaoId(id)).resolves.toBe(id);
  });

  it('prefers the DAO holding the slug now, even over a DAO that used to', async () => {
    db.claimed = { daoId: 'CNOW' };
    db.previous = { daoId: 'CBEFORE' };
    await expect(resolveDaoId('night-walkers')).resolves.toBe('CNOW');
  });

  it('sends an old link to the DAO that moved away from it while nobody holds it', async () => {
    db.previous = { daoId: 'CBEFORE' };
    db.requested = [{ daoId: 'CPENDING' }];
    await expect(resolveDaoId('night-walkers')).resolves.toBe('CBEFORE');
  });

  it('falls back to an unambiguous pending request, and fails otherwise', async () => {
    db.requested = [{ daoId: 'CPENDING' }];
    await expect(resolveDaoId('night-walkers')).resolves.toBe('CPENDING');
    db.requested = [{ daoId: 'C1' }, { daoId: 'C2' }];
    await expect(resolveDaoId('night-walkers')).rejects.toThrow(/DAO not found/);
  });
});

describe('getAssuranceDeadlineFromDatabase', () => {
  beforeEach(() => {
    db.drive = null;
  });

  it('reads the indexed drive deadline as unix seconds', async () => {
    // Prisma returns the numeric column as a Decimal.
    db.drive = { deadline: { toString: () => '1900000000' } };
    await expect(getAssuranceDeadlineFromDatabase('CDAO')).resolves.toBe(1_900_000_000);
  });

  it('is null for a DAO that never opened a drive', async () => {
    await expect(getAssuranceDeadlineFromDatabase('CDAO')).resolves.toBeNull();
  });
});
