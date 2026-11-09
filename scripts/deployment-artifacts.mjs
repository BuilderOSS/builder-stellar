import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Manager deployment the web app indexes: the newest `*-manager.json` in `deploys/` by
 * `deployedAt`. `e2e-*` files are rehearsal state from scripts/e2e-*.mjs (gitignored): a newer
 * rehearsal must never win over the real deployment, or the app would read a Manager the
 * database does not hold.
 */
export function latestManagerArtifact(deploysDirectory) {
  const artifacts = readdirSync(deploysDirectory)
    .filter((fileName) => fileName.endsWith('-manager.json') && !fileName.startsWith('e2e-'))
    .map((fileName) => {
      const path = resolve(deploysDirectory, fileName);
      const artifact = JSON.parse(readFileSync(path, 'utf8'));

      if (!artifact.manager || !artifact.deployedAt) {
        throw new Error(`Manager deployment artifact ${path} must define manager and deployedAt`);
      }

      return { artifact, fileName };
    })
    .sort(
      ({ artifact: left }, { artifact: right }) =>
        new Date(right.deployedAt).getTime() - new Date(left.deployedAt).getTime()
    );

  const latest = artifacts[0];
  if (!latest) {
    throw new Error(`No manager deployment artifacts found in ${deploysDirectory}`);
  }
  return latest;
}
