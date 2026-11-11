/**
 * What the public forms (/api/buy, /api/contact, /api/book) will accept.
 *
 * Until September 2026 they took any JSON: a message, address or note of any
 * length went straight into the owner's inbox, and a non-text field (say
 * `"name": {}`) crashed the handler into a 500 instead of a clear refusal.
 * Each form is rate-limited, but a size limit is cheaper and closes the
 * mail-bombing route outright. Found while writing the abuse tests that
 * stand in for a manual penetration test (/architecture §10).
 *
 * The limits are generous for a real person and small for a script.
 */

/** Bytes, checked before parsing. A real submission is a few hundred. */
export const MAX_BODY_BYTES = 32 * 1024;

export const FIELD_MAX = {
  name: 100,
  email: 254, // the longest a valid address can be (RFC 5321)
  phone: 40,
  address: 600,
  message: 5000,
  notes: 3000,
  medium: 200,
  town: 100,
  current: 200,
  website: 200, // the honeypot
} as const;

type Refusal = { ok: false; status: 400 | 413; error: string };

/** The request body as a plain object, or the reason it can't be one. */
export async function readFormBody(
  request: Request
): Promise<{ ok: true; body: Record<string, unknown> } | Refusal> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return tooLong();
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return tooLong();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "Malformed request." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 400, error: "Malformed request." };
  }
  return { ok: true, body: data as Record<string, unknown> };
}

/**
 * Every listed field that is present must be text within its limit. Returns
 * the first problem as a message for the visitor, or null when all is well.
 * Absent and empty fields pass; whether a field is required is the form's call.
 */
export function checkFields(body: Record<string, unknown>, fields: (keyof typeof FIELD_MAX)[]): string | null {
  for (const key of fields) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return "Malformed request.";
    const max = FIELD_MAX[key];
    if (value.length > max) {
      return `That ${key === "notes" ? "note" : key} is too long. Please keep it under ${max.toLocaleString("en-CA")} characters.`;
    }
  }
  return null;
}

function tooLong(): Refusal {
  return { ok: false, status: 413, error: "That's too long to send. Please shorten it and try again." };
}
