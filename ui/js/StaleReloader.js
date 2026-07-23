// Reloads the page when it returns from a long background suspension or from
// the bfcache. Mobile browsers can keep a tab alive for hours then revive it
// with stale DOM state, so we force a fresh load instead of showing minutes-
// old anchor data.

export class StaleReloader {
  constructor({ staleThresholdMs }) {
    this.staleThresholdMs = staleThresholdMs;
    this.hiddenAt = null;
  }

  start() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
      } else if (this.hiddenAt !== null) {
        const elapsed = Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        if (elapsed >= this.staleThresholdMs) {
          this.reload();
        }
      }
    });

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        this.reload();
      }
    });
  }

  // Cover the page before navigating so the user sees "Reloading" instead of a
  // frozen frame of stale data while the fresh load is in flight.
  reload() {
    this.showOverlay();
    // Give the browser a beat to paint the overlay; location.reload() can
    // otherwise commit the navigation before the mutation ever hits the screen.
    setTimeout(() => window.location.reload(), 50);
  }

  // Scrim + spinner built entirely inline (injected keyframes, no images or
  // fetches) since the page is about to navigate away. Chromium 69 (Navico
  // MFDs): long-hand positioning and margins only — no `inset`, no flex `gap`.
  showOverlay() {
    if (document.getElementById("stale-reloader-overlay")) {
      return;
    }

    const style = document.createElement("style");
    style.textContent =
      "@keyframes stale-reloader-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "stale-reloader-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,0.55);";

    const spinner = document.createElement("div");
    spinner.style.cssText =
      "width:48px;height:48px;border-radius:50%;" +
      "border:5px solid rgba(255,255,255,0.3);border-top-color:#fff;" +
      "animation:stale-reloader-spin 0.9s linear infinite;";

    const label = document.createElement("div");
    label.textContent = "Reloading";
    label.style.cssText =
      "margin-top:16px;color:#fff;font-size:18px;font-weight:600;" +
      'font-family:"Helvetica Neue",Arial,Helvetica,sans-serif;';

    overlay.appendChild(spinner);
    overlay.appendChild(label);
    document.body.appendChild(overlay);
  }
}
