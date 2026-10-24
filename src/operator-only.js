/** Server-owned authorization, never inferred from pod labels or configuration. */
export async function requireOperatorOnly(config, podId, signal) {
  let response;
  try {
    response = await fetch(`${config.apiUrl}/api/agents/runtime/pods/${encodeURIComponent(podId)}/operator-only`, {
      headers: { Authorization: `Bearer ${config.token}` }, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]),
    });
    const body = response.ok ? await response.json() : null;
    if (body?.allowed === true && body.podId === podId && body.agentName === config.agentName
      && body.instanceId === (config.instanceId || 'default')) return;
  } catch { /* Network, missing endpoint and malformed responses all refuse. */ }
  throw new Error('Commonly native requires a verified private operator-only pod; authorization refused or unavailable');
}
