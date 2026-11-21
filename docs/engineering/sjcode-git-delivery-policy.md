# SJCode Git delivery 策略在 T3 Code 基座上的落地

- 日期：2026-11-22
- 背景：旧 SJCode 的 Git delivery pack（PR-08）包含「只读本地检查」+「opt-in skill 门控」，用于防止未经授权的交付动作。t3code 原生已提供 checkpoints、source control、worktree、PR 链接与 commit/push，功能层面更强，因此**不移植功能代码**，只补策略与说明。

## t3code 已有的等价/更强能力（官方文档自述，未逐项实测）

- `docs/user/source-control.md`：变更查看、commit、push、PR 链接与合并通知。
- `docs/internals/overview.md`：checkpoints 用隐藏 git ref 捕获工作区状态；worktree 线程；线程结算由 server 负责。
- 权限模式（`docs/user/permission-modes.md`）：Supervised / Auto-accept edits / Auto / Full access，控制 agent 的命令审批行为。

## 策略映射

| 旧 SJCode 语义                   | t3code 对应                                                   | 结论               |
| -------------------------------- | ------------------------------------------------------------- | ------------------ |
| 只读本地 Git 检查（默认）        | Supervised 权限模式 + source control 只读查看                 | 默认满足           |
| opt-in 后才允许交付动作          | 在 Supervised 下显式批准命令；Auto/Full access 需用户主动切换 | 满足，但要写清风险 |
| 专用 skill `sjcode-git-delivery` | 保留为团队约定文档，不再是功能开关                            | 本文即替代         |

## 用户约定（写进 README/项目文档时采用）

1. 默认使用 **Supervised**：agent 的 commit/push 等交付动作必须逐条批准。
2. 仅在信任的自动化场景切换到 Auto / Full access；切换即视为 opt-in。
3. 每个线程的 worktree 与 checkpoint 提供回滚点；交付前先审阅 diff。
4. 不把 `Full access` 设为项目级默认值。

## 旧实现参考

- `sjcode/docs/engineering/08-git-delivery-capability.md`
- `sjcode/core/crates/aionui-app/assets/builtin-skills/sjcode-git-delivery/SKILL.md`

## 状态

`Git delivery` 能力在 t3code 基座上由原生 source control + 权限模式覆盖，策略如上。**不需要代码移植**；剩余 P4 工作量集中在 Project Memory。
