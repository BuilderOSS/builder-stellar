// psql connection settings from a postgres:// URL, handed over as a libpq service file and password file
// in a private temporary directory, never on the command line, where `ps` shows arguments to every local
// user. The same approach, and the same parsing, as db/lib.sh.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const decode = (value) => decodeURIComponent(value);
const TARGET_VARS = ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGREQUIRESSL', 'PGTARGETSESSIONATTRS'];
const pgpassEscape = (value) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

/**
 * The service file (host, port, dbname, user and every query parameter) and the password file line for a
 * URL. The user information ends at the last @, so an unencoded @ in a password still parses.
 */
export function pgServiceFiles(url) {
  const match = /^postgres(?:ql)?:\/\/(.*)$/s.exec(url ?? '');
  if (!match) throw new Error('DATABASE_URL must be a postgres:// or postgresql:// URL');
  if (url.includes('\n')) throw new Error('DATABASE_URL contains a line break');
  let rest = match[1];
  let query = '';
  if (rest.includes('?')) [rest, query] = [rest.slice(0, rest.indexOf('?')), rest.slice(rest.indexOf('?') + 1)];
  let auth = '';
  if (rest.includes('@')) [auth, rest] = [rest.slice(0, rest.lastIndexOf('@')), rest.slice(rest.lastIndexOf('@') + 1)];
  const hosts = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest;
  const path = rest.includes('/') ? rest.slice(rest.indexOf('/') + 1) : '';
  const user = auth.includes(':') ? decode(auth.slice(0, auth.indexOf(':'))) : decode(auth);
  const password = auth.includes(':') ? decode(auth.slice(auth.indexOf(':') + 1)) : '';

  const hostList = [];
  const portList = [];
  for (const entry of hosts.split(',')) {
    let host = entry;
    let port = '';
    if (entry.startsWith('[')) {
      host = entry.slice(1, entry.indexOf(']'));
      if (entry.includes(']:')) port = entry.slice(entry.indexOf(']:') + 2);
    } else if (entry.includes(':')) {
      [host, port] = [entry.slice(0, entry.indexOf(':')), entry.slice(entry.indexOf(':') + 1)];
    }
    hostList.push(decode(host));
    portList.push(port);
  }

  // Each setting once, no target overrides and no control characters, as in db/lib.sh: a repeated
  // ?port= or ?dbname= would win in libpq but not in a service file.
  const lines = ['[db]'];
  const seen = new Set();
  const add = (key, value) => {
    if (/[\x00-\x1f\x7f]/.test(value)) throw new Error(`DATABASE_URL has a control character in its ${key}`);
    if (['hostaddr', 'service', 'servicefile', 'passfile'].includes(key)) throw new Error(`DATABASE_URL may not set ${key}`);
    if (seen.has(key)) throw new Error(`DATABASE_URL sets ${key} more than once`);
    seen.add(key);
    lines.push(`${key}=${value}`);
  };
  if (hostList.some(Boolean)) add('host', hostList.join(','));
  if (portList.some(Boolean)) add('port', portList.join(','));
  if (path) add('dbname', decode(path));
  if (user) add('user', user);
  if (/[\x00-\x1f\x7f]/.test(password)) throw new Error('DATABASE_URL has a control character in its password');
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.includes('=') ? [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)] : [pair];
    add(decode(key), decode(value));
  }
  return { service: `${lines.join('\n')}\n`, pass: password ? `*:*:*:*:${pgpassEscape(password)}\n` : null };
}

/** Runs fn(env) with PGSERVICEFILE, PGSERVICE and PGPASSFILE set for the URL; the files are removed after. */
export function withPgEnv(url, fn) {
  const { service, pass } = pgServiceFiles(url);
  const dir = mkdtempSync(join(tmpdir(), 'pg-conn-'));
  try {
    writeFileSync(join(dir, 'service'), service, { mode: 0o600 });
    const env = { ...process.env };
    // Only the URL decides the target: the libpq variables that choose one are cleared.
    for (const name of TARGET_VARS) delete env[name];
    delete env.DATABASE_URL;
    Object.assign(env, { PGSERVICEFILE: join(dir, 'service'), PGSERVICE: 'db' });
    if (pass) {
      writeFileSync(join(dir, 'pass'), pass, { mode: 0o600 });
      env.PGPASSFILE = join(dir, 'pass');
    }
    return fn(env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
