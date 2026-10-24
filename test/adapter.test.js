import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAdapter } from '../src/native-adapter.js';
const pod = 'aaaaaaaaaaaaaaaaaaaaaaaa';
function fixture() {
  let callback; let turns = 0; const signal = new AbortController().signal;
  const journal = { records: new Map(), async save() {} };
  const agent = { session: { header: { cwd: process.cwd() } }, options: { model: 'fixture' }, followup(message) {
    assert.equal(journal.records.get('event').stage, 'turn'); turns++;
    callback(this.session, { type: 'turn/start', data: { turn: 1 } });
    callback(this.session, { type: 'user/message', data: message });
    callback(this.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  } };
  const ctx = { on(name, listener) { callback = listener; return () => {}; }, get(name) { return name === 'agents' ? { get: () => agent } : { flush: async () => {} }; } };
  const adapter = createNativeAdapter(ctx, { [pod]: 'session' }, journal, signal);
  const options = { cwd: process.cwd(), metadata: { event: { _id: 'event', podId: pod } } };
  return { adapter, journal, agent, options, turns: () => turns };
}
test('unbound pod is refused without a model call', async () => {
  const h = fixture(); h.options.metadata.event.podId = 'other';
  await assert.rejects(h.adapter.spawn('prompt', h.options), /no pod/); assert.equal(h.turns(), 0);
});
test('requested workspace and model overrides cannot silently diverge from an existing dsh session', async () => {
  const h = fixture();
  await assert.rejects(h.adapter.spawn('prompt', { ...h.options, cwd: '/other' }), /workspace/);
  await assert.rejects(h.adapter.spawn('prompt', { ...h.options, environment: { model: 'other' } }), /overrides/);
  await assert.rejects(h.adapter.spawn('prompt', { ...h.options, environment: { provider: {} } }), /overrides/);
  assert.equal(h.turns(), 0);
});
test('failed flush leaves an ambiguous record and refuses a repeated model call', async () => {
  const h = fixture(); h.journal.save = async () => { throw Error('disk'); };
  await assert.rejects(h.adapter.spawn('prompt', h.options), /disk/); assert.equal(h.turns(), 0);
  await assert.rejects(h.adapter.spawn('prompt', h.options), /ambiguous/);
});
test('pending turn from an interrupted process never silently regenerates', async () => {
  const h = fixture(); h.journal.records.set('event', { stage: 'turn' });
  await assert.rejects(h.adapter.spawn('prompt', h.options), /ambiguous/); assert.equal(h.turns(), 0);
});
