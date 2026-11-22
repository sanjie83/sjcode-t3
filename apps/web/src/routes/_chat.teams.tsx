import { createFileRoute } from "@tanstack/react-router";

import { TeamsPage } from "../components/team/TeamsPage";

export const Route = createFileRoute("/_chat/teams")({
  component: TeamsPage,
});
