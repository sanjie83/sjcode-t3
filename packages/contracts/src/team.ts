import * as Schema from "effect/Schema";

import { NodeId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

// SJCode Team domain: a durable leader + members group that runs on top of
// t3code's verified delegate_task child-thread primitive. Team itself owns no
// scheduler loop — it binds real child threads and keeps a task board + mailbox.

export const TeamId = TrimmedNonEmptyString.pipe(Schema.brand("TeamId"));
export type TeamId = typeof TeamId.Type;
export const TeamTaskId = TrimmedNonEmptyString.pipe(Schema.brand("TeamTaskId"));
export type TeamTaskId = typeof TeamTaskId.Type;
export const TeamMessageId = TrimmedNonEmptyString.pipe(Schema.brand("TeamMessageId"));
export type TeamMessageId = typeof TeamMessageId.Type;

export const TeamStatus = Schema.Literals(["forming", "ready", "stopping", "stopped", "failed"]);
export type TeamStatus = typeof TeamStatus.Type;

export const TeamMemberStatus = Schema.Literals(["idle", "working", "review", "error", "removed"]);
export type TeamMemberStatus = typeof TeamMemberStatus.Type;

export const TeamTaskStatus = Schema.Literals([
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
  "cancelled",
]);
export type TeamTaskStatus = typeof TeamTaskStatus.Type;

/** A task-board entry. `blockedBy` holds TeamTaskId strings not yet done. */
export const TeamTask = Schema.Struct({
  id: TeamTaskId,
  teamId: TeamId,
  title: TrimmedNonEmptyString,
  body: Schema.String,
  status: TeamTaskStatus,
  assignee: Schema.NullOr(TrimmedNonEmptyString),
  blockedBy: Schema.Array(TeamTaskId),
  result: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type TeamTask = typeof TeamTask.Type;

/**
 * A member is a real delegate_task child: `taskId`/`childThreadId` come from a
 * successful delegate_task and are never fabricated by the model.
 */
export const TeamMember = Schema.Struct({
  id: TrimmedNonEmptyString,
  teamId: TeamId,
  name: TrimmedNonEmptyString,
  role: Schema.String,
  taskId: NodeId,
  childThreadId: Schema.NullOr(ThreadId),
  status: TeamMemberStatus,
  isolation: Schema.Literals(["shared", "worktree"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type TeamMember = typeof TeamMember.Type;

/** Mailbox message. `dedupeKey` makes delivery idempotent across retries. */
export const TeamMessage = Schema.Struct({
  id: TeamMessageId,
  teamId: TeamId,
  from: TrimmedNonEmptyString,
  to: TrimmedNonEmptyString,
  body: Schema.String,
  dedupeKey: Schema.String,
  read: Schema.Boolean,
  createdAt: Schema.String,
});
export type TeamMessage = typeof TeamMessage.Type;

/**
 * Immutable authorization of a team, ported from dsh-superagent's Mandate
 * (MIT): why this team may do work and how far it may go. `basis` records how
 * the leader was admitted; `policyVersion` lets a later reviewer re-validate.
 */
export const TeamMandate = Schema.Struct({
  strength: Schema.Literals(["explicit", "inferred"]),
  policyVersion: TrimmedNonEmptyString,
  scope: TrimmedNonEmptyString,
  basis: Schema.Literals(["addressed", "followup", "admission", "listed", "leader"]),
  grantedBy: TrimmedNonEmptyString,
  grantedAt: Schema.String,
});
export type TeamMandate = typeof TeamMandate.Type;

export const Team = Schema.Struct({
  id: TeamId,
  projectId: ProjectId,
  name: TrimmedNonEmptyString,
  goal: Schema.String,
  leaderThreadId: ThreadId,
  status: TeamStatus,
  mandate: TeamMandate,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Team = typeof Team.Type;

export const TeamSnapshot = Schema.Struct({
  team: Team,
  members: Schema.Array(TeamMember),
  tasks: Schema.Array(TeamTask),
  unread: Schema.Array(TeamMessage),
});
export type TeamSnapshot = typeof TeamSnapshot.Type;

export const TeamToolFailure = Schema.Struct({
  code: Schema.Literals(["invalid_request", "not_found", "conflict", "unavailable"]),
  message: Schema.String,
});
export type TeamToolFailure = typeof TeamToolFailure.Type;

/** Read-only list of all teams in the environment, for the UI panel. */
export const TeamListInput = Schema.Struct({});
export const TeamListResult = Schema.Struct({ teams: Schema.Array(TeamSnapshot) });
export type TeamListResult = typeof TeamListResult.Type;

export const TeamCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  goal: Schema.String,
});
export const TeamCreateResult = Schema.Struct({ teamId: TeamId, snapshot: TeamSnapshot });

export const TeamMemberAddInput = Schema.Struct({
  teamId: TeamId,
  name: TrimmedNonEmptyString,
  role: Schema.optionalKey(Schema.String),
  // Bound to a real delegate_task result; the leader must call delegate_task first.
  taskId: NodeId,
  childThreadId: Schema.NullOr(ThreadId),
  isolation: Schema.optionalKey(Schema.Literals(["shared", "worktree"])),
});
export const TeamMemberAddResult = Schema.Struct({ snapshot: TeamSnapshot });

export const TeamTaskCreateInput = Schema.Struct({
  teamId: TeamId,
  title: TrimmedNonEmptyString,
  body: Schema.optionalKey(Schema.String),
  assignee: Schema.optionalKey(Schema.NullOr(TrimmedNonEmptyString)),
  blockedBy: Schema.optionalKey(Schema.Array(TeamTaskId)),
});
export const TeamTaskCreateResult = Schema.Struct({ task: TeamTask });

export const TeamTaskUpdateInput = Schema.Struct({
  teamId: TeamId,
  taskId: TeamTaskId,
  status: Schema.optional(TeamTaskStatus),
  assignee: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  result: Schema.optional(Schema.NullOr(Schema.String)),
});
export const TeamTaskUpdateResult = Schema.Struct({ task: TeamTask });

export const TeamTaskListInput = Schema.Struct({ teamId: TeamId });
export const TeamTaskListResult = Schema.Struct({ tasks: Schema.Array(TeamTask) });

export const TeamSendInput = Schema.Struct({
  teamId: TeamId,
  to: TrimmedNonEmptyString,
  body: Schema.String,
  dedupeKey: TrimmedNonEmptyString,
});
export const TeamSendResult = Schema.Struct({ message: TeamMessage });

export const TeamInboxInput = Schema.Struct({
  teamId: TeamId,
  for: TrimmedNonEmptyString,
  markRead: Schema.optionalKey(Schema.Boolean),
});
export const TeamInboxResult = Schema.Struct({ messages: Schema.Array(TeamMessage) });

export const TeamStatusInput = Schema.Struct({ teamId: TeamId });
export const TeamStatusResult = TeamSnapshot;
