# 计划 04（Repo Wiki + Project Memory）从零实施计划

- 日期：2026-11-22
- 基座：t3code pin `0775dc4` + 本 fork（Team domain `4075969b`）
- 前提：原计划的 Rust/aion-memory/ZCode 移植路线已失效（t3code 中无 Aionrs、无 Rust Core、无 ZCode 源码）。本计划**从零用 t3code 原生栈实现**：Effect service + SQLite（Drizzle migrations）+ MCP toolkit + web/desktop UI + 全语言 i18n。
- 原则：Wiki = 源码证据；Memory = 跨会话持续知识；两者不混同、不自动互转。首版不建向量库、不做 RAG、不做自动后台 LLM 刷新。

## 0. 与 t3code 架构的映射（决定实现方式）

| 原计划概念                     | t3code 承载点                                                                                                             | 说明                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Rust domain + repository trait | `apps/server/src/{wiki,memory}/` 的 Effect `Context.Service` + `packages/contracts` schema                                | 不用 Rust，遵循 t3code 的 service 分层 |
| SQLite 迁移                    | `apps/server/src/persistence/Migrations/107_*.ts` 起                                                                      | 参照本次 Team 的 `106_SjcodeTeams.ts`  |
| 后端 Repository                | `apps/server/src/persistence/{WikiStore,ProjectMemoryStore}.ts`（`SqlClient` + `SqlSchema`，`NodeSqliteClient.readOnly`） | 参照 `PullRequestFilesViewed.ts`       |
| UI 页面                        | `apps/web/src/` 页面 + `apps/desktop`（包装 web）；共享逻辑进 `packages/client-runtime`                                   | 三个 surface（web/desktop/mobile）     |
| MCP 工具                       | `apps/server/src/mcp/toolkits/{wiki,memory}/` + 注册进 `McpHttpServer.layerTools`                                         | 参照本次 Team 的 `toolkits/team/`      |
| i18n                           | `apps/{web,mobile}/src/i18n/translations/*.json`（`vp run i18n:generate` + `i18n:check`）                                 | 11 种语言                              |
| 生成用 Agent                   | 复用 `delegate_task`（child thread）跑只读提取/大纲生成                                                                   | 不建第二个 Agent Engine                |

## 1. Project Memory（先做，比 Wiki 轻且是 Wiki 的前置约束）

### D0 — 审计与去重（必须先做）

- [ ] 确认 t3code 是否有任何自动记忆/上下文注入机制（本 fork 已 grep：`apps/packages/docs` 无 `MEMORY.md`/`aion-memory`；需在 provider adapter 层再确认 Claude/Codex 是否自带项目记忆写入）。
- [ ] 输出审计结论：是否存在双重注入风险；若有，Memory 注入必须可关闭且默认不注入。
- 验收：审计报告 + "无未知自动提取"结论。

### D1 — 单一 Store + 手动管理（MVP 核心）

- contracts：`ProjectMemory`（id/projectId/type/title/content/sourceConversationId/createdAt/updatedAt/version/status），四类型 `project|decision|feedback|reference`。
- migration `107_ProjectMemory`：`project_memories` 表，`UNIQUE(project_id,id)`，`idx_project_memories_project`；按 `project_id` 隔离（**不是路径、不是 Worktree**）。
- service `ProjectMemoryService`：create/update/delete/list/get，`write(id, expected_version)` 乐观锁（版本冲突返回候选，不覆盖）；删除后不能被旧任务复活。
- MCP toolkit `memory_*`：`memory_add/list/update/delete/export`。
- 验收：同项目跨会话召回有效；另一项目无法召回；并发写入无 last-write-wins；删除后不复活。

### D2 — 召回与注入（含 Token 预算）

- `MEMORY.md` 精简索引 + 按当前项目/查询目标/类型选择少量条目；总 Token 上限与截断。
- Memory 作为**不可信上下文**注入下一轮，不覆盖系统策略/用户指令/权限；只读 subagent 可读写边界：默认只读共享记忆，写需 opt-in。
- 验收：Solo/Team/Subagent 读一致；跨项目不泄露；注入内容不能提升工具权限（对抗性用例）。

### D3 — Desktop Memory 管理页

- 项目设置：启用/关闭自动提取（默认关闭）、列表、来源会话、更新日期、逐条编辑/删除、全部导出、项目级清空（危险操作需确认）、Token 预算。
- 三 surface 覆盖：web 主页面 + desktop（包装）+ mobile（只读查看）；i18n 全语言。
- 验收：禁用后停止注入而非只隐藏 UI；清空/导出行为正确。

### D4 — 自动候选提取（默认关闭，最后做）

- 会话完成后、用户授权开启时运行；用 `delegate_task` 只读辅助任务整理候选；**写入由 Memory Service 完成，不给提取 agent 文件写权限**。
- 去重/冲突/隐私过滤（密钥、PII）；用户确认后保存；历史版本可追溯。
- 验收：默认关闭；逐条可追溯；无并发丢失；Team 多成员写候选由统一服务串行合并。

## 2. Repo Wiki（在 D2 之后，可并行启动 D1-D3）

### W1 — Snapshot + Indexer

- `wiki_snapshots`（project_id/repository_identity/branch/head_commit/dirty/generated_at）+ `wiki_files`（relative_path/content_hash/snippet）。
- 扫描：`.gitignore` + 显式排除 + 文件/总数上限 + 二进制探测；排除 `.env`/私钥/凭据；拒绝越界符号链接（规范化路径校验）。
- `CodeCitation`（repository_id/snapshot_id/relative_path/start_line/end_line/content_hash/commit_sha）。
- 验收：同一快照可重现引用与扫描范围；文件变化后引用标 stale。

### W2 — 生成（分章节、可取消、限预算）

- `delegate_task` 只读 Explore 收集片段与引用 → OutlineGenerator → PageGenerator（并行、受预算）→ `wiki_pages`（markdown/mermaid/status/error）。
- 分章节保存；失败章节可重试；用户可取消；Git 变更后标 stale 手动更新。
- 验收：可取消不清空成功章节；重试只处理失败/过期章节；输出带可点击源码引用；无证据内容标记推测。

### W3 — Desktop Wiki Explorer

- 页面树、Markdown/Mermaid 渲染、源码跳转（到 snapshot 对应文件和行号）、过期提示、手动更新按钮、多 Worktree 指定快照。
- 验收：文件变化显示过期提醒；指定快照生成；三 surface + i18n。

### W4 — Wiki ↔ Memory 联动（仅用户确认）

- "将此决策保存为项目记忆"（Wiki→Memory）；Memory 为生成器提供用户确认的架构约束（Memory→Wiki，不覆盖代码证据）。
- 验收：仅经用户确认才跨模块转换；模型猜测不会自动变权威事实。

## 3. 里程碑、依赖、验收节奏

```text
D0 → D1 → D2 ──┬→ D3（UI）        D4（最后）
               └→ W1 → W2 → W3 → W4
```

每个里程碑独立 PR 进 `main`；每步都跑 `vp run check:changed`（fmt/lint/knip/typecheck/相关测试）。
**真实验收**：D1/D2 用内存 SQLite 集成测试 + 真实 project 的多会话召回；W2 用真实小仓库生成一次 Wiki 并点击引用回到源码。不依赖 mock 宣称完成。

## 4. 交付物清单

1. contracts：`projectMemory.ts`、`wiki.ts` + index 导出。
2. persistence：2 个 migration + 2 个 Store。
3. service：`ProjectMemoryService`、`WikiService`。
4. MCP toolkits：`memory/*`、`wiki/*` + McpHttpServer 注册 + `agentContextBudget.json` 更新。
5. UI：web/desktop/mobile 页面 + i18n 全语言。
6. 测试：单元 + 集成 + 真实项目端到端记录。
7. 审计文档：D0 记忆去重结论。

## 5. 风险与边界

- **Token/成本**：W2 生成会消耗模型用量；必须预算上限 + 用户可取消；不自动大量刷新。
- **隐私**：源码/记忆可能含密钥；扫描与写入前过滤 + 告知 Provider/范围；过滤是降低风险非绝对保证。
- **注入安全**：Memory 内容是不可信上下文，不能覆盖系统策略/权限；必须有对抗性用例。
- **不建第二套引擎**：生成用 `delegate_task`，共享逻辑进 service，MCP 与 UI 都走 service，不写 handler 专属逻辑。
- **三 surface / 全语言**：每次 UI 改动按 t3code `AGENTS.md` 的 "hit every surface" 清单核对。

> 完成判断：Wiki 的事实能回到源码（snapshot + citation），Memory 的来源能回到用户/会话；两者都能关闭、撤销、审计，且不绕过权限与项目隔离。
