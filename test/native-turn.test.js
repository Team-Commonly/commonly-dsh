import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeTurn } from '../src/native-turn.js';

function harness() {
  const listeners = new Set();
  const ctx = { on(name, fn) { assert.equal(name, 'session/event'); listeners.add(fn); return () => listeners.delete(fn); } };
  const agent = { session: {}, followup(message) { this.sent = message; } };
  const emit = (type, data, session = agent.session) => { for (const fn of listeners) fn(session, { type, data }); };
  return { ctx, agent, emit, listeners };
}
const text = (turn, value) => ({ turn, message: { content: [{ type: 'text', text: value }] } });

test('posts only the final reply of the turn that consumed this relay', async () => {
  const h = harness();
  const promise = runNativeTurn(h.ctx, h.agent, { id: 'relay' }, new AbortController().signal);
  h.emit('turn/start', { turn: 1 });
  h.emit('user/message', { id: 'human' });
  h.emit('assistant/message', text(1, 'private local human answer'));
  h.emit('turn/end', { turn: 1, reason: { kind: 'completed' } });
  h.emit('turn/start', { turn: 2 });
  h.emit('user/message', { id: 'relay' });
  h.emit('assistant/message', text(2, 'tool progress'));
  h.emit('assistant/message', text(2, 'foreign session answer'), {});
  h.emit('assistant/message', text(3, 'another turn answer'));
  h.emit('assistant/message', text(2, 'actual reply'));
  h.emit('turn/end', { turn: 2, reason: { kind: 'completed' } });
  assert.equal(await promise, 'actual reply');
  assert.equal(h.listeners.size, 0);
});

for (const kind of ['aborted', 'error', 'blocked']) {
  test(`a ${kind} turn never becomes a successful reply`, async () => {
    const h = harness();
    const promise = runNativeTurn(h.ctx, h.agent, { id: 'relay' }, new AbortController().signal);
    h.emit('turn/start', { turn: 1 }); h.emit('user/message', { id: 'relay' });
    h.emit('turn/end', { turn: 1, reason: { kind } });
    await assert.rejects(promise, /did not complete/);
    assert.equal(h.listeners.size, 0);
  });
}
test('disposal stops observing without canceling the user session', async () => {
  const h = harness(); const abort = new AbortController();
  const promise = runNativeTurn(h.ctx, h.agent, { id: 'relay' }, abort.signal);
  abort.abort(); await assert.rejects(promise, /interrupted/); assert.equal(h.listeners.size, 0);
});
test('already-aborted lifetime never injects a relay', async () => {
  const h = harness(); const abort = new AbortController(); abort.abort();
  await assert.rejects(runNativeTurn(h.ctx, h.agent, { id: 'relay' }, abort.signal));
  assert.equal(h.agent.sent, undefined);
});
