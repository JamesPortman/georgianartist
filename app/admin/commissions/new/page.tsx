import Link from "next/link";
import { requireAuth } from "@/app/actions/admin";
import CommissionForm from "../CommissionForm";

export const metadata = { title: "Add commission example | Admin" };
export const dynamic = "force-dynamic";

export default async function NewCommissionPage() {
  await requireAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white px-6 py-4 flex items-center gap-4">
        <Link href="/admin/commissions" className="text-white/80 hover:text-white text-sm">
          ← Commissions
        </Link>
        <h1 className="text-lg font-semibold">Add example</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <CommissionForm />
      </main>
    </div>
  );
}
