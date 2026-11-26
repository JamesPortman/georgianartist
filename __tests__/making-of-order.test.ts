import { describe, it, expect, vi } from "vitest";

// Ordered by title A to Z (owner's choice, Nov 2026), in code rather than by
// the query, so the order doesn't depend on the database's collation.
const rows = vi.hoisted(() => ({
  films: [] as { title: string }[],
  asked: null as unknown,
}));
vi.mock("@/lib/catalogue-cache", () => ({
  catalogue: {
    makingOf: {
      findMany: async (args: unknown) => {
        rows.asked = args;
        return rows.films;
      },
    },
  },
}));

const { byTitle, getMakingOfFilms } = await import("../lib/making-of");
const titles = (xs: { title: string }[]) => xs.map((x) => x.title);

describe("the Making Of films' order", () => {
  it("is alphabetical by title, whatever order the records come in", async () => {
    rows.films = [{ title: "Scenic Caves" }, { title: "Bridal Veil Falls" }, { title: "Lora Bay" }];
    expect(titles(await getMakingOfFilms())).toEqual(["Bridal Veil Falls", "Lora Bay", "Scenic Caves"]);
  });

  it("asks only for the films that are showing", async () => {
    rows.films = [];
    await getMakingOfFilms();
    expect(rows.asked).toMatchObject({ where: { visible: true } });
  });

  it("ignores case and accents, and puts numbers in counting order", () => {
    expect(
      titles(byTitle([{ title: "bruce Trail" }, { title: "Beaver River" }, { title: "Éugenia Falls" }, { title: "Craigleith" }]))
    ).toEqual(["Beaver River", "bruce Trail", "Craigleith", "Éugenia Falls"]);
    expect(titles(byTitle([{ title: "Point 10" }, { title: "Point 2" }]))).toEqual(["Point 2", "Point 10"]);
  });

  it("leaves the list it was given untouched", () => {
    const given = [{ title: "B" }, { title: "A" }];
    byTitle(given);
    expect(titles(given)).toEqual(["B", "A"]);
  });
});
