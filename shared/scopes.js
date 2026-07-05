// Scope-ratio helpers shared by the UI (AppState computes the rode lengths,
// ScopePanel renders the rows) and available to the backend. Kept dependency-free
// so it can be imported by the Node plugin and bundled into the browser UI alike.

// Ratios used when the user hasn't configured any usable value. Sorted high→low
// to match parseScopes output. Cloned on the way out so callers can't mutate it.
export const DEFAULT_SCOPES = [7, 5, 4, 3];

// Scope ratios must fall within this inclusive range; anything else is dropped.
export const MIN_SCOPE = 1;
export const MAX_SCOPE = 10;

// Parse a user-supplied scope list into a clean, sorted array of numbers.
//
// Fault tolerant by design: accepts a comma-separated string (what the admin
// and UI text fields produce) or an array. Each entry is trimmed and coerced to
// a number; anything non-numeric or outside [MIN_SCOPE, MAX_SCOPE] is discarded,
// duplicates are collapsed, and the survivors are sorted highest→lowest.
//
// Three "no valid numbers" outcomes are deliberately distinguished:
//   - Unset (undefined/null, e.g. an upgraded config missing the key): the
//     value was never configured, so return the defaults.
//   - Explicitly blank ("" / whitespace / empty array): the user cleared the
//     field to turn scopes off, so return an empty list (no scopes at all).
//   - Non-blank but unparseable ("abc", "0,99"): likely a typo, so fall back
//     to the defaults rather than silently showing nothing.
export function parseScopes(input, fallback = DEFAULT_SCOPES) {
  if (input === undefined || input === null)
    return [...fallback];

  let parts;
  let blank;
  if (typeof input === "string") {
    blank = input.trim() === "";
    parts = input.split(",");
  } else if (Array.isArray(input)) {
    blank = input.length === 0;
    parts = input;
  } else {
    // Unexpected type — treat as unset.
    return [...fallback];
  }

  const seen = new Set();
  const scopes = [];
  for (const part of parts) {
    const n = Number(String(part).trim());
    if (!Number.isFinite(n) || n < MIN_SCOPE || n > MAX_SCOPE)
      continue;
    if (seen.has(n))
      continue;
    seen.add(n);
    scopes.push(n);
  }

  if (scopes.length === 0)
    return blank ? [] : [...fallback];

  scopes.sort((a, b) => b - a);
  return scopes;
}

// Format a scope ratio for the "N:1" label. Whole numbers show with no decimals
// (7.0 → "7"); everything else is rounded to a single decimal place
// (3.523 → "3.5"). Rounding can promote a value to a whole number (6.98 → "7").
export function formatScopeRatio(scope) {
  const rounded = Math.round(scope * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
