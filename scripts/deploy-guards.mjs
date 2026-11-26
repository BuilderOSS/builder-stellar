// Checks scripts/deploy-manager.mjs runs before it sends anything (docs/MANAGER_DEPLOYMENT.md). Each one
// takes its command runner and prompt as arguments, so scripts/deploy-guards.test.mjs can run them offline.
import { LEDGERS_PER_DAY, runQuiet } from './lib.mjs';

export const PUBLIC_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

// Every DAO depends on the Manager (registry, factory), and the upgrade notice is the time a DAO has to see
// an approved Manager upgrade and react before it can land. 7 days is the default; a mainnet Manager may not
// start with less. The admin can still change it later with set_upgrade_delay, where a reduction waits out
// the notice in force.
export const DEFAULT_UPGRADE_DELAY_LEDGERS = 7 * LEDGERS_PER_DAY;
export const MAINNET_MIN_UPGRADE_DELAY_LEDGERS = 7 * LEDGERS_PER_DAY;

/** The upgrade delay to deploy with: the config's value, else 7 days; refused below the mainnet minimum. */
export function upgradeDelayFor(network, configured) {
  const value = Number(configured ?? DEFAULT_UPGRADE_DELAY_LEDGERS);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`upgradeDelayLedgers must be a non-negative integer, got ${configured}`);
  }
  if (network === 'mainnet' && value < MAINNET_MIN_UPGRADE_DELAY_LEDGERS) {
    throw new Error(
      `upgradeDelayLedgers ${value} is below the mainnet minimum of ${MAINNET_MIN_UPGRADE_DELAY_LEDGERS} ledgers (7 days). ` +
        'DAOs rely on the notice to react to an approved Manager upgrade.'
    );
  }
  return value;
}

/** A mainnet config must name the public network, so a copied testnet passphrase can't slip through. */
export function assertNetworkPassphrase(network, passphrase) {
  if (network === 'mainnet' && passphrase !== PUBLIC_NETWORK_PASSPHRASE) {
    throw new Error(`A mainnet config must use the network passphrase "${PUBLIC_NETWORK_PASSPHRASE}", got "${passphrase}"`);
  }
}

// What the deployed WASM and its recorded versions are built from.
export const BUILD_INPUTS = ['contracts', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo', 'releases'];

/** `git status` lines for uncommitted changes (untracked files included) to the build inputs. */
export function uncommittedBuildInputs(run = runQuiet) {
  const result = run('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', ...BUILD_INPUTS]);
  if (!result.ok) {
    throw new Error(`git status failed, so the build inputs can't be checked: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Whether a Manager deploy must upload the published build of a pushed release tag, checked for every
 * crate with `assertUploadProvenance` (scripts/wasm-build.mjs) before any network call. A local network
 * never needs it. Testnet does, unless the deploy is a throwaway rehearsal run with
 * `--allow-unpublished`. Mainnet always does, and refuses the flag.
 */
export function publishedBuildRequired(network, allowUnpublished) {
  if (network === 'local') return false;
  if (allowUnpublished && network === 'mainnet') {
    throw new Error('--allow-unpublished is for testnet rehearsals: a mainnet Manager uploads only the published build of a release tag.');
  }
  return !allowUnpublished;
}

/**
 * Refuses a mainnet deploy from uncommitted build inputs: the artifact records `sourceCommit`, and the
 * WASM must be what that commit builds. Elsewhere it returns a warning to print instead.
 */
export function checkBuildInputs(network, dirty) {
  if (dirty.length === 0) return null;
  const list = dirty.slice(0, 10).join('\n  ');
  if (network === 'mainnet') {
    throw new Error(`Refusing a mainnet deploy with uncommitted build inputs:\n  ${list}\nCommit them, or check out a clean tree.`);
  }
  return `WARNING: uncommitted build inputs; the artifact's sourceCommit does not describe this WASM:\n  ${list}`;
}

function keyAddress(identityName, run) {
  const result = run('stellar', ['keys', 'address', identityName]);
  return result.ok ? result.stdout.trim() : null;
}

/**
 * The deploy identity signs every admin call this script makes (register_implementation,
 * set_latest_implementation, set_current_implementations), so it must be the config's adminAddress.
 * The script never creates a key: a missing one is an error (local-up.mjs makes the local admin and
 * writes its address into the local config). Returns the address.
 */
export function resolveIdentity({ identityName, adminAddress }, run = runQuiet) {
  const address = keyAddress(identityName, run);
  if (!address) {
    throw new Error(
      `No stellar key named ${identityName}. Add the admin key first, stored as docs/KEY_CUSTODY.md describes ` +
        `(stellar keys add ${identityName} --ledger, or --secure-store); this script never creates one.`
    );
  }
  if (address !== adminAddress) {
    throw new Error(
      `The deploy identity ${identityName} is ${address}, but the config's adminAddress is ${adminAddress}. ` +
        'They must be the same key: this script signs the admin calls with the identity. To give the Manager ' +
        'another admin (a multisig account, say), deploy with a single key, then propose_admin and accept_admin ' +
        '(docs/KEY_CUSTODY.md).'
    );
  }
  return address;
}

/**
 * On mainnet, shows what is about to be deployed and asks for `mainnet <label>`, typed in full. There is
 * no flag that skips it, and without a terminal the deploy is refused.
 */
export async function confirmMainnet({ label, summary, isTTY, ask }) {
  if (!isTTY) {
    throw new Error('Refusing a mainnet deploy without a terminal: the confirmation is typed, and no flag skips it.');
  }
  const expected = `mainnet ${label}`;
  const answer = await ask(`${summary.join('\n')}\n\nType "${expected}" to deploy: `);
  if (answer.trim() !== expected) {
    throw new Error(`Mainnet deploy cancelled: "${answer.trim()}" is not "${expected}"`);
  }
}
