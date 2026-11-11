import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertDatabaseAllowed } from "@/lib/db-guard";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Production (and any neon.tech URL) uses Neon's HTTP driver. A plain Postgres
// URL — e.g. the throwaway Postgres used in CI/E2E — uses the standard pg
// adapter. Detection is by URL host, so production behaviour is unchanged.
function createClient() {
  // Off Vercel, a remote database must be named in DATABASE_ALLOW_HOST
  // (lib/db-guard.ts), so a laptop can't reach production by accident.
  assertDatabaseAllowed(process.env, "app");
  const url = process.env.DATABASE_URL!;
  const isNeon = /neon\.tech/i.test(url);
  const adapter = isNeon ? new PrismaNeonHttp(url, {}) : new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
