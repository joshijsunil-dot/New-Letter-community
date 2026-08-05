import { createHash, timingSafeEqual } from "node:crypto";
import { PublicError } from "./http.mjs";

const REACTIONS = new Set(["loved", "useful", "insightful", "resonated", "taking_action"]);
const VOTES = new Set([-1, 1]);

export function newsletterId() {
  return process.env.NEWSLETTER_ID || "edition-077";
}

export function cleanPlainText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function validateName(value) {
  const name = cleanPlainText(value, 40);
  if (!name) return "Anonymous";
  if (/[<>]/.test(name)) throw new PublicError(400, "Display name contains unsupported characters.");
  return name;
}

export function validateComment(value) {
  const body = cleanPlainText(value, 1200);
  if (body.length < 2) throw new PublicError(400, "Comment must be at least 2 characters.");
  if (body.length > 1200) throw new PublicError(400, "Comment must be 1,200 characters or fewer.");
  if (/[<>]/.test(body)) throw new PublicError(400, "HTML is not allowed in comments.");
  const links = body.match(/https?:\/\//gi) || [];
  if (links.length > 2) throw new PublicError(400, "Please include no more than two links.");
  if (/(.)\1{14,}/u.test(body)) throw new PublicError(400, "Comment looks repetitive.");

  const blocked = (process.env.COMMENT_BLOCKLIST || "")
    .split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  const lower = body.toLowerCase();
  if (blocked.some((word) => lower.includes(word))) {
    throw new PublicError(400, "Comment contains blocked language.");
  }
  return body;
}

export function validateReaction(value) {
  const reaction = String(value || "").toLowerCase();
  if (!REACTIONS.has(reaction)) throw new PublicError(400, "Invalid reaction.");
  return reaction;
}

export function validateVote(value) {
  const vote = Number(value);
  if (!VOTES.has(vote)) throw new PublicError(400, "Vote must be 1 or -1.");
  return vote;
}

export function validateUuid(value, label = "ID") {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new PublicError(400, `${label} is invalid.`);
  }
  return id;
}

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-nf-client-connection-ip") || forwarded || "unknown";
}

function coarseIp(ip) {
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".");
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":");
  return ip;
}

export function visitorHash(request, visitorId) {
  const pepper = process.env.VISITOR_HASH_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("VISITOR_HASH_PEPPER must contain at least 32 characters.");
  const id = validateUuid(visitorId, "Visitor ID");
  const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 300);
  return createHash("sha256")
    .update(`${pepper}|${id}|${coarseIp(clientIp(request))}|${userAgent}`)
    .digest("hex");
}

export function requestFingerprint(request) {
  const pepper = process.env.VISITOR_HASH_PEPPER || "";
  return createHash("sha256")
    .update(`${pepper}|${coarseIp(clientIp(request))}|${(request.headers.get("user-agent") || "").slice(0, 300)}`)
    .digest("hex");
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return;
  try {
    if (new URL(origin).host !== host) throw new PublicError(403, "Cross-site request blocked.");
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(403, "Invalid request origin.");
  }
}

export function secureTokenEqual(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
