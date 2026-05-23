"use strict";

// CommonJS shim for signalk-server, which loads plugins via require(). The
// real plugin entry is the ESM default export of ./index.js; Node 20.19+
// supports require()-ing an ESM module, returning the namespace object whose
// `default` property is the plugin factory.
module.exports = require("./index.js").default;
