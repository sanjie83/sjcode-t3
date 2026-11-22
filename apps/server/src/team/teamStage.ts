// MIT: ported from deepseek-ai/dsh-superagent-prototype src/core/stage.ts, adapted to TeamTask.
// Derives stage from the board; execution lives in t3code child threads, so Team owns its lifecycle.
// See docs/engineering/code-portability-feasibility.md.
import type { TeamTask } from "@t3tools/contracts";

export type TaskStage =
  | { readonly stage: "ended"; readonly outcome: "done" | "cancelled" }
  | { readonly stage: "person"; readonly action: "review" | "blocked" }
  | { readonly stage: "working"; readonly action?: "queued" };

/**
 * Classify a board task. First matching row wins (mirrors dsh `ticketStage`).
 * `blockersDone` is supplied by the caller from the board, keeping this pure.
 */
export const taskStage = (task: TeamTask, blockersDone: boolean): TaskStage => {
  if (task.status === "done" || task.status === "cancelled") {
    return { stage: "ended", outcome: task.status };
  }
  if (task.status === "review") return { stage: "person", action: "review" };
  if (task.status === "blocked" && !blockersDone) {
    return { stage: "person", action: "blocked" };
  }
  if (task.status === "todo") return { stage: "working", action: "queued" };
  return { stage: "working" };
};

/** A stalled task waits for a person when blocked with unresolved blockers or failed. */
export const canRetryTask = (task: TeamTask, blockersDone: boolean): boolean =>
  (task.status === "blocked" && !blockersDone) || task.status === "cancelled";
