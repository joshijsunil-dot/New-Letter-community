import { db } from "./_shared/db.mjs";
import { handleError, json, methodNotAllowed, readJson } from "./_shared/http.mjs";
import { enforceRateLimit } from "./_shared/rate-limit.mjs";
import { assertSameOrigin, newsletterId, requestFingerprint, validateReaction, visitorHash } from "./_shared/security.mjs";

export default async (request) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  try {
    assertSameOrigin(request);
    const input = await readJson(request, 4000);
    const sql = db();
    await enforceRateLimit(sql, requestFingerprint(request), "reaction", 20, 300);
    const id = newsletterId();
    const reaction = validateReaction(input.reaction);
    const hash = visitorHash(request, input.visitorId);

    await sql`
      INSERT INTO newsletter_reactions (newsletter_id, visitor_hash, reaction)
      VALUES (${id}, ${hash}, ${reaction})
      ON CONFLICT (newsletter_id, visitor_hash)
      DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = now();
    `;

    const rows = await sql`
      SELECT reaction, COUNT(*)::int AS count
      FROM newsletter_reactions
      WHERE newsletter_id = ${id}
      GROUP BY reaction;
    `;
    const totals = { loved: 0, useful: 0, insightful: 0, resonated: 0, taking_action: 0 };
    for (const row of rows) totals[row.reaction] = row.count;
    return json(200, { message: "Reaction saved.", reactions: totals, selected: reaction });
  } catch (error) {
    return handleError(error);
  }
};

export const config = {
  path: "/api/reactions",
  method: "POST",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip"], windowLimit: 30, windowSize: 300 },
};
