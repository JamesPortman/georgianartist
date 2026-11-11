"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  excludeThisBrowserAction,
  removeExclusionAction,
  type ExcludedRow,
} from "@/app/actions/analytics";

/**
 * Keep your own browsing out of the numbers.
 *
 * Identified by the anonymous analytics cookie, which is httpOnly and set at
 * path "/", so the server action can read it here without anyone needing to
 * know their own id. Filtering by city was the obvious alternative and is wrong
 * twice over: Wasaga Beach is a real Georgian Bay town whose residents are
 * plausible customers, and this cookie has been seen from Ottawa and Little
 * Current — it follows the person, the city doesn't.
 */
export default function ExcludeBrowser({ rows }: { rows: ExcludedRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const thisBrowserExcluded = rows.some((r) => r.isThisBrowser);
  const remaining = rows.reduce((n, r) => n + r.remainingEvents, 0);

  function exclude() {
    setMsg(null);
    startTransition(async () => {
      const res = await excludeThisBrowserAction(label);
      setMsg(
        res.ok
          ? { text: "This browser is no longer counted.", ok: true }
          : { text: res.error, ok: false }
      );
      if (res.ok) setLabel("");
      router.refresh();
    });
  }

  function remove(visitorId: string) {
    setMsg(null);
    startTransition(async () => {
      await removeExclusionAction(visitorId);
      router.refresh();
    });
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5 mt-8">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Browsers not counted
      </h3>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Your own visits would otherwise show up as real traffic. This matches on
        an anonymous cookie rather than a location, so it follows you when you
        travel and never hides a genuine visitor who happens to live nearby.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">Nothing excluded yet.</p>
      ) : (
        <ul className="text-sm divide-y divide-gray-100 mb-4 list-none p-0">
          {rows.map((r) => (
            <li key={r.visitorId} className="flex items-center gap-3 py-2">
              <code className="text-xs text-gray-400">{r.visitorId.slice(0, 8)}…</code>
              <span className="text-gray-700">{r.label || "(no label)"}</span>
              {r.isThisBrowser && (
                <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded">
                  this browser
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {r.remainingEvents > 0
                  ? `${r.remainingEvents} past event${r.remainingEvents === 1 ? "" : "s"} still counted`
                  : "history cleared"}
              </span>
              <button
                onClick={() => remove(r.visitorId)}
                disabled={busy}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                Count again
              </button>
            </li>
          ))}
        </ul>
      )}

      {thisBrowserExcluded ? (
        <p className="text-sm text-brand">✓ This browser is already excluded.</p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. James (desktop Chrome)"
            className="text-sm border border-gray-300 rounded px-3 py-2 flex-1 max-w-xs"
          />
          <button
            onClick={exclude}
            disabled={busy}
            className="text-sm bg-brand text-white px-4 py-2 rounded hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Working…" : "Don't count this browser"}
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm mt-3 ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>
      )}

      {remaining > 0 && (
        <p className="text-xs text-gray-500 mt-4">
          Excluding stops new events. The {remaining} already recorded still count until you
          run <code className="bg-gray-100 px-1 rounded">npm run analytics:purge-excluded -- --commit</code>.
        </p>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Do this once in each browser and device you browse the site from. The cookie is
        per-browser.
      </p>
    </section>
  );
}
