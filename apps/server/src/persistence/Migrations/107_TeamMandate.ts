import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Adds the immutable mandate to teams (ported from dsh-superagent, MIT).
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE sjcode_teams ADD COLUMN mandate_json TEXT NOT NULL DEFAULT '{}'`;
});
