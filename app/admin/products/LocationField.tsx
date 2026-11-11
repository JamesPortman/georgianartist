"use client";

import { useState } from "react";

export type Gps = { lat: number; lng: number } | null;

/**
 * "Where the photo was taken" for photographs — coordinates only (unlike
 * paintings, a photograph needs no separate inspiration image). Coordinates
 * auto-fill from the uploaded photo's EXIF via the `autoGps` prop and stay
 * editable. Submits inspirationLat / inspirationLng within the parent form —
 * the same DB columns paintings use for their inspiration photo's location.
 */
export default function LocationField({
  initialLat = null,
  initialLng = null,
  autoGps = null,
}: {
  initialLat?: number | null;
  initialLng?: number | null;
  /** GPS read from the main image's EXIF; fills the fields when it arrives. */
  autoGps?: Gps;
}) {
  const [lat, setLat] = useState(initialLat != null ? String(initialLat) : "");
  const [lng, setLng] = useState(initialLng != null ? String(initialLng) : "");
  const [note, setNote] = useState<string | null>(null);

  // Adjusting state during render rather than in an effect: an effect would
  // paint the empty fields first and the filled ones a frame later. Keyed on
  // the coordinate values, not the object, so a prop recreated inline can't
  // re-trigger this forever.
  const gpsKey = autoGps ? `${autoGps.lat},${autoGps.lng}` : null;
  const [appliedGpsKey, setAppliedGpsKey] = useState<string | null>(null);

  if (autoGps && gpsKey !== appliedGpsKey) {
    setAppliedGpsKey(gpsKey);
    setLat(autoGps.lat.toFixed(6));
    setLng(autoGps.lng.toFixed(6));
    setNote("📍 Location auto-filled from the photo.");
  }

  const hasCoords = lat.trim() !== "" && lng.trim() !== "";

  return (
    <div className="border-t border-gray-100 pt-5 space-y-3">
      <p className="text-sm font-medium text-gray-700">
        Where the photo was taken{" "}
        <span className="font-normal text-gray-400">(optional, shows a map on the photo&apos;s page)</span>
      </p>

      {note && <p className="text-xs text-gray-500">{note}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="loc-lat" className="block text-xs font-medium text-gray-600 mb-1">
            Latitude
          </label>
          <input
            id="loc-lat"
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
          <label htmlFor="loc-lng" className="block text-xs font-medium text-gray-600 mb-1">
            Longitude
          </label>
          <input
            id="loc-lng"
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
