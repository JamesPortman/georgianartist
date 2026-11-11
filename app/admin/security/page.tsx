import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth, logoutAction } from "@/app/actions/admin";
import { passwordLoginAllowed } from "@/lib/passkey";
import { siteConfig } from "@/data/siteConfig";
import PasskeysClient from "./PasskeysClient";

export const metadata = { title: "Security | Admin" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireAuth();
  const passkeys = await prisma.adminPasskey.findMany({ orderBy: { createdAt: "asc" } });
  const passwordOn = passwordLoginAllowed(passkeys.length);
  const breakGlass = passkeys.length > 0 && passwordOn;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-brand text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">{siteConfig.brand} · Admin</h1>
          <nav className="hidden sm:flex gap-4 text-sm text-white/80">
            <Link href="/admin/products" className="hover:text-white">Products</Link>
            <Link href="/admin/instagram" className="hover:text-white">Instagram</Link>
            <Link href="/admin/analytics" className="hover:text-white">Analytics</Link>
            <span className="text-white font-medium">Security</span>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-white/80 hover:text-white underline">Sign out</button>
        </form>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Signing in</h2>
          {passkeys.length === 0 ? (
            <p className="text-sm text-gray-700">
              The admin signs in with the <strong>password</strong>. Add a passkey below and the
              password stops working: from then on it&rsquo;s Touch ID, Face ID or your
              device&rsquo;s passkey, which can&rsquo;t be phished or guessed.
            </p>
          ) : breakGlass ? (
            <p className="text-sm text-amber-800">
              <strong>Password sign-in is on as a break-glass</strong> (<code>ADMIN_PASSWORD_LOGIN=1</code>{" "}
              in Vercel). Remove that variable and redeploy once you can sign in with a passkey again.
            </p>
          ) : (
            <p className="text-sm text-gray-700">
              The admin signs in with a <strong>passkey</strong>; the password no longer works. If
              every device below is lost, set <code>ADMIN_PASSWORD_LOGIN=1</code> in Vercel to
              switch the password back on, sign in, register a new passkey, then remove the
              variable.
            </p>
          )}
        </section>

        <PasskeysClient
          passkeys={passkeys.map((p) => ({
            id: p.id,
            label: p.label,
            synced: p.deviceType === "multiDevice" || p.backedUp,
            createdAt: p.createdAt.toISOString(),
            lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </main>
    </div>
  );
}
