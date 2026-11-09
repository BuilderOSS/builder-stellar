import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Manager deployment the web app indexes: the newest `*-manager.json` in `deploys/` by
 * `deployedAt`. Rehearsal state from scripts/e2e-*.mjs never counts: its `e2e-*` files are
 * gitignored, and scripts/e2e-membership.mjs marks its relabelled Manager copy with `rehearsalOf`.
 * A newer rehearsal must never win over the real deployment, or the app would read a Manager the
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
      const deployedAt = new Date(artifact.deployedAt).getTime();
      if (Number.isNaN(deployedAt)) {
        throw new Error(`Manager deployment artifact ${path} has an unparseable deployedAt: ${JSON.stringify(artifact.deployedAt)}`);
      }

      return { artifact, fileName, deployedAt };
    })
    .filter(({ artifact }) => !artifact.rehearsalOf)
    .sort((left, right) => right.deployedAt - left.deployedAt);

  const latest = artifacts[0];
  if (!latest) {
    throw new Error(`No manager deployment artifacts found in ${deploysDirectory}`);
  }
  return { artifact: latest.artifact, fileName: latest.fileName };
}
