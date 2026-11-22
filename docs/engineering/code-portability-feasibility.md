# 代码移植可行性评估：dsh-superagent → SJCode fork

- 日期：2026-11-22
- 问题：能否移植现成代码减少重复工作量？
- 结论：**整体移植不可行；选择性移植纯领域逻辑可行，已落地两件。**

## 评估对象

| 仓库                                                   | Star  | 许可     | 形态                                                                                                 | 可否整体移植   |
| ------------------------------------------------------ | ----- | -------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| `deepseek-ai/dsh-superagent-prototype`                 | 24.2k | MIT      | **DeepSeek Harness 插件**，依赖 `cordis` + DSH Session API + `@deepseek-ai/dsh-client-ui-primitives` | ❌             |
| `moonoops/dsh-super-agent-droy`                        | 33    | MIT      | 同上 + 外部 Hindsight 记忆服务                                                                       | ❌             |
| 其他 dsh 变体（windows/ptc/panel/multi/pi-superagent） | 少量  | MIT/其他 | 均为 DSH 插件衍生                                                                                    | ❌             |
| ZCode（原计划 04 提及）                                | —     | —        | 当前网络检索无公开源码                                                                               | ❌（无法获取） |

## 为什么整体移植不可行（已核实的源码事实）

1. dsh-superagent 是 **DSH 插件，不是独立应用**。其 `src/app/*`、`src/executor/dsh.ts`、`src/sources/*`、`src/client/*` 全部绑定 DSH 运行时（见 `docs/007-architecture.md` 的模块表）。移植 = 重写，不是复制。
2. 它的 Sources 是 GitHub webhook + 飞书机器人（团队值守分流），与我们的桌面 IDE 场景不符。
3. 它的领域概念（Trigger/Thread/Eval/Ticket/Mandate/Subscription）与 t3code 的（AppThread/Run/ExecutionNode/ContextTransfer）语义重叠但不同。整搬会引入第二套调度器 —— t3code `AGENTS.md` 明确禁止 "introduce machinery because it looks architecturally impressive"。
4. 它的记忆（Hindsight 双库）是外部服务，与计划 04 首版"不建向量库、不引入独立服务"的边界冲突。

## 唯一可移植的部分：`src/core`

dsh 官方文档明确："`src/core` imports nothing outside itself apart from Node's hashing, and does no I/O." 我读了 `src/core/stage.ts` 与 `src/core/model.ts` 核实：确实是纯函数 + 类型定义，无宿主依赖。

### 已移植（本分支）

| 移植件             | 来源                                           | 适配                                                                                          | 填补的缺口                            |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| 工单阶段状态机     | `src/core/stage.ts` `ticketStage` / `canRetry` | 改为从 Team 任务板状态派生（执行在 t3code delegate_task 子线程，Team 自有生命周期）           | Subagent 缺口 1：工单状态不跟随执行器 |
| Mandate 不可变授权 | `src/core/model.ts` `Mandate`                  | 精简为 strength/policyVersion/scope/basis/grantedBy/grantedAt，持久化到 Team（migration 107） | Subagent 缺口 2：授权可审计化         |

保留 MIT 署名于源码注释；未复制任何 DSH 宿主代码。测试：23 个相关用例通过，typecheck 43/43。

### 未移植（评估为不划算）

- 完整 Engine/EnginePart（Intake/Evals/Tickets/Assignments/Replies）—— 会与 t3code 的事件溯源编排正面冲突。
- Effects/Outbox/Source 插件体系 —— DSH 专属。
- 面板 UI（`src/client/*`）—— DSH 客户端插件，不是 React web app。
- Hindsight 记忆引擎 —— 外部服务依赖。

## 对计划 04 的启示

Repo Wiki / Project Memory **没有可直接移植的开源实现**（ZCode 源码当前不可得，dsh 的记忆是外部服务）。计划 04 维持从零实现，但可借鉴两处 dsh 思路（无需复制代码）：

- Mandate 的 `basis`/`policyVersion` 已移植，可作为 Memory 注入权限的模型基础；
- Core4 四文件身份核心（`identity/principles/relationship/focus` 的 pure markdown 模板）可作为 Memory `reference` 类型的模板设计参考 —— 但要重新实现，不复制。

## 判断原则（供以后复用）

移植前问三个问题，任一为"否"则不要移植：

1. 源码是否**无宿主运行时依赖**（能独立编译/运行）？
2. 其领域概念是否与目标系统**同构**（不是仅字面相似）？
3. 移植后是否**不引入第二套状态机/调度器**？

"整体换基座"时，可移植的通常只有纯算法/状态机/协议定义；编排层与 UI 层几乎总是要重写。
