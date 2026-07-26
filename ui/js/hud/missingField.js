// Write a formatted value into a HUD data-field span, falling back to a
// grayed-out placeholder when the value is missing. DisplayUnit.format*
// returns "" for anything unformattable (no envelope, null value, non-finite
// math), so panels funnel every field through here instead of leaving it
// blank. The .missing class carries the muted styling — see style.css.
const MISSING_TEXT = "~";

export function setFieldText(el, text) {
  if (text) {
    el.textContent = text;
    el.classList.remove("missing");
  } else {
    el.textContent = MISSING_TEXT;
    el.classList.add("missing");
  }
}
