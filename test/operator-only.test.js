import test from 'node:test';
import assert from 'node:assert/strict';
import { requireOperatorOnly } from '../src/operator-only.js';
const config = { apiUrl: 'https://api.example.test', token: 'cm_agent_fixture', agentName: 'fixture' };
const pod = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const valid = { allowed: true, podId: pod, agentName: 'fixture', instanceId: 'default' };
test('authorization requires explicit server proof bound to pod and token identity', async (t) => {
  for (const body of [valid, {}, { ...valid, podId: 'other' }, { ...valid, agentName: 'other' },
    { ...valid, instanceId: 'other' }, { ...valid, allowed: false }]) {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, `https://api.example.test/api/agents/runtime/pods/${pod}/operator-only`);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer cm_agent_fixture');
      return { ok: true, json: async () => body };
    });
    if (body === valid) await requireOperatorOnly(config, pod);
    else await assert.rejects(requireOperatorOnly(config, pod), /operator-only/);
    t.mock.restoreAll();
  }
});
test('missing endpoint and transport failure cannot authorize a native session', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  await assert.rejects(requireOperatorOnly(config, pod), /operator-only/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw Error('transport'); });
  await assert.rejects(requireOperatorOnly(config, pod), /operator-only/);
});
