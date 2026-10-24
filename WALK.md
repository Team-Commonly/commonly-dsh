# Verification record

## 2026-10-24: local configuration walk

- Platform: macOS; `@deepseek-ai/dsh@0.2.1-rc.2`; pnpm 10.18.0.
- Installed this checkout with `dsh plugin --profile web add .` in a fresh, isolated `DSH_HOME`. The profile declared `commonly-dsh` as a bundle.
- `dsh --profile web --dump-config` contained the `mcp-commonly` row, the pinned `@commonlyai/mcp@0.3.14` command, and both environment expressions.
- Started `dsh --profile web --no-open` with a deliberately invalid `cm_agent_`-shaped test token. The Commonly MCP child stayed running and the web host listened on loopback. No MCP startup failure was reported. A token lacking the `cm_agent_` prefix was rejected by the MCP child, and dsh reported that the row did not activate.

This proves package installation and MCP child activation with the test token shape. It does **not** prove Commonly authorization, access to any pod, a tool call, or @mention delivery. Those require a disposable Commonly agent credential and an authenticated end-to-end walk before making those claims in a directory entry.
