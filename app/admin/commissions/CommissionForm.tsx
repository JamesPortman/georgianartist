"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { createCommissionAction, updateCommissionAction } from "@/app/actions/commissions";
import { processImageFile } from "../products/imageProcessing";
import { COMMISSION_KINDS, EXAMPLE_MAX, KIND_LABEL } from "@/lib/commissions";

export type CommissionFormValues = {
  id: string;
  kind: string;
  name: string;
  subject: string | null;
  medium: string | null;
  size: string | null;
  image: string;
  visible: boolean;
};

const input =
  "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand";

/** Add (no `example`) or edit an example. */
export default function CommissionForm({ example }: { example?: CommissionFormValues }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(example?.image ?? null);
  const [blurDataURL, setBlurDataURL] = useState("");
  const [processing, setProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) =>
      (await (example ? updateCommissionAction(example.id, formData) : createCommissionAction(formData))) ?? null,
    null
  );

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setFileError(null);
    try {
      // HEIC to JPEG and downscaled in the browser, as for products, so the
      // upload stays under the server action's body limit.
      const processed = await processImageFile(file, ["landscape"]);
      setBlurDataURL(processed.blurDataURL);
      const dt = new DataTransfer();
      dt.items.add(processed.file);
      if (fileRef.current) fileRef.current.files = dt.files;
      setPreview(URL.createObjectURL(processed.file));
    } catch {
      setFileError("Couldn't read that image. Please upload a JPEG, PNG, or HEIC photo.");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form action={action} className="bg-white rounded-lg shadow-sm p-6 space-y-5">
      <input type="hidden" name="blurDataURL" value={blurDataURL} />

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">Kind</legend>
        <div className="flex gap-4">
          {COMMISSION_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="kind"
                value={k}
                defaultChecked={(example?.kind ?? "pet") === k}
                className="accent-brand"
              />
              {KIND_LABEL[k].replace(/s$/, "")}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-1">
          Image of the painting {!example && <span className="text-red-500">*</span>}
        </label>
        <input
          ref={fileRef}
          id="image"
          name="image"
          type="file"
          accept="image/*"
          required={!example}
          onChange={onFileChange}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white file:text-sm hover:file:bg-brand-hover"
        />
        <p className="mt-1 text-xs text-gray-500">
          Any location data in the file is removed, and your copyright is added.
          {example && " Leave empty to keep the current image."}
        </p>
        {processing && <p className="mt-2 text-xs text-gray-500">Processing image…</p>}
        {fileError && <p className="mt-2 text-sm text-red-600">{fileError}</p>}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="preview" className="mt-3 max-h-48 rounded border border-gray-200" />
        )}
      </div>

      <Text name="name" label="Subject's name" hint="e.g. Bailey. Never the client's name." required value={example?.name} />
      <Text name="subject" label="What they are" hint="e.g. Golden retriever" value={example?.subject} />
      <Text name="medium" label="Medium" hint="e.g. Oil on canvas" value={example?.medium} />
      <Text name="size" label="Size" hint="e.g. 12 x 16 in" value={example?.size} />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="visible" defaultChecked={example?.visible ?? false} className="accent-brand" />
        Visible on the site (only once the client has said yes)
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || processing}
          className="bg-brand text-white px-5 py-2 rounded text-sm font-medium hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : example ? "Save changes" : "Add example"}
        </button>
        <Link href="/admin/commissions" className="text-sm text-gray-600 underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Text({
  name,
  label,
  hint,
  required,
  value,
}: {
  name: keyof typeof EXAMPLE_MAX;
  label: string;
  hint: string;
  required?: boolean;
  value?: string | null;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        required={required}
        maxLength={EXAMPLE_MAX[name]}
        defaultValue={value ?? ""}
        className={input}
      />
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}
