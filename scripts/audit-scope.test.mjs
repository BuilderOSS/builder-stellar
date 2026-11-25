import assert from 'node:assert/strict';
import test from 'node:test';

import { analyseRustFile, cfgIsTrueInRelease, lexRust } from './audit-scope.mjs';

test('blank lines, line comments, doc comments and nested block comments are not code', () => {
  const src = [
    '//! Crate docs',
    '',
    '/// Item docs',
    'pub fn a() {} // trailing comment keeps the line as code',
    '/* outer /* nested */',
    '   still a comment */',
    '    ',
    'let x = 1;'
  ].join('\n');
  const r = analyseRustFile(src);
  assert.equal(r.lines, 8);
  assert.equal(r.codeLines, 2);
  assert.equal(r.commentLines, 4);
  assert.equal(r.blankLines, 2);
});

test('comment markers inside string, raw string and char literals are code', () => {
  const src = [
    'let url = "https://example.org/*not a comment*/";',
    'let raw = r#"a "quoted" // value"#;',
    "let slash = '/';",
    "let quote = '\\'';",
    'let multi = "line one',
    '// still inside the string',
    '";',
    "fn f<'a>(x: &'a str) {}"
  ].join('\n');
  const r = analyseRustFile(src);
  assert.equal(r.codeLines, 8);
  assert.equal(r.commentLines, 0);
});

test('the lexer blanks comments and literal contents but keeps line breaks', () => {
  const { sanitized } = lexRust('a /* b */ "c" // d\ne');
  assert.equal(sanitized.split('\n').length, 2);
  assert.ok(!sanitized.includes('b'));
  assert.ok(!sanitized.includes('c'));
  assert.ok(!sanitized.includes('d'));
  assert.ok(sanitized.includes('a') && sanitized.includes('e'));
});

test('cfg predicates are evaluated for a release build', () => {
  assert.equal(cfgIsTrueInRelease('test'), false);
  assert.equal(cfgIsTrueInRelease('not(test)'), true);
  assert.equal(cfgIsTrueInRelease('any(test, feature = "testutils")'), false);
  assert.equal(cfgIsTrueInRelease('all(target_family = "wasm", not(test))'), true);
});

test('test-only items and modules are counted apart from release code', () => {
  const src = [
    'pub fn release() {}',
    '#[cfg(test)]',
    'mod test;',
    '#[cfg(any(test, feature = "testutils"))]',
    'pub mod testutils;',
    '#[cfg(test)]',
    'pub(crate) mod key_samples {',
    '    #[test]',
    '    fn sample() { let s = "}"; }',
    '}',
    '#[cfg(not(test))]',
    'fn only_in_release() {}'
  ].join('\n');
  const r = analyseRustFile(src);
  assert.equal(r.codeLines, 3);
  assert.equal(r.testCodeLines, 9);
  assert.deepEqual(r.testOnlyMods, ['test', 'testutils']);
  assert.equal(r.tests, 1);
});

test('a file that starts with #![cfg(test)] is all test code', () => {
  const r = analyseRustFile('#![cfg(test)]\nuse super::*;\n\n#[test]\nfn t() {}\n');
  assert.equal(r.wholeFileTest, true);
  assert.equal(r.codeLines + r.testCodeLines, 4);
  assert.equal(r.tests, 1);
});

test('a test-only enum variant or struct field ends at its comma, not at the closing brace', () => {
  const src = [
    'pub enum E {',
    '    A,',
    '    #[cfg(test)]',
    '    B,',
    '    C,',
    '}',
    'pub struct S {',
    '    pub a: u32,',
    '    #[cfg(test)]',
    '    pub b: u32',
    '}',
    'pub fn one() {}',
    'pub fn two() {}'
  ].join('\n');
  const r = analyseRustFile(src);
  assert.equal(r.testCodeLines, 4);
  assert.equal(r.codeLines, 9);
});
