// GPS glitch filter shared by the backend plugin (so a position spike can't
// trip the drag alarm) and the web UI (so spikes don't pollute the scribble
// tracks). One instance tracks one vessel's position stream.
//
// A fix is a glitch when the speed implied by the move from the last GOOD fix
// exceeds maxSpeed (meters/second — the SignalK base unit). Glitched fixes are
// rejected and the last good fix stands, so an isolated spike is skipped and
// the next sane fix is judged against the pre-spike position. A run of
// GLITCH_ACCEPT_LIMIT consecutive rejections means the vessel may genuinely be
// moving that fast (or the "glitch" was a real relocation), so the run's final
// fix is accepted and becomes the new baseline. The run counter resets on
// every accepted fix.
//
// maxSpeed <= 0 disables the filter: everything is accepted untouched, which
// is the default so existing installs see zero behavior change.

import { Geo } from "./geo.js";

// Consecutive rejections after which the next fix is accepted as real.
export const GLITCH_ACCEPT_LIMIT = 5;

// Floor for the elapsed time between fixes. A repeated or out-of-order
// timestamp would otherwise make the implied speed infinite (or negative);
// clamping keeps the comparison finite while still flagging a same-instant
// jump as impossibly fast.
const MIN_INTERVAL_SEC = 0.1;

export class GlitchFilter {
  constructor(maxSpeed = 0) {
    this.setMaxSpeed(maxSpeed);
    this.reset();
  }

  setMaxSpeed(maxSpeed) {
    this.maxSpeed = Number(maxSpeed) || 0;
  }

  reset() {
    this.lastGood = null;
    this.lastGoodTime = 0;
    this.glitches = 0;
  }

  // Judge one fix. `position` is { latitude, longitude }; `timeMs` is epoch
  // milliseconds (from the delta's timestamp). Returns { accepted, speed }
  // where speed is the implied m/s from the last good fix, or null when no
  // speed was computed (filter disabled, first fix, or an unusable position).
  // Rejections also carry `glitches` (length of the current run, including
  // this fix) and a run-limit acceptance carries `limitAccepted: true`, so
  // callers can log what happened.
  check(position, timeMs) {
    const usable =
      position != null &&
      Number.isFinite(position.latitude) &&
      Number.isFinite(position.longitude);

    if (this.maxSpeed <= 0) {
      // Disabled: accept everything, but keep tracking the stream so enabling
      // the filter live starts with a baseline instead of a blind first fix.
      if (usable)
        this._accept(position, timeMs);
      return { accepted: true, speed: null };
    }

    if (!usable)
      return { accepted: false, speed: null, glitches: this.glitches };

    if (!this.lastGood) {
      this._accept(position, timeMs);
      return { accepted: true, speed: null };
    }

    const seconds = Math.max(
      (timeMs - this.lastGoodTime) / 1000,
      MIN_INTERVAL_SEC,
    );
    const speed = Geo.distance(this.lastGood, position) / seconds;

    if (speed <= this.maxSpeed || this.glitches + 1 >= GLITCH_ACCEPT_LIMIT) {
      const limitAccepted = speed > this.maxSpeed;
      this._accept(position, timeMs);
      return { accepted: true, speed, limitAccepted };
    }

    this.glitches++;
    return { accepted: false, speed, glitches: this.glitches };
  }

  _accept(position, timeMs) {
    this.lastGood = {
      latitude: position.latitude,
      longitude: position.longitude,
    };
    this.lastGoodTime = timeMs;
    this.glitches = 0;
  }
}

// One-line description of a rejected fix for logging: the offending
// coordinates, the implied speed from the last good fix (which a rejection
// leaves untouched, so it's still the pre-glitch baseline), and how deep into
// a run of consecutive glitches we are.
export function describeGlitch(filter, result, position) {
  const speed =
    result.speed != null ? `${result.speed.toFixed(1)} m/s` : "unusable fix";
  const from = filter.lastGood
    ? ` from last good ${formatPosition(filter.lastGood)}`
    : "";
  return `${formatPosition(position)} — ${speed}${from} (glitch #${result.glitches} in a row)`;
}

function formatPosition(position) {
  if (
    position == null ||
    !Number.isFinite(position.latitude) ||
    !Number.isFinite(position.longitude)
  )
    return JSON.stringify(position);
  return `${position.latitude.toFixed(6)},${position.longitude.toFixed(6)}`;
}
