"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { updateProductAction } from "@/app/actions/admin";
import { processImageFile } from "../imageProcessing";
import InspirationField from "../InspirationField";
import HomePhotoField from "../HomePhotoField";
import LocationField from "../LocationField";
import { isMediaUrl } from "@/lib/private-blob";

export type EditProduct = {
  id: string;
  slug: string | null;
  type: string;
  title: string;
  description: string | null;
  image: string;
  category: string;
  sizeType: string;
  price: number;
  isNew: boolean;
  onSale: boolean;
  soldOut: boolean;
  visible: boolean;
  naturalWidth: number | null;
  naturalHeight: number | null;
  inspirationImage: string | null;
  inspirationLat: number | null;
  inspirationLng: number | null;
  homePhoto: string | null;
  homePhotoCredit: string | null;
};

export default function EditProductForm({
  product,
  sizeTypes,
}: {
  product: EditProduct;
  sizeTypes: string[];
}) {
  const isPhoto = product.type === "photograph";
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState(product.image);
  const [replaced, setReplaced] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [natW, setNatW] = useState<number | null>(product.naturalWidth);
  const [natH, setNatH] = useState<number | null>(product.naturalHeight);
  const [blurDataURL, setBlurDataURL] = useState("");
  const [inspProcessing, setInspProcessing] = useState(false);
  const [homeProcessing, setHomeProcessing] = useState(false);

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await updateProductAction(product.id, formData);
      return result ?? null;
    },
    null
  );

  async function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setFileError(null);
    try {
      const processed = await processImageFile(file, sizeTypes);
      setNatW(processed.width);
      setNatH(processed.height);
      setBlurDataURL(processed.blurDataURL);
      const dt = new DataTransfer();
      dt.items.add(processed.file);
      if (fileRef.current) fileRef.current.files = dt.files;
      setPreview(URL.createObjectURL(processed.file));
      setReplaced(true);
    } catch {
      setFileError("Couldn't read that image. Please upload a JPEG, PNG, or HEIC photo.");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setProcessing(false);
    }
  }

  const isBlobPreview = preview.startsWith("blob:");

  return (
    <form action={action} className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* hidden dimensions (updated when the image is replaced) */}
      <input type="hidden" name="naturalWidth" value={natW ?? ""} />
      <input type="hidden" name="naturalHeight" value={natH ?? ""} />
      <input type="hidden" name="blurDataURL" value={blurDataURL} />

      {/* Preview + replace */}
      <div className="md:col-span-1">
        <div className="relative w-full aspect-[4/3] bg-gray-200 rounded-lg overflow-hidden">
          {isBlobPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={product.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Image
              src={preview}
              alt={product.title}
              fill
              className="object-cover"
              sizes="300px"
              // A hidden work's upload is served only to the signed-in admin, and the
              // optimiser fetches without the admin's cookie (app/media).
              unoptimized={isMediaUrl(preview)}
            />
          )}
        </div>

        <label className="mt-3 block">
          <span className="block text-sm font-medium text-gray-700 mb-1">Replace image</span>
          <input
            ref={fileRef}
            name="image"
            type="file"
            accept="image/*"
            onChange={onReplace}
            className="block w-full text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-brand file:px-2 file:py-1 file:text-white file:text-xs hover:file:bg-brand-hover"
          />
        </label>
        {processing && <p className="mt-1 text-xs text-gray-400">Processing image…</p>}
        {replaced && !processing && <p className="mt-1 text-xs text-brand">New image ready. Save to apply.</p>}
        {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
        <p className="text-xs text-gray-400 mt-2 break-all">ID: {product.id}</p>
      </div>

      {/* Fields */}
      <div className="md:col-span-2 space-y-5">
        <Field label="Title" name="title" defaultValue={product.title} required />

        <div>
          <Field label="URL slug" name="slug" defaultValue={product.slug ?? product.id} required />
          <p className="mt-1 text-xs text-gray-500">
            The page&apos;s address: {product.type === "photograph" ? "/photographs/" : "/products/"}
            <span className="font-mono">slug</span>. Changing it moves the page; the old address
            keeps redirecting. The work&apos;s id ({product.id}) never changes.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={product.description ?? ""}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
          />
        </div>

        <Field label="Category" name="category" defaultValue={product.category} required />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size type</label>
            <select
              name="sizeType"
              defaultValue={product.sizeType}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              {sizeTypes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <Field label="Base price (CA$)" name="price" type="number" defaultValue={String(product.price)} required />
        </div>

        {isPhoto && natW && natH && (
          <p className="text-xs text-gray-400">
            Stored dimensions: {natW}×{natH}px{replaced ? " (from new image)" : ""}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
          <Checkbox label="On sale" name="onSale" checked={product.onSale} />
          <Checkbox label="New arrival" name="isNew" checked={product.isNew} />
          {/* The update action reads soldOut from this form, so it has to be
              here. Before it was, saving any edit on a sold-out work sent no
              soldOut field, which reads as false — and quietly put the work
              back on sale. */}
          <Checkbox label="Sold out" name="soldOut" checked={product.soldOut} />
          <Checkbox label="Visible" name="visible" checked={product.visible} />
        </div>

        {isPhoto ? (
          <LocationField
            initialLat={product.inspirationLat}
            initialLng={product.inspirationLng}
          />
        ) : (
          <>
            <InspirationField
              initialImage={product.inspirationImage}
              initialLat={product.inspirationLat}
              initialLng={product.inspirationLng}
              onProcessingChange={setInspProcessing}
            />
            <HomePhotoField
              initialImage={product.homePhoto}
              initialCredit={product.homePhotoCredit}
              onProcessingChange={setHomeProcessing}
            />
          </>
        )}

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending || processing || inspProcessing || homeProcessing}
            className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded text-sm transition-colors disabled:opacity-60"
          >
            {pending ? "Saving…" : inspProcessing || homeProcessing ? "Processing photo…" : "Save changes"}
          </button>
          <Link
            href="/admin/products"
            className="px-4 py-2.5 border border-gray-300 rounded text-sm text-gray-600 hover:border-gray-400 transition-colors text-center"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

function Checkbox({ label, name, checked }: { label: string; name: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
      <input type="checkbox" name={name} defaultChecked={checked} className="w-4 h-4 accent-brand" />
      {label}
    </label>
  );
}
