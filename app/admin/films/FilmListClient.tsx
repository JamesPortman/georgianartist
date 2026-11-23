"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFilmVisibleAction } from "@/app/actions/films";

export type AdminFilm = {
  id: string;
  title: string;
  posterUrl: string | null;
  seconds: number | null;
  /** The work the film belongs to, when that work is in the catalogue. */
  work: string | null;
  visible: boolean;
};

export default function FilmListClient({ films }: { films: AdminFilm[] }) {
  const router = useRouter();
  const [items, setItems] = useState(films);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, visible: boolean) {
    setError(null);
    setItems((all) => all.map((f) => (f.id === id ? { ...f, visible } : f)));
    startTransition(async () => {
      try {
        await toggleFilmVisibleAction(id, visible);
        router.refresh();
      } catch {
        setError("That didn't save. Please try again.");
        setItems(films);
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="bg-white rounded-lg shadow-sm p-6 text-sm text-gray-600">
        No films yet. Films are added with scripts/publish-films.ts.
      </p>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
      {error && (
        <p role="alert" className="p-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {items.map((f) => (
        <div key={f.id} className="flex items-center gap-4 p-3" data-testid="film-row" data-film={f.id}>
          {f.posterUrl ? (
            // A plain img: the admin doesn't need the optimiser for a thumbnail.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.posterUrl} alt="" className="w-20 h-15 object-cover rounded border border-gray-200" />
          ) : (
            <span className="w-20 h-15 rounded border border-gray-200 bg-gray-100" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${f.visible ? "text-gray-800" : "text-gray-500"}`}>{f.title}</p>
            <p className="text-xs text-gray-500">
              {[f.seconds ? `${f.seconds} seconds` : null, f.work ? `on the page of ${f.work}` : "no work in the catalogue"]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={f.visible}
              disabled={pending}
              onChange={(ev) => toggle(f.id, ev.target.checked)}
              aria-label={`Show the film ${f.title}`}
              className="accent-brand"
            />
            Visible
          </label>
        </div>
      ))}
    </div>
  );
}
