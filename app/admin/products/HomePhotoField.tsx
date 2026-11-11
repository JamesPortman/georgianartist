"use client";

import { useRef, useState } from "react";
import { convertAndResize } from "./imageProcessing";

/**
 * A collector's own photo of the painting hanging in their home, and how they
 * asked to be credited. Paintings only.
 *
 * On the work's page it replaces the generated "In a Room" mockup: a real wall
 * in a real house is the strongest answer to "how would this look in mine?",
 * and showing both would put the staged version next to the one that isn't.
 *
 * The photo goes through the same in-browser resize as every other upload,
 * which also discards its EXIF — worth knowing, because a phone photo taken in
 * someone's kitchen carries their home's GPS. The server strips it again.
 *
 * Submits `homePhoto` (file), `homePhotoCredit`, and — when editing a work that
 * already has one — `removeHomePhoto`.
 */
export default function HomePhotoField({
  initialImage = null,
  initialCredit = null,
  onProcessingChange,
}: {
  initialImage?: string | null;
  initialCredit?: string | null;
  /** Lifts the converting state so the parent can hold Save until the resized
   *  JPEG replaces the raw file in the input. */
  onProcessingChange?: (processing: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [credit, setCredit] = useState(initialCredit ?? "");
  const [remove, setRemove] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setBusy(busy: boolean) {
    setProcessing(busy);
    onProcessingChange?.(busy);
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clear the raw selection at once, as InspirationField does: a large
    // original posted by an impatient Save is rejected at the body-size limit.
    if (fileRef.current) fileRef.current.value = "";
    setBusy(true);
    setErr(null);
    try {
      const resized = await convertAndResize(file);
      const dt = new DataTransfer();
      dt.items.add(resized);
      if (fileRef.current) fileRef.current.files = dt.files;
      setPreview(URL.createObjectURL(resized));
      setRemove(false);
    } catch {
      setErr("Couldn't read that image. Use a JPEG, PNG, or HEIC photo.");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-5 space-y-3">
      <p className="text-sm font-medium text-gray-700">
        In a collector&rsquo;s home{" "}
        <span className="font-normal text-gray-400">
          (optional, their photo of this painting on their wall)
        </span>
      </p>
      <p className="text-xs text-gray-500">
        Replaces the generated room mockup on the painting&rsquo;s page. Crop it to 4:3 first:
        the page shows it in a 4:3 frame and cuts off anything that doesn&rsquo;t fit.
      </p>

      <input
        ref={fileRef}
        name="homePhoto"
        type="file"
        accept="image/*"
        onChange={onChange}
        className="block w-full text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-brand file:px-2 file:py-1 file:text-white file:text-xs hover:file:bg-brand-hover"
      />
      {processing && <p className="text-xs text-gray-400">Processing…</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}

      {preview && !remove && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="collector's photo preview"
          className="max-h-40 rounded border border-gray-200"
        />
      )}

      <div>
        <label htmlFor="homePhotoCredit" className="block text-xs font-medium text-gray-600 mb-1">
          Credit
        </label>
        <input
          id="homePhotoCredit"
          name="homePhotoCredit"
          type="text"
          value={credit}
          onChange={(e) => setCredit(e.target.value)}
          disabled={remove}
          placeholder="e.g. Gino C. (however they asked to be named)"
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand disabled:bg-gray-50 disabled:text-gray-400"
        />
        <p className="text-xs text-gray-400 mt-1">
          Leave blank if they&rsquo;d rather not be named.
        </p>
      </div>

      {/* Only when there is something to remove. It is someone else's photo of
          their own home, and they are entitled to ask for it back. */}
      {initialImage && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            name="removeHomePhoto"
            checked={remove}
            onChange={(e) => setRemove(e.target.checked)}
            className="w-4 h-4 accent-brand"
          />
          Remove this photo
        </label>
      )}
    </div>
  );
}
