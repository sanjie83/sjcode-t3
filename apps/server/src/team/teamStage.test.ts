import { describe, expect, it } from "vite-plus/test";
import type { TeamTask } from "@t3tools/contracts";

import { canRetryTask, taskStage } from "./teamStage.ts";

const task = (status: TeamTask["status"]): TeamTask => ({
  id: "task-1" as TeamTask["id"],
  teamId: "team-1" as TeamTask["teamId"],
  title: "t",
  body: "",
  status,
  assignee: null,
  blockedBy: [],
  result: null,
  createdAt: "",
  updatedAt: "",
});

describe("taskStage (ported from dsh-superagent)", () => {
  it("classifies board status into dsh-style stages", () => {
    expect(taskStage(task("done"), true)).toEqual({ stage: "ended", outcome: "done" });
    expect(taskStage(task("review"), true)).toEqual({ stage: "person", action: "review" });
    expect(taskStage(task("blocked"), false)).toEqual({ stage: "person", action: "blocked" });
    expect(taskStage(task("todo"), false)).toEqual({ stage: "working", action: "queued" });
    expect(taskStage(task("in_progress"), true)).toEqual({ stage: "working" });
  });

  it("unblocks when blockers are done", () => {
    expect(taskStage(task("blocked"), true)).toEqual({ stage: "working" });
  });

  it("allows retry only for stalled states", () => {
    expect(canRetryTask(task("blocked"), false)).toBe(true);
    expect(canRetryTask(task("blocked"), true)).toBe(false);
    expect(canRetryTask(task("in_progress"), false)).toBe(false);
  });
});
