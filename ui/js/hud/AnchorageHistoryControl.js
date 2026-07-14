// Leaflet map overlay control: a button that opens the "Past Anchorages"
// dialog. Sessions come from the plugin's session log (drop/raise metadata
// only); selecting one reconstructs its vessel track by querying the server's
// v2 History API for navigation.position over the session's time window and
// draws it as a dedicated layer (polyline + anchor point), separate from the
// live FleetLayer tracks. Only added to the map when a history provider is
// available (see AnchorAlarm.initAnchorageHistory).
//
// Element classes are CSS hooks in style.css; do not rename without updating it.

import { Modal } from "./Modal.js";
import { setTitle } from "../BrowserSupport.js";
import { SignalKHelper } from "../SignalKHelper.js";

// bootstrap-icons: bi-clock-history.
const HISTORY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-clock-history" viewBox="0 0 16 16">
  <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/>
  <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/>
  <path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/>
</svg>`;

// bootstrap-icons: bi-trash3 (per-row delete).
const TRASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
  <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47M8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5"/>
</svg>`;

// Track styling for a displayed historical session. Distinct from the live
// hotline tracks (red→green gradient) so the two never read as the same thing.
const HISTORY_TRACK_STYLE = {
  color: "#b45bff",
  weight: 2,
  opacity: 0.9,
};
const HISTORY_ANCHOR_STYLE = {
  radius: 6,
  color: "#b45bff",
  fillColor: "#b45bff",
  fillOpacity: 0.6,
  weight: 2,
};

// Target point budget for a fetched track: pick the History API resolution so
// even a weeks-long anchorage comes back as roughly this many samples.
const TRACK_POINT_BUDGET = 2000;

// Format an ISO timestamp for the session list; falls back to the raw string
// if it doesn't parse.
function formatWhen(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms))
    return String(iso);
  return new Date(ms).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Human duration of a session ("3h 20m", "2d 5h"). An open session runs to now.
function formatDuration(droppedAt, raisedAt) {
  const start = Date.parse(droppedAt);
  const end = raisedAt ? Date.parse(raisedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return "";
  const minutes = Math.round((end - start) / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days)
    return `${days}d ${hours}h`;
  if (hours)
    return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const AnchorageHistoryControl = L.Control.extend({
  options: {
    position: "topleft",
  },

  // opts: { signalK, statusBar, getLoggedIn }
  initialize: function (opts) {
    L.Control.prototype.initialize.call(this);
    this._signalK = opts.signalK;
    this._statusBar = opts.statusBar;
    this._getLoggedIn = opts.getLoggedIn || (() => false);
    this._layer = null; // layer group of the currently displayed track
    this._shownSessionId = null;
    this._modal = null;
  },

  onAdd: function (map) {
    this._map = map;
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const button = L.DomUtil.create("a", "leaflet-control-history", container);
    button.href = "#";
    button.setAttribute("role", "button");
    button.innerHTML = HISTORY_ICON;
    setTitle(button, "Past anchorages");

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button, "click", (e) => {
      L.DomEvent.stop(e);
      this.openDialog();
    });

    return container;
  },

  onRemove: function () {
    this.clearTrack();
  },

  // === Dialog =====================================================================

  openDialog: function () {
    if (this._modal && this._modal.isOpen())
      return;

    const modal = new Modal({ title: "Past Anchorages" });
    this._modal = modal;

    const body = document.createElement("div");
    body.className = "sessionList";
    body.textContent = "Loading…";
    modal.setContent(body);

    const buttons = [{ label: "Close", variant: "secondary", value: null }];
    if (this._shownSessionId) {
      buttons.unshift({
        label: "Hide track",
        variant: "secondary",
        onClick: (m) => {
          this.clearTrack();
          m.close();
        },
      });
    }
    modal.setButtons(buttons);
    modal.open();

    this._signalK
      .fetchSessions()
      .then(({ sessions }) => {
        if (!modal.isOpen())
          return;
        this.renderSessions(body, sessions, modal);
      })
      .catch((error) => {
        if (!modal.isOpen())
          return;
        body.textContent = "";
        modal.setError(
          `Failed to load sessions: ${error.message || error.statusText || "unknown error"}`,
        );
      });
  },

  renderSessions: function (body, sessions, modal) {
    body.innerHTML = "";
    if (!sessions || !sessions.length) {
      const empty = document.createElement("p");
      empty.className = "modalMessage";
      empty.textContent =
        "No anchoring sessions recorded yet. Sessions are logged each time the anchor is dropped.";
      body.appendChild(empty);
      return;
    }

    for (const session of sessions) {
      const row = document.createElement("div");
      row.className = "sessionRow";
      // Selecting a session is the dialog's primary action — make each row a
      // real button for keyboard and screen-reader users.
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          row.click();
        }
      });
      if (session.id === this._shownSessionId)
        row.classList.add("shown");

      const info = document.createElement("div");
      info.className = "sessionInfo";
      const when = document.createElement("div");
      when.className = "sessionWhen";
      when.textContent = formatWhen(session.droppedAt);
      const detail = document.createElement("div");
      detail.className = "sessionDetail";
      const duration = formatDuration(session.droppedAt, session.raisedAt);
      const state = session.raisedAt ? duration : `${duration} — still anchored`;
      const estimated =
        session.droppedAtEstimated || session.raisedAtEstimated
          ? " (approx.)"
          : "";
      detail.textContent = `${state}${estimated}`;
      info.appendChild(when);
      info.appendChild(detail);
      row.appendChild(info);

      // Delete is destructive and auth-gated server-side; only offer it to
      // logged-in users so anonymous taps don't dead-end in the login modal.
      if (this._getLoggedIn()) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "sessionDelete";
        del.innerHTML = TRASH_ICON;
        setTitle(del, "Delete this session");
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          modal.close();
          const ok = await Modal.confirm({
            title: "Delete session?",
            message: `Delete the anchorage from ${formatWhen(session.droppedAt)}? The recorded position history is not affected.`,
            okLabel: "Delete",
          });
          if (ok) {
            try {
              await this._signalK.deleteSession(session.id);
              if (session.id === this._shownSessionId)
                this.clearTrack();
            } catch (error) {
              this._statusBar.set(
                "anchorage-history",
                `Failed to delete session: ${error.message || error.statusText || "unknown error"}`,
                "warning",
              );
            }
          }
          this.openDialog();
        });
        row.appendChild(del);
      }

      row.addEventListener("click", () => {
        modal.close();
        this.showSession(session);
      });
      body.appendChild(row);
    }
  },

  // === Track display ==============================================================

  showSession: function (session) {
    const from = session.droppedAt;
    const to = session.raisedAt || new Date().toISOString();
    const durationSec = Math.max(
      1,
      (Date.parse(to) - Date.parse(from)) / 1000,
    );
    const resolution = Math.max(1, Math.ceil(durationSec / TRACK_POINT_BUDGET));

    this._statusBar.clear("anchorage-history");
    // Guard against out-of-order responses: if another session is picked
    // while this fetch is in flight, whichever response lands last must not
    // overwrite the newer selection. Only the latest request may draw.
    this._pendingSessionId = session.id;
    this._signalK
      .fetchPositionHistory(from, to, resolution)
      .then((response) => {
        if (this._pendingSessionId !== session.id)
          return;
        const positions = SignalKHelper.positionsFromHistory(response);
        this.drawTrack(session, positions);
      })
      .catch((error) => {
        if (this._pendingSessionId !== session.id)
          return;
        this._statusBar.set(
          "anchorage-history",
          `Failed to load track: ${error.message || error.statusText || "unknown error"}`,
          "warning",
        );
      });
  },

  drawTrack: function (session, positions) {
    this.clearTrack();

    const layers = [];
    if (positions.length >= 2) {
      layers.push(
        L.polyline(
          positions.map((p) => [p.latitude, p.longitude]),
          HISTORY_TRACK_STYLE,
        ),
      );
    }

    // The anchor point itself, with the session summary as its popup.
    if (session.position) {
      const marker = L.circleMarker(
        [session.position.latitude, session.position.longitude],
        HISTORY_ANCHOR_STYLE,
      );
      const duration = formatDuration(session.droppedAt, session.raisedAt);
      const until = session.raisedAt ? formatWhen(session.raisedAt) : "now";
      marker.bindPopup(
        `<b>Anchorage</b><br>${formatWhen(session.droppedAt)} → ${until}<br>${duration}, ${positions.length} track points`,
      );
      layers.push(marker);
    }

    if (!layers.length) {
      this._statusBar.set(
        "anchorage-history",
        "No position history recorded for that session.",
        "warning",
      );
      return;
    }

    this._layer = L.layerGroup(layers).addTo(this._map);
    this._shownSessionId = session.id;

    const bounds = positions.length
      ? L.latLngBounds(positions.map((p) => [p.latitude, p.longitude]))
      : L.latLngBounds([
        [session.position.latitude, session.position.longitude],
      ]);
    this._map.fitBounds(bounds.pad(0.3));
  },

  clearTrack: function () {
    if (this._layer) {
      this._map.removeLayer(this._layer);
      this._layer = null;
    }
    this._shownSessionId = null;
    // Also void any in-flight track fetch so "Hide track" can't be undone by
    // a late response. drawTrack is unaffected: its caller's guard runs
    // before it calls in here.
    this._pendingSessionId = null;
  },
});
