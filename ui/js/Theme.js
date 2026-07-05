// Light/dark theme controller. The initial theme is chosen before first paint
// by the inline script in index.html (MFD `?mode=` param, else the OS
// prefers-color-scheme, else dark) and applied as a class on <html>, which
// style.css keys its color variables off of. This module reads that state and
// lets the UI flip it at runtime (see hud/ThemeControl.js).
//
// The choice is intentionally NOT persisted: on an MFD the mode is dictated by
// the plotter's day/night setting via the query param, and on a phone/browser
// it follows the OS. A runtime toggle is a transient override for the current
// session only, so each load re-derives the theme from scratch.

// Read the active theme straight from the class the inline script (or a prior
// toggle) left on <html>. Anything that isn't explicitly "light" is treated as
// dark, matching the inline script's dark default.
export function getTheme() {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

// Apply `theme` as the sole theme class on <html>, preserving any unrelated
// classes. Returns the theme that was applied.
export function setTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  return next;
}

// Flip between light and dark, returning the newly active theme.
export function toggleTheme() {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
}
