// Shared with lib/db-guard.ts, which keeps the app itself off production.
import { LOCAL_HOSTS, databaseHost } from "../lib/db-guard";
export { databaseHost };

/**
 * Refuse to run the E2E suite against anything but a throwaway database.
 *
 * The suite is destructive, and not incidentally so:
 *
 *   - `global-setup.ts` overwrites inspiration coordinates on four catalogue
 *     rows, and deliberately CLEARS the GPS on one of them as the negative case.
 *   - `upload.spec.ts` creates a real product, uploading a real image to Blob,
 *     then deletes it — and leaves both behind if it fails partway.
 *   - `zz-admin-manage.spec.ts` flips Visible / New / Sold on real products.
 *
 * Against the CI database that is all fine: `.github/workflows/e2e.yml` runs a
 * throwaway Postgres container and seeds it. Against a developer's `.env.local`
 * it is not fine at all — that points at production Neon, so `npm run test:e2e`
 * on a laptop edits the live catalogue. It has already happened: a run during
 * the making-of work moved three products' coordinates and blanked one photo's
 * real GPS. That one was caught and restored from a snapshot taken beforehand,
 * which is not a control — it is luck plus a habit.
 *
 * So the check is an allowlist of hosts that cannot be production, not a
 * denylist of hosts that look like it. A denylist has to be right about every
 * managed Postgres provider that will ever be used here; the allowlist only has
 * to be right about "is this my own machine", and fails closed on anything new.
 */


/** Set to "1" to run the destructive suite against a remote database anyway. */
export const OVERRIDE_ENV = "E2E_ALLOW_DESTRUCTIVE_DB";

/**
 * Whether this connection string is safe to let a destructive test suite at.
 *
 * Unparseable counts as unsafe. A URL this cannot read is one we cannot make
 * any promise about, and the failure mode of guessing wrong is editing a live
 * catalogue.
 */
export function isThrowawayDatabase(url: string | undefined): boolean {
  if (!url) return false;
  const host = databaseHost(url);
  return host !== null && LOCAL_HOSTS.has(host);
}

export function throwawayDatabaseMessage(url: string | undefined): string {
  const host = url ? (databaseHost(url) ?? "unreadable") : "unset";
  return [
    ``,
    `  E2E refused to start: DATABASE_URL points at "${host}".`,
    ``,
    `  This suite writes. It creates and deletes a product, uploads an image to`,
    `  Blob, flips Visible/New/Sold on real rows, and rewrites inspiration`,
    `  coordinates — including clearing one photo's GPS on purpose. Pointed at`,
    `  production that edits the live catalogue.`,
    ``,
    `  Run it against a throwaway Postgres instead:`,
    ``,
    `    docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres \\`,
    `      -e POSTGRES_DB=test --name gba-e2e postgres:16`,
    ``,
    `    export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test`,
    `    npm run db:push && npm run db:seed`,
    `    npm run dev            # same DATABASE_URL, separate shell`,
    `    npm run test:e2e`,
    ``,
    `  The dev server needs that DATABASE_URL too — it is what the specs browse.`,
    ``,
    `  If you genuinely mean to run this against a remote database, set`,
    `  ${OVERRIDE_ENV}=1. Read the list above again first.`,
    ``,
  ].join("\n");
}

/**
 * Throws unless the database is a throwaway, or the override is explicitly set.
 *
 * Both arguments are required and neither defaults to `process.env`. They did,
 * and it made the function untestable in the case that matters most: passing an
 * explicit `undefined` fires the default, so "DATABASE_URL is unset" silently
 * became "DATABASE_URL is whatever the runner has". That test passed on a
 * laptop with no DATABASE_URL and failed in CI, which is precisely backwards
 * for a guard whose whole job is to be right about the environment.
 */
export function assertThrowawayDatabase(
  url: string | undefined,
  override: string | undefined
): void {
  if (override === "1") {
    console.warn(
      `[e2e] ${OVERRIDE_ENV}=1 — running the destructive suite against ` +
        `"${databaseHost(url ?? "") ?? "unreadable"}". Hope that was deliberate.`
    );
    return;
  }
  if (!isThrowawayDatabase(url)) {
    throw new Error(throwawayDatabaseMessage(url));
  }
}
