/*
 * Copyright 2016 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { AnchorError } = require("./anchor-service");

function register(app, plugin, router) {
  function fail(res, err) {
    if (err instanceof AnchorError) {
      app.debug(err.message);
      res.status(403).json({
        statusCode: 403,
        state: "FAILED",
        message: err.message,
      });
    } else {
      app.error(err);
      res.status(500).json({
        statusCode: 500,
        state: "FAILED",
        message: err.message || "internal error",
      });
    }
  }

  router.post("/dropAnchor", (req, res) => {
    try {
      plugin.anchor.drop({
        position: req.body.position,
        radius: req.body.radius,
      });
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/setRadius", (req, res) => {
    try {
      plugin.anchor.setRadius(req.body.radius);
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post("/raiseAnchor", (req, res) => {
    try {
      plugin.anchor.raise();
      res.json({ statusCode: 200, state: "COMPLETED" });
    } catch (err) {
      fail(res, err);
    }
  });
}

module.exports = { register };
