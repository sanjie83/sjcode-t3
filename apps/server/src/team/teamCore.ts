// Pure, deterministic core of the SJCode Team domain. No Effect, no I/O, so the
// state machine and dedup rules can be tested without a database. All ids are
// supplied by the caller (normally the MCP handler), keeping callers authoritative.

import type {
  Team,
  TeamId,
  TeamMember,
  TeamMessage,
  TeamTask,
  TeamTaskStatus,
} from "@t3tools/contracts";

export interface TeamClock {
  readonly now: () => string;
  readonly newId: (prefix: string) => string;
}

export type CoreFailure =
  | { readonly code: "not_found"; readonly message: string }
  | { readonly code: "conflict"; readonly message: string }
  | { readonly code: "invalid_request"; readonly message: string };

export const makeTeam = (
  input: {
    teamId: TeamId;
    projectId: string;
    name: string;
    goal: string;
    leaderThreadId: string;
    mandate: Team["mandate"];
  },
  clock: TeamClock,
): Team => ({
  id: input.teamId,
  projectId: input.projectId as Team["projectId"],
  name: input.name,
  goal: input.goal,
  leaderThreadId: input.leaderThreadId as Team["leaderThreadId"],
  status: "forming",
  mandate: input.mandate,
  createdAt: clock.now(),
  updatedAt: clock.now(),
});

export const makeMember = (
  input: Omit<TeamMember, "id" | "status" | "createdAt" | "updatedAt">,
  clock: TeamClock,
): TeamMember => ({
  ...input,
  id: clock.newId("mem"),
  status: "idle",
  createdAt: clock.now(),
  updatedAt: clock.now(),
});

export const makeTask = (
  input: {
    teamId: TeamId;
    title: string;
    body: string;
    assignee: string | null;
    blockedBy: Array<string>;
  },
  clock: TeamClock,
): TeamTask => ({
  id: clock.newId("task") as TeamTask["id"],
  teamId: input.teamId,
  title: input.title,
  body: input.body,
  status: input.blockedBy.length > 0 ? "blocked" : "todo",
  assignee: input.assignee,
  blockedBy: input.blockedBy as unknown as TeamTask["blockedBy"],
  result: null,
  createdAt: clock.now(),
  updatedAt: clock.now(),
});

export interface TaskUpdate {
  readonly status?: TeamTaskStatus;
  readonly assignee?: string | null;
  readonly result?: string | null;
}

/**
 * Apply a task update. `blocked -> todo|in_progress` is allowed only when every
 * blocker is done; callers pass the current statuses of blockers so this stays
 * pure. Terminal statuses are sticky against reopening by a stale writer.
 */
export const updateTask = (
  task: TeamTask,
  update: TaskUpdate,
  blockerStatuses: ReadonlyArray<TeamTaskStatus>,
): TeamTask => {
  let status = task.status;
  if (update.status !== undefined) {
    const blockersDone = blockerStatuses.every((value) => value === "done");
    const terminal = task.status === "done" || task.status === "cancelled";
    if (terminal) {
      // A terminal status is sticky against a stale writer trying to reopen.
      status = task.status;
    } else if (task.status === "blocked" && !blockersDone && update.status !== "blocked") {
      status = "blocked";
    } else {
      status = update.status;
    }
  }
  return {
    ...task,
    status,
    ...(update.assignee !== undefined ? { assignee: update.assignee } : {}),
    ...(update.result !== undefined ? { result: update.result } : {}),
    updatedAt: "",
  };
};

export const makeMessage = (
  input: { teamId: TeamId; from: string; to: string; body: string; dedupeKey: string },
  clock: TeamClock,
): TeamMessage => ({
  id: clock.newId("msg") as TeamMessage["id"],
  teamId: input.teamId,
  from: input.from,
  to: input.to,
  body: input.body,
  dedupeKey: input.dedupeKey,
  read: false,
  createdAt: clock.now(),
});

/** A member may only act on a task assigned to it; the leader may act on any. */
export const canMutateTask = (memberName: string, leaderName: string, task: TeamTask): boolean =>
  memberName === leaderName || task.assignee === memberName;
