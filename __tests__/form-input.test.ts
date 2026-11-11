import { describe, it, expect } from "vitest";
import { checkFields, readFormBody, FIELD_MAX, MAX_BODY_BYTES } from "../lib/form-input";

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers });

describe("readFormBody", () => {
  it("accepts a JSON object", async () => {
    expect(await readFormBody(req(JSON.stringify({ name: "Jane Smith" })))).toEqual({ ok: true, body: { name: "Jane Smith" } });
  });

  it("refuses a body over the cap before parsing it", async () => {
    const r = await readFormBody(req(JSON.stringify({ message: "x".repeat(MAX_BODY_BYTES) })));
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("trusts a declared oversize length without reading the body", async () => {
    const r = await readFormBody(req("{}", { "content-length": String(MAX_BODY_BYTES + 1) }));
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses what isn't a JSON object", async () => {
    for (const body of ["not json", "[1,2]", "null", '"text"']) {
      expect(await readFormBody(req(body))).toEqual({ ok: false, status: 400, error: "Malformed request." });
    }
  });

  it("accepts a body of exactly the cap, counted in bytes", async () => {
    const wrapper = JSON.stringify({ message: "" }).length;
    const body = JSON.stringify({ message: "x".repeat(MAX_BODY_BYTES - wrapper) });
    expect(new TextEncoder().encode(body).length).toBe(MAX_BODY_BYTES);
    expect(await readFormBody(req(body))).toMatchObject({ ok: true });
    expect(await readFormBody(req(body, { "content-length": String(MAX_BODY_BYTES) }))).toMatchObject({ ok: true });
  });

  it("tells the visitor to shorten an oversize body", async () => {
    const r = await readFormBody(req("{}", { "content-length": String(MAX_BODY_BYTES + 1) }));
    expect(r).toEqual({ ok: false, status: 413, error: "That's too long to send. Please shorten it and try again." });
  });
});

describe("checkFields", () => {
  it("passes text within its limit, and absent or empty fields", () => {
    expect(checkFields({ name: "Jane Smith", message: "" }, ["name", "message", "phone"])).toBeNull();
  });

  it("passes a null field, and text of exactly its limit", () => {
    expect(checkFields({ phone: null }, ["phone"])).toBeNull();
    expect(checkFields({ name: "x".repeat(FIELD_MAX.name) }, ["name"])).toBeNull();
  });

  it("calls an over-long note a note", () => {
    expect(checkFields({ notes: "x".repeat(FIELD_MAX.notes + 1) }, ["notes"])).toBe(
      "That note is too long. Please keep it under 3,000 characters."
    );
    expect(checkFields({ name: "x".repeat(FIELD_MAX.name + 1) }, ["name"])).toBe(
      "That name is too long. Please keep it under 100 characters."
    );
  });

  it("refuses text over its limit, naming the field and the limit", () => {
    const msg = checkFields({ message: "x".repeat(FIELD_MAX.message + 1) }, ["message"]);
    expect(msg).toMatch(/message is too long/);
    expect(msg).toMatch(/5,000/);
  });

  it("refuses a field that isn't text rather than crashing on it", () => {
    for (const bad of [{}, [], 42, true]) {
      expect(checkFields({ name: bad }, ["name"])).toBe("Malformed request.");
    }
  });
});
