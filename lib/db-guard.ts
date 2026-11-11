/**
 * Keeps a laptop off the production database by default.
 *
 * `lib/db.ts` calls this before it builds the Prisma client, so the dev server
 * and a local `next start` refuse a remote database they haven't been told
 * about. The scripts in `scripts/` build their own clients and call it first
 * themselves; `__tests__/db-guard.test.ts` fails the build if one doesn't. Local `.env` pointed at production Neon for most of this site's
 * life, and an E2E run once edited the live catalogue that way;
 * `e2e/db-guard.ts` closed that one door, this closes the rest.
 *
 * Same shape as the E2E guard: an allowlist, failing closed. Allowed are
 *
 *   - a Vercel production deployment, the one place production is meant to
 *     be reached;
 *   - a Vercel PREVIEW only when it can show it is not on production: its
 *     DATABASE_URL must be a different Neon endpoint from PRODUCTION_DATABASE_HOST,
 *     and that must be set (Neon's preview branching gives each preview its own
 *     branch; without it, previews inherit production's DATABASE_URL);
 *   - no DATABASE_URL at all (unit tests mock the client; nothing to reach);
 *   - a database on this machine (localhost, CI's throwaway Postgres);
 *   - the one remote host named in DATABASE_ALLOW_HOST — a Neon dev branch in
 *     `.env.local`, or production itself, typed inline for a deliberate run:
 *       DATABASE_ALLOW_HOST=ep-….neon.tech npm run db:export
 *
 * A denylist of production's host would need production's host on every
 * laptop to work, and would fail open on a laptop that didn't have it.
 *
 * "On Vercel" can't be read from VERCEL alone: `vercel env pull` writes
 * VERCEL="1" and VERCEL_ENV into the file it creates, so a laptop that sources
 * a pulled production file, or a dev server reading a pulled .env.local, looked
 * like a deployment and skipped every check (seen 7 Oct 2026, when a sourced
 * production pull reached the database with nothing named). So each caller
 * says where it runs, and the Vercel exemption is narrowed to match:
 *
 *   - "script" (the default): a hand-run script under scripts/. Never on Vercel,
 *     so VERCEL is ignored and only the local/named rules apply.
 *   - "build": the build's own check (scripts/assert-build-database.ts). Trusts
 *     VERCEL only alongside CI="1", which Vercel's build sets and a pulled file
 *     doesn't.
 *   - "app": lib/db.ts. Trusts VERCEL except under `next dev`
 *     (NODE_ENV=development), which no deployment runs.
 */

/** Hosts that are, by definition, not someone's production database. */
export const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Names the one remote database host this machine may connect to. */
export const ALLOW_HOST_ENV = "DATABASE_ALLOW_HOST";

/** The host in a Postgres connection string, or null if it can't be read. */
export function databaseHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (!host) return null;
    // WHATWG URL brackets IPv6 literals; the allowlist stores them bare.
    return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  } catch {
    return null;
  }
}

type GuardEnv = Record<string, string | undefined> & {
  DATABASE_URL?: string;
  VERCEL?: string;
  CI?: string;
  NODE_ENV?: string;
  DATABASE_ALLOW_HOST?: string;
};

/**
 * The Neon endpoint a host belongs to: "ep-cool-name-123-pooler.us-east-2.aws.neon.tech"
 * and "ep-cool-name-123.us-east-2.aws.neon.tech" are the same database.
 */
export function neonEndpoint(host: string): string {
  return (host.toLowerCase().split(".")[0] ?? "").replace(/-pooler$/, "");
}

/** On a Vercel preview: null if its database is provably not production. */
export function previewRefusal(env: GuardEnv): string | null {
  const host = env.DATABASE_URL ? databaseHost(env.DATABASE_URL) : null;
  const prod = env.PRODUCTION_DATABASE_HOST?.trim();
  if (!prod) {
    return [
      "Refusing to use a database on a preview deployment: PRODUCTION_DATABASE_HOST is not set,",
      "so this can't tell whether DATABASE_URL is production. Set it (all environments) to",
      "production's Neon host, and turn on the Neon integration's preview branching.",
    ].join("\n");
  }
  if (!host) return "Refusing: this preview's DATABASE_URL is missing or unreadable.";
  if (neonEndpoint(host) === neonEndpoint(prod)) {
    return [
      `Refusing: this preview's DATABASE_URL is production (${host}). Previews must get their`,
      "own Neon branch: Vercel → Storage → Neon → enable preview branching, then redeploy.",
    ].join("\n");
  }
  return null;
}

/** Where the caller runs; decides when VERCEL="1" can be believed (see above). */
export type GuardContext = "script" | "build" | "app";

/** True when this really is a Vercel deployment or build, not a pulled env file. */
export function onVercel(env: GuardEnv, where: GuardContext): boolean {
  if (env.VERCEL !== "1") return false;
  if (where === "build") return env.CI === "1";
  if (where === "app") return env.NODE_ENV !== "development";
  return false;
}

/** Null when the connection is allowed, otherwise why it isn't. */
export function databaseRefusal(env: GuardEnv, where: GuardContext = "script"): string | null {
  const url = env.DATABASE_URL;
  if (onVercel(env, where)) return env.VERCEL_ENV === "preview" ? previewRefusal(env) : null;
  if (!url) return null;

  const host = databaseHost(url);
  if (host !== null && LOCAL_HOSTS.has(host)) return null;
  const allowed = env.DATABASE_ALLOW_HOST?.trim().toLowerCase();
  if (host !== null && allowed && host.toLowerCase() === allowed) return null;

  return [
    `Refusing to connect: DATABASE_URL points at "${host ?? "an unreadable URL"}", a remote`,
    `database, and this isn't Vercel. Locally, use a Neon dev branch or a local Postgres,`,
    `and name it so this knows it was meant:`,
    ``,
    `  ${ALLOW_HOST_ENV}=<that branch's host>   # in .env.local, next to its DATABASE_URL`,
    ``,
    `To run something against production on purpose, name production's host for that`,
    `one command: ${ALLOW_HOST_ENV}=<production host> npm run …`,
  ].join("\n");
}

/** Throws unless this process may connect to DATABASE_URL (see above). */
export function assertDatabaseAllowed(env: GuardEnv = process.env, where: GuardContext = "script"): void {
  const refusal = databaseRefusal(env, where);
  if (refusal) throw new Error(refusal);
}
