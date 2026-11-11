/**
 * Run by `npm run build` immediately before `prisma db push`.
 *
 * The push writes the schema to whatever DATABASE_URL names, and the Prisma CLI
 * doesn't go through lib/db.ts, so it skipped the guard there. This applies the
 * same rule (lib/db-guard.ts) first: a laptop build can't push to a remote
 * database it hasn't named, and a Vercel preview can't push to production.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] }); // as prisma.config.ts, so it checks the URL the push will use
import { databaseRefusal } from "../lib/db-guard";

const refusal = databaseRefusal(process.env, "build");
if (refusal) {
  console.error(`\nBuild stopped before \`prisma db push\`:\n${refusal}\n`);
  process.exit(1);
}
