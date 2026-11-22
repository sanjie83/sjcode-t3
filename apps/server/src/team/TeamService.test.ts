import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { assert, it } from "@effect/vitest";
import { type TeamId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Migrations from "../persistence/Migrations.ts";
import * as TeamService from "./TeamService.ts";

const teamId = "team-test-1" as TeamId;

const layer = Layer.mergeAll(
  TeamService.layer,
  Layer.effectDiscard(Migrations.runMigrations()),
).pipe(Layer.provide(NodeSqliteClient.layer({ filename: ":memory:" })));

it.layer(layer)("TeamService (integration)", (it) => {
  it.effect("create -> member -> task board -> mailbox -> status", () =>
    Effect.gen(function* () {
      const service = yield* TeamService.TeamService;

      const team = yield* service.create({
        teamId,
        projectId: "proj-1" as never,
        name: "build-feature",
        goal: "ship it",
        leaderThreadId: "thread-leader" as never,
      });
      assert.strictEqual(team.status, "forming");

      yield* service.addMember({
        teamId,
        name: "worker-1",
        taskId: "node-1" as never,
        childThreadId: "thread-worker-1" as never,
        isolation: "worktree",
      });

      const blocked = yield* service.createTask({
        teamId,
        title: "needs review",
        body: "",
        assignee: "worker-1",
        blockedBy: ["task-prereq" as never],
      });
      assert.strictEqual(blocked.status, "blocked");

      // A blocked task cannot leave blocked while its blocker is not done.
      const stillBlocked = yield* service.updateTask({
        teamId,
        taskId: blocked.id,
        status: "done",
        actor: "worker-1",
      });
      assert.strictEqual(stillBlocked.status, "blocked");

      const msg = yield* service.send({
        teamId,
        from: "build-feature",
        to: "worker-1",
        body: "start",
        dedupeKey: "k1",
      });
      const inbox = yield* service.inbox({ teamId, for: "worker-1", markRead: true });
      assert.strictEqual(inbox.length, 1);
      assert.strictEqual(inbox[0]?.id, msg.id);

      // Dedupe: same key creates no second message.
      yield* service.send({
        teamId,
        from: "build-feature",
        to: "worker-1",
        body: "start",
        dedupeKey: "k1",
      });
      const readAgain = yield* service.inbox({ teamId, for: "worker-1", markRead: false });
      assert.strictEqual(readAgain.length, 0);

      const snapshot = yield* service.status(teamId);
      assert.strictEqual(snapshot.members.length, 1);
      assert.strictEqual(snapshot.tasks.length, 1);
    }),
  );
});
