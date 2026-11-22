import type { TeamSnapshot } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

export interface TeamsState {
  readonly teams: ReadonlyArray<TeamSnapshot>;
  readonly loading: boolean;
  readonly error: string | null;
}

const EMPTY: TeamsState = { teams: [], loading: true, error: null };

async function fetchTeams(signal: AbortSignal): Promise<ReadonlyArray<TeamSnapshot>> {
  const response = await fetch("/api/teams", { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`Teams request failed: ${response.status}`);
  const body = (await response.json()) as { readonly teams?: ReadonlyArray<TeamSnapshot> };
  return body.teams ?? [];
}

/**
 * Reads the environment's Team board over the same-origin HTTP API. Polls on a
 * modest interval so task/member changes made by agents appear without a socket
 * subscription. The endpoint is read-only and gated by orchestration:read.
 */
export function useTeams(intervalMs = 5_000): TeamsState {
  const [state, setState] = useState<TeamsState>(EMPTY);
  const mounted = useRef(true);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the polling timer and in-flight fetch in step with this component's lifetime; aborts on unmount.
  useEffect(() => {
    mounted.current = true;
    const refresh = async (signal: AbortSignal) => {
      try {
        const teams = await fetchTeams(signal);
        if (mounted.current && !signal.aborted) setState({ teams, loading: false, error: null });
      } catch (error) {
        if (mounted.current && !signal.aborted) {
          setState((prev) => ({
            teams: prev.teams,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    };
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => {
      void refresh(controller.signal);
    }, intervalMs);
    return () => {
      mounted.current = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return state;
}
