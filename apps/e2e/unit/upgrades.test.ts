import { describe, expect, it } from 'vitest';

import { type ModuleState, type RegistryState, W16, w16Phase } from '../src/upgrades.ts';

const onOld: ModuleState = { version: W16.from.version, hash: W16.from.hash, storageVersion: W16.from.storage };
const ready: RegistryState = {
  target: { name: 'Metadata', version: W16.to.version, revoked: false },
  approved: true,
  latest: W16.to.hash
};

describe('w16Phase', () => {
  it('lists every admin step still missing, in order', () => {
    expect(w16Phase({ target: null, approved: false, latest: W16.from.hash }, onOld)).toEqual({
      phase: 'awaiting-admin',
      missing: [
        '1. register_implementation Metadata 0.4.1',
        '2. approve_upgrade 0.4.0 -> 0.4.1',
        '3. set_latest_implementation Metadata 0.4.1'
      ]
    });
    expect(w16Phase({ ...ready, latest: W16.from.hash }, onOld)).toEqual({
      phase: 'awaiting-admin',
      missing: ['3. set_latest_implementation Metadata 0.4.1']
    });
  });

  it('is available once registered, approved and announced', () => {
    expect(w16Phase(ready, onOld)).toEqual({ phase: 'available' });
  });

  it('tells an upgrade without its migration from a finished run', () => {
    const upgraded = { version: W16.to.version, hash: W16.to.hash, storageVersion: W16.from.storage };
    expect(w16Phase(ready, upgraded)).toEqual({ phase: 'upgraded-not-migrated' });
    expect(w16Phase(ready, { ...upgraded, storageVersion: W16.to.storage })).toEqual({ phase: 'done' });
  });

  it('refuses a wrong registration, a revoked candidate or an unknown running hash', () => {
    expect(() => w16Phase({ ...ready, target: { name: 'Metadata', version: '0.5.0', revoked: false } }, onOld)).toThrow(
      /registered as Metadata 0.5.0/
    );
    expect(() => w16Phase({ ...ready, target: { ...ready.target!, revoked: true } }, onOld)).toThrow(/revoked/);
    expect(() => w16Phase(ready, { ...onOld, hash: 'f'.repeat(64) })).toThrow(/neither/);
  });
});
