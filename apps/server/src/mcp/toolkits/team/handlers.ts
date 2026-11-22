// @effect-diagnostics nodeBuiltinImport:off - UUIDs for durable team ids.
import * as NodeCrypto from "node:crypto";

import { type TeamId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpToolAccess from "../../McpToolAccess.ts";
import { readCaller, unavailable } from "../../threadAccess.ts";
import * as TeamService from "../../../team/TeamService.ts";
import { TeamToolkit } from "./tools.ts";

const callerContext = Effect.gen(function* () {
  const caller = yield* readCaller();
  const threadId = caller.scope.thread?.threadId;
  if (caller.caller === undefined || threadId === undefined) {
    return yield* unavailable();
  }
  return { projectId: caller.caller.projectId, leaderThreadId: threadId };
});

export const layer = McpToolAccess.toLayer(TeamToolkit, {
  team_create: McpToolAccess.writes(({ name, goal }) =>
    Effect.gen(function* () {
      const ctx = yield* callerContext;
      const service = yield* TeamService.TeamService;
      const teamId = `team-${NodeCrypto.randomUUID()}` as TeamId;
      const team = yield* service.create({
        teamId,
        projectId: ctx.projectId,
        name,
        goal,
        leaderThreadId: ctx.leaderThreadId,
      });
      const snapshot = yield* service.status(teamId);
      return { teamId, snapshot: { ...snapshot, team } };
    }),
  ),

  team_member_add: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      yield* service.addMember({
        teamId: input.teamId,
        name: input.name,
        role: input.role ?? "member",
        taskId: input.taskId,
        childThreadId: input.childThreadId,
        isolation: input.isolation ?? "shared",
      });
      return { snapshot: yield* service.status(input.teamId) };
    }),
  ),

  team_task_create: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      const task = yield* service.createTask({
        teamId: input.teamId,
        title: input.title,
        body: input.body ?? "",
        assignee: input.assignee ?? null,
        blockedBy: [...(input.blockedBy ?? [])],
      });
      return { task };
    }),
  ),

  team_task_update: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      const team = yield* service.status(input.teamId);
      const task = yield* service.updateTask({
        teamId: input.teamId,
        taskId: input.taskId,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.result !== undefined ? { result: input.result } : {}),
        actor: team.team.name,
      });
      return { task };
    }),
  ),

  team_task_list: McpToolAccess.reads(({ teamId }) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      return { tasks: yield* service.listTasks(teamId) };
    }),
  ),

  team_send: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      const team = yield* service.status(input.teamId);
      const message = yield* service.send({
        teamId: input.teamId,
        from: team.team.name,
        to: input.to,
        body: input.body,
        dedupeKey: input.dedupeKey,
      });
      return { message };
    }),
  ),

  team_inbox: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      return {
        messages: yield* service.inbox({
          teamId: input.teamId,
          for: input.for,
          markRead: input.markRead ?? true,
        }),
      };
    }),
  ),

  team_status: McpToolAccess.reads(({ teamId }) =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;
      return yield* service.status(teamId);
    }),
  ),
});
