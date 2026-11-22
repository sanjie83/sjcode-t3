import {
  TeamCreateInput,
  TeamCreateResult,
  TeamInboxInput,
  TeamInboxResult,
  TeamMemberAddInput,
  TeamMemberAddResult,
  TeamSendInput,
  TeamSendResult,
  TeamStatusInput,
  TeamStatusResult,
  TeamTaskCreateInput,
  TeamTaskCreateResult,
  TeamTaskListInput,
  TeamTaskListResult,
  TeamTaskUpdateInput,
  TeamTaskUpdateResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as TeamService from "../../../team/TeamService.ts";

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    TeamService.TeamService,
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
};

const TeamCreateTool = Tool.make("team_create", {
  ...shared,
  description:
    "Create a durable team for this project. You are the leader. Call delegate_task first to start members, then bind each with team_member_add. Returns a snapshot.",
  parameters: TeamCreateInput,
  success: TeamCreateResult,
}).annotate(Tool.Destructive, true);

const TeamMemberAddTool = Tool.make("team_member_add", {
  ...shared,
  description:
    "Bind a real delegate_task child to this team as a member. taskId and childThreadId MUST come from a successful delegate_task; the server never invents them. `isolation:'worktree'` records a separate checkout.",
  parameters: TeamMemberAddInput,
  success: TeamMemberAddResult,
}).annotate(Tool.Destructive, true);

const TeamTaskCreateTool = Tool.make("team_task_create", {
  ...shared,
  description:
    "Add a task to the team board. A task with blockedBy is 'blocked' until every listed task is done. `assignee` is a member name or null.",
  parameters: TeamTaskCreateInput,
  success: TeamTaskCreateResult,
}).annotate(Tool.Destructive, true);

const TeamTaskUpdateTool = Tool.make("team_task_update", {
  ...shared,
  description:
    "Update a task's status, assignee, or result. Only its assignee or the leader may change it. Terminal (done/cancelled) is sticky. A blocked task cannot leave 'blocked' until its blockers are done.",
  parameters: TeamTaskUpdateInput,
  success: TeamTaskUpdateResult,
}).annotate(Tool.Destructive, true);

const TeamTaskListTool = Tool.make("team_task_list", {
  ...shared,
  description: "List the team's task board.",
  parameters: TeamTaskListInput,
  success: TeamTaskListResult,
}).annotate(Tool.Readonly, true);

const TeamSendTool = Tool.make("team_send", {
  ...shared,
  description:
    "Post a mailbox message to a member or the leader. Pass a stable `dedupeKey`; a retry with the same key creates no duplicate.",
  parameters: TeamSendInput,
  success: TeamSendResult,
}).annotate(Tool.Destructive, true);

const TeamInboxTool = Tool.make("team_inbox", {
  ...shared,
  description: "Read your unread mailbox messages. By default marks them read.",
  parameters: TeamInboxInput,
  success: TeamInboxResult,
}).annotate(Tool.Readonly, true);

const TeamStatusTool = Tool.make("team_status", {
  ...shared,
  description: "Read the full team snapshot: record, members, task board, unread messages.",
  parameters: TeamStatusInput,
  success: TeamStatusResult,
}).annotate(Tool.Readonly, true);

export const TeamToolkit = Toolkit.make(
  TeamCreateTool,
  TeamMemberAddTool,
  TeamTaskCreateTool,
  TeamTaskUpdateTool,
  TeamTaskListTool,
  TeamSendTool,
  TeamInboxTool,
  TeamStatusTool,
);
