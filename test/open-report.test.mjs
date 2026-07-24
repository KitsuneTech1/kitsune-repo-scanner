import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('--open passes the report path as a process argument instead of shell text', async () => {
  const source = await readFile(new URL('../bin/kitsune-scan.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\bexec\(cmd\)/);
  assert.match(source, /spawn\(command, \[htmlPath\]/);
});
