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
          window.location.reload();
        }
      }
    });

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        window.location.reload();
      }
    });
  }
}
