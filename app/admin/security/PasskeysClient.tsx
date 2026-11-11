"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import {
  deletePasskeyAction,
  passkeyRegisterOptionsAction,
  passkeyRegisterVerifyAction,
} from "@/app/actions/passkey";

type Passkey = { id: string; label: string; synced: boolean; createdAt: string; lastUsedAt: string | null };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

export default function PasskeysClient({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function add() {
    setMsg(null);
    setBusy(true);
    try {
      const opts = await passkeyRegisterOptionsAction();
      if ("error" in opts) return setMsg({ ok: false, text: opts.error });
      const response = await startRegistration({ optionsJSON: opts.options });
      const result = await passkeyRegisterVerifyAction(response, label || "Passkey");
      if ("error" in result) return setMsg({ ok: false, text: result.error });
      setLabel("");
      setMsg({
        ok: true,
        text:
          passkeys.length === 0
            ? "Passkey added. The password no longer signs in; use the passkey next time."
            : "Passkey added.",
      });
      router.refresh();
    } catch (e) {
      const cancelled = e instanceof WebAuthnError || (e instanceof Error && e.name === "NotAllowedError");
      setMsg({ ok: false, text: cancelled ? "Cancelled." : "The passkey couldn't be created." });
    } finally {
      setBusy(false);
    }
  }

  function remove(p: Passkey) {
    const last = passkeys.length === 1;
    const warning = last
      ? `Remove "${p.label}"? It's the only passkey, so the password will start working again.`
      : `Remove "${p.label}"? That device will no longer sign in.`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      await deletePasskeyAction(p.id);
      router.refresh();
    });
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Passkeys</h2>

      {passkeys.length === 0 ? (
        <p className="text-sm text-gray-600">None yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 list-none p-0" data-testid="passkey-list">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3 text-sm">
              <div className="flex-1">
                <p className="font-medium text-gray-800">{p.label}</p>
                <p className="text-xs text-gray-600">
                  Added {day(p.createdAt)} · {p.lastUsedAt ? `last used ${day(p.lastUsedAt)}` : "not used yet"}
                  {p.synced && " · syncs across your devices"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={pending}
                className="text-xs text-gray-600 hover:text-red-600 underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <label htmlFor="passkey-label" className="sr-only">
          Name for this passkey
        </label>
        <input
          id="passkey-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name, e.g. MacBook Air"
          maxLength={60}
          className="text-sm border border-gray-300 rounded px-3 py-2 flex-1 min-w-[12rem]"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="text-sm bg-brand text-white px-4 py-2 rounded hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "Waiting for your device…" : "Add a passkey"}
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}

      <p className="text-xs text-gray-600">
        A passkey made on a Mac or iPhone syncs through iCloud Keychain, so it works on your other
        Apple devices too. Add one on a second device (or a security key) so losing one isn&rsquo;t
        a lockout.
      </p>
    </section>
  );
}
