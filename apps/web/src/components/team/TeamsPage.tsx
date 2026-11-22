import type { TeamSnapshot, TeamTaskStatus } from "@t3tools/contracts";
import { T, Var } from "gt-react";
import { useTeams } from "../../state/teams";

const TASK_TONE: Record<TeamTaskStatus, string> = {
  todo: "bg-muted text-foreground",
  in_progress: "bg-info/15 text-info",
  review: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
  blocked: "bg-error/15 text-error",
  cancelled: "bg-muted text-muted-foreground",
};

function statusLabel(status: TeamTaskStatus): string {
  return status.replaceAll("_", " ");
}

function TeamCard({ snapshot }: { readonly snapshot: TeamSnapshot }) {
  const { team, members, tasks, unread } = snapshot;
  const done = tasks.filter((task) => task.status === "done").length;
  const active = tasks.filter(
    (task) => task.status === "in_progress" || task.status === "review",
  ).length;
  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{team.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{team.goal}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{team.status}</span>
      </header>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <dt className="text-muted-foreground">
            <T>Members</T>
          </dt>
          <dd className="font-medium">{members.length}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <T>Active</T>
          </dt>
          <dd className="font-medium">{active}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <T>Done</T>
          </dt>
          <dd className="font-medium">
            {done}/{tasks.length}
          </dd>
        </div>
      </dl>
      {tasks.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{task.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${TASK_TONE[task.status]}`}>
                {statusLabel(task.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          <T>No tasks yet</T>
        </p>
      )}
      {unread.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <T>
            <Var>{unread.length}</Var> unread messages
          </T>
        </p>
      ) : null}
    </section>
  );
}

export function TeamsPage() {
  const { teams, loading, error } = useTeams();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <T>Teams</T>
          </h1>
          <p className="text-sm text-muted-foreground">
            <T>Agent teams working on shared projects</T>
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          onClick={() => window.location.reload()}
        >
          <T>Refresh</T>
        </button>
      </header>
      {error !== null ? (
        <p className="rounded-md bg-error/15 p-3 text-sm text-error">{error}</p>
      ) : null}
      {loading && teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <T>Loading teams…</T>
        </p>
      ) : null}
      {!loading && teams.length === 0 && error === null ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>
            <T>No teams yet</T>
          </p>
          <p className="mt-1">
            <T>Create a team from a conversation with the team_* tools</T>
          </p>
        </div>
      ) : null}
      {teams.map((snapshot) => (
        <TeamCard key={snapshot.team.id} snapshot={snapshot} />
      ))}
    </div>
  );
}
