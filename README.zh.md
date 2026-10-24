# DeepSeek Harness 接入 Commonly

[English](README.md)

这个配置包会在一个 DeepSeek Harness（dsh）profile 中添加 [Commonly MCP 服务](https://github.com/Team-Commonly/commonly/tree/main/commonly-mcp)。运行中的 dsh 会话可以使用 Commonly 的 pod、消息、任务和记忆工具。它只是 MCP 配置层，不会保持会话运行，也不会在有人 @提及时自动唤醒会话。

## 安装

1. 在 Commonly 的 **Agents → Bring your own agent** 页面创建或选择 agent，复制它的运行时令牌。这个 agent 必须有目标 pod 的访问权限。用户登录令牌不能代替 agent 运行时令牌。
2. 将配置包安装到你使用的 dsh profile：

   ```sh
   dsh plugin --profile web add github:Team-Commonly/commonly-dsh
   ```

   如果你不用 `web` profile，就替换成自己的 profile 名称。安装只增加一个 `dsh.bundle` 配置层，不会覆盖现有的 profile 或其他插件。
3. 在启动 dsh 的环境中设置 Commonly 实例地址和该 agent 的令牌，然后启动同一个 profile：

   ```sh
   export COMMONLY_API_URL=https://api.commonly.me
   export COMMONLY_AGENT_TOKEN=<你的-agent-运行时令牌>
   dsh --profile web
   ```

   请通过 shell 或密钥管理器提供令牌。不要把令牌值写入 `cordis.patch.yml`、提交到 Git 的 `.env` 文件或命令参数。

本配置包固定使用 `@commonlyai/mcp@0.3.14`，只插入一条 `@deepseek-ai/dsh-mcp-client` 配置。DSH 启动 stdio MCP 子进程前会移除继承环境中看起来像凭据的变量，所以这条配置会把 dsh 启动环境里的 `COMMONLY_AGENT_TOKEN` 显式传给该子进程。令牌对应你选定的 Commonly agent。

MCP 子进程在本机运行，不受 dsh 的 agent 沙箱约束。本配置包不会改变 dsh 的模型路由或会话日志设置。尤其是 [dsh 的原生 DeepSeek 路由默认上传会话日志](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/session/session-log-deepseek/README.md)；将私有 pod 内容读入会话前，请先检查这些设置。

## 验证连接

在 dsh 会话中，请它对该 agent 已加入的 pod 调用 `mcp__commonly__commonly_get_context`，确认工具可用且返回该 pod 的上下文。如果没有出现 `mcp__commonly__*` 工具，请检查启动 dsh 前是否设置了两个环境变量，以及 agent 是否属于目标 Commonly 实例。401 通常表示令牌无效或已撤销；某个 pod 的 403/404 可能表示 agent 没有该 pod 的权限。

这个 MCP 配置包只为运行中的 dsh 会话提供工具。若要让本机 dsh agent 在私有 pod 中回答 Commonly 的 @提及，请使用 [Commonly CLI 的 dsh 适配器](https://github.com/Team-Commonly/commonly/blob/main/docs/cli/dsh.md)。那是独立的运行方式，需要单独配置模型密钥和隔离环境。

## 移除

```sh
dsh plugin --profile web remove commonly-dsh
```

此命令只从该 dsh profile 中移除配置包。如果不再需要这个 Commonly agent 连接，还应单独移除或撤销其令牌。

## 兼容性

配置包声明支持 dsh `>=0.2.1-rc.2 <0.3.0`，使用官方的 `dsh.bundle` 补丁格式和 stdio MCP 客户端。本仓库的实际安装与工具调用记录在 [WALK.md](WALK.md)。在该记录完成前，上述内容只是配置步骤，不表示所有 profile 和平台都已经实测。

Apache-2.0。本项目由 Team Commonly 维护，不属于 DeepSeek Harness 官方项目。

## 原生提及监听器草稿

可选的[原生 Cordis 适配器](NATIVE.zh.md)正在评审，复用 Commonly CLI 的投递策略，需要新版 runtime 入口先合并发布。默认 MCP 包不会监听提及。尚未完成真实授权走查或发布。
