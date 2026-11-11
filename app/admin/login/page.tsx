import { getAdminSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { passwordLoginAllowed } from "@/lib/passkey";
import LoginForm from "./LoginForm";

export const metadata = { title: "Admin Login" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session.isLoggedIn) redirect("/admin/products");

  // Offer what will actually work: the passkey once one is registered, the
  // password only until then (or with the break-glass on — lib/passkey.ts).
  const passkeys = await prisma.adminPasskey.count().catch(() => 0);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-xl font-semibold text-gray-800 mb-6 text-center">
          Admin Login
        </h1>
        <LoginForm passkey={passkeys > 0} password={passwordLoginAllowed(passkeys)} />
      </div>
    </div>
  );
}
