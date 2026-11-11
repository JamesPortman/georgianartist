/**
 * Embedded map pinning where a photo was taken, with the coordinates and a
 * Google Maps link. Shared by both detail pages: paintings use it for the
 * inspiration photo's location, photographs for where the photograph itself
 * was taken. Only rendered when GPS coordinates are set.
 */
export default function LocationMap({
  lat,
  lng,
  label = "Where the photo was taken",
  title = "Photo location",
}: {
  lat: number;
  lng: number;
  /** Caption above the map. */
  label?: string;
  /** iframe title — also the accessible name for the embedded map. */
  title?: string;
}) {
  const d = 0.006; // map zoom window
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <div className="mt-1">
      <p className="text-xs font-medium text-gray-500 mb-1.5">📍 {label}</p>
      <div className="relative w-full h-56 rounded-sm overflow-hidden border border-gray-200">
        <iframe
          title={title}
          src={osm}
          className="absolute inset-0 w-full h-full"
          loading="lazy"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 mt-1.5">
        <span>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline font-medium"
        >
          Open in Google Maps ↗
        </a>
      </div>
    </div>
  );
}
