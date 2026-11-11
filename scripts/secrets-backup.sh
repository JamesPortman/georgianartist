#!/usr/bin/env bash
#
# An encrypted copy of the site's secrets, kept somewhere that isn't Vercel.
#
# Every credential the site runs on lives in Vercel's environment variables and
# nowhere else. Losing the Vercel account (a locked login, a billing lapse, a
# deleted project) would leave the site's database, Blob store, email and
# Instagram keys unrecoverable without going back to each provider. This pulls
# Production's variables, encrypts them with a passphrase, and writes one file
# to keep off Vercel: a USB stick, iCloud Drive, the password manager.
#
#   npm run secrets:backup                 # writes to ~/Documents/georgianartist-secrets/
#   npm run secrets:backup -- <dir>        # or to <dir>
#   npm run secrets:backup -- --verify <file.env.age>   # list the names inside
#
# Needs the Vercel CLI, logged in and linked to this project (`vercel link`),
# and `age` (`brew install age`). The passphrase is asked for twice by age; keep
# it in the password manager and in the handover envelope (RUNBOOK.md), never
# next to the file. Decrypt with `age -d <file> > .env.restore`.
#
# The plaintext only exists in a private temp directory and is deleted on exit,
# however the script exits. Variables Vercel marks "Sensitive" come back empty
# from `vercel env pull`; they are listed at the end so they can be copied in by
# hand from where they were created.

set -euo pipefail
umask 077

die() { echo "secrets-backup: $*" >&2; exit 1; }

command -v age >/dev/null || die "needs age: brew install age"

if [[ "${1:-}" == "--verify" ]]; then
  [[ -f "${2:-}" ]] || die "usage: --verify <file.env.age>"
  echo "Variables in $2 (values not shown):"
  age -d "$2" | sed -nE 's/^([A-Z0-9_]+)=.*/  \1/p'
  exit 0
fi

command -v vercel >/dev/null || die "needs the Vercel CLI: npm i -g vercel, then vercel login && vercel link"

out_dir="${1:-$HOME/Documents/georgianartist-secrets}"
mkdir -p "$out_dir"
case "$(cd "$out_dir" && pwd -P)/" in
  "$(git rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"/*)
    rmdir "$out_dir" 2>/dev/null || true
    die "refusing to write inside the repository; choose a directory outside it" ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

vercel env pull "$tmp/pulled.env" --environment=production --yes >/dev/null

# Vercel's own system variables (VERCEL_*, the OIDC token) are per-deployment
# and regenerate themselves; only the site's secrets are worth keeping.
grep -vE '^(VERCEL|TURBO|NX)_' "$tmp/pulled.env" > "$tmp/secrets.env" || true
[[ -s "$tmp/secrets.env" ]] || die "Vercel returned no variables; is this directory linked (vercel link)?"

{
  echo "# georgianartist.com Production environment, pulled $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "# GitHub Actions also holds BLOB_READ_WRITE_TOKEN (same value) for CI."
  cat "$tmp/secrets.env"
} > "$tmp/out.env"

file="$out_dir/georgianartist-secrets-$(date +%Y-%m-%d).env.age"
age -p -o "$file" "$tmp/out.env"

echo "Wrote $file"
echo "Variables: $(grep -cE '^[A-Z0-9_]+=' "$tmp/secrets.env")"
empty="$(sed -nE 's/^([A-Z0-9_]+)=("")?$/\1/p' "$tmp/secrets.env")"
if [[ -n "$empty" ]]; then
  echo
  echo "These came back EMPTY (Vercel 'Sensitive' variables can't be pulled)."
  echo "Copy their values in by hand from the provider, then re-encrypt:"
  echo "$empty" | sed 's/^/  /'
fi
