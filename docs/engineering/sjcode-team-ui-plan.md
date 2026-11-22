# SJCode Team 可视化面板 + mirasim UI 融合（第一阶段）

- 日期：2026-11-22
- 状态：第一阶段已实现并通过 typecheck/build/lint/knip/单测
- 基座：t3code pin `0775dc4` + fork

## 已实现

### Team 数据通道（HTTP，独立于核心 RPC）

- `packages/contracts/src/environmentHttp.ts`：`EnvironmentTeamsHttpApi` group，GET `/api/teams`（orchestration:read scope）
- `apps/server/src/team/http.ts`：handler，调用 `TeamService.list()` 返回 `TeamSnapshot[]`
- `apps/server/src/team/TeamService.ts`：`list()`（遍历所有 team 取 snapshot）；`TeamStore.listTeamIds()`
- 为什么用 HTTP 而非 WebSocket RPC：t3code 的 `WsRpcGroup` 接近 200 方法时触发 TypeScript 实例化上限（实测：新增一个 RPC 让 CLI command 的 requirements 退化成 `any`，级联 100+ 错误）。HTTP HttpApi group 是隔离扩展点，无此限制。

### Web 面板

- `apps/web/src/state/teams.ts`：`useTeams()` hook，同源 fetch + 定时轮询（只读，orchestration:read）
- `apps/web/src/components/team/TeamsPage.tsx`：团队卡片列表（成员数/活跃任务/完成任务、任务状态徽标、未读消息数）
- `apps/web/src/routes/_chat.teams.tsx`：`/_chat/teams` 路由（TanStack file-based，routeTree 自动重新生成）
- `apps/web/src/components/sidebar/SidebarChrome.tsx`：侧栏 Teams 入口 + 活跃团队数徽标
- `apps/web/src/components/sidebar/mainAppLocation.ts`：/teams 纳入 utility 页返回逻辑
- i18n：所有新文案走 `<T>`，已 `gt generate` 合并到全语言目录

### 验证

- `vp run typecheck`：43/43
- `vp build`（apps/web）：成功，18.46s
- `vp lint`（改动文件）：干净
- `vp run knip:check`：3/3
- 单元测试：5 文件 23 用例通过（TeamService/Migrations/AgentContextBudget/teamCore/teamStage）

## mirasim UI 融合进度（对照原 B 批 IA 方案）

| 项                     | 原计划                         | 本基座状态                                                   |
| ---------------------- | ------------------------------ | ------------------------------------------------------------ |
| B2 导航行 + 运行徽标   | 侧栏入口 + 运行中徽标          | ✅ Teams 入口 + 活跃团队数徽标（同源数据结构）               |
| B6 工作区 Git 变更徽标 | Explorer Changes tab 徽标      | t3code 已有 Source Control 面板（形态不同，未改）            |
| B4 输入框下 metaRow    | assistant/模型/推理/文件夹一行 | t3code composer 已有模型/推理/文件夹选择（形态不同，未改）   |
| B1 新手引导            | 三步引导                       | t3code Welcome 页已覆盖 agent 检测（形态不同，未改）         |
| C5 Memory 类型徽标     | 四类型徽标                     | 依赖计划 04 Memory（未实现，见 sjcode-04-from-zero-plan.md） |

说明：原 IA 方案针对旧 AionUi 的 Arco/Sider/SendBox renderer，在 t3code（React + TanStack Router + shadcn/ui）上不适用。本阶段按 t3code 原生模式重做了等价的 B2（导航 + 徽标）；B6/B4/B1 因 t3code 已有功能等价物而不再重复造轮子。

## 已知限制 / 下一步

- Team 面板是只读的（创建/加成员/派任务仍通过会话里的 `team_*` MCP 工具）。下一步可做交互写操作（需加 HTTP POST 端点 + 权限）。
- 多环境：当前面板读同源环境（当前 server）的 team 数据；若需跨环境聚合，要扩展 `useEnvironmentHttpBaseUrl` 逐环境拉取。
- Windows 上 `vp run i18n:check` 因 `node_modules/.bin/gt` 的 shim 被 node 直接执行而报语法错误（既有环境问题，非本次改动）；各 app 的 `i18n:generate` 本身成功。
- 浏览器单测在 Windows 环境有 "no tests"/BrowserWorker 问题（既有，非本次改动）；本阶段以 typecheck + build + 非浏览器单测为门禁。
