import { AuthOrchestrationReadScope, EnvironmentHttpApi } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { traceLocalHandlerWork } from "../cloud/traceRelayRequest.ts";
import * as TeamService from "./TeamService.ts";

export const layer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "teams",
  Effect.fnUntraced(function* (handlers) {
    const teams = yield* TeamService.TeamService;

    return handlers.handle(
      "list",
      Effect.fn("environment.teams.list")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        yield* requireEnvironmentScope(AuthOrchestrationReadScope);
        return yield* teams.list().pipe(
          Effect.map((list) => ({ teams: list })),
          traceLocalHandlerWork,
          Effect.catch((cause) => failEnvironmentInternal("internal_error", cause)),
        );
      }),
    );
  }),
);
