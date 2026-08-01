import { db } from "./_shared/db.mjs";
import { handleError, json, methodNotAllowed, readJson, PublicError } from "./_shared/http.mjs";
import { enforceRateLimit } from "./_shared/rate-limit.mjs";
import {
  assertSameOrigin, newsletterId, requestFingerprint, validateComment,
  validateName, visitorHash, cleanPlainText,
} from "./_shared/security.mjs";

export default async (request) => {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  try {
    assertSameOrigin(request);
    const input = await readJson(request);
    if (input.website) throw new PublicError(400, "Spam submission rejected.");
    if (Number(input.startedAt) > Date.now() - 1200) throw new PublicError(400, "Please take a moment before submitting.");

    const sql = db();
    await enforceRateLimit(sql, requestFingerprint(request), "comment", 4, 600);

    const name = validateName(input.displayName);
    const body = validateComment(input.body);
    const articleId = cleanPlainText(input.articleId, 80) || null;
    const hash = visitorHash(request, input.visitorId);
    const status = process.env.MODERATION_MODE === "approval" ? "pending" : "published";
    const rows = await sql`
      INSERT INTO comments (newsletter_id, article_id, display_name, body, status, visitor_hash)
      VALUES (${newsletterId()}, ${articleId}, ${name}, ${body}, ${status}, ${hash})
      RETURNING id, article_id, display_name, body, status, created_at;
    `;

    return json(201, {
      message: status === "pending" ? "Comment submitted for review." : "Comment published.",
      comment: rows[0],
    });
  } catch (error) {
    return handleError(error);
  }
};

export const config = {
  path: "/api/comments",
  method: "POST",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip"], windowLimit: 8, windowSize: 600 },
};
