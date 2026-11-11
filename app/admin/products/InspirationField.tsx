"use client";

import { useRef, useState } from "react";
import { convertAndResize, readGps } from "./imageProcessing";

/**
 * Optional "Inspiration" input for paintings: upload the photo behind the
 * painting; GPS auto-fills from the photo's EXIF (editable). Submits
 * inspirationImage (file), inspirationLat, inspirationLng within the parent form.
 */
export default function InspirationField({
  initialImage = null,
  initialLat = null,
  initialLng = null,
  onProcessingChange,
}: {
  initialImage?: string | null;
  initialLat?: number | null;
  initialLng?: number | null;
  /** Lifts the converting state so the parent can disable Save until the
   *  resized JPEG is ready (otherwise a fast Save submits the raw file). */
  onProcessingChange?: (processing: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialImage);
  const [lat, setLat] = useState(initialLat != null ? String(initialLat) : "");
  const [lng, setLng] = useState(initialLng != null ? String(initialLng) : "");
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);

  const hasCoords = lat.trim() !== "" && lng.trim() !== "";

  function setBusy(busy: boolean) {
    setProcessing(busy);
    onProcessingChange?.(busy);
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Drop the raw selection from the input immediately: large originals
    // (e.g. a 35MP HEIC) take seconds to convert, and until the resized JPEG
    // replaces it a premature Save would post the oversized original and the
    // request would be rejected at the body-size boundary. The DataTransfer
    // below re-populates the input once conversion succeeds.
    if (fileRef.current) fileRef.current.value = "";
    setBusy(true);
    setErr(null);
    setGpsNote(null);
    try {
      // Read GPS from the original (canvas resize strips EXIF).
      const gps = await readGps(file);
      if (gps) {
        setLat(gps.lat.toFixed(6));
        setLng(gps.lng.toFixed(6));
        setGpsNote("📍 GPS auto-filled from the photo.");
      } else {
        setGpsNote("No GPS in this photo. Enter coordinates manually if you have them.");
      }
      const resized = await convertAndResize(file);
      const dt = new DataTransfer();
      dt.items.add(resized);
      if (fileRef.current) fileRef.current.files = dt.files;
      setPreview(URL.createObjectURL(resized));
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
        Inspiration{" "}
        <span className="font-normal text-gray-400">(optional, the photo behind this painting)</span>
      </p>

      <input
        ref={fileRef}
        name="inspirationImage"
        type="file"
        accept="image/*"
        onChange={onChange}
        className="block w-full text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-brand file:px-2 file:py-1 file:text-white file:text-xs hover:file:bg-brand-hover"
      />
      {processing && <p className="text-xs text-gray-400">Processing…</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {gpsNote && !err && <p className="text-xs text-gray-500">{gpsNote}</p>}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="inspiration preview" className="max-h-40 rounded border border-gray-200" />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
          <input
            name="inspirationLat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="e.g. 44.5012"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
          <input
            name="inspirationLng"
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="e.g. -80.3210"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {hasCoords && (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-brand hover:underline"
        >
          Check this spot on Google Maps ↗
        </a>
      )}
    </div>
  );
}
