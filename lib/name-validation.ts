// Server-side name validation. Designed to catch common spam patterns
// without rejecting legitimate single-word names (mononyms, first-name-only
// submissions).

export type NameValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const MAX_SINGLE_WORD_LENGTH = 20;

export function validateName(name: string): NameValidationResult {
  if (!name || typeof name !== "string") {
    return { ok: false, reason: "Please enter your name." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { ok: false, reason: "Please enter your full name." };
  }

  // If the name has no space, it must look like a real single-word name —
  // not a 23-character random string like "LaAnWcgtaVtdvNxwaKOgLdF".
  // Allows mononyms ("Madonna", "Ramachandran") and first-name-only.
  const hasSpace = /\s/.test(trimmed);
  if (!hasSpace && trimmed.length > MAX_SINGLE_WORD_LENGTH) {
    return { ok: false, reason: "Please enter your full name." };
  }

  return { ok: true };
}
