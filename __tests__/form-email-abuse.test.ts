import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The public forms must not work as a mail relay.
 *
 * Each one emails a confirmation to whatever address is typed in, from the
 * site's own domain — so that email passes SPF and DKIM and looks entirely
 * legitimate. The order form used to put the posted title into its subject and
 * body, and every confirmation opened with the posted name, so anyone could
 * send "Your enquiry for <any text>" to anyone. These tests call the real
 * route handlers with the database, Resend and the limiter faked.
 */

const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
const limiter = vi.hoisted(() => ({ submission: true, confirmation: true, owner: true }));
/** Make Resend refuse the owner's copy or the confirmation, the way it does: no throw. */
const refuse = vi.hoisted(() => ({ owner: false, confirmation: false }));
/** What each route told the dashboard happened (lib/server-event.ts). */
const recorded = vi.hoisted(() => [] as string[]);

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: { to: string; subject: string; text: string }) => {
        const toOwner = m.to !== "victim@example.com";
        if (toOwner ? refuse.owner : refuse.confirmation) {
          return { data: null, error: { name: "validation_error", message: "refused" } };
        }
        sent.push(m);
        return { data: { id: "x" }, error: null };
      },
    };
  },
}));
vi.mock("@/lib/server-event", () => ({
  recordServerAction: async (action: string) => {
    recorded.push(action);
  },
}));
vi.mock("@/lib/email-validation", () => ({ validateEmail: async () => ({ ok: true }) }));
vi.mock("@/lib/form-rate-limit", () => ({
  allowSubmission: async () => limiter.submission,
  allowConfirmation: async () => limiter.confirmation,
  allowOwnerEmail: async () => limiter.owner,
  TOO_MANY: { error: "Too many requests" },
}));
vi.mock("@/lib/db", () => {
  const work = { id: "lora-bay", title: "Lora Bay", sizeType: "landscape", visible: true, soldOut: false };
  return {
    prisma: {
      product: {
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === work.id ? work : null),
        findMany: async () => [work],
      },
    },
  };
});

const { POST: buy } = await import("../app/api/buy/route");
const { POST: contact } = await import("../app/api/contact/route");
const { POST: book } = await import("../app/api/book/route");
const { sizeOptions } = await import("../data/products");

const post = (body: unknown) =>
  new Request("http://localhost/api/x", { method: "POST", body: JSON.stringify(body) });

const PAYLOAD = "Pay the deposit at evil example dot com";
const VICTIM = "victim@example.com";
const size = sizeOptions.landscape[0];
const toVictim = () => sent.filter((m) => m.to === VICTIM);

beforeEach(() => {
  sent.length = 0;
  recorded.length = 0;
  limiter.submission = true;
  limiter.confirmation = true;
  limiter.owner = true;
  refuse.owner = false;
  refuse.confirmation = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/buy", () => {
  const order = { kind: "print", productId: "lora-bay", size: size.label };
  const person = { name: PAYLOAD, email: VICTIM, phone: "555 0100", address: "1 Main St" };

  it("builds both emails from the catalogue, not from what was posted", async () => {
    const res = await buy(post({ order, ...person, title: PAYLOAD, price: 1, sizeLabel: PAYLOAD }));
    expect(res.status).toBe(200);

    const owner = sent.find((m) => m.to !== VICTIM)!;
    expect(owner.subject).toContain("Lora Bay");
    expect(owner.text).toContain(`CA$${size.salePrice.toFixed(2)}`);
    expect(owner.text).not.toContain("CA$1.00");
  });

  it("repeats nothing the visitor typed in the confirmation", async () => {
    await buy(post({ order, ...person, title: PAYLOAD }));
    const [confirmation] = toVictim();
    expect(confirmation!.subject).toBe("Your enquiry for Lora Bay");
    expect(confirmation!.subject + confirmation!.text).not.toContain("evil");
  });

  it("refuses an order for a work that isn't in the catalogue, and sends nothing", async () => {
    const res = await buy(post({ order: { ...order, productId: "no-such-work" }, ...person }));
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing, and says it failed, once the day's owner emails are used up", async () => {
    limiter.owner = false;
    const res = await buy(post({ order, ...person }));
    expect(res.status).toBe(500);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing at all once the IP is over its limit", async () => {
    limiter.submission = false;
    const res = await buy(post({ order, ...person }));
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(0);
  });

  it("still tells the owner when only the confirmation is held back", async () => {
    // A real customer retrying must not be lost; the courtesy email is what's capped.
    limiter.confirmation = false;
    const res = await buy(post({ order, ...person }));
    expect(res.status).toBe(200);
    expect(toVictim()).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });
});

describe("/api/contact", () => {
  it("repeats nothing the visitor typed in the confirmation", async () => {
    const res = await contact(post({ name: PAYLOAD, email: VICTIM, message: "Hello there, a real message." }));
    expect(res.status).toBe(200);
    const [confirmation] = toVictim();
    expect(confirmation!.subject + confirmation!.text).not.toContain("evil");
  });

  it("sends nothing once the IP is over its limit", async () => {
    limiter.submission = false;
    const res = await contact(post({ name: "Jane Smith", email: VICTIM, message: "Hello there." }));
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(0);
  });
});

describe("/api/book", () => {
  it("repeats nothing the visitor typed in the autoresponder", async () => {
    const res = await book(post({ name: PAYLOAD, email: VICTIM, elapsedMs: 60_000 }));
    expect(res.status).toBe(200);
    const [confirmation] = toVictim();
    expect(confirmation!.subject + confirmation!.text).not.toContain("evil");
  });

  it("sends nothing once the IP is over its limit", async () => {
    limiter.submission = false;
    const res = await book(post({ name: "Jane Smith", email: VICTIM, elapsedMs: 60_000 }));
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(0);
  });
});

// ── Oversized and malformed input ─────────────────────────────────────────────
// No size limits existed until the abuse tests that stand in for a manual pen
// test looked for them: a message of any length went to the owner's inbox, and
// a non-text field crashed the handler into a 500. Nothing is sent in any case.

describe("oversized and malformed input", () => {
  const order = { kind: "print", productId: "lora-bay", size: size.label };
  const raw = (body: string) => new Request("http://localhost/api/x", { method: "POST", body });
  const long = (n: number) => "word ".repeat(Math.ceil(n / 5)).slice(0, n);

  it("refuses a body too big to be a real enquiry, on every form", async () => {
    const huge = long(40_000);
    for (const res of [
      await contact(post({ name: "Jane Smith", email: VICTIM, message: huge })),
      await buy(post({ order, name: "Jane Smith", email: VICTIM, phone: "555", address: huge })),
      await book(post({ name: "Jane Smith", email: VICTIM, notes: huge, elapsedMs: 60_000 })),
    ]) {
      expect(res.status).toBe(413);
    }
    expect(sent).toHaveLength(0);
  });

  it("refuses a field over its limit, with a reason a person can act on", async () => {
    const res = await contact(post({ name: "Jane Smith", email: VICTIM, message: long(5001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/message is too long/);
    expect((await buy(post({ order, name: "Jane Smith", email: VICTIM, phone: "5".repeat(41), address: "1 Main St" }))).status).toBe(400);
    expect((await book(post({ name: "Jane Smith", email: VICTIM, notes: long(3001), elapsedMs: 60_000 }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("answers a non-text field with a 400, not a crash", async () => {
    expect((await contact(post({ name: { first: "Jane" }, email: VICTIM, message: "hello there" }))).status).toBe(400);
    expect((await buy(post({ order, name: ["Jane"], email: VICTIM, phone: "555", address: "1 Main St" }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("answers a body that isn't JSON with a 400, on every form", async () => {
    for (const handler of [contact, buy, book]) {
      expect((await handler(raw("name=Jane&email=x"))).status).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });
});


// ── What the dashboard counts, and refused emails ─────────────────────────────
// "Contact form sent" was reported by the page whenever the route said OK. The
// route says OK to a bot caught by the honeypot -- deliberately, the reply must
// not differ -- and Resend's send() resolves rather than throws when it refuses
// an email, so a refused message said OK too. Fourteen "sent" contact messages
// between June and September 2026 produced no email at all. The routes now
// record the outcome themselves, and only once the owner's email has gone.

describe("form outcomes", () => {
  const order = { kind: "print", productId: "lora-bay", size: size.label };
  const contactBody = { name: "Jane Smith", email: VICTIM, message: "Hello there, a real message." };
  const buyBody = { order, name: "Jane Smith", email: VICTIM, phone: "555 0100", address: "1 Main St" };
  const bookBody = { name: "Jane Smith", email: VICTIM, elapsedMs: 60_000 };

  it("counts a message as sent only once the owner's email has gone", async () => {
    expect((await contact(post(contactBody))).status).toBe(200);
    expect((await buy(post(buyBody))).status).toBe(200);
    expect(recorded).toEqual(["contact_submit", "buy_submit"]);
  });

  it("answers a caught bot exactly like a person, sends nothing, and counts it as spam", async () => {
    const replies = [
      await contact(post({ ...contactBody, website: "http://spam.example" })),
      await buy(post({ ...buyBody, website: "http://spam.example" })),
      await book(post({ ...bookBody, website: "http://spam.example" })),
    ];
    for (const res of replies) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(sent).toHaveLength(0);
    expect(recorded).toEqual(["spam_blocked", "spam_blocked", "spam_blocked"]);
  });

  it("says so when Resend refuses the owner's email, and sends no confirmation", async () => {
    refuse.owner = true;
    expect((await contact(post(contactBody))).status).toBe(500);
    expect((await buy(post(buyBody))).status).toBe(500);
    expect((await book(post(bookBody))).status).toBe(500);
    // No "we received your message" for a message nobody received.
    expect(sent).toHaveLength(0);
    expect(recorded).toEqual([]);
  });

  it("still succeeds when only the confirmation is refused: the owner has the message", async () => {
    refuse.confirmation = true;
    expect((await contact(post(contactBody))).status).toBe(200);
    expect(sent.map((m) => m.to)).not.toContain(VICTIM);
    expect(recorded).toEqual(["contact_submit"]);
  });
});
