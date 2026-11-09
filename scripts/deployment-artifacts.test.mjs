import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { latestManagerArtifact } from './deployment-artifacts.mjs';

function directoryWith(files) {
  const directory = mkdtempSync(join(tmpdir(), 'deploys-'));
  mkdirSync(directory, { recursive: true });
  for (const [name, artifact] of Object.entries(files)) {
    writeFileSync(join(directory, name), JSON.stringify(artifact));
  }
  return directory;
}

test('picks the newest manager artifact by deployedAt', () => {
  const directory = directoryWith({
    'builder-testnet-manager.json': { manager: 'CREAL', deployedAt: '2026-10-13T12:36:44.291Z' },
    'other-testnet-manager.json': { manager: 'COLDER', deployedAt: '2026-10-01T00:00:00.000Z' }
  });
  try {
    assert.equal(latestManagerArtifact(directory).artifact.manager, 'CREAL');
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('ignores e2e rehearsal artifacts even when they are newer', () => {
  const directory = directoryWith({
    'builder-testnet-manager.json': { manager: 'CREAL', deployedAt: '2026-10-13T12:36:44.291Z' },
    'e2e-1791966647-testnet-manager.json': { manager: 'CREHEARSAL', deployedAt: '2026-10-14T08:35:10.027Z' }
  });
  try {
    const latest = latestManagerArtifact(directory);
    assert.equal(latest.artifact.manager, 'CREAL');
    assert.equal(latest.fileName, 'builder-testnet-manager.json');
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('fails when only e2e artifacts exist', () => {
  const directory = directoryWith({
    'e2e-1-testnet-manager.json': { manager: 'CREHEARSAL', deployedAt: '2026-10-14T08:35:10.027Z' }
  });
  try {
    assert.throws(() => latestManagerArtifact(directory), /No manager deployment artifacts/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('rejects an artifact without a manager or deployedAt', () => {
  const directory = directoryWith({ 'broken-testnet-manager.json': { manager: 'C1' } });
  try {
    assert.throws(() => latestManagerArtifact(directory), /must define manager and deployedAt/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
