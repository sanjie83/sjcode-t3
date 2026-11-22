import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// SJCode Team domain. A team binds real delegate_task child threads (taskId +
// childThreadId) and owns a task board and mailbox. Team stores only identifiers
// it can prove came from a successful delegate_task; it never invents a thread.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sjcode_teams (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      leader_thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_sjcode_teams_project ON sjcode_teams (project_id)`;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sjcode_team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      task_id TEXT NOT NULL,
      child_thread_id TEXT,
      status TEXT NOT NULL,
      isolation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (team_id, task_id)
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_sjcode_team_members_team ON sjcode_team_members (team_id)`;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sjcode_team_tasks (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      assignee TEXT,
      blocked_by_json TEXT NOT NULL DEFAULT '[]',
      result TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_sjcode_team_tasks_team ON sjcode_team_tasks (team_id)`;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sjcode_team_messages (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      body TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE (team_id, dedupe_key)
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_sjcode_team_messages_inbox ON sjcode_team_messages (team_id, recipient, is_read)`;
});
