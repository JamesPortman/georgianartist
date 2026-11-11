import { requireAuth } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { sizeOptions } from "@/data/products";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditProductForm, { type EditProduct } from "./EditProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  const sizeTypes = Object.keys(sizeOptions);

  const data: EditProduct = {
    id: product.id,
    slug: product.slug,
    type: product.type,
    title: product.title,
    description: product.description,
    image: product.image,
    category: product.category,
    sizeType: product.sizeType,
    price: product.price,
    isNew: product.isNew,
    onSale: product.onSale,
    soldOut: product.soldOut,
    visible: product.visible,
    naturalWidth: product.naturalWidth,
    naturalHeight: product.naturalHeight,
    inspirationImage: product.inspirationImage,
    inspirationLat: product.inspirationLat,
    inspirationLng: product.inspirationLng,
    homePhoto: product.homePhoto,
    homePhotoCredit: product.homePhotoCredit,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white px-6 py-4 flex items-center gap-4">
        <Link href="/admin/products" className="text-white/80 hover:text-white text-sm">
          ← Products
        </Link>
        <h1 className="text-lg font-semibold">
          Edit {product.type === "photograph" ? "Photograph" : "Painting"}
        </h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <EditProductForm product={data} sizeTypes={sizeTypes} />
      </main>
    </div>
  );
}
