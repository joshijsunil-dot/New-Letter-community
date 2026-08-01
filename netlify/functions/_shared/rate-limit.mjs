import { PublicError } from "./http.mjs";

export async function enforceRateLimit(sql, fingerprint, action, limit, windowSeconds) {
  const result = await sql`
    WITH recent AS (
      SELECT COUNT(*)::int AS count
      FROM action_events
      WHERE fingerprint = ${fingerprint}
        AND action = ${action}
        AND created_at > NOW() - (${windowSeconds} * INTERVAL '1 second')
    ), inserted AS (
      INSERT INTO action_events (fingerprint, action)
      SELECT ${fingerprint}, ${action}
      FROM recent WHERE count < ${limit}
      RETURNING id
    )
    SELECT count, EXISTS(SELECT 1 FROM inserted) AS allowed FROM recent;
  `;
  if (!result[0]?.allowed) throw new PublicError(429, "Too many attempts. Please wait and try again.");

  // Occasional bounded cleanup; no user data is returned.
  if (Math.random() < 0.02) {
    await sql`DELETE FROM action_events WHERE created_at < NOW() - INTERVAL '2 days'`;
  }
}
