// @effect-diagnostics nodeBuiltinImport:off - SQL params are branded strings; plain SQL keeps the store small.
import { Team, TeamMember, TeamMessage, TeamTask, type TeamId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { PersistenceDecodeError, PersistenceSqlError } from "./Errors.ts";

type PersistenceError = PersistenceSqlError | PersistenceDecodeError;

const sqlError = (operation: string) => (cause: unknown) =>
  new PersistenceSqlError({ operation, cause });

interface TaskRow {
  readonly id: TeamTask["id"];
  readonly teamId: TeamId;
  readonly title: string;
  readonly body: string;
  readonly status: TeamTask["status"];
  readonly assignee: string | null;
  readonly blockedByJson: string;
  readonly result: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toTask(row: TaskRow): TeamTask {
  return {
    id: row.id,
    teamId: row.teamId,
    title: row.title,
    body: row.body,
    status: row.status,
    assignee: row.assignee,
    blockedBy: JSON.parse(row.blockedByJson || "[]") as unknown as TeamTask["blockedBy"],
    result: row.result,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface MessageRow {
  readonly id: TeamMessage["id"];
  readonly teamId: TeamId;
  readonly from: string;
  readonly to: string;
  readonly body: string;
  readonly dedupeKey: string;
  readonly isRead: number;
  readonly createdAt: string;
}

function toMessage(row: MessageRow): TeamMessage {
  return {
    id: row.id,
    teamId: row.teamId,
    from: row.from,
    to: row.to,
    body: row.body,
    dedupeKey: row.dedupeKey,
    read: row.isRead === 1,
    createdAt: row.createdAt,
  };
}

export class TeamStore extends Context.Service<
  TeamStore,
  {
    readonly putTeam: (team: Team) => Effect.Effect<void, PersistenceError>;
    readonly getTeam: (id: TeamId) => Effect.Effect<Team | null, PersistenceError>;
    readonly putMember: (member: TeamMember) => Effect.Effect<void, PersistenceError>;
    readonly putTask: (task: TeamTask) => Effect.Effect<void, PersistenceError>;
    readonly getTask: (
      teamId: TeamId,
      taskId: string,
    ) => Effect.Effect<TeamTask | null, PersistenceError>;
    readonly putMessage: (message: TeamMessage) => Effect.Effect<void, PersistenceError>;
    readonly markMessageRead: (id: string) => Effect.Effect<void, PersistenceError>;
    readonly snapshot: (id: TeamId) => Effect.Effect<
      {
        readonly team: Team | null;
        readonly members: ReadonlyArray<TeamMember>;
        readonly tasks: ReadonlyArray<TeamTask>;
        readonly unread: ReadonlyArray<TeamMessage>;
      },
      PersistenceError
    >;
  }
>()("t3/persistence/TeamStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const putTeam = Effect.fn("TeamStore.putTeam")((team: Team) =>
    sql`
      INSERT INTO sjcode_teams (id, project_id, name, goal, leader_thread_id, status, created_at, updated_at)
      VALUES (${team.id}, ${team.projectId}, ${team.name}, ${team.goal}, ${team.leaderThreadId}, ${team.status}, ${team.createdAt}, ${team.updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name, goal = excluded.goal, status = excluded.status, updated_at = excluded.updated_at
    `.pipe(Effect.asVoid, Effect.mapError(sqlError("putTeam"))),
  );

  const getTeam = Effect.fn("TeamStore.getTeam")((id: TeamId) =>
    sql<Team>`SELECT id, project_id AS projectId, name, goal, leader_thread_id AS leaderThreadId,
      status, created_at AS createdAt, updated_at AS updatedAt FROM sjcode_teams WHERE id = ${id}`.pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError(sqlError("getTeam")),
    ),
  );

  const putMember = Effect.fn("TeamStore.putMember")((member: TeamMember) =>
    sql`
      INSERT INTO sjcode_team_members (id, team_id, name, role, task_id, child_thread_id, status, isolation, created_at, updated_at)
      VALUES (${member.id}, ${member.teamId}, ${member.name}, ${member.role}, ${member.taskId}, ${member.childThreadId}, ${member.status}, ${member.isolation}, ${member.createdAt}, ${member.updatedAt})
      ON CONFLICT (team_id, task_id) DO UPDATE SET
        name = excluded.name, role = excluded.role, child_thread_id = excluded.child_thread_id,
        status = excluded.status, updated_at = excluded.updated_at
    `.pipe(Effect.asVoid, Effect.mapError(sqlError("putMember"))),
  );

  const putTask = Effect.fn("TeamStore.putTask")((task: TeamTask) =>
    sql`
      INSERT INTO sjcode_team_tasks (id, team_id, title, body, status, assignee, blocked_by_json, result, created_at, updated_at)
      VALUES (${task.id}, ${task.teamId}, ${task.title}, ${task.body}, ${task.status}, ${task.assignee}, ${JSON.stringify(task.blockedBy)}, ${task.result}, ${task.createdAt}, ${task.updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        title = excluded.title, body = excluded.body, status = excluded.status,
        assignee = excluded.assignee, blocked_by_json = excluded.blocked_by_json,
        result = excluded.result, updated_at = excluded.updated_at
    `.pipe(Effect.asVoid, Effect.mapError(sqlError("putTask"))),
  );

  const getTask = Effect.fn("TeamStore.getTask")((teamId: TeamId, taskId: string) =>
    sql<TaskRow>`SELECT id, team_id AS teamId, title, body, status, assignee,
      blocked_by_json AS blockedByJson, result, created_at AS createdAt, updated_at AS updatedAt
      FROM sjcode_team_tasks WHERE team_id = ${teamId} AND id = ${taskId}`.pipe(
      Effect.map((rows) => (rows[0] === undefined ? null : toTask(rows[0]))),
      Effect.mapError(sqlError("getTask")),
    ),
  );

  const putMessage = Effect.fn("TeamStore.putMessage")((message: TeamMessage) =>
    sql`
      INSERT OR IGNORE INTO sjcode_team_messages (id, team_id, sender, recipient, body, dedupe_key, is_read, created_at)
      VALUES (${message.id}, ${message.teamId}, ${message.from}, ${message.to}, ${message.body}, ${message.dedupeKey}, ${message.read ? 1 : 0}, ${message.createdAt})
    `.pipe(Effect.asVoid, Effect.mapError(sqlError("putMessage"))),
  );

  const markMessageRead = Effect.fn("TeamStore.markMessageRead")((id: string) =>
    sql`UPDATE sjcode_team_messages SET is_read = 1 WHERE id = ${id}`.pipe(
      Effect.asVoid,
      Effect.mapError(sqlError("markMessageRead")),
    ),
  );

  const snapshot = Effect.fn("TeamStore.snapshot")((id: TeamId) =>
    Effect.gen(function* () {
      const team = yield* getTeam(id);
      const memberRows = yield* sql<TeamMember>`
        SELECT id, team_id AS teamId, name, role, task_id AS taskId,
          child_thread_id AS childThreadId, status, isolation,
          created_at AS createdAt, updated_at AS updatedAt
        FROM sjcode_team_members WHERE team_id = ${id} ORDER BY created_at`;
      const taskRows = yield* sql<TaskRow>`
        SELECT id, team_id AS teamId, title, body, status, assignee,
          blocked_by_json AS blockedByJson, result,
          created_at AS createdAt, updated_at AS updatedAt
        FROM sjcode_team_tasks WHERE team_id = ${id} ORDER BY created_at`;
      const messageRows = yield* sql<MessageRow>`
        SELECT id, team_id AS teamId, sender AS "from", recipient AS "to", body,
          dedupe_key AS dedupeKey, is_read AS isRead, created_at AS createdAt
        FROM sjcode_team_messages WHERE team_id = ${id} AND is_read = 0 ORDER BY created_at`;
      return {
        team,
        members: memberRows,
        tasks: taskRows.map(toTask),
        unread: messageRows.map(toMessage),
      };
    }).pipe(Effect.mapError(sqlError("snapshot"))),
  );

  return TeamStore.of({
    putTeam,
    getTeam,
    putMember,
    putTask,
    getTask,
    putMessage,
    markMessageRead,
    snapshot,
  });
});

export const layer = Layer.effect(TeamStore, make);
