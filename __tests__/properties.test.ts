/**
 * Property-based tests (fast-check): instead of a few hand-picked examples,
 * each property is checked against hundreds of generated inputs — long,
 * empty, Unicode, hostile — and a failure is shrunk to the smallest input
 * that breaks it. They cover the code that turns untrusted input into
 * something the site acts on: slugs, form fields, order prices and the
 * browser error reports.
 *
 * A failing run prints a seed; `fc.assert(..., { seed, path })` replays it.
 * Mutation runs use a fixed seed (below), so their scores are repeatable.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { deriveSizeType, standardPrice, slugify } from "../lib/product-utils";
import { productPath, slugProblem, SLUG_MAX, SLUG_PATTERN } from "../lib/product-path";
import { checkFields, readFormBody, FIELD_MAX, MAX_BODY_BYTES } from "../lib/form-input";
import { resolveOrder, CARDS, type WorkLookup } from "../lib/order";
import { parseClientError, CLIENT_ERROR_KINDS } from "../lib/client-error";
import { sizeOptions, type SizeType } from "../data/products";
import { giftShopProducts } from "../data/giftShop";

// Under mutation testing (scripts/mutation-run.mjs switches each mutant on
// through __STRYKER_ACTIVE_MUTANT__) every run uses the same inputs, so a
// module's mutation score doesn't change from run to run and its floor in
// stryker.config.mjs means something. Everywhere else each run explores fresh
// inputs.
if (process.env.__STRYKER_ACTIVE_MUTANT__ !== undefined) fc.configureGlobal({ seed: 20261008 });

const SIZE_TYPES = Object.keys(sizeOptions) as SizeType[];

// Titles as an admin might type them, plus anything else a string can hold.
const title = fc.oneof(
  fc.string({ maxLength: 120 }),
  fc.string({ unit: "grapheme", maxLength: 80 }),
  fc.stringMatching(/^[A-Za-z0-9 '&.,!?-]{0,100}$/),
  // Long titles of short words, so the 60-character cut can land anywhere.
  fc.array(fc.stringMatching(/^[A-Za-z]{1,6}$/), { minLength: 8, maxLength: 30 }).map((w) => w.join(" "))
);

describe("slugify", () => {
  it("always produces a slug the admin will accept", () => {
    fc.assert(
      fc.property(title, (t) => {
        const slug = slugify(t);
        expect(slugProblem(slug)).toBeNull();
        expect(slug.length).toBeLessThanOrEqual(60);
      })
    );
  });

  it("is idempotent: a slug slugifies to itself", () => {
    fc.assert(
      fc.property(title, (t) => {
        expect(slugify(slugify(t))).toBe(slugify(t));
      })
    );
  });

  it("keeps every letter and digit of a short ASCII title, in order", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9 -]{1,50}$/), (t) => {
        const alnum = t.toLowerCase().replace(/[^a-z0-9]/g, "");
        fc.pre(alnum.length > 0);
        expect(slugify(t).replace(/-/g, "")).toBe(alnum);
      })
    );
  });
});

describe("slugProblem", () => {
  it("accepts exactly the well-formed slugs up to SLUG_MAX", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 100 }), fc.stringMatching(/^[a-z0-9-]{0,100}$/)), (s) => {
        const ok = s.length > 0 && s.length <= SLUG_MAX && SLUG_PATTERN.test(s);
        expect(slugProblem(s) === null).toBe(ok);
      })
    );
  });
});

describe("productPath", () => {
  it("puts photographs and everything else under their own section, with the slug last", () => {
    const slug = fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    fc.assert(
      fc.property(slug, fc.option(slug), fc.constantFrom("painting", "photograph", "film"), (id, s, type) => {
        const path = productPath({ id, slug: s, type });
        expect(path).toBe(`${type === "photograph" ? "/photographs" : "/products"}/${s ?? id}`);
      })
    );
  });
});

describe("deriveSizeType", () => {
  const side = fc.integer({ min: 1, max: 20_000 });

  it("never depends on resolution, only on the shape", () => {
    fc.assert(
      fc.property(side, side, fc.integer({ min: 2, max: 8 }), (w, h, k) => {
        expect(deriveSizeType(w * k, h * k)).toBe(deriveSizeType(w, h));
      })
    );
  });

  it("always returns a size type the work is offered in", () => {
    fc.assert(
      fc.property(side, side, fc.uniqueArray(fc.constantFrom(...SIZE_TYPES), { minLength: 1 }), (w, h, avail) => {
        expect(avail).toContain(deriveSizeType(w, h, avail));
      })
    );
  });

  it("gets wider as the image gets wider", () => {
    const order = ["portrait", "square", "landscape", "panoramic", "ultrawide"];
    fc.assert(
      fc.property(side, side, side, (h, a, b) => {
        const [narrow, wide] = a <= b ? [a, b] : [b, a];
        expect(order.indexOf(deriveSizeType(narrow, h))).toBeLessThanOrEqual(order.indexOf(deriveSizeType(wide, h)));
      })
    );
  });
});

describe("standardPrice", () => {
  it("is the lowest price on offer for the size type, and 0 for an unknown one", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...SIZE_TYPES), fc.string(), fc.constantFrom("valueOf", "__proto__", "constructor")), (type) => {
        const price = standardPrice(type);
        if (!Object.hasOwn(sizeOptions, type)) {
          expect(price).toBe(0);
          return;
        }
        const opts = sizeOptions[type as SizeType];
        expect(opts.map((o) => o.salePrice)).toContain(price);
        for (const o of opts) expect(price).toBeLessThanOrEqual(o.salePrice);
      })
    );
  });
});

describe("checkFields", () => {
  const FIELDS = Object.keys(FIELD_MAX) as (keyof typeof FIELD_MAX)[];

  it("never throws, whatever JSON arrives", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...FIELDS, "other"), fc.jsonValue()), (body) => {
        const result = checkFields(body, FIELDS);
        expect(result === null || typeof result === "string").toBe(true);
      })
    );
  });

  it("passes text within every limit, and refuses one field over its limit", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FIELDS),
        fc.integer({ min: 1, max: 200 }),
        fc.boolean(),
        (field, extra, over) => {
          const max = FIELD_MAX[field];
          const value = "x".repeat(over ? max + extra : Math.max(1, max + 1 - extra)); // up to exactly max
          const result = checkFields({ [field]: value }, [field]);
          if (over) expect(result).toMatch(/too long/);
          else expect(result).toBeNull();
        }
      )
    );
  });

  it("refuses anything that isn't text, except an absent or empty field", () => {
    const notText = fc.oneof(fc.integer(), fc.boolean(), fc.array(fc.string()), fc.object());
    fc.assert(
      fc.property(fc.constantFrom(...FIELDS), notText, (field, value) => {
        expect(checkFields({ [field]: value }, [field])).toBe("Malformed request.");
      })
    );
  });
});

describe("readFormBody", () => {
  const post = (body: string) => new Request("http://localhost/api/contact", { method: "POST", body });

  it("accepts a JSON object, refuses everything else, and never throws", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.string(), fc.json(), fc.jsonValue().map((v) => JSON.stringify(v))), async (text) => {
        const result = await readFormBody(post(text));
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }
        const isObject = !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
        expect(result.ok).toBe(isObject);
      })
    );
  });

  it("refuses any body over the size limit, counted in bytes, not characters", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4096 }), fc.constantFrom("a", "é", "🎨"), async (extra, ch) => {
        const bytes = new TextEncoder().encode(ch).length;
        const text = JSON.stringify({ message: ch.repeat(Math.ceil((MAX_BODY_BYTES + extra) / bytes)) });
        const result = await readFormBody(post(text));
        expect(result).toMatchObject({ ok: false, status: 413 });
      }),
      { numRuns: 30 }
    );
  });
});

describe("resolveOrder", () => {
  type Work = { id: string; title: string; sizeType: string; visible: boolean; soldOut: boolean };
  const work: fc.Arbitrary<Work> = fc.record({
    id: fc.stringMatching(/^[a-z]{1,8}$/),
    title: fc.string({ minLength: 1, maxLength: 40 }),
    sizeType: fc.constantFrom(...SIZE_TYPES),
    visible: fc.boolean(),
    soldOut: fc.boolean(),
  });
  const lookup = (works: Work[]): WorkLookup => ({
    one: async (id) => works.find((w) => w.id === id) ?? null,
    many: async (ids) => works.filter((w) => ids.includes(w.id)),
  });
  const PRICES = new Set([
    ...Object.values(sizeOptions).flatMap((opts) => opts.map((o) => o.salePrice)),
    ...Object.values(CARDS).map((c) => c.price),
    ...giftShopProducts.map((p) => p.priceCAD),
  ]);

  it("never throws, and every price comes from the catalogue, never from the request", async () => {
    const anyOrder = fc.oneof(
      fc.anything(),
      fc.record({
        kind: fc.constantFrom("print", "card", "pack", "other"),
        productId: fc.oneof(fc.stringMatching(/^[a-z]{1,8}$/), fc.anything()),
        size: fc.oneof(fc.constantFrom(...Object.values(sizeOptions).flat().map((o) => o.label)), fc.anything()),
        card: fc.oneof(fc.constantFrom("greeting", "postcard"), fc.anything()),
        packId: fc.oneof(fc.constantFrom(...giftShopProducts.map((p) => p.id)), fc.string()),
        imageIds: fc.oneof(fc.array(fc.stringMatching(/^[a-z]{1,8}$/), { maxLength: 14 }), fc.anything()),
        price: fc.integer(),
      })
    );
    await fc.assert(
      fc.asyncProperty(anyOrder, fc.array(work, { maxLength: 15 }), async (input, works) => {
        const result = await resolveOrder(input, lookup(works));
        if (result.ok) expect(PRICES).toContain(result.order.price);
      })
    );
  });

  it("refuses a print of a hidden or sold-out work, and prices an available one at its size", async () => {
    await fc.assert(
      fc.asyncProperty(work, fc.nat(), async (w, pick) => {
        const opts = sizeOptions[w.sizeType as SizeType];
        const size = opts[pick % opts.length]!;
        const result = await resolveOrder({ kind: "print", productId: w.id, size: size.label }, lookup([w]));
        if (w.visible && !w.soldOut) expect(result).toMatchObject({ ok: true, order: { price: size.salePrice } });
        else expect(result.ok).toBe(false);
      })
    );
  });

  it("accepts a pack only with exactly its count of different, available images", async () => {
    const pack = fc.constantFrom(...giftShopProducts);
    await fc.assert(
      fc.asyncProperty(pack, fc.array(work, { maxLength: 15 }), fc.array(fc.nat(), { maxLength: 14 }), async (p, works, picks) => {
        const ids = works.length ? picks.map((i) => works[i % works.length]!.id) : [];
        const result = await resolveOrder({ kind: "pack", packId: p.id, imageIds: ids }, lookup(works));
        const usable = new Set(works.filter((w) => w.visible && !w.soldOut).map((w) => w.id));
        const valid = ids.length === p.photoCount && new Set(ids).size === ids.length && ids.every((id) => usable.has(id));
        expect(result.ok).toBe(valid);
      })
    );
  });
});

describe("parseClientError", () => {
  const nearlyValid = fc
    .record(
      {
        name: fc.oneof(fc.string({ maxLength: 200 }), fc.anything()),
        message: fc.oneof(fc.string({ maxLength: 1000 }), fc.constant("Script error."), fc.anything()),
        stack: fc.oneof(fc.string({ maxLength: 3000 }), fc.anything()),
        path: fc.oneof(
          fc.webPath({ size: "large" }),
          fc.webUrl({ withQueryParameters: true, withFragments: true }),
          fc.constant("//evil.example/x"),
          fc.string({ maxLength: 300 }).map((s) => `/${s}`)
        ),
        kind: fc.oneof(fc.constantFrom(...CLIENT_ERROR_KINDS), fc.string()),
      },
      { requiredKeys: [] }
    )
    .map((o) => JSON.stringify(o));

  it("never throws, and anything it accepts is bounded, on this site, and without a query", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json(), nearlyValid), (text) => {
        const report = parseClientError(text);
        if (report === null) return;
        expect(report.name.length).toBeLessThanOrEqual(80);
        expect(report.message.length).toBeGreaterThan(0);
        expect(report.message.length).toBeLessThanOrEqual(500);
        expect(report.message).not.toMatch(/^script error\.?$/i);
        expect(report.stack === null || report.stack.length <= 2000).toBe(true);
        expect(report.path).toMatch(/^\/(?!\/)/);
        expect(report.path).not.toMatch(/[?#]/);
        expect(report.path.length).toBeLessThanOrEqual(200);
        expect(CLIENT_ERROR_KINDS).toContain(report.kind);
      })
    );
  });
});
