import { db } from "./_shared/db.mjs";
import { handleError, json, methodNotAllowed, readJson, PublicError } from "./_shared/http.mjs";
import { enforceRateLimit } from "./_shared/rate-limit.mjs";
import {
  assertSameOrigin, newsletterId, requestFingerprint, validateUuid,
  validateVote, visitorHash,
} from "./_shared/security.mjs";

export default async (request) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  try {
    assertSameOrigin(request);
    const input = await readJson(request, 4000);
    const sql = db();
    await enforceRateLimit(sql, requestFingerprint(request), "vote", 40, 300);

    const targetType = input.targetType === "newsletter" ? "newsletter" : "comment";
    const targetId = targetType === "newsletter" ? newsletterId() : validateUuid(input.targetId, "Comment ID");
    const value = validateVote(input.value);
    const hash = visitorHash(request, input.visitorId);

    if (targetType === "comment") {
      const exists = await sql`
        SELECT 1 FROM comments
        WHERE id = ${targetId}::uuid AND newsletter_id = ${newsletterId()} AND status = 'published';
      `;
      if (!exists.length) throw new PublicError(404, "Comment not found.");
    }

    await sql`
      INSERT INTO votes (target_type, target_id, visitor_hash, value)
      VALUES (${targetType}, ${targetId}, ${hash}, ${value})
      ON CONFLICT (target_type, target_id, visitor_hash)
      DO UPDATE SET value = CASE
        WHEN votes.value = EXCLUDED.value THEN votes.value
        ELSE EXCLUDED.value
      END, updated_at = now();
    `;

    const totals = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0)::int AS likes,
        COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes
      FROM votes WHERE target_type = ${targetType} AND target_id = ${targetId};
    `;
    return json(200, { message: "Vote saved.", targetType, targetId, ...totals[0] });
  } catch (error) {
    return handleError(error);
  }
};

export const config = {
  path: "/api/votes",
  method: "POST",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip"], windowLimit: 50, windowSize: 300 },
};
