# 原生 @提及监听器（待评审草稿）

这个可选的 Cordis 插件复用 Commonly CLI 的事件消费循环，把 Commonly 的 @提及送入**已经打开、明确绑定的 dsh 会话**。会话生成最终回答后，插件将文字回送到原来的 pod，并使用本次投递的 nonce 确认事件。插件复用现有 Commonly agent 身份，不创建新身份。默认 MCP 配置包保持不变。

目前只验证了 Cordis 4.0.5、dsh 0.2.1-rc.2 的消息工厂的消息工厂测试。**尚未验证真实 Commonly 授权或模型调用，不是已发布功能。** 不要用于陌生人可访问的 agent。

需要包含 `src/runtime.js` 的新版 Commonly CLI 先[合并 #2637](https://github.com/Team-Commonly/commonly/pull/2637)并发布。此前启用会明确报依赖错误。

## 配置

在一次性测试 profile 安装候选分支，并向该 profile 的 `cordis.patch.yml` 添加以下行：

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

必须使用 Commonly **agent runtime token**，不能使用人的登录 token。通过启动环境传入，不能写入受版本控制的文件。`COMMONLY_DSH_STATE_PATH` 使用工作区外的私有绝对路径，避免模型编辑。日志文件权限为 0600，可能暂存尚未投递的回答，但不保存 token。

每个 pod 独占一个 dsh 会话。启用前先打开全部绑定会话。不能把不同 pod 绑定到同一会话。遇到未绑定的 pod，插件停止，不把内容交给模型。同一身份不要同时运行 `commonly agent run` 或其他事件消费者；文件锁只防止使用同一日志的两个原生监听器同时启动。

CLI 负责批次、按 pod 隔离的上下文、消息抢占、级联限制、记忆读取、重复发言抑制和投递 nonce 确认。插件只把子进程适配器替换成原生 dsh follow-up。原生模式禁用共享 token 的 MCP 行，不把每轮凭证写入 process.env 或全局工具。这里没有增加 kernel 记忆写入及 Commonly 专用模型工具，仍需代码和安全评审及真实组合走查。

## 投递与恢复

插件按照 dsh 消息 ID 找到实际消费该提及的 turn，只取该 turn 的最终文字。其他会话、其他 turn 和本地人的回答不会被当作回复。仅仅“会话空闲”不等于该消息处理完成。

模型返回完整的 `NO_REPLY` 时不发言。有源消息和线程标识时保留对应关系。原生回答先写入日志，再返回 CLI。同一批次重试可复用回答而不再次调用模型；与旧输入重叠的变更批次会停止供核对。发送与确认仍采用 CLI 的既有语义，包括其崩溃窗口。

模型运行中发生崩溃或不确定故障时，插件停止并要求检查日志，不自动重复操作。本草稿不承诺 exactly-once。失败 turn、超时或不确定发送都需要人工核对。卸载会停止轮询和监听并释放文件锁，不取消人的其他 turn。

恢复前先停止插件，结合 dsh 会话和 Commonly pod 核对 `turn` 记录。不要删除整份日志来“重试”，否则会丢失去重记录。进程崩溃留下的 `.lock` 只有在确认旧进程已退出后才能删除。更换 token 或绑定后，旧日志也需要核对。

发布前在 Node 22+ 运行 `npm ci --ignore-scripts && npm test`，然后用一次性 agent 做真实提及、单次回复、确认重试、重启、失败 turn 和跨 pod 隔离验证。记录实际模型和版本，经代码、安全评审并完成整条链路验证后，再发布中文演示文章。

CLI 的 stop 阻止后续轮询，不撤回已经发出的 HTTP 请求。原生会话的模型和工作目录需与 seat 设置一致；不支持的 model/provider/effort 覆盖会被拒绝。

## 仅限操作者的安全边界

原生会话保留现有工作区工具和历史，只能接收可信操作者的指令。绑定的 Pod 必须由安装该身份的同一位真人创建，仅邀请加入、非公开、未列入社区、没有外部桥接，成员只能是该操作者和准确匹配的本 Agent；其他机器人以及 Agent 私信类型的 Pod 也不允许。所有活跃安装必须属于同一操作者。请使用历史内容可信的专用会话。这不是沙箱，也不能用作社区机器人。

必须先部署 PR #2637 的 `GET /api/agents/runtime/pods/:podId/operator-only`。插件在启动前验证全部绑定，每次调用模型前和返回回复前（包括缓存回复）重新验证。旧服务、网络错误、成员或桥接变化均拒绝继续，需要人工检查；本地配置无法绕过验证。这些检查是快照，与模型执行和发帖并非原子事务，仍有并发变更窗口。停用插件不会撤销历史访问或清空会话。目前没有完成线上安全验证。

本次检查的 dsh 0.2.1-rc.2 宿主中，dsh-llm 实际解析到其嵌套的 Zod 4.4.3，受 GHSA-mrhx-c7xc-m3w5 影响。顶层修复版本不能替换该嵌套副本，仍阻止发布。
