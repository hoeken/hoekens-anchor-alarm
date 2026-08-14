// Who this browser session is to the SignalK server, and what it may do.
//
// The server answers that on /skServer/loginStatus, whose payload comes from
// whichever security strategy is active:
//
//   security enabled  { status: "loggedIn" | "notLoggedIn", readOnlyAccess,
//                       authenticationRequired: true, userLevel?, username?, … }
//   security disabled { status: "notLoggedIn", readOnlyAccess: false,
//                       authenticationRequired: false }
//
// The two "notLoggedIn" cases mean opposite things — with security disabled
// nobody is logged in and yet every route is served unconditionally — so the UI
// can't gate on `status` alone. This class collapses the payload into one of the
// server's own permission levels and answers capability questions against it, so
// each control asks what it needs (canWrite for the anchor buttons, canAdmin for
// the boat icon) instead of guessing from a request that came back 401.
//
// The levels mirror the per-route access levels the plugin registers its API
// with (see src/http-routes.js): readonly reads, readwrite works the anchor and
// saves preferences, admin replaces the boat icon.

const LEVELS = { none: 0, readonly: 1, readwrite: 2, admin: 3 };

export class Identity {
  constructor(loginStatus = {}) {
    this.loginStatus = loginStatus;
    this.loggedIn = loginStatus.status === "loggedIn";
    // Absent means enabled: an older server that predates the field only ever
    // shipped the security-enabled strategy.
    this.authRequired = loginStatus.authenticationRequired !== false;
    this.username = (this.loggedIn && loginStatus.username) || null;
    this.level = this._resolveLevel(loginStatus);
  }

  // Least-privileged identity, used until the probe resolves and as its
  // fallback when it fails: assume nothing is permitted rather than offering
  // controls whose requests would 401.
  static anonymous() {
    return new Identity({ status: "notLoggedIn", authenticationRequired: true });
  }

  // Full access, the shape a server with security disabled reports. The
  // permissive default for components given no identity at all.
  static unrestricted() {
    return new Identity({ authenticationRequired: false });
  }

  _resolveLevel(loginStatus) {
    // No security means no principals to authenticate: every route is open, so
    // the effective level is the highest one rather than "nobody".
    if (!this.authRequired)
      return "admin";
    // `userLevel` is the user's configured permissions ("readonly" /
    // "readwrite" / "admin"); assume the lowest if a server omits it.
    if (this.loggedIn)
      return LEVELS[loginStatus.userLevel] ? loginStatus.userLevel : "readonly";
    // Anonymous. With read-only access allowed, unauthenticated requests are
    // served as a shared readonly principal; without it, nothing is.
    return loginStatus.readOnlyAccess ? "readonly" : "none";
  }

  atLeast(level) {
    return LEVELS[this.level] >= LEVELS[level];
  }

  canRead() {
    return this.atLeast("readonly");
  }

  // Working the anchor (drop/raise/set zone), saving UI preferences, deleting
  // a session — everything the plugin registers as readwrite.
  canWrite() {
    return this.atLeast("readwrite");
  }

  // Boat-wide setup, currently just replacing the custom boat icon.
  canAdmin() {
    return this.atLeast("admin");
  }
}
