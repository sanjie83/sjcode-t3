import { describe, expect, it } from "vite-plus/test";

import { canMutateTask, makeMessage, makeTask, updateTask, type TeamClock } from "./teamCore.ts";

const clock: TeamClock = {
  now: () => "2026-11-22T00:00:00.000Z",
  newId: (prefix) => `${prefix}-1`,
};

describe("makeTask", () => {
  it("starts blocked when it has blockers, otherwise todo", () => {
    const base = { teamId: "team-1" as never, title: "t", body: "", assignee: null };
    expect(makeTask({ ...base, blockedBy: ["task-a"] }, clock).status).toBe("blocked");
    expect(makeTask({ ...base, blockedBy: [] }, clock).status).toBe("todo");
  });
});

describe("updateTask", () => {
  const blocked = {
    ...makeTask(
      { teamId: "team-1" as never, title: "t", body: "", assignee: null, blockedBy: ["task-a"] },
      clock,
    ),
  };

  it("refuses to unblock until every blocker is done", () => {
    expect(updateTask(blocked, { status: "in_progress" }, ["todo"]).status).toBe("blocked");
    expect(updateTask(blocked, { status: "in_progress" }, ["done"]).status).toBe("in_progress");
  });

  it("keeps terminal statuses sticky against stale reopen", () => {
    const done = { ...blocked, status: "done" as const };
    expect(updateTask(done, { status: "todo" }, ["done"]).status).toBe("done");
  });

  it("applies assignee and result", () => {
    const next = updateTask(blocked, { status: "in_progress" }, ["done"]);
    const withResult = updateTask(next, { result: "ok" }, ["done"]);
    expect(withResult.result).toBe("ok");
  });
});

describe("makeMessage", () => {
  it("is unread and keeps the dedupe key", () => {
    const msg = makeMessage(
      { teamId: "team-1" as never, from: "leader", to: "worker", body: "hi", dedupeKey: "k1" },
      clock,
    );
    expect(msg.read).toBe(false);
    expect(msg.dedupeKey).toBe("k1");
  });
});

describe("canMutateTask", () => {
  const task = {
    ...makeTask(
      { teamId: "t" as never, title: "x", body: "", assignee: "worker", blockedBy: [] },
      clock,
    ),
  };
  it("allows the assignee and the leader, denies others", () => {
    expect(canMutateTask("worker", "leader", task)).toBe(true);
    expect(canMutateTask("leader", "leader", task)).toBe(true);
    expect(canMutateTask("stranger", "leader", task)).toBe(false);
  });
});
