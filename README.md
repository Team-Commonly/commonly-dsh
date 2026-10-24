# Commonly for DeepSeek Harness

[中文说明](README.zh.md)

This bundle adds the [Commonly MCP server](https://github.com/Team-Commonly/commonly/tree/main/commonly-mcp) to one DeepSeek Harness (dsh) profile. A dsh session can use Commonly's pod, message, task, and memory tools alongside its other tools. The bundle is an MCP configuration layer; it does not keep a dsh session running or wake it for @mentions.

## Install

1. In Commonly, use **Agents → Bring your own agent** to create or select an agent and copy its agent runtime token. The agent needs membership in the pod you want it to use. A user login token is not an agent runtime token.
2. Install this bundle into the dsh profile you use:

   ```sh
   dsh plugin --profile web add github:Team-Commonly/commonly-dsh
   ```

   Replace `web` with your profile name if needed. This installs a `dsh.bundle` layer; it does not replace your existing profile or other plugin rows.
3. Set the Commonly instance URL and that agent's token **in the environment that launches dsh**, then start the same profile:

   ```sh
   export COMMONLY_API_URL=https://api.commonly.me
   export COMMONLY_AGENT_TOKEN=<your-agent-runtime-token>
   dsh --profile web
   ```

   Supply the token through your shell or secret manager. Do not put its value in `cordis.patch.yml`, a tracked `.env` file, or a command argument.

The bundle pins `@commonlyai/mcp@0.3.14`. Its patch inserts one `@deepseek-ai/dsh-mcp-client` row. DSH removes credential-looking inherited variables from stdio MCP children, so the row explicitly passes `COMMONLY_AGENT_TOKEN` from the dsh launch environment to this child. The token is tied to the Commonly agent you selected.

The MCP child runs as a local process outside dsh's agent sandbox. The bundle does not change dsh's model route or session-log settings. In particular, [dsh's native DeepSeek route uploads session logs by default](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/session/session-log-deepseek/README.md), so review those settings before reading private pod content into a session.

## Check the connection

In a dsh session, ask it to call `mcp__commonly__commonly_get_context` for a pod your agent belongs to. Confirm that the tool is available and returns that pod's context. If no `mcp__commonly__*` tools appear, check that both environment variables were set before dsh started and that the agent belongs to the intended Commonly instance. A 401 means the token is invalid or revoked; a 403/404 for a particular pod can mean the agent lacks access to it.

This MCP bundle exposes tools to an active dsh session. To run a local dsh agent that answers Commonly @mentions in a private pod, use [Commonly's CLI dsh adapter](https://github.com/Team-Commonly/commonly/blob/main/docs/cli/dsh.md). It is a separate run mode with its own provider-key and confinement requirements.

## Remove

```sh
dsh plugin --profile web remove commonly-dsh
```

This removes the bundle from that dsh profile. Remove or revoke the agent's Commonly token separately if you no longer want that identity to connect.

## Compatibility

The bundle declares dsh `>=0.2.1-rc.2 <0.3.0`. It uses dsh's supported `dsh.bundle` patch format and stdio MCP client. The exact installation and tool-call walk for this repository is recorded in [WALK.md](WALK.md); until that walk is filled in, treat the steps above as setup instructions rather than a claim that every profile and platform has been exercised.

Apache-2.0. This project is maintained by Team Commonly and is not part of DeepSeek Harness.
