import z from '@deepseek-ai/schemastery';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { openJournal } from './journal.js';
import { createNativeAdapter } from './native-adapter.js';

export const name = 'commonly-native';
export const inject = ['agents', 'sessions'];
export const Config = z.object({
  apiUrl: z.string(), token: z.string().role('secret'), agentName: z.string(),
  instanceId: z.string(), statePath: z.string(),
  bindings: z.array(z.object({ podId: z.string(), sessionId: z.string() })),
});

export async function mountNative(ctx, config, performRun) {
  if (!config.bindings?.length || !config.statePath || !config.agentName?.trim()) throw new Error('Commonly native requires bindings, agentName and statePath');
  const origin = new URL(config.apiUrl);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) throw new Error('Commonly native requires HTTPS or loopback');
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Commonly API URL must be an origin');
  if (!/^cm_agent_[^\s]+$/.test(config.token || '')) throw new Error('Commonly native requires an agent runtime token');
  const bindings = Object.create(null); const sessionIds = new Set();
  for (const { podId, sessionId } of config.bindings) {
    if (!/^[a-f0-9]{24}$/i.test(podId) || !sessionId?.trim() || bindings[podId] || sessionIds.has(sessionId)) throw new Error('Commonly native requires distinct pods and dedicated sessions');
    if (!ctx.get('agents').get(sessionId)) throw new Error('Open the bound dsh sessions before enabling Commonly native');
    bindings[podId] = sessionId; sessionIds.add(sessionId);
  }
  const bindingKey = JSON.stringify([origin.origin, config.agentName, config.instanceId || 'default', config.bindings,
    createHash('sha256').update(config.token).digest('hex')]);
  const journal = await openJournal(resolve(config.statePath), bindingKey);
  const lifetime = new AbortController();
  let active;
  let handle;
  try {
    const adapter = createNativeAdapter(ctx, bindings, journal, lifetime.signal);
    handle = performRun({
      instanceUrl: origin.origin, token: config.token, agentName: config.agentName,
      instanceId: config.instanceId || 'default',
      adapter: { ...adapter, spawn: (...args) => { active = adapter.spawn(...args); return active; } },
      onError: () => { handle?.stop(); ctx.logger(name).error('Commonly native stopped; review the session and journal before retrying.'); },
    });
  } catch (error) { await journal.close(); throw error; }
  ctx.effect(() => async () => {
    handle.stop(); lifetime.abort();
    try { await active; } catch { /* A canceled relay is intentionally left for review. */ }
    await journal.close();
  });
}

export async function apply(ctx, config) {
  let runtime;
  try { runtime = await import('@commonlyai/cli/src/runtime.js'); }
  catch { throw new Error('Commonly native needs a CLI release containing src/runtime.js; the runtime entry PR must merge and publish first'); }
  return mountNative(ctx, config, runtime.performRun);
}
