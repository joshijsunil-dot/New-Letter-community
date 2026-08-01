export const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  },
});

export const methodNotAllowed = (allowed) =>
  json(405, { error: "Method not allowed." }, { allow: allowed.join(", ") });

export async function readJson(request, maxBytes = 12_000) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new PublicError(413, "Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new PublicError(413, "Request is too large.");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new PublicError(400, "Invalid JSON request.");
  }
}

export class PublicError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function handleError(error) {
  if (error instanceof PublicError) return json(error.status, { error: error.message });
  console.error(error);
  return json(500, { error: "Something went wrong. Please try again." });
}
