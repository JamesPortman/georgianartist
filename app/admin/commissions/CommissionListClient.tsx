"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteCommissionAction,
  reorderCommissionsAction,
  toggleCommissionVisibleAction,
} from "@/app/actions/commissions";
import { captionOf, isCommissionKind, KIND_LABEL } from "@/lib/commissions";

export type AdminCommission = {
  id: string;
  kind: string;
  name: string;
  subject: string | null;
  medium: string | null;
  size: string | null;
  image: string;
  visible: boolean;
};

export default function CommissionListClient({ examples }: { examples: AdminCommission[] }) {
  const router = useRouter();
  const [items, setItems] = useState(examples);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch {
        setError("That didn't save. Please try again.");
        setItems(examples);
      }
    });
  }

  function move(index: number, by: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setItems(next);
    run(() => reorderCommissionsAction(next.map((e) => e.id)));
  }

  function toggle(id: string, visible: boolean) {
    setItems((all) => all.map((e) => (e.id === id ? { ...e, visible } : e)));
    run(() => toggleCommissionVisibleAction(id, visible));
  }

  function remove(e: AdminCommission) {
    if (!window.confirm(`Delete the example "${e.name}"? Its image is deleted too. This can't be undone.`)) return;
    setItems((all) => all.filter((x) => x.id !== e.id));
    run(() => deleteCommissionAction(e.id));
  }

  if (items.length === 0) {
    return (
      <p className="bg-white rounded-lg shadow-sm p-6 text-sm text-gray-600">
        No examples yet. Until there are some, /commissions shows the terms and the quote form only.
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
      {items.map((e, i) => (
        <div key={e.id} className="flex items-center gap-4 p-3" data-testid="commission-row">
          {/* A /media file needs the admin's cookie, which the image optimiser doesn't send. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.image} alt="" className="w-16 h-16 object-cover rounded border border-gray-200" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{captionOf(e)}</p>
            <p className="text-xs text-gray-500">{isCommissionKind(e.kind) ? KIND_LABEL[e.kind] : e.kind}</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={e.visible}
              disabled={pending}
              onChange={(ev) => toggle(e.id, ev.target.checked)}
              className="accent-brand"
            />
            Visible
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={pending || i === 0}
              aria-label={`Move ${e.name} up`}
              className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={pending || i === items.length - 1}
              aria-label={`Move ${e.name} down`}
              className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-30"
            >
              ↓
            </button>
          </div>
          <Link href={`/admin/commissions/${e.id}`} className="text-sm text-brand underline">
            Edit
          </Link>
          <button
            type="button"
            onClick={() => remove(e)}
            disabled={pending}
            className="text-sm text-red-600 underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
