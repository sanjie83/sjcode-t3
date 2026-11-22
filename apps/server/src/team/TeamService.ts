// @effect-diagnostics nodeBuiltinImport:off globalDate:off - UUID + ISO timestamps for durable ids.
import * as NodeCrypto from "node:crypto";

import {
  OrchestratorMcpFailure,
  type Team,
  type TeamId,
  type TeamMember,
  type TeamMessage,
  type TeamSnapshot,
  type TeamTask,
  type TeamTaskStatus,
  type NodeId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as TeamStore from "../persistence/TeamStore.ts";
import type { PersistenceDecodeError, PersistenceSqlError } from "../persistence/Errors.ts";
import {
  canMutateTask,
  makeMember,
  makeMessage,
  makeTask,
  makeTeam,
  updateTask,
  type TeamClock,
} from "./teamCore.ts";

type PersistenceError = PersistenceSqlError | PersistenceDecodeError;
type TeamError = OrchestratorMcpFailure;

const asTeamFailure = (error: OrchestratorMcpFailure | PersistenceError): OrchestratorMcpFailure =>
  error._tag === "OrchestratorMcpFailure"
    ? error
    : new OrchestratorMcpFailure({ code: "orchestration_error", message: "Team storage error." });

const withStoreErrors = <A, E extends PersistenceError>(
  effect: Effect.Effect<A, OrchestratorMcpFailure | E>,
): Effect.Effect<A, TeamError> => effect.pipe(Effect.mapError(asTeamFailure));

const wallClock: TeamClock = {
  now: () => new Date().toISOString(),
  newId: (prefix) => `${prefix}-${NodeCrypto.randomUUID()}`,
};

export class TeamService extends Context.Service<
  TeamService,
  {
    readonly create: (input: {
      teamId: TeamId;
      projectId: string;
      name: string;
      goal: string;
      leaderThreadId: string;
    }) => Effect.Effect<Team, TeamError>;
    readonly addMember: (input: {
      teamId: TeamId;
      name: string;
      role?: string;
      taskId: NodeId;
      childThreadId: ThreadId | null;
      isolation: "shared" | "worktree";
    }) => Effect.Effect<TeamMember, TeamError>;
    readonly createTask: (input: {
      teamId: TeamId;
      title: string;
      body: string;
      assignee: string | null;
      blockedBy: Array<string>;
    }) => Effect.Effect<TeamTask, TeamError>;
    readonly updateTask: (input: {
      teamId: TeamId;
      taskId: string;
      status?: TeamTaskStatus;
      assignee?: string | null;
      result?: string | null;
      actor: string;
    }) => Effect.Effect<TeamTask, TeamError>;
    readonly listTasks: (teamId: TeamId) => Effect.Effect<ReadonlyArray<TeamTask>, TeamError>;
    readonly send: (input: {
      teamId: TeamId;
      from: string;
      to: string;
      body: string;
      dedupeKey: string;
    }) => Effect.Effect<TeamMessage, TeamError>;
    readonly inbox: (input: {
      teamId: TeamId;
      for: string;
      markRead: boolean;
    }) => Effect.Effect<ReadonlyArray<TeamMessage>, TeamError>;
    readonly status: (teamId: TeamId) => Effect.Effect<TeamSnapshot, TeamError>;
  }
>()("t3/team/TeamService") {}

const fail = (code: "not_found" | "conflict" | "forbidden" | "invalid_request", message: string) =>
  Effect.fail(
    new OrchestratorMcpFailure({
      code:
        code === "not_found"
          ? "task_not_found"
          : code === "forbidden"
            ? "capability_denied"
            : "invalid_request",
      message,
    }),
  );

const make = Effect.gen(function* () {
  const store = yield* TeamStore.TeamStore;

  const create = Effect.fn("TeamService.create")(
    (input: {
      teamId: TeamId;
      projectId: string;
      name: string;
      goal: string;
      leaderThreadId: string;
    }) =>
      Effect.gen(function* () {
        const existing = yield* store.getTeam(input.teamId);
        if (existing !== null) return yield* fail("conflict", "Team id already exists.");
        const team = makeTeam(
          {
            ...input,
            mandate: {
              strength: "explicit",
              policyVersion: "v1",
              scope: input.projectId,
              basis: "leader",
              grantedBy: input.leaderThreadId,
              grantedAt: wallClock.now(),
            },
          },
          wallClock,
        );
        yield* store.putTeam(team);
        return team;
      }),
    withStoreErrors,
  );

  const addMember = Effect.fn("TeamService.addMember")(
    (input: {
      teamId: TeamId;
      name: string;
      role?: string;
      taskId: NodeId;
      childThreadId: ThreadId | null;
      isolation: "shared" | "worktree";
    }) =>
      Effect.gen(function* () {
        const team = yield* store.getTeam(input.teamId);
        if (team === null) return yield* fail("not_found", "Team not found.");
        const member = makeMember(
          {
            teamId: input.teamId,
            name: input.name,
            role: input.role ?? "member",
            taskId: input.taskId,
            childThreadId: input.childThreadId,
            isolation: input.isolation,
          },
          wallClock,
        );
        yield* store.putMember(member);
        return member;
      }),
    withStoreErrors,
  );

  const createTask = Effect.fn("TeamService.createTask")(
    (input: {
      teamId: TeamId;
      title: string;
      body: string;
      assignee: string | null;
      blockedBy: Array<string>;
    }) =>
      Effect.gen(function* () {
        const team = yield* store.getTeam(input.teamId);
        if (team === null) return yield* fail("not_found", "Team not found.");
        const task = makeTask(input, wallClock);
        yield* store.putTask(task);
        return task;
      }),
    withStoreErrors,
  );

  const updateTaskFn = Effect.fn("TeamService.updateTask")(
    (input: {
      teamId: TeamId;
      taskId: string;
      status?: TeamTaskStatus;
      assignee?: string | null;
      result?: string | null;
      actor: string;
    }) =>
      Effect.gen(function* () {
        const team = yield* store.getTeam(input.teamId);
        if (team === null) return yield* fail("not_found", "Team not found.");
        const task = yield* store.getTask(input.teamId, input.taskId);
        if (task === null) return yield* fail("not_found", "Task not found.");
        if (!canMutateTask(input.actor, team.name, task)) {
          return yield* fail("forbidden", "Not your task.");
        }
        const snapshot = yield* store.snapshot(input.teamId);
        // A blocker not present on the board counts as unresolved (never auto-unblock).
        const blockerStatuses = task.blockedBy.map((id) => {
          const match = snapshot.tasks.find((candidate) => candidate.id === id);
          return match === undefined ? ("blocked" as const) : match.status;
        });
        const updated = updateTask(task, input, blockerStatuses);
        yield* store.putTask(updated);
        return updated;
      }),
    withStoreErrors,
  );

  const listTasks = Effect.fn("TeamService.listTasks")(
    (teamId: TeamId) => Effect.map(store.snapshot(teamId), (snapshot) => snapshot.tasks),
    withStoreErrors,
  );

  const send = Effect.fn("TeamService.send")(
    (input: { teamId: TeamId; from: string; to: string; body: string; dedupeKey: string }) =>
      Effect.gen(function* () {
        const team = yield* store.getTeam(input.teamId);
        if (team === null) return yield* fail("not_found", "Team not found.");
        const message = makeMessage(input, wallClock);
        yield* store.putMessage(message);
        return message;
      }),
    withStoreErrors,
  );

  const inbox = Effect.fn("TeamService.inbox")(
    (input: { teamId: TeamId; for: string; markRead: boolean }) =>
      Effect.gen(function* () {
        const team = yield* store.getTeam(input.teamId);
        if (team === null) return yield* fail("not_found", "Team not found.");
        const snapshot = yield* store.snapshot(input.teamId);
        const messages = snapshot.unread.filter((message) => message.to === input.for);
        if (input.markRead) {
          yield* Effect.forEach(messages, (message) => store.markMessageRead(message.id), {
            discard: true,
          });
        }
        return messages;
      }),
    withStoreErrors,
  );

  const status = Effect.fn("TeamService.status")(
    (teamId: TeamId) =>
      Effect.gen(function* () {
        const snapshot = yield* store.snapshot(teamId);
        if (snapshot.team === null) return yield* fail("not_found", "Team not found.");
        return {
          team: snapshot.team,
          members: snapshot.members,
          tasks: snapshot.tasks,
          unread: snapshot.unread,
        };
      }),
    withStoreErrors,
  );

  return TeamService.of({
    create,
    addMember,
    createTask,
    updateTask: updateTaskFn,
    listTasks,
    send,
    inbox,
    status,
  });
});

export const layer = Layer.effect(TeamService, make).pipe(Layer.provide(TeamStore.layer));
