// psql connection settings from a postgres:// URL, handed over as a libpq service file and password file
// in a private temporary directory, never on the command line, where `ps` shows arguments to every local
// user. The same approach, and the same parsing, as db/lib.sh.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const decode = (value) => decodeURIComponent(value);
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

  const lines = ['[db]'];
  if (hostList.some(Boolean)) lines.push(`host=${hostList.join(',')}`);
  if (portList.some(Boolean)) lines.push(`port=${portList.join(',')}`);
  if (path) lines.push(`dbname=${decode(path)}`);
  if (user) lines.push(`user=${user}`);
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.includes('=') ? [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)] : [pair];
    lines.push(`${decode(key)}=${decode(value)}`);
  }
  return { service: `${lines.join('\n')}\n`, pass: password ? `*:*:*:*:${pgpassEscape(password)}\n` : null };
}

/** Runs fn(env) with PGSERVICEFILE, PGSERVICE and PGPASSFILE set for the URL; the files are removed after. */
export function withPgEnv(url, fn) {
  const { service, pass } = pgServiceFiles(url);
  const dir = mkdtempSync(join(tmpdir(), 'pg-conn-'));
  try {
    writeFileSync(join(dir, 'service'), service, { mode: 0o600 });
    const env = { ...process.env, PGSERVICEFILE: join(dir, 'service'), PGSERVICE: 'db' };
    delete env.DATABASE_URL;
    if (pass) {
      writeFileSync(join(dir, 'pass'), pass, { mode: 0o600 });
      env.PGPASSFILE = join(dir, 'pass');
      delete env.PGPASSWORD;
    }
    return fn(env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
