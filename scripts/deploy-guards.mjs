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
 * A missing key is an error: the script creates one only with --generate-identity, never on mainnet,
 * and says so. Returns { address, generated }.
 */
export function resolveIdentity({ identityName, network, adminAddress, generate }, run = runQuiet) {
  let address = keyAddress(identityName, run);
  let generated = false;
  if (!address) {
    if (network === 'mainnet') {
      throw new Error(
        `No stellar key named ${identityName}. A mainnet admin key is created and stored as docs/KEY_CUSTODY.md ` +
          'describes (a hardware wallet or the OS secure store), never by this script.'
      );
    }
    if (!generate) {
      throw new Error(
        `No stellar key named ${identityName}. Add the admin key first (stellar keys add ${identityName} --secure-store), ` +
          'or pass --generate-identity to create a new local or testnet key.'
      );
    }
    const created = run('stellar', ['keys', 'generate', identityName]);
    if (!created.ok) throw new Error(`stellar keys generate ${identityName} failed: ${(created.stderr || created.stdout).trim()}`);
    address = keyAddress(identityName, run);
    if (!address) throw new Error(`Generated ${identityName}, but stellar keys address returned nothing`);
    generated = true;
  }
  if (address !== adminAddress) {
    throw new Error(
      `The deploy identity ${identityName} is ${address}, but the config's adminAddress is ${adminAddress}. ` +
        'They must be the same key: this script signs the admin calls with the identity. To give the Manager ' +
        'another admin (a multisig account, say), deploy with a single key, then propose_admin and accept_admin ' +
        '(docs/KEY_CUSTODY.md).'
    );
  }
  return { address, generated };
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
