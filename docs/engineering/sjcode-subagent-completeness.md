# Subagent 功能完整性盘点（对照 dsh-superagent）

- 日期：2026-11-22
- 基座：t3code pin `0775dc4` + 本 fork 的 Team domain（`4075969b`）
- 参照：DeepSeek 官方研究原型 `deepseek-ai/dsh-superagent-prototype`（24.2k stars，MIT，中文文档由社区镜像 `saltapp/dsh-superagent-prototype-cn`）；原 SJCode 计划 03。
- 证据分级：t3code 能力来自其官方文档自述 + P0 真实验证；dsh 能力来自官方/镜像文档自述；**未逐项实测的部分明确标注**。

## 结论

P0 已用真实 Claude 验证 t3code 的委派闭环（`verify-background-live --scenario nested` 通过）。按 dsh-superagent 的领域模型逐项核对，**核心执行闭环完整，但"授权可审计化"和"工单生命周期独立于执行器"这两层是主要缺口**。已实现的新 Team domain 补上了任务板 + mailbox + 幂等，但不替代 dsh 的 Mandate/Policy 模型。

**本次交付状态**：Subagent 核心能力盘点已完成（本文档）；Team domain 已落地任务板/mailbox/幂等（`4075969b`）。缺口 1、2 是**待办建议，本次未实现**，按下方"缺口明细"可在 Team domain 上小步补齐，不需要再动 t3code 核心。

| 能力维度（dsh 术语）                         | t3code / 本 fork 现状                                                                     | 判定                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| 委派执行（Assignment running→ended）         | `delegate_task` / `task_status` / `task_cancel`，真实子线程，P0 实测通过                  | 完整                          |
| 子任务可取消、结果可等待                     | `t3_thread_wait`、`task_cancel`、`hasPendingChildRuns`、`workState`                       | 完整                          |
| 后台工作唤醒父线程                           | `docs/operations/background-verification.md` 的 idle/active/native/nested 场景            | 完整（自述）                  |
| 权限不放大 / 能力降级                        | provider capability 声明 + `supportedRuntimeModes` + 父实例权限继承                       | 完整（自述）                  |
| 子任务审批显示在父会话                       | `permission-modes.md` 明确记载                                                            | 完整                          |
| 幂等（触发两次只建一个工单）                 | 本 fork Team `TeamMessage.dedupeKey` + DB UNIQUE；委派有 `clientRequestId`                | 部分（Team 有，委派层需实测） |
| 工单状态独立于执行器（Ticket vs Assignment） | 本 fork Team 任务板独立持久化；但**任务状态不会因子线程完成自动更新**                     | 缺口                          |
| 授权 Mandate（策略版本/范围/强度/来源身份）  | t3code 有权限模式与 scoped credential，但**没有绑定"为何可做、可做多远"的不可变授权记录** | 缺口                          |
| 订阅扇出 + 后续消息恢复工单                  | Team mailbox 是显式 send/inbox；没有"订阅线程→触发自动 fan-out→恢复已结束工单"            | 缺口                          |
| 失败/重试/重启恢复                           | t3code 有 ProviderRuntimeRecovery；本 fork Team 状态存 SQLite 可恢复                      | 部分                          |
| 并发槽位 + 后台工作保槽                      | t3code 有 background work + `t3_background_wait`；无显式全局槽位上限                      | 部分                          |

## 缺口明细与建议

### 缺口 1：工单状态跟随执行器（最高价值）

dsh 的核心规则："工单定义自己的状态，不跟随执行器的状态；只有最终报告才能结束工单。"
本 fork 的 Team 任务板状态目前**需要 leader/成员显式调用 `team_task_update`**。如果子线程（assignment）结束，任务不会自动从 `in_progress` 变 `review/done`。

建议（小改动）：

- 增加 `team_task_attach`：任务关联 `taskId`（已有 delegate_task 的 NodeId）。
- 在 `task_status` 读到 `latestTerminalStatus` 时，由 leader 调用一次 `team_task_update(status: review|done)`。这是**文档约定**，不是自动机 —— 保持"不建第二套调度器"的原则。
- 验收：子线程失败时任务保持 `in_progress/blocked`，不会被假完成。

### 缺口 2：授权 Mandate / 策略版本

dsh 的 Mandate 记录：策略版本、范围、强度、命中规则、来源身份；不可变；范围更宽即新工单；策略变更使运行中的评估作废。t3code 的权限模式（Supervised→Full access）只表达"当前模式"，没有"为何可做"的可审计记录。

建议：在 `team.ts` 增加 `TeamMandate`（teamId、policyVersion、scope、strength、grantedBy、grantedAt），`team_create` 时写入且不可变。这是新增 schema + 一列，风险低。

### 缺口 3：订阅扇出 / 恢复

dsh 用"订阅"把线程上的后续消息自动投递给工单，且人的消息可恢复已结束工单。本 fork 的 mailbox 是显式 `team_send`。

建议：**不做自动扇出**（会与 t3code 的 thread 模型冲突）。用约定替代：leader 在子线程完成后读取 `team_inbox`，人工决定是否恢复任务。明确写进文档，避免误以为有自动恢复。

### 不算缺口 / 不要移植

- "来源 Source / 触发 Trigger / 策略 Policy 内容"是 dsh 面向 GitHub/飞书的部署层概念，t3code 的 provider/connector 体系已覆盖；不要照搬第二套。
- "worker 目录 prepare 命令"对应 t3code 的 worktree isolation（`isolation: 'worktree'`），已覆盖。
- "eval/orchestrator session 拆分"对应 t3code 的 delegate_task + 父会话审批，形态不同但语义一致。

## 与 P0 实测的关系

P0 的 `nested` 场景证明了"委派 + 后台结果回传 + 重启持久化"这条主线可用，这是 dsh 执行模型的核心。上述缺口都在**编排/审计层**，不是执行引擎本身。因此不需要再动 t3code 核心，只需在本 fork 的 Team domain 上小步补齐缺口 1、2。

> 说明：dsh-superagent-prototype 自述为"研究原型，非生产软件"，其论文中部分设计未实现。本文把它当作能力清单参照，不假定其生产可用性。
