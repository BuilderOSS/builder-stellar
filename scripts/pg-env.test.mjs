import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

import { pgServiceFiles, withPgEnv } from './pg-env.mjs';

test('a Neon URL becomes a service file and a password file', () => {
  const { service, pass } = pgServiceFiles(
    'postgresql://neondb_owner:npg_AbC123@ep-x-1.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
  );
  assert.equal(
    service,
    '[db]\nhost=ep-x-1.us-east-2.aws.neon.tech\ndbname=neondb\nuser=neondb_owner\nsslmode=require\nchannel_binding=require\n'
  );
  assert.equal(pass, '*:*:*:*:npg_AbC123\n');
});

test('encoded and unencoded special characters, IPv6 and several hosts parse as db/lib.sh does', () => {
  const encoded = pgServiceFiles('postgres://us%40er:p%3Aw%2Fd%25%5C@db.example:6543/my%20db');
  assert.equal(encoded.service, '[db]\nhost=db.example\nport=6543\ndbname=my db\nuser=us@er\n');
  assert.equal(encoded.pass, '*:*:*:*:p\\:w/d%\\\\\n');
  assert.equal(pgServiceFiles('postgres://u:raw@pass:wo/rd@host/db').pass, '*:*:*:*:raw@pass\\:wo/rd\n');
  assert.equal(pgServiceFiles('postgres://admin@[::1]:5433/postgres').service, '[db]\nhost=::1\nport=5433\ndbname=postgres\nuser=admin\n');
  assert.equal(pgServiceFiles('postgres://admin@[::1]:5433/postgres').pass, null);
  assert.equal(
    pgServiceFiles('postgres://u:x@h1:5432,h2:5433/db?target_session_attrs=read-write').service,
    '[db]\nhost=h1,h2\nport=5432,5433\ndbname=db\nuser=u\ntarget_session_attrs=read-write\n'
  );
  assert.throws(() => pgServiceFiles('mysql://x'), /postgres:\/\//);
  assert.throws(() => pgServiceFiles('postgres://u:x@h:1/db?port=5432'), /sets port more than once/);
  assert.throws(() => pgServiceFiles('postgres://u:x@h/db?dbname=other'), /sets dbname more than once/);
  assert.throws(() => pgServiceFiles('postgres://u:x@h/db?hostaddr=10.0.0.1'), /may not set hostaddr/);
  assert.throws(() => pgServiceFiles('postgres://u:x@h/d%0Ahost=evil'), /control character in its dbname/);
  assert.throws(() => pgServiceFiles('postgres://u:x%0A@h/db'), /control character in its password/);
  assert.equal(pgServiceFiles('postgres:///localdb?host=/var/run/postgresql').service, '[db]\ndbname=localdb\nhost=/var/run/postgresql\n');
  assert.throws(() => pgServiceFiles(undefined), /postgres:\/\//);
});

test('psql gets the files, not the URL, and they are removed afterwards', () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://u:secret@host/db';
  process.env.PGHOSTADDR = '10.9.9.9';
  let seen;
  try {
    withPgEnv(process.env.DATABASE_URL, (env) => {
      seen = env;
      assert.equal(env.DATABASE_URL, undefined, 'the URL is not passed on');
      assert.equal(env.PGHOSTADDR, undefined, 'a stray target variable is cleared');
      assert.equal(env.PGSERVICE, 'db');
      assert.equal(readFileSync(env.PGPASSFILE, 'utf8'), '*:*:*:*:secret\n');
      assert.equal(statSync(env.PGPASSFILE).mode & 0o777, 0o600);
      assert.equal(statSync(env.PGSERVICEFILE).mode & 0o777, 0o600);
    });
  } finally {
    delete process.env.PGHOSTADDR;
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  assert.ok(!existsSync(seen.PGSERVICEFILE) && !existsSync(seen.PGPASSFILE));
});
