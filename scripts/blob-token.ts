/**
 * The Blob token, for scripts that load their environment from a .env file.
 *
 * Every Blob call in a script has to be passed this explicitly. The SDK can
 * read `BLOB_READ_WRITE_TOKEN` from the environment on its own, and in the app
 * that works — Vercel sets the variable before any module loads. In a script it
 * doesn't: ESM hoists `import { put } from "@vercel/blob"` above the
 * `dotenv.config()` call that appears before it in the source, so the SDK
 * resolves its default token while .env.local is still unloaded, and captures
 * nothing.
 *
 * What that looks like from the outside is every call failing with
 *
 *     Vercel Blob: Access denied, please provide a valid token for this resource.
 *
 * which reads like a revoked token, not a load-order bug — the token is fine,
 * and the same one works against the REST API by hand. It cost an hour to find
 * once. Pass `token: blobToken()` and it doesn't come back.
 */
export function blobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Add it to .env.local " +
        "(`vercel env pull` writes it, among everything else)."
    );
  }
  return token;
}
