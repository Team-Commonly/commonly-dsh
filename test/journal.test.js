import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from '../src/journal.js';

test('journal lock excludes concurrent consumers and persists committed records at 0600', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'commonly-native-')); const path = join(dir, 'journal.json');
  try {
    const first = await openJournal(path, 'binding');
    await assert.rejects(openJournal(path, 'binding'), /EEXIST/);
    first.records.set('event', { stage: 'done', podId: 'pod', result: { outcome: 'posted' } });
    await first.save(); await first.close();
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const second = await openJournal(path, 'binding');
    assert.equal(second.records.get('event').stage, 'done'); await second.close();
    await assert.rejects(openJournal(path, 'other-token-or-binding'), /another binding/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('corrupt journal is refused, never replaced with an empty dedup set', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'commonly-native-')); const path = join(dir, 'journal.json');
  try {
    await writeFile(path, 'invalid JSON');
    await assert.rejects(openJournal(path, 'binding'));
    assert.equal(await readFile(path, 'utf8'), 'invalid JSON');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
