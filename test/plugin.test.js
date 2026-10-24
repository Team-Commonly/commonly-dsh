import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import { mountNative } from '../src/native.js';

const pod = 'aaaaaaaaaaaaaaaaaaaaaaaa';
function harness() {
  const ctx = new Context();
  const agent = { session: { header: { cwd: process.cwd() } }, options: { model: 'fixture' }, followup(message) {
    assert.equal(message.role, 'user'); assert.equal(message.source.kind, 'commonly');
    ctx.emit('session/event', this.session, { type: 'turn/start', data: { turn: 1 } });
    ctx.emit('session/event', this.session, { type: 'user/message', data: message });
    ctx.emit('session/event', this.session, { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'Hello teammate' }] } } });
    ctx.emit('session/event', this.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  } };
  ctx.provide('agents', { get: (id) => id === 'dedicated-session' ? agent : undefined });
  ctx.provide('sessions', { flush: async (session) => assert.equal(session, agent.session) });
  return { ctx, agent };
}
const options = { metadata: { event: { _id: 'batch-event', podId: pod, payload: { batchEventIds: ['event1', 'event2'] } } }, cwd: process.cwd(), memoryLongTerm: 'fixture memory' };

test('Cordis mount delegates consumer policies to CLI, drives exact native turn, caches redelivery and disposes', async (t) => {
  let allowed = true;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: allowed, json: async () => ({ allowed: true, podId: pod, agentName: 'fixture', instanceId: 'default' }) }));
  const dir = await mkdtemp(join(tmpdir(), 'commonly-plugin-')); const h = harness();
  const originalFollowup = h.agent.followup;
  let runner; let stopped = 0; let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const plugin = { inject: ['agents', 'sessions'], apply: (ctx) => mountNative(ctx, {
    apiUrl: 'http://127.0.0.1:5000', token: 'cm_agent_fixture', agentName: 'fixture', statePath: join(dir, 'journal'),
    bindings: [{ podId: pod, sessionId: 'dedicated-session' }],
  }, (config) => { runner = config; finish(); return { stop() { stopped++; } }; }) };
  const fork = h.ctx.plugin(plugin);
  try {
    await done;
    assert.equal(runner.agentName, 'fixture'); assert.equal(runner.adapter.name, 'dsh');
    runner.onError(new Error('temporary network failure'));
    assert.equal(stopped, 0, 'network errors retain the CLI retry policy');
    const result = await runner.adapter.spawn('Received mention', options);
    assert.deepEqual(result, { text: 'Hello teammate', newSessionId: 'dedicated-session' });
    h.agent.followup = () => { throw Error('must not regenerate'); };
    assert.deepEqual(await runner.adapter.spawn('Received mention', options), result);
    await assert.rejects(runner.adapter.spawn('changed batch', { ...options, metadata: { event: { ...options.metadata.event, payload: { batchEventIds: ['event1'] } } } }), /changed batch/);
    allowed = false;
    await assert.rejects(runner.adapter.spawn('Received mention', options), /operator-only/);
    const fresh = { ...options, metadata: { event: { _id: 'fresh', podId: pod } } };
    await assert.rejects(runner.adapter.spawn('Print a local file', fresh), /operator-only/);
    allowed = true;
    h.agent.followup = function (message) { originalFollowup.call(this, message); allowed = false; };
    await assert.rejects(runner.adapter.spawn('Respond after audience change', fresh), /operator-only/);
  } finally {
    await fork.dispose(); assert.equal(stopped, 1);
    await assert.rejects(stat(join(dir, 'journal.lock')), /ENOENT/);
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid binding or origin is refused before starting the runtime consumer', async () => {
  const h = harness(); let calls = 0;
  const config = { apiUrl: 'https://api.example.test', token: 'cm_agent_fixture', agentName: 'fixture', statePath: '/unused', bindings: [{ podId: pod, sessionId: 'missing' }] };
  await assert.rejects(mountNative(h.ctx, config, () => { calls++; }), /Open the bound/);
  await assert.rejects(mountNative(h.ctx, { ...config, apiUrl: 'http://remote.test' }, () => { calls++; }), /HTTPS/);
  await assert.rejects(mountNative(h.ctx, { ...config, token: 'human' }, () => { calls++; }), /agent runtime token/);
  assert.equal(calls, 0);
});

test('unverified operator-only pod refuses mount before consumer, model or journal', async (t) => {
  const h = harness(); let calls = 0;
  h.agent.followup = () => { calls++; };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  await assert.rejects(mountNative(h.ctx, {
    apiUrl: 'https://api.example.test', token: 'cm_agent_fixture', agentName: 'fixture',
    statePath: '/unused', bindings: [{ podId: pod, sessionId: 'dedicated-session' }],
  }, () => { calls++; }), /operator-only/);
  assert.equal(calls, 0);
});
