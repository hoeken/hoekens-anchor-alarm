import fs from "fs";
import path from "path";

// Persistent log of anchoring sessions (one entry per drop..raise span),
// stored as JSON in the plugin data dir. The sessions carry only metadata —
// timestamps, anchor position, zone shape. The track itself is not stored
// here: a history provider (e.g. signalk-questdb) already records
// navigation.position continuously, so a session's track is reconstructed by
// querying the History API for the [droppedAt, raisedAt] window.
//
// Every public method is a no-throw: anchor alarm operation is safety
// critical and must never be blocked by a failed bookkeeping write. Errors
// are reported through app.error and the call becomes a no-op.

const SESSIONS_FILE = "anchor-sessions.json";

// Upper bound on retained sessions; oldest entries fall off. Generous — at a
// realistic one-drop-per-day this is well over a year of anchorages.
const MAX_SESSIONS = 500;

export class SessionLog {
  constructor(app) {
    this.app = app;
    this.sessions = null; // lazy-loaded array, oldest first
  }

  filePath() {
    return path.join(this.app.getDataDirPath(), SESSIONS_FILE);
  }

  // Load once, tolerating a missing or corrupt file (fresh install, torn
  // write) by starting over with an empty log.
  load() {
    if (this.sessions)
      return this.sessions;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath(), "utf8"));
      this.sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    } catch {
      this.sessions = [];
    }
    return this.sessions;
  }

  // Atomic write (tmp + rename) so a crash mid-write can't tear the log.
  save() {
    try {
      const file = this.filePath();
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ sessions: this.sessions }, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      this.app.error(`anchor session log write failed: ${err.message}`);
    }
  }

  // All sessions, newest first. Returns a deep copy so callers can't mutate
  // state that a later lifecycle write would then persist.
  all() {
    return JSON.parse(JSON.stringify(this.load())).reverse();
  }

  // The open session (dropped, not yet raised), or null.
  current() {
    const sessions = this.load();
    const last = sessions[sessions.length - 1];
    return last && !last.raisedAt ? last : null;
  }

  // Record an anchor drop. An open session at this point means the previous
  // raise was never recorded (re-drop while watching, or a missed raise) —
  // close it now so sessions never overlap.
  start(position, zoneConfig) {
    try {
      const sessions = this.load();
      const now = new Date().toISOString();
      const open = this.current();
      if (open)
        open.raisedAt = now;
      sessions.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        droppedAt: now,
        position: position,
        zone: zoneConfig,
      });
      if (sessions.length > MAX_SESSIONS)
        sessions.splice(0, sessions.length - MAX_SESSIONS);
      this.save();
    } catch (err) {
      this.app.error(`anchor session log start failed: ${err.message}`);
    }
  }

  // Keep the open session's zone in sync when the operator reshapes it.
  updateZone(zoneConfig) {
    try {
      const open = this.current();
      if (!open)
        return;
      open.zone = zoneConfig;
      this.save();
    } catch (err) {
      this.app.error(`anchor session log update failed: ${err.message}`);
    }
  }

  // Record the anchor raise. No open session is fine (raise without a
  // recorded drop, e.g. first run after upgrading to this version).
  end() {
    try {
      const open = this.current();
      if (!open)
        return;
      open.raisedAt = new Date().toISOString();
      this.save();
    } catch (err) {
      this.app.error(`anchor session log end failed: ${err.message}`);
    }
  }

  // Reconcile the log with the actual watch state at plugin start, healing
  // the two ways a restart can leave them out of sync:
  //  - watching with no open session (log introduced mid-watch, or the drop
  //    write failed): open one now. droppedAt is the restart time, not the
  //    true drop — flagged estimated so the UI can say so.
  //  - not watching but a session is open (crash between raise and the log
  //    write): close it at restart time, also flagged. The estimate errs
  //    long — the boat may have sailed after the unrecorded raise — but a
  //    too-long window only pads the track query, it loses nothing.
  reconcile(isWatching, position, zoneConfig) {
    try {
      const open = this.current();
      if (isWatching && !open) {
        this.start(position, zoneConfig);
        this.current().droppedAtEstimated = true;
        this.save();
      } else if (!isWatching && open) {
        open.raisedAt = new Date().toISOString();
        open.raisedAtEstimated = true;
        this.save();
      }
    } catch (err) {
      this.app.error(`anchor session log reconcile failed: ${err.message}`);
    }
  }

  // Delete a session by id. Returns true when something was removed.
  remove(id) {
    try {
      const sessions = this.load();
      const index = sessions.findIndex((s) => s.id === id);
      if (index === -1)
        return false;
      sessions.splice(index, 1);
      this.save();
      return true;
    } catch (err) {
      this.app.error(`anchor session log remove failed: ${err.message}`);
      return false;
    }
  }
}
