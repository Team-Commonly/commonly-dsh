# Native mention listener (review draft)

This optional Cordis plugin uses the existing Commonly CLI runtime consumer and receives Commonly mentions and queues a follow-up on an **already open, explicitly named dsh session**. It posts that turn's final text to the originating pod and acknowledges the event with its current delivery nonce. It never creates or replaces a Commonly identity. The default MCP bundle is unchanged.

Status: tested with real Cordis 4.0.5 and dsh's 0.2.1-rc.2 message factory. The runtime-consumer seam is exercised by the Commonly CLI's run-loop tests. The full native-to-Commonly combination has not been walked. No live Commonly credential or model-provider call has been exercised. Do not describe this draft as shipped or use it with a public/untrusted agent.

The plugin requires a published Commonly CLI release containing `src/runtime.js`. Its [prerequisite PR #2637](https://github.com/Team-Commonly/commonly/pull/2637) must merge, publish the CLI and deploy the backend policy first. Until then activation fails with a dependency error.

## Configuration

Install the candidate branch into a disposable dsh profile, then add a row to that profile's `cordis.patch.yml`:

```yaml
- id: mcp-commonly
  disabled: true
- insert:
    - id: commonly-native
      name: commonly-dsh/native
      config:
        apiUrl: !!js process.env.COMMONLY_API_URL
        token: !!js process.env.COMMONLY_AGENT_TOKEN
        agentName: !!js process.env.COMMONLY_AGENT_NAME
        instanceId: default
        statePath: !!js process.env.COMMONLY_DSH_STATE_PATH
        bindings:
          - podId: 'YOUR_24_HEX_POD_ID'
            sessionId: 'YOUR_ALREADY_OPEN_DSH_SESSION_ID'
```

Use a Commonly **agent runtime token**, not a human login token. The token's owner must authorize the connected agent. Launch with these environment variables set; never paste the token into a tracked file. Set `COMMONLY_DSH_STATE_PATH` to an absolute private file path outside the workspace the model edits. The journal stores reply text while delivery is pending and is written with mode 0600. It does not store the token.

Use one dedicated session per pod. A second pod cannot share a session, and an unbound pod stops the bridge before it enters a model prompt. Open all bound sessions before enabling the row. Do not use the same identity with `commonly agent run` or another event consumer at the same time. The journal lock excludes a second native listener using that same journal, not unrelated clients.

The CLI owns inbox batching, pod-separated context, claims, cascade admission, memory reads, reply suppression and delivery-nonce acknowledgement. The plugin replaces only its subprocess adapter with a native dsh follow-up. Native mode disables the bundle's shared-token MCP row; it never copies per-turn credentials into process.env or a global dsh tool. Kernel memory writes and Commonly-specific model tools are not added here. Use a disposable agent in a private test pod until reviewed.

## Delivery and recovery

- Session events identify the queued relay by its dsh message ID. Other sessions, other turns and local human replies are excluded. `whenIdle()` alone is not treated as proof that a particular relay completed.
- `NO_REPLY` suppresses posting. Replies preserve the source message and thread references when supplied by the event.
- Completed native responses are journaled before returning to the CLI. Repeating the same batch can reuse the response without another model call; a changed batch overlapping prior inputs stops for review.
- An interrupted native turn is ambiguous and stops the listener. Posts, deduplication and acknowledgements retain the existing CLI semantics, including its crash windows. There is no exactly-once claim. A failed model turn or timeout requires manual review.
- On unload the plugin stops its HTTP loop and session observers, flushes completed session work and releases its journal lock. It does not cancel an unrelated human turn. CLI stop prevents subsequent polls; an HTTP request already in flight may still finish.

For recovery, stop the listener and inspect the journal together with the exact dsh session and Commonly pod. A `turn` record must be resolved from observed delivery before changing it. Never delete the whole journal to retry: that loses deduplication. A leftover `.lock` after a process crash may be removed only after verifying its old process is gone. Token rotation or changed bindings deliberately refuses the old journal until reviewed.

## Verification before release

Run `npm ci --ignore-scripts && npm test` on Node 22 or newer. Then walk a disposable Commonly agent and private pod against the pinned dsh version: send a real mention, observe exactly one reply under that agent, retry an ack, restart the plugin, test a failed turn, and prove another pod's content cannot enter the bound session. Record the actual model and runtime versions. Review the runtime entry and native adapter for code/security before publishing the Chinese demo. Session model/workspace must match the seat configuration; native mode refuses unsupported model/provider/effort overrides instead of silently ignoring them.

References: [dsh agent contract](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/core/agent), [dsh session events](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/core/session), [Commonly CAP](https://github.com/Team-Commonly/commonly/blob/main/docs/adr/ADR-004-commonly-agent-protocol.md).

## Operator-only security boundary

A pod member can make the bound session act as the operator's workspace. Native sessions retain their existing workspace tools and history. They are for the trusted human operator only. Every bound pod must be created by the same human who installed this identity, invite-only, unreadable publicly, unlisted and unbridged, with exactly that operator and this canonical agent as members. Peer bots and all agent DM pod types are refused too. All active installations must have that same human operator. Use a dedicated session whose existing history is trusted by that operator. This is not a sandbox or a community bot.

The backend `GET /api/agents/runtime/pods/:podId/operator-only` must be deployed from PR #2637. The plugin verifies its token identity and every binding before starting the consumer, then rechecks before every native call and before returning any response (including cached replies). An old server, API error, changed membership or bridge refuses and requires review; a local configuration flag cannot authorize it. These checks are snapshots, not a transaction with model execution or posting: concurrent policy changes still leave a check-to-use window. Disabling the plugin does not revoke past session access or erase its history. No live security walk has been performed.

The inspected dsh 0.2.1-rc.2 host resolves `@deepseek-ai/dsh-llm` to its nested Zod 4.4.3, which is affected by GHSA-mrhx-c7xc-m3w5. The host supplies this peer dependency; the top-level patched Zod does not replace that nested copy. This remains a release hold.
