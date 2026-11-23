/**
 * Commissions: the examples on /commissions and the quote request beside them.
 *
 * Pure, so the rules are unit-tested without a database. The page, the admin
 * and /api/commissions all read from here.
 *
 * Decisions behind it (owner, November 2026):
 *   - Quote only. The page names no prices; every commission is quoted.
 *   - The terms are stated: half up front, the balance before shipping,
 *     typically four to six weeks.
 *   - An example names its subject, never the client.
 */

export const COMMISSION_KINDS = ["pet", "portrait"] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

export const KIND_LABEL: Record<CommissionKind, string> = { pet: "Pets", portrait: "Portraits" };

export const isCommissionKind = (v: unknown): v is CommissionKind =>
  typeof v === "string" && (COMMISSION_KINDS as readonly string[]).includes(v);

/** What a quote request can be for. "other" is a place, a house, a boat. */
export const REQUEST_KINDS = { pet: "A pet", portrait: "A portrait", other: "Something else" } as const;
export type RequestKind = keyof typeof REQUEST_KINDS;

export const isRequestKind = (v: unknown): v is RequestKind =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(REQUEST_KINDS, v);

/** The terms, shown on the page and repeated in the confirmation email. */
export const COMMISSION_TERMS = {
  deposit: "50% deposit to start, balance before shipping.",
  turnaround: "Typically 4 to 6 weeks.",
} as const;

/** The parts of an example that make up its caption. */
export type ExampleCaption = {
  name: string;
  subject?: string | null;
  medium?: string | null;
  size?: string | null;
};

/** "Bailey, Golden retriever, Oil on canvas, 12 x 16 in": blanks dropped. */
export function captionOf(e: ExampleCaption): string {
  return [e.name, e.subject, e.medium, e.size]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

/** The image's alt text: the subject first, so it reads as a description. */
export function altOf(e: ExampleCaption & { kind: string }): string {
  const what = e.subject?.trim() || (e.kind === "portrait" ? "portrait" : "pet");
  return `Commissioned painting of ${e.name.trim()}, ${what.toLowerCase()}`;
}

/** Field limits for an example, as entered in the admin. */
export const EXAMPLE_MAX = { name: 60, subject: 100, medium: 100, size: 60 } as const;

export type ExampleFields = {
  kind: CommissionKind;
  name: string;
  subject: string | null;
  medium: string | null;
  size: string | null;
};

/**
 * Read an example's text fields from the admin form. Returns the fields, or
 * the first problem as a message for the admin.
 */
export function parseExampleFields(
  get: (key: string) => unknown
): { ok: true; fields: ExampleFields } | { ok: false; error: string } {
  const kind = get("kind");
  if (!isCommissionKind(kind)) return { ok: false, error: "Choose Pet or Portrait." };

  const text = (key: keyof typeof EXAMPLE_MAX): string | null => {
    const v = get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const name = text("name");
  if (!name) return { ok: false, error: "The subject's name is required." };

  for (const key of Object.keys(EXAMPLE_MAX) as (keyof typeof EXAMPLE_MAX)[]) {
    const v = text(key);
    if (v && v.length > EXAMPLE_MAX[key]) {
      return { ok: false, error: `The ${key} is too long (${EXAMPLE_MAX[key]} characters at most).` };
    }
  }
  return {
    ok: true,
    fields: { kind, name, subject: text("subject"), medium: text("medium"), size: text("size") },
  };
}

/** The owner's copy of a quote request. Everything the visitor typed, labelled. */
export function quoteEmailText(r: {
  name: string;
  email: string;
  kind: RequestKind;
  size?: string;
  deadline?: string;
  message: string;
}): string {
  return [
    `Name: ${r.name}`,
    `Email: ${r.email}`,
    `For: ${REQUEST_KINDS[r.kind]}`,
    `Size in mind: ${r.size?.trim() || "Not given"}`,
    `Needed by: ${r.deadline?.trim() || "No deadline given"}`,
    "",
    r.message,
  ].join("\n");
}
