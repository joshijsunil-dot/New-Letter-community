import { db } from "./_shared/db.mjs";
import { handleError, json, methodNotAllowed } from "./_shared/http.mjs";
import { newsletterId } from "./_shared/security.mjs";

export default async (request) => {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  try {
    const sql = db();
    const id = newsletterId();
    const [comments, reactions, newsletterVotes] = await Promise.all([
      sql`
        SELECT c.id, c.article_id, c.display_name, c.body, c.created_at,
          COALESCE(SUM(CASE WHEN v.value = 1 THEN 1 ELSE 0 END), 0)::int AS likes,
          COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes
        FROM comments c
        LEFT JOIN votes v ON v.target_type = 'comment' AND v.target_id = c.id::text
        WHERE c.newsletter_id = ${id} AND c.status = 'published'
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT 100;
      `,
      sql`
        SELECT reaction, COUNT(*)::int AS count
        FROM newsletter_reactions
        WHERE newsletter_id = ${id}
        GROUP BY reaction;
      `,
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0)::int AS likes,
          COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes
        FROM votes
        WHERE target_type = 'newsletter' AND target_id = ${id};
      `,
    ]);

    const totals = { loved: 0, useful: 0, insightful: 0, resonated: 0 };
    for (const row of reactions) totals[row.reaction] = row.count;

    return json(200, {
      newsletterId: id,
      reactions: totals,
      newsletterVotes: newsletterVotes[0] || { likes: 0, dislikes: 0 },
      comments,
    });
  } catch (error) {
    return handleError(error);
  }
};

export const config = {
  path: "/api/interactions",
  method: "GET",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip"], windowLimit: 120, windowSize: 60 },
};
