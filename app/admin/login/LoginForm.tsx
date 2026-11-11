"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { loginAction } from "@/app/actions/admin";
import { passkeyLoginOptionsAction, passkeyLoginVerifyAction } from "@/app/actions/passkey";

export default function LoginForm({ passkey, password }: { passkey: boolean; password: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await loginAction(formData);
      return result ?? null;
    },
    null
  );
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);

  async function signInWithPasskey() {
    setPkError(null);
    setPkBusy(true);
    try {
      const opts = await passkeyLoginOptionsAction();
      if ("error" in opts) return setPkError(opts.error);
      const response = await startAuthentication({ optionsJSON: opts.options });
      const result = await passkeyLoginVerifyAction(response);
      if ("error" in result) return setPkError(result.error);
      router.replace("/admin/products");
      router.refresh();
    } catch (e) {
      // The person closed the prompt, or the device has no passkey for this site.
      const cancelled = e instanceof WebAuthnError || (e instanceof Error && e.name === "NotAllowedError");
      setPkError(cancelled ? "Sign-in was cancelled." : "The passkey couldn't be used.");
    } finally {
      setPkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {passkey && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={signInWithPasskey}
            disabled={pkBusy}
            className="w-full bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded text-sm transition-colors disabled:opacity-60"
          >
            {pkBusy ? "Waiting for your passkey…" : "Sign in with a passkey"}
          </button>
          <p className="text-xs text-gray-600 text-center">Touch ID, Face ID or your device&rsquo;s passkey.</p>
          {pkError && <p className="text-sm text-red-600 text-center">{pkError}</p>}
        </div>
      )}

      {passkey && password && (
        <p className="text-xs text-gray-600 border-t border-gray-200 pt-4">
          Password sign-in is switched on as a break-glass (<code>ADMIN_PASSWORD_LOGIN</code>). Remove it
          in Vercel once you have a passkey again.
        </p>
      )}

      {password && (
        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus={!passkey}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className={`w-full font-medium py-2 rounded text-sm transition-colors disabled:opacity-60 ${
              passkey
                ? "border border-gray-300 text-gray-700 hover:border-brand"
                : "bg-brand hover:bg-brand-hover text-white"
            }`}
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
          {!passkey && (
            <p className="text-xs text-gray-600">
              Once signed in, add a passkey under <strong>Security</strong>; the password then stops
              working.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
