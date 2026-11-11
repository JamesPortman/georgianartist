"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { createProductAction } from "@/app/actions/admin";
import { processImageFile, readGps } from "../imageProcessing";
import InspirationField from "../InspirationField";
import HomePhotoField from "../HomePhotoField";
import LocationField, { type Gps } from "../LocationField";

export default function NewProductForm({
  sizeTypes,
  standardPrices,
}: {
  sizeTypes: string[];
  standardPrices: Record<string, number>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<"painting" | "photograph">("painting");
  const [preview, setPreview] = useState<string | null>(null);
  const [sizeType, setSizeType] = useState("");
  const [price, setPrice] = useState("");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [finalDims, setFinalDims] = useState<{ w: number; h: number } | null>(null);
  const [blurDataURL, setBlurDataURL] = useState("");
  const [processing, setProcessing] = useState(false);
  const [inspProcessing, setInspProcessing] = useState(false);
  const [homeProcessing, setHomeProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [photoGps, setPhotoGps] = useState<Gps>(null);

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createProductAction(formData);
      return result ?? null;
    },
    null
  );

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setFileError(null);
    setDims(null);
    setFinalDims(null);
    setPreview(null);
    try {
      // Read GPS from the original before processing — the canvas resize strips
      // EXIF. Read regardless of type (the type radio may be switched after) and
      // only surfaced for photographs.
      setPhotoGps(await readGps(file));

      const processed = await processImageFile(file, sizeTypes);
      setDims({ w: processed.width, h: processed.height });
      setFinalDims({ w: processed.width, h: processed.height });
      setBlurDataURL(processed.blurDataURL);

      // Auto-detect size type + standard price from the aspect ratio.
      setSizeType(processed.sizeType);
      setPrice(String(standardPrices[processed.sizeType] ?? ""));

      // Swap the processed (HEIC→JPEG, downscaled) file back into the input so
      // the form submits the small, web-viewable version.
      const dt = new DataTransfer();
      dt.items.add(processed.file);
      if (fileRef.current) fileRef.current.files = dt.files;

      setPreview(URL.createObjectURL(processed.file));
    } catch {
      setFileError(
        "Couldn't read that image. Please upload a JPEG, PNG, or HEIC photo."
      );
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setProcessing(false);
    }
  }

  // When the user changes size type manually, refresh the standard price.
  function onSizeTypeChange(value: string) {
    setSizeType(value);
    if (standardPrices[value] != null) setPrice(String(standardPrices[value]));
  }

  return (
    <form action={action} className="bg-white rounded-lg shadow-sm p-6 space-y-5">
      {/* Dimensions computed in the browser — avoids running sharp on the server */}
      <input type="hidden" name="naturalWidth" value={finalDims?.w ?? ""} />
      <input type="hidden" name="naturalHeight" value={finalDims?.h ?? ""} />
      <input type="hidden" name="blurDataURL" value={blurDataURL} />

      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <div className="flex gap-4">
          {(["painting", "photograph"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="accent-brand"
              />
              {t === "painting" ? "Painting" : "Photograph"}
            </label>
          ))}
        </div>
      </div>

      {/* Image */}
      <div>
        <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-1">
          Image <span className="text-red-500">*</span>
        </label>
        <input
          ref={fileRef}
          id="image"
          name="image"
          type="file"
          accept="image/*"
          required
          onChange={onFileChange}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white file:text-sm hover:file:bg-brand-hover"
        />
        {processing && <p className="mt-2 text-xs text-gray-400">Processing image…</p>}
        {fileError && <p className="mt-2 text-sm text-red-600">{fileError}</p>}
        {dims && (
          <p className="mt-2 text-xs text-gray-500">
            Detected {dims.w}×{dims.h}px → size type{" "}
            <span className="font-medium text-brand">{sizeType}</span>, standard price{" "}
            <span className="font-medium text-brand">CA${price}</span>. Adjust below if needed.
          </p>
        )}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="preview" className="mt-3 max-h-48 rounded border border-gray-200" />
        )}
      </div>

      <Field label="Title" name="title" required />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
        />
      </div>
      <Field label="Category" name="category" required />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Size type <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400">(auto-detected)</span>
          </label>
          <select
            name="sizeType"
            required
            value={sizeType}
            onChange={(e) => onSizeTypeChange(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand"
          >
            <option value="" disabled>
              Choose an image first…
            </option>
            {sizeTypes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base price (CA$) <span className="text-red-500">*</span>
          </label>
          <input
            name="price"
            type="number"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="flex gap-6 pt-1">
        <Checkbox label="Visible" name="visible" defaultChecked />
        <Checkbox label="On sale" name="onSale" />
        <Checkbox label="New arrival" name="isNew" />
        {/* So a work can be added already sold out. Without it the only route
            was create-then-toggle, and the work sat priced and buyable in the
            meantime. */}
        <Checkbox label="Sold out" name="soldOut" />
      </div>

      {type === "painting" ? (
        <>
          <InspirationField onProcessingChange={setInspProcessing} />
          <HomePhotoField onProcessingChange={setHomeProcessing} />
        </>
      ) : (
        <LocationField autoGps={photoGps} />
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || processing || inspProcessing || homeProcessing || !finalDims}
          className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded text-sm transition-colors disabled:opacity-60"
        >
          {pending ? "Saving…" : processing || inspProcessing || homeProcessing ? "Processing…" : "Create product"}
        </button>
        <Link
          href="/admin/products"
          className="px-4 py-2.5 border border-gray-300 rounded text-sm text-gray-600 hover:border-gray-400 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        name={name}
        type="text"
        required={required}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

function Checkbox({
  label,
  name,
  defaultChecked = false,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="w-4 h-4 accent-brand" />
      {label}
    </label>
  );
}
