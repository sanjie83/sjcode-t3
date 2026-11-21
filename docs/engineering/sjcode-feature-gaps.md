# SJCode 必须保留能力 → T3 Code 基座差距分析

- 日期：2026-11-22
- 背景：整体 rebase 到 t3code（pin `0775dc4`），用户要求保留四项能力；旧实现位于 `sanjie83/sjcode` 的 AionUi fork。
- 原则：先确认 t3code 原生已覆盖的部分，只对**真实缺口**排期，避免重复造轮子。
- 证据：t3code 侧均为官方文档自述（`docs/user/*.md`、`docs/internals/overview.md`），尚未逐项实测；旧 SJCode 侧为本仓库已读文件。

## 结论速览

| 能力             | t3code 原生覆盖                                         | 真实缺口                                    | 建议                                                  | 优先级 |
| ---------------- | ------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- | ------ |
| 品牌 / 安装身份  | —                                                       | 已在 P1 完成                                | 已提交到本分支                                        | 完成   |
| mirasim 界面融合 | 线程侧栏、composer 模型/推理选择、Welcome 页            | 三步引导文案与视觉、多会话分组窗格、导航 IA | 在 t3code React UI 上做定向改造，不移植旧 AionUi 组件 | P2     |
| Runtime Doctor   | Welcome/Providers 已做 agent CLI 检测                   | Java/Spring Boot 项目运行时检测             | 作为独立工具页或 skill 补上，不复用旧 Rust CLI        | P3     |
| Project Memory   | 无直接对应                                              | 四类型记忆 / 索引 / 来源字段                | 后端新增，工作量与风险最高                            | P4     |
| Git delivery     | checkpoints / source control / worktree / PR 链接已很强 | 旧「只读本地检查 + opt-in skill」语义       | Mostly superseded；只补 opt-in 开关说明               | P4     |

## 1. mirasim 界面融合

**t3code 已有（官方自述）：**

- `docs/user/welcome-page.md`：新装 Welcome 页，自动检测已装 agent、可安装/登录、导入历史项目、手机配对。
- `docs/user/composer.md`：模型选择、推理强度、文件/上下文引用、斜杠命令与 `$` skill。
- `docs/user/thread-sidebar.md`：线程列表、分组、归档、置顶、搜索。
- `docs/user/project-settings.md`：项目级设置与默认模型。

**真实缺口（相对旧 SJCode `product-tasks.md` B 类）：**

1. B1 三步引导的**文案与顺序**（安装智能体 → 配置额度 → 选择用法）与 t3code Welcome 不同；t3code 已覆盖「安装智能体」，缺「配置额度 / 选择用法」两步。
2. B2 固定导航行（消息/会话/事项/文件/工作区/自动化）的 IA 未落地；t3code 用侧栏+路由，需按 mirasim 意象重排。
3. B5 多会话分组/窗格：t3code 有线程分组与 tab 预览，但「分组栏切换 + 会话标签保留状态」需按旧 B5 MVP 语义对齐。

**落点：** `apps/web/src/`（页面/路由）、`apps/desktop/src/renderer` 对应层、i18n translations。
**旧实现参考：** `sjcode/desktop/packages/desktop/src/renderer/pages/guid/`（`GuidPage.tsx`、components、hooks）、`sjcode/docs/engineering/20-batch-visual-ia-plan.md`。
**验收：** 三步引导可恢复进度；导航行齐全且有运行中徽标；分组切换后会话状态保留。
**注意：** UI 改动先出 IA 方案再动代码（旧仓库约定）。

## 2. Runtime Doctor

**t3code 已有：** Welcome 页与 `Settings → Providers` 已做 agent 安装/登录/版本检测，等价于旧 doctor 的「agent CLI 检测」部分。
**真实缺口：** 旧 PR-07 的 Java / Spring Boot 运行时检测（读 Maven/Gradle manifest，检出 Spring Boot、模块数、Java 版本，`version_unsupported` 判定）。
**落点建议：** 新建独立工具页或 `t3.json` action + skill；用 Node 读 manifest，不移植 Rust。
**旧实现参考：** `sjcode/core/crates/aionui-app/src/commands/cmd_doctor.rs` 只是 agent 检测（已被 t3code 覆盖）；Java 逻辑在 PR-07 相关提交与 e2e fixture 中，需进一步定位。
**验收：** Java/Spring Boot fixture 检出 Spring Boot、模块数、Java 版本；dev 与 packaged 双模式。

## 3. Project Memory

**t3code 已有：** 无原生四类型记忆；有 `docs/internals/composer-context-references.md`（上下文引用）与 MCP tools，但不等价。
**真实缺口：** 四类型 / 索引 / 来源字段的持久化与索引，以及 agent 可调用的读写接口。
**落点建议：** 在 t3code server 上以 Effect service + SQLite projection 实现；client 侧加设置页。工作量与风险最高，放在最后。
**旧实现参考：** `sjcode/core/crates/aionui-ai-agent/src/manager/aionrs/project_memory.rs`、`aionui-api-types/src/project.rs`、`aionui-app/src/commands/cmd_project_memory_stdio.rs`。
**验收：** 四类型 CRUD + 索引/来源字段；live Agent 能读写。

## 4. Git delivery

**t3code 已有（官方自述）：** checkpoints（隐藏 git ref）、source control 面板、worktree 线程、PR 链接与合并通知、commit/push。这比旧 SJCode 的 Git delivery pack 完整得多。
**真实缺口：** 旧实现的「只读本地检查 + opt-in skill 门控」语义，用于防止未授权推送。
**落点建议：** 不需要移植功能，只需把 opt-in 策略映射到 t3code 的权限模式 / 项目设置，并补一份说明。
**旧实现参考：** `sjcode/docs/engineering/08-git-delivery-capability.md`、`sjcode/core/crates/aionui-app/assets/builtin-skills/sjcode-git-delivery/SKILL.md`。
**验收：** 默认只读；显式 opt-in 后才允许交付动作。

## 执行顺序建议

P2（UI，风险低、用户感知强）→ P3（Runtime Doctor，独立）→ P4（Memory 后端，最难）→ P5（验证/发布）。
Git delivery 的 opt-in 说明可并入 P5 文档工作。

## 已知的环境性测试失败（与 rebase 改动无关）

在本机 Windows 上，以下测试即使未改身份也会失败，原因分别是大小写不敏感文件系统与子进程 fixture：

- `DesktopLinuxUrlHandler.test.ts` 的 theme icon 用例：`com.sjcode.SJCode.png` 与 `com.sjcode.sjcode.png` 在 NTFS 上是同一文件。
- `scripts/build-desktop-artifact.test.ts` 的 manifest restore / overlapping build 用例：`ChildProcess.spawn` NotFound（依赖 Unix 工具）。
  这些不计入本次改动的回归判断；如要在 Windows 上全绿，需要上游为这些用例加平台门控。
