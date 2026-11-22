# SJCode 计划 01–04 在 T3 Code 基座上的满足度核对

- 日期：2026-11-22
- 输入：用户提供的 4 份原计划（01 Agent 安全治理 / 02 Agent Team 与 Worktree / 03 Subagents 融合 / 04 Repo Wiki 与 Project Memory）
- 基座：t3code pin `0775dc4`，fork `sanjie83/sjcode-t3`
- 证据规则：t3code 侧以官方 `docs/**` 自述和本 fork 的实际 grep 为准；**不把文档自述当成已实测行为**。仅 P0 的委派闭环有真实验证记录。

## 总结判定

| 计划                          | 原计划前提                                      | 按原 PR 清单 | 按功能目标                       | 真实缺口                                       |
| ----------------------------- | ----------------------------------------------- | ------------ | -------------------------------- | ---------------------------------------------- |
| 01 Agent 安全治理             | Rust Core + Aionrs v0.2.11 + `safety_policy_v2` | 不满足       | 部分覆盖                         | 默认权限模式与计划相反；Aionrs 治理项整体失效  |
| 02 Agent Team / Worktree      | `aionui-team` Scheduler/Mailbox/TaskBoard       | 不满足       | Worktree 覆盖强，Team 编排不成立 | 无持久化 Leader/成员/Mailbox/TaskBoard/TeamRun |
| 03 Subagents 融合             | Aionrs SpawnTool + Assistant Catalog            | 不满足       | 核心委派已覆盖并有实测           | 无 Assistant Catalog / 原形态 SubagentRunCard  |
| 04 Repo Wiki / Project Memory | Rust Project/Agent 接口 + Aionrs Memory         | 不满足       | 完全未覆盖                       | 两项能力都不存在，是最大缺口                   |

**关键事实**：t3code 中检索不到 `aionrs`（除本 fork 自带的说明文档外），计划 01/03/04 里围绕 Aionrs 的交付物（Spawn 治理、Memory 去重、Assistant Profile）没有承载对象。

## 01 Agent 安全治理与统一执行底座

t3code 已覆盖（官方自述）：

- 权限模式 Supervised / Auto-accept edits / Auto / Full access，可由 managed policy 设上限（`docs/user/permission-modes.md`）；Subagent 审批显示在父会话。
- Provider 能力声明：`OrchestrationV2ProviderCapabilities`、`supportedRuntimeModes`；"Turn off fork, rollback, steering, or subagent support it lacks"（`docs/internals/adding-a-provider.md`）。
- 认证与作用域：scoped session、DPoP、MCP 客户端只读/运行时上限、编译期 `McpToolAccess`（`docs/internals/environment-auth.md`）。
- 事件溯源 + command receipt + outbox effect 保证幂等与可恢复（`docs/internals/overview.md`）。

不满足/需注意：

1. **默认模式是 Full access**（`permission-modes.md` 第 10–11 行），与计划 01 的 `confirm`（默认询问）相反。这是安全姿态回退，需在 fork 里改为默认 Supervised 或至少写入项目级默认。
2. 计划中的 `AgentRunContext`、Core 生成的 `run_id`、`PolicyService` 的 `once/session/project` 规则、路径/命令规范化、具名审计事件，在 t3code 中是**不同形态**（execution node / run scope / provider capability），不能视为等价交付。
3. A4「Aionrs Spawn 治理」和 `safety_policy_v2` flag 无对应对象。

## 02 Agent Team 与 Worktree 完善

t3code 已覆盖：worktree 线程、TaskFolders、隐藏 git ref checkpoints、sparse repository scope、source control / PR 链接（`docs/internals/overview.md`、`docs/user/source-control.md`）。

不满足：

1. 无持久化 Team 实体：未检索到 Leader / Teammate / Mailbox（未读游标、确认读取）/ TaskBoard（`blocked_by`）/ TeamRunManager 的产品实现。`NotificationMailbox` 是通知机制，不是团队邮箱。
2. 计划 02 的 T1–T3 验收（1→2 人协作、成员独立路径、崩溃重启恢复）**无真实证据**，不能按原样标为通过。
3. P0 已实测的 `nested` 委派通过，只能证明"子任务委派闭环"，不等于"持久化 Team"。

## 03 Subagents 融合与任务工作台

t3code 已覆盖并有实测：

- 受控委派工具 `delegate_task` / `task_status` / `t3_thread_wait`（`docs/orchestration-v2/orchestrator-mcp-server.md`），支持 `isolation: "worktree"`、父实例权限继承、能力发现（不可用的 provider 标为 unavailable）。
- 子任务审批在父会话显示（`docs/user/permission-modes.md`）。
- P0 真实 Claude `verify-background-live.ts --scenario nested` 通过（委派完成 + 重启持久化）。
- 侧栏线程搜索/归档/置顶（`docs/user/thread-sidebar.md`）。

不满足：

1. 无 AionUi 的 Assistant Catalog / `AssistantExecutionProfile`（字段 `supported_executions`、`workspace_policy`、`max_spawn_depth` 等）。
2. 未确认存在按计划字段定义的 `SubagentRunCard`（角色/模型/耗时/Token/摘要）；`ChatView.tsx` 有 `subagentRuntime` 与 lineage 接入，但需要实测才能判定是否等价，不能凭引用断言满足。
3. 计划里的 Aionrs + 一个真实 ACP 后端的双后端集成、只读 Explore 工具白名单，在 t3code 里是 provider 能力机制，形态不同。

## 04 Repo Wiki 与 Project Memory

**完全不满足。** 在 `apps/`、`packages/`、`docs/` 中未检索到 `MEMORY.md`、Repo Wiki、WikiIndexer / WikiStore、带 Git Snapshot 的 `CodeCitation` 等实现（命中的只有本 fork 新增的分析文档）。计划 04 的 D0–D7 全部无承载对象，且其"首个开发动作审计 Aionrs aion-memory"的前提已不存在。

## 建议的处置顺序

1. 先把计划 01 的默认权限模式改回 Supervised（或项目级强制），否则 rebase 后安全姿态比原计划弱。
2. 明确放弃计划 02 的持久化 Team 语义，改用 t3code 的委派 + worktree 线程模型，并据此重写验收场景（不再要求 T1–T3 原样通过）。
3. 计划 03 以 P0 实测结果为基线，只补齐确有缺口的部分（Assistant Profile、卡片字段），不要再实现第二套 SubagentRunManager。
4. 计划 04 是最大的净新增工作量：Repo Wiki 与 Project Memory 都需要从零实现，按 `sjcode-feature-gaps.md` 的 P4 排期。
