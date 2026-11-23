import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/app/actions/admin";
import CommissionForm from "../CommissionForm";

export const metadata = { title: "Edit commission example | Admin" };
export const dynamic = "force-dynamic";

export default async function EditCommissionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const e = await prisma.commissionExample.findUnique({ where: { id } });
  if (!e) notFound();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white px-6 py-4 flex items-center gap-4">
        <Link href="/admin/commissions" className="text-white/80 hover:text-white text-sm">
          ← Commissions
        </Link>
        <h1 className="text-lg font-semibold">Edit {e.name}</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <CommissionForm
          example={{
            id: e.id,
            kind: e.kind,
            name: e.name,
            subject: e.subject,
            medium: e.medium,
            size: e.size,
            image: e.image,
            visible: e.visible,
          }}
        />
      </main>
    </div>
  );
}
