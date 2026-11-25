#!/usr/bin/env node
// Writes docs/audit/SCOPE.md: the Rust contracts audit scope as a list of files with line counts.
//
// Usage (repository root):
//   node scripts/audit-scope.mjs                 write docs/audit/SCOPE.md from HEAD
//   node scripts/audit-scope.mjs --ref <ref>     describe another commit or tag (for example the freeze tag)
//   node scripts/audit-scope.mjs --check         exit 1 if docs/audit/SCOPE.md differs from what it would write
//   node scripts/audit-scope.mjs --stdout        print instead of writing
//
// Files are read from git objects at the ref, not from the working tree, so the output depends only on the
// commit. A line counts as code when it holds anything other than whitespace and comments. Test-only code is
// counted apart: files and items behind a cfg that is false in a release build (`#[cfg(test)]`,
// `#[cfg(any(test, feature = "testutils"))]`) and files that start with `#![cfg(test)]`.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'docs/audit/SCOPE.md';

// Paths whose changes alter the scope: the contract sources and what decides how they build.
const SCOPE_INPUTS = ['contracts', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'rust-toolchain'];

// Crates under contracts/ that are not audit targets, and why.
export const EXCLUDED_CRATES = {
  e2e: 'Integration tests (`dao-e2e`). They run the real contracts together in the in-memory host and are evidence for the audit, not deployed code.',
  'vote-adapter-mock':
    'A vote source whose admin sets any weight. It exists for tests and testnet and must never be approved on mainnet (see its README).'
};

const CRATE_PURPOSE = {
  auction: 'Auction module: sells one new token per auction; refunds outbid bidders',
  common: 'Shared library: admin, lifecycle, upgrades, TTL, module kinds, batch budget and cross-contract clients',
  governor: 'Governor: proposals, voting, quorum and the queue, on the OpenZeppelin governor',
  manager: 'Manager: factory, implementation registry, upgrade approvals, slugs, launch and assurance drives',
  marketplace: 'Marketplace module: escrowed listings and quick-buy pools',
  metadata: 'Metadata: artwork, attributes, token URIs and the DAO profile hash',
  minter: 'ClaimMinter module: Merkle claim lists, assurance escrow, refunds and release',
  token: 'Token: the membership NFT with votes, mint allowances, the module registry and membership switches',
  treasury: 'Treasury: holds DAO assets and executes queued proposals'
};

const OZ_REPO = 'https://github.com/OpenZeppelin/stellar-contracts';

// ---------------------------------------------------------------------------------------------------------
// Rust source analysis
// ---------------------------------------------------------------------------------------------------------

const isIdentChar = (c) => c !== undefined && /[A-Za-z0-9_]/.test(c);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v';

/**
 * Splits Rust source into per-line flags and a sanitised copy in which comments and the contents of string
 * and character literals are blanked (newlines kept), so later passes can match syntax without being fooled
 * by text inside them.
 */
export function lexRust(src) {
  const chars = Array.from(src);
  const n = chars.length;
  const out = new Array(n);
  const code = [];
  const comment = [];
  let line = 0;
  let i = 0;

  const markCode = () => {
    code[line] = true;
  };
  const markComment = () => {
    comment[line] = true;
  };
  // Copies a blanked character, keeping newlines and counting lines.
  const blank = (k, onNewline) => {
    if (chars[k] === '\n') {
      out[k] = '\n';
      line++;
      onNewline?.();
    } else {
      out[k] = ' ';
    }
  };

  while (i < n) {
    const c = chars[i];
    const d = chars[i + 1];

    if (c === '\n') {
      out[i] = '\n';
      line++;
      i++;
      continue;
    }
    if (isSpace(c)) {
      out[i] = c;
      i++;
      continue;
    }

    // Line comment, including `///` and `//!` doc comments.
    if (c === '/' && d === '/') {
      markComment();
      while (i < n && chars[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      continue;
    }

    // Block comment; Rust block comments nest.
    if (c === '/' && d === '*') {
      let depth = 0;
      do {
        if (chars[i] === '/' && chars[i + 1] === '*') {
          depth++;
          out[i] = ' ';
          out[i + 1] = ' ';
          markComment();
          i += 2;
        } else if (chars[i] === '*' && chars[i + 1] === '/') {
          depth--;
          out[i] = ' ';
          out[i + 1] = ' ';
          markComment();
          i += 2;
        } else {
          if (chars[i] !== '\n' && !isSpace(chars[i])) markComment();
          blank(i);
          i++;
        }
      } while (i < n && depth > 0);
      continue;
    }

    // Identifiers and keywords, and raw strings (r"..", r#".."#, br"..", cr"..").
    if (/[A-Za-z_]/.test(c) && !isIdentChar(chars[i - 1])) {
      let j = i;
      if (chars[j] === 'b' || chars[j] === 'c') j++;
      if (chars[j] === 'r') {
        let k = j + 1;
        let hashes = 0;
        while (chars[k] === '#') {
          hashes++;
          k++;
        }
        if (chars[k] === '"') {
          markCode();
          for (let t = i; t <= k; t++) out[t] = chars[t];
          i = k + 1;
          while (i < n) {
            if (chars[i] === '"') {
              let h = 0;
              while (h < hashes && chars[i + 1 + h] === '#') h++;
              if (h === hashes) {
                for (let t = 0; t <= h; t++) out[i + t] = chars[i + t];
                i += 1 + h;
                break;
              }
            }
            blank(i, markCode);
            i++;
          }
          continue;
        }
      }
      markCode();
      while (i < n && isIdentChar(chars[i])) {
        out[i] = chars[i];
        i++;
      }
      continue;
    }

    // String literal (a `b` or `c` prefix was consumed as an identifier just before).
    if (c === '"') {
      markCode();
      out[i] = '"';
      i++;
      while (i < n && chars[i] !== '"') {
        if (chars[i] === '\\') {
          out[i] = ' ';
          i++;
          if (i < n) blank(i, markCode);
          i++;
          continue;
        }
        blank(i, markCode);
        i++;
      }
      if (i < n) {
        out[i] = '"';
        i++;
      }
      continue;
    }

    // Character literal or lifetime.
    if (c === "'") {
      markCode();
      let end = -1;
      if (d === '\\') {
        let j = i + 3;
        while (j < n && chars[j] !== "'" && chars[j] !== '\n') j++;
        if (chars[j] === "'") end = j;
      } else if (d !== undefined && d !== '\n' && chars[i + 2] === "'") {
        end = i + 2;
      }
      if (end >= 0) {
        out[i] = "'";
        for (let t = i + 1; t < end; t++) out[t] = ' ';
        out[end] = "'";
        i = end + 1;
      } else {
        out[i] = "'";
        i++;
      }
      continue;
    }

    markCode();
    out[i] = c;
    i++;
  }

  const lineCount = src.length === 0 ? 0 : src.endsWith('\n') ? line : line + 1;
  return { sanitized: out.join(''), code, comment, lineCount };
}

// Evaluates a cfg predicate for a release build: no test, no features enabled, other keys assumed true.
export function cfgIsTrueInRelease(expr) {
  let pos = 0;
  const s = expr;
  const skip = () => {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
  };
  const parse = () => {
    skip();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(pos));
    if (!m) throw new Error(`cannot parse cfg(${expr})`);
    const name = m[0];
    pos += name.length;
    skip();
    if (s[pos] === '(') {
      pos++;
      const args = [];
      skip();
      while (s[pos] !== ')') {
        args.push(parse());
        skip();
        if (s[pos] === ',') pos++;
        skip();
      }
      pos++;
      if (name === 'any') return args.some(Boolean);
      if (name === 'all') return args.every(Boolean);
      if (name === 'not') return !args[0];
      throw new Error(`unknown cfg function ${name}`);
    }
    if (s[pos] === '=') {
      pos++;
      skip();
      // The value was blanked by the lexer when it came from sanitised text; read up to the next , or ).
      while (pos < s.length && s[pos] !== ',' && s[pos] !== ')') pos++;
      return name !== 'feature';
    }
    return name !== 'test';
  };
  return parse();
}

// Returns the index just past the bracket that closes the one at `open`.
function matchBracket(text, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (let k = open; k < text.length; k++) {
    const ch = text[k];
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== ch) throw new Error('unbalanced brackets');
      if (stack.length === 0) return k + 1;
    }
  }
  throw new Error('unbalanced brackets');
}

// The end (exclusive) of the item that starts at `start`: its first top-level `;`, or the `}` closing its
// first top-level `{`.
function itemEnd(text, start) {
  let k = start;
  while (k < text.length) {
    const ch = text[k];
    if (ch === ';') return k + 1;
    if (ch === '{') return matchBracket(text, k);
    if (ch === '(' || ch === '[') {
      k = matchBracket(text, k);
      continue;
    }
    k++;
  }
  return text.length;
}

/**
 * Analyses one Rust file. Returns line counts, the test-only line ranges, the `mod name;` declarations that
 * are test-only (so their files are test files), and the number of `#[test]` functions.
 */
export function analyseRustFile(src) {
  const { sanitized, code, comment, lineCount } = lexRust(src);
  const lineStarts = [0];
  for (let k = 0; k < sanitized.length; k++) if (sanitized[k] === '\n') lineStarts.push(k + 1);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const testLine = new Array(lineCount).fill(false);
  const testOnlyMods = [];
  let wholeFileTest = false;

  const attr = /#(!?)\[\s*cfg\s*\(/g;
  let m;
  while ((m = attr.exec(sanitized))) {
    const inner = m[1] === '!';
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchBracket(sanitized, openParen);
    const predicate = sanitized.slice(openParen + 1, closeParen - 1);
    const closeAttr = sanitized.indexOf(']', closeParen);
    if (cfgIsTrueInRelease(predicate)) continue;
    if (inner) {
      wholeFileTest = true;
      continue;
    }
    // Skip any further attributes on the same item.
    let k = closeAttr + 1;
    for (;;) {
      while (k < sanitized.length && /\s/.test(sanitized[k])) k++;
      if (sanitized[k] === '#' && sanitized[k + 1] === '[') {
        k = matchBracket(sanitized, k + 1);
        continue;
      }
      break;
    }
    const end = itemEnd(sanitized, k);
    const itemText = sanitized.slice(k, end);
    const modDecl = /^(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/.exec(itemText);
    if (modDecl) testOnlyMods.push(modDecl[1]);
    for (let l = lineOf(m.index); l <= lineOf(Math.max(end - 1, m.index)); l++) testLine[l] = true;
    attr.lastIndex = end;
  }

  let codeLines = 0;
  let testCodeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  for (let l = 0; l < lineCount; l++) {
    if (code[l]) {
      if (wholeFileTest || testLine[l]) testCodeLines++;
      else codeLines++;
    } else if (comment[l]) commentLines++;
    else blankLines++;
  }
  const tests = (sanitized.match(/#\[\s*test\s*\]/g) || []).length;
  return { lines: lineCount, codeLines, testCodeLines, commentLines, blankLines, tests, testOnlyMods, wholeFileTest };
}

// ---------------------------------------------------------------------------------------------------------
// Git access
// ---------------------------------------------------------------------------------------------------------

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function gitTry(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

const readAt = (ref, file) => git(['show', `${ref}:${file}`]);
const existsAt = (ref, file) => gitTry(['cat-file', '-e', `${ref}:${file}`]) !== null;

// ---------------------------------------------------------------------------------------------------------
// Manifest helpers (just enough TOML for Cargo manifests and the lock file)
// ---------------------------------------------------------------------------------------------------------

function tomlSection(text, header) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === `[${header}]`);
  if (startIdx < 0) return null;
  const body = [];
  for (let k = startIdx + 1; k < lines.length; k++) {
    if (/^\s*\[/.test(lines[k])) break;
    body.push(lines[k]);
  }
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  return body;
}

function tomlString(lines, key) {
  for (const l of lines ?? []) {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`).exec(l);
    if (m) return m[1];
  }
  return null;
}

function dependencyNames(lines) {
  return (lines ?? []).map((l) => /^\s*([A-Za-z0-9_-]+)\s*=/.exec(l)?.[1]).filter(Boolean);
}

function lockPackages(lockText) {
  return lockText
    .split(/\n\[\[package\]\]\n/)
    .slice(1)
    .map((block) => ({
      name: /^name = "([^"]+)"/m.exec(block)?.[1],
      version: /^version = "([^"]+)"/m.exec(block)?.[1],
      source: /^source = "([^"]+)"/m.exec(block)?.[1] ?? null
    }));
}

// ---------------------------------------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------------------------------------

export function collect(ref) {
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const scopeCommit = git(['log', '-1', '--format=%H', commit, '--', ...SCOPE_INPUTS]).trim() || commit;
  const scopeDate = git(['log', '-1', '--format=%cs', scopeCommit]).trim();
  const contractsTree = git(['rev-parse', `${commit}:contracts`]).trim();
  const files = git(['ls-tree', '-r', '--name-only', '-z', commit, '--', 'contracts'])
    .split('\0')
    .filter(Boolean)
    .sort();

  const crateNames = [...new Set(files.map((f) => f.split('/')[1]))].filter((c) =>
    files.includes(`contracts/${c}/Cargo.toml`)
  );

  const crates = crateNames.map((name) => {
    const dir = `contracts/${name}`;
    const crateFiles = files.filter((f) => f.startsWith(`${dir}/`));
    const manifest = readAt(commit, `${dir}/Cargo.toml`);
    const pkg = tomlSection(manifest, 'package');
    const lib = tomlSection(manifest, 'lib');
    const crateTypes = /crate-type\s*=\s*\[([^\]]*)\]/.exec((lib ?? []).join('\n'))?.[1] ?? '';
    const packageName = tomlString(pkg, 'name') ?? name;

    const rust = crateFiles.filter((f) => f.endsWith('.rs'));
    const analysed = new Map(rust.map((f) => [f, analyseRustFile(readAt(commit, f))]));
    // A `mod name;` behind a test-only cfg makes name.rs (or name/mod.rs) a test file.
    const testFiles = new Set();
    for (const [file, a] of analysed) {
      if (a.wholeFileTest) testFiles.add(file);
      for (const mod of a.testOnlyMods) {
        const base = path.posix.dirname(file);
        for (const candidate of [`${base}/${mod}.rs`, `${base}/${mod}/mod.rs`]) {
          if (analysed.has(candidate)) testFiles.add(candidate);
        }
      }
    }
    const sourceFiles = [];
    const testSourceFiles = [];
    for (const [file, a] of analysed) {
      const entry = { file, ...a };
      if (testFiles.has(file)) {
        entry.testCodeLines += entry.codeLines;
        entry.codeLines = 0;
        testSourceFiles.push(entry);
      } else sourceFiles.push(entry);
    }
    const otherFiles = crateFiles.filter((f) => !f.endsWith('.rs'));

    // OpenZeppelin paths used by release code.
    const ozUses = new Set();
    for (const { file } of sourceFiles) {
      const { sanitized } = lexRust(readAt(commit, file));
      const testFree = stripTestItems(sanitized);
      for (const m of testFree.matchAll(/\b(stellar_[a-z_]+)::(\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (m[2].startsWith('{')) {
          for (const part of m[2].slice(1, -1).split(',')) {
            const item = part.trim().split(/\s|::/)[0];
            if (item && item !== 'self') ozUses.add(`${m[1]}::${item}`);
          }
        } else ozUses.add(`${m[1]}::${m[2]}`);
      }
    }

    const sum = (list, key) => list.reduce((acc, f) => acc + f[key], 0);
    return {
      name,
      dir,
      packageName,
      cdylib: crateTypes.includes('cdylib'),
      excluded: Object.hasOwn(EXCLUDED_CRATES, name),
      purpose: CRATE_PURPOSE[name] ?? '',
      dependencies: dependencyNames(tomlSection(manifest, 'dependencies')),
      sourceFiles,
      testSourceFiles,
      otherFiles,
      ozUses: [...ozUses].sort(),
      codeLines: sum(sourceFiles, 'codeLines'),
      testCodeLines: sum(sourceFiles, 'testCodeLines') + sum(testSourceFiles, 'testCodeLines'),
      tests: sum(sourceFiles, 'tests') + sum(testSourceFiles, 'tests'),
      totalLines: sum(sourceFiles, 'lines') + sum(testSourceFiles, 'lines')
    };
  });

  const rootManifest = readAt(commit, 'Cargo.toml');
  const lock = lockPackages(readAt(commit, 'Cargo.lock'));
  const sdk = lock.find((p) => p.name === 'soroban-sdk');
  const ozPackages = lock.filter((p) => p.source?.includes('OpenZeppelin/stellar-contracts'));
  const ozCommit = ozPackages[0]?.source?.split('#')[1] ?? null;
  const ozPin = /OpenZeppelin\/stellar-contracts"\s*,\s*(rev|tag|branch)\s*=\s*"([^"]+)"/.exec(rootManifest);
  const ozPinIsTag = ozPin?.[1] === 'tag';

  const toolchainFile = ['rust-toolchain.toml', 'rust-toolchain'].find((f) => existsAt(commit, f)) ?? null;
  const toolchain = toolchainFile ? readAt(commit, toolchainFile).trim() : null;
  const ci = existsAt(commit, '.github/workflows/ci.yml') ? readAt(commit, '.github/workflows/ci.yml') : '';
  const stellarCli = /STELLAR_CLI_VERSION:\s*['"]?([0-9][^\s'"]*)/.exec(ci)?.[1] ?? null;
  const ciRust = /rustup toolchain install (\S+)/.exec(ci)?.[1] ?? null;
  const releaseProfile = tomlSection(rootManifest, 'profile.release');

  return {
    commit,
    scopeCommit,
    scopeDate,
    contractsTree,
    crates,
    sdk,
    ozPackages,
    ozCommit,
    ozPin: ozPin ? { kind: ozPin[1], value: ozPin[2] } : null,
    ozPinIsTag,
    ozPinDoc: existsAt(commit, 'docs/OPENZEPPELIN_PIN.md'),
    toolchainFile,
    toolchain,
    stellarCli,
    ciRust,
    releaseProfile
  };
}

// Blanks every test-only item in sanitised text, so release-code scans skip test helpers.
function stripTestItems(sanitized) {
  let text = sanitized;
  const attr = /#(!?)\[\s*cfg\s*\(/g;
  let m;
  while ((m = attr.exec(text))) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchBracket(text, openParen);
    if (cfgIsTrueInRelease(text.slice(openParen + 1, closeParen - 1))) continue;
    if (m[1] === '!') return '';
    const end = itemEnd(text, text.indexOf(']', closeParen) + 1);
    text = text.slice(0, m.index) + text.slice(m.index, end).replace(/[^\n]/g, ' ') + text.slice(end);
    attr.lastIndex = end;
  }
  return text;
}

// ---------------------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------------------

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const link = (file) => `[\`${file}\`](../../${file})`;
const shortSha = (sha) => sha.slice(0, 12);

export function render(data) {
  const inScope = data.crates.filter((c) => !c.excluded);
  const excluded = data.crates.filter((c) => c.excluded);
  const total = (key) => inScope.reduce((acc, c) => acc + c[key], 0);
  // Test-only items inside release source files (not the unit test files). Tools such as cloc count them.
  const inlineTest = inScope.reduce((acc, c) => acc + c.sourceFiles.reduce((a, f) => a + f.testCodeLines, 0), 0);
  const ozRev = data.ozPin ? `${data.ozPin.kind} \`${data.ozPin.value}\`` : 'not found';
  const out = [];
  const p = (s = '') => out.push(s);

  p('# Audit scope: Rust contracts');
  p();
  p('<!-- Generated by scripts/audit-scope.mjs. Do not edit by hand: run `node scripts/audit-scope.mjs`. -->');
  p();
  p(
    'This is the list of contract files and folders in the audit scope, with their sizes. `scripts/audit-scope.mjs` writes it from a git commit, so it can be regenerated for the frozen audit commit. Contract changes still in progress will change these counts, so regenerate it at the freeze and quote the numbers from that run.'
  );
  p();
  p('## Snapshot');
  p();
  p('| | |');
  p('| --- | --- |');
  p(`| Commit | \`${data.scopeCommit}\` (${data.scopeDate}), the latest commit that changed a file in scope |`);
  p(`| \`contracts/\` tree | \`${data.contractsTree}\` |`);
  p(`| Crates in scope | ${inScope.length} |`);
  p(`| Code lines in scope | ${fmt(total('codeLines'))} |`);
  p(`| Unit tests in those crates | ${fmt(total('tests'))} |`);
  p(`| Code lines including test-only blocks inside source files | ${fmt(total('codeLines') + inlineTest)} |`);
  p();
  p(
    `To confirm a checkout matches this list, run \`git rev-parse HEAD:contracts\`: it prints the tree above. To regenerate for another commit or tag, run \`node scripts/audit-scope.mjs --ref <tag>\`; \`--check\` reports whether this file is current.`
  );
  p();
  p(
    '**How lines are counted.** A code line holds something other than whitespace and comments; blank lines, comment lines and doc comments are left out. Test-only code is counted apart and is not in the scope total: the unit test files, and items behind a `cfg` that is false in a release build, such as `#[cfg(test)]` and `#[cfg(any(test, feature = "testutils"))]`. Tools that do not read `cfg`, such as `cloc`, count the test-only blocks inside source files as code; the second line count above is that figure.'
  );
  p();
  p('## Crates in scope');
  p();
  p('| Crate | Folder | What it is | Rust files | Code lines | Unit tests | Test code lines |');
  p('| --- | --- | --- | ---: | ---: | ---: | ---: |');
  for (const c of inScope) {
    const files = c.sourceFiles.length;
    p(
      `| ${c.packageName} | [\`${c.dir}/\`](../../${c.dir}) | ${c.purpose} | ${files} | ${fmt(c.codeLines)} | ${fmt(c.tests)} | ${fmt(c.testCodeLines)} |`
    );
  }
  p(
    `| **Total** | | | **${inScope.reduce((a, c) => a + c.sourceFiles.length, 0)}** | **${fmt(total('codeLines'))}** | **${fmt(total('tests'))}** | **${fmt(total('testCodeLines'))}** |`
  );
  p();
  const contractsBuilt = inScope.filter((c) => c.cdylib);
  const libraries = inScope.filter((c) => !c.cdylib);
  const librarySentence = (lib) => {
    const users = inScope.filter((c) => c.dependencies.includes(lib.packageName)).length;
    const who = users === contractsBuilt.length ? 'every contract compiles it in' : `${users} of them compile it in`;
    return ` \`${lib.packageName}\` is a library: ${who}, so its code is reviewed once and ships in each of them.`;
  };
  p(`${contractsBuilt.length} crates build to their own WASM contract.${libraries.map(librarySentence).join('')}`);
  p();
  p('## Toolchain and dependencies');
  p();
  p('| | |');
  p('| --- | --- |');
  p(
    `| soroban-sdk | \`${data.sdk?.version ?? 'not found'}\` (crates.io), with the \`experimental_spec_shaking_v2\` feature |`
  );
  p(
    `| OpenZeppelin \`stellar-contracts\` | [${OZ_REPO.replace('https://', '')}](${OZ_REPO}) at ${ozRev}${data.ozCommit ? `, commit \`${data.ozCommit}\` (from \`Cargo.lock\`)` : ''}${data.ozPinIsTag ? '' : '. This is a git revision, not a tagged release'} |`
  );
  if (data.toolchainFile) {
    p(`| Rust toolchain | Pinned in [\`${data.toolchainFile}\`](../../${data.toolchainFile}) (below) |`);
  } else {
    p(
      `| Rust toolchain | Not pinned at this commit: there is no \`rust-toolchain.toml\`, and CI installs \`${data.ciRust ?? 'stable'}\` |`
    );
  }
  p(`| WASM target | \`wasm32v1-none\` |`);
  p(
    `| Stellar CLI | ${data.stellarCli ? `\`${data.stellarCli}\`, the version CI installs and checks by SHA-256 ([\`.github/workflows/ci.yml\`](../../.github/workflows/ci.yml))` : 'not found in CI'} |`
  );
  p();
  if (data.toolchain) {
    p('```toml');
    p(data.toolchain);
    p('```');
    p();
  }
  p(
    data.ozPinDoc
      ? 'Why the project uses this OpenZeppelin revision, and how it differs from the nearest release, is recorded in [`docs/OPENZEPPELIN_PIN.md`](../OPENZEPPELIN_PIN.md).'
      : 'TODO: `docs/OPENZEPPELIN_PIN.md` will record why the project uses this OpenZeppelin revision and how it differs from the nearest release. It does not exist at this commit.'
  );
  p();
  p('### OpenZeppelin packages and the modules used');
  p();
  p(
    'Each package below comes from the revision above. "Used" lists the paths release code imports or calls; test code is left out.'
  );
  p();
  p('| Package | Version | Declared by | Used |');
  p('| --- | --- | --- | --- |');
  for (const pkg of data.ozPackages) {
    const crateIdent = pkg.name.replace(/-/g, '_');
    const declaredBy = inScope.filter((c) => c.dependencies.includes(pkg.name)).map((c) => c.packageName);
    const used = [
      ...new Set(
        inScope.flatMap((c) =>
          c.ozUses.filter((u) => u.startsWith(`${crateIdent}::`)).map((u) => `\`${u}\` (${c.packageName})`)
        )
      )
    ];
    const usedText = used.length
      ? used.join(', ')
      : declaredBy.length
        ? 'No direct use in release code'
        : 'Not declared by a crate in scope; a dependency of another OpenZeppelin package';
    p(`| \`${pkg.name}\` | \`${pkg.version}\` | ${declaredBy.join(', ') || '(none)'} | ${usedText} |`);
  }
  p();
  p('### Release profile');
  p();
  p(
    'From the workspace [`Cargo.toml`](../../Cargo.toml). `overflow-checks = true` makes integer overflow abort in the WASM.'
  );
  p();
  p('```toml');
  p('[profile.release]');
  for (const l of (data.releaseProfile ?? []).filter((x) => x.trim() && !x.trim().startsWith('#'))) p(l);
  p('```');
  p();
  p('## Build');
  p();
  p('From the repository root:');
  p();
  p('```bash');
  p('stellar contract build');
  p('```');
  p();
  p(
    "It builds every crate with a `cdylib` target into `target/wasm32v1-none/release/<crate>.wasm` and removes unused contract-spec entries from the WASM. A plain `cargo build` leaves those entries in, and the Token then exceeds the network's 128 KiB code limit. The WASM files in scope:"
  );
  p();
  for (const c of inScope.filter((x) => x.cdylib))
    p(`- \`${c.packageName.replace(/-/g, '_')}.wasm\` from \`${c.dir}\``);
  p();
  p('Run the tests after the build, because the integration tests load the built WASM:');
  p();
  p('```bash');
  p('cargo test');
  p('```');
  p();
  p(
    'TODO: reproducible builds and published WASM hashes are being added. Link the build instructions and the hash file here once they exist.'
  );
  p();
  p('## Files in scope');
  p();
  p(
    'Each crate\'s `Cargo.toml` is in scope with its sources, because it sets the dependencies and features the contract builds with. Line counts are for the whole file; "Code" leaves out blank lines, comments and test-only code.'
  );
  for (const c of inScope) {
    p();
    p(`### ${c.packageName} (\`${c.dir}/\`)`);
    p();
    p('| File | Lines | Code | Notes |');
    p('| --- | ---: | ---: | --- |');
    for (const f of c.sourceFiles) {
      const note = f.testCodeLines ? `Also ${fmt(f.testCodeLines)} lines of test-only code` : '';
      p(`| ${link(f.file)} | ${fmt(f.lines)} | ${fmt(f.codeLines)} | ${note} |`);
    }
    p(`| ${link(`${c.dir}/Cargo.toml`)} | | | Manifest |`);
    p(`| **Total** | **${fmt(c.sourceFiles.reduce((a, f) => a + f.lines, 0))}** | **${fmt(c.codeLines)}** | |`);
  }
  p();
  p('## Supporting material (not counted)');
  p();
  p('Unit tests and test helpers live next to the code they test. They are evidence for the audit, not audit targets.');
  p();
  p('| File | Lines | Test code | `#[test]` functions |');
  p('| --- | ---: | ---: | ---: |');
  for (const c of inScope) {
    for (const f of c.testSourceFiles) {
      p(`| ${link(f.file)} | ${fmt(f.lines)} | ${fmt(f.testCodeLines)} | ${fmt(f.tests)} |`);
    }
  }
  p();
  const other = inScope.flatMap((c) => c.otherFiles.filter((f) => !f.endsWith('/Cargo.toml')));
  if (other.length) {
    p('Other files in the crate folders:');
    p();
    for (const f of other) {
      const kind = f.endsWith('README.md')
        ? "the crate's reference documentation"
        : f.includes('/testdata/')
          ? 'test data'
          : 'other';
      p(`- ${link(f)}: ${kind}`);
    }
    p();
  }
  p('## Out of scope');
  p();
  p('| Path | Why it is out of scope | Size |');
  p('| --- | --- | --- |');
  for (const c of excluded) {
    const files = c.sourceFiles.length + c.testSourceFiles.length;
    const lines = c.codeLines + c.testCodeLines;
    p(
      `| [\`${c.dir}/\`](../../${c.dir}) | ${EXCLUDED_CRATES[c.name]} | ${files} Rust files, ${fmt(lines)} code lines, ${fmt(c.tests)} tests |`
    );
  }
  p(
    '| The OpenZeppelin packages | Third-party code, listed above with the paths the contracts use. Whether the modules used are in scope is agreed in the scope letter. | |'
  );
  p('| `soroban-sdk` and the Soroban host | Platform code, trusted as released. | |');
  p(
    '| `apps/`, `packages/`, `db/` | The web app, the indexer, the generated bindings and the SQL read model. They are not contract code; the app and indexer tier has its own [threat model](THREAT_MODEL.md). | |'
  );
  p('| `scripts/`, `configs/`, `deploys/`, `releases/` | Deployment and operations tooling and records. | |');
  p('| `docs/`, `apps/docs/` | Documentation. It describes the contracts but is not part of them. | |');
  p();
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { ref: 'HEAD', check: false, stdout: false };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--ref') args.ref = argv[++k];
    else if (a === '--check') args.check = true;
    else if (a === '--stdout') args.stdout = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.ref) throw new Error('--ref needs a value');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 9)
        .join('\n') + '\n'
    );
    return;
  }
  const dirty = gitTry(['status', '--porcelain', '--', ...SCOPE_INPUTS]);
  if (args.ref === 'HEAD' && dirty) {
    process.stderr.write(
      'Note: uncommitted changes in contracts/ or the Cargo files are not counted; the list reads HEAD.\n'
    );
  }
  const text = render(collect(args.ref));
  if (args.stdout) {
    process.stdout.write(text);
    return;
  }
  const target = path.join(repoRoot, OUTPUT);
  if (args.check) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      // Missing counts as out of date.
    }
    if (current !== text) {
      process.stderr.write(
        `${OUTPUT} is out of date for ${args.ref}. Run: node scripts/audit-scope.mjs${args.ref === 'HEAD' ? '' : ` --ref ${args.ref}`}\n`
      );
      process.exit(1);
    }
    process.stdout.write(`${OUTPUT} matches ${args.ref}.\n`);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
  process.stdout.write(`Wrote ${OUTPUT} for ${args.ref}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    // A bad argument or an unknown ref: print the reason, not a stack trace.
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    process.stderr.write(`audit-scope: ${detail}\n`);
    process.exit(2);
  }
}
