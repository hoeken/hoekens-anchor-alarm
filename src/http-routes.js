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

function register(app, plugin, router) {
  router.post("/dropAnchor", (req, res) => {
    const position = req.body["position"];

    if (typeof position == "undefined") {
      app.debug("no position supplied");
      res.status(403);
      res.json({
        statusCode: 403,
        state: "FAILED",
        message: "no position supplied",
      });
    } else {
      app.debug(
        "set anchor position to: " +
        position.latitude +
        " " +
        position.longitude,
      );
      let radius = req.body["radius"];
      if (typeof radius == "undefined")
        radius = null;

      plugin.updateAnchorState({
        anchorPosition: position,
        currentRadius: 0,
        maxRadius: radius,
        isSet: true,
      });

      plugin.configuration["position"] = {
        latitude: parseFloat(position.latitude),
        longitude: parseFloat(position.longitude),
      };
      plugin.configuration["radius"] = parseFloat(radius);
      plugin.configuration["on"] = true;

      plugin.startWatchingPosition();

      try {
        plugin.savePluginOptions();
        res.json({
          statusCode: 200,
          state: "COMPLETED",
        });
      } catch (err) {
        app.error(err);
        res.status(500);
        res.json({
          statusCode: 500,
          state: "FAILED",
          message: "can't save config",
        });
      }
    }
  });

  router.post("/setRadius", (req, res) => {
    let position = app.getSelfPath("navigation.position");
    if (position.value)
      position = position.value;
    if (typeof position == "undefined") {
      app.debug("no position supplied");
      res.status(403);
      res.json({
        statusCode: 403,
        state: "FAILED",
        message: "no position supplied",
      });
    } else {
      const radius = req.body["radius"];
      if (typeof radius == "undefined") {
        app.debug("no radius supplied");
        res.status(403);
        res.json({
          statusCode: 403,
          state: "FAILED",
          message: "no radius supplied",
        });
        return;
      }

      app.debug("set anchor radius: " + radius);

      plugin.updateAnchorState({
        vesselPosition: position,
        anchorPosition: plugin.configuration.position,
        maxRadius: radius,
        isSet: false,
      });

      plugin.configuration["radius"] = parseFloat(radius);

      try {
        plugin.savePluginOptions();
        res.json({
          statusCode: 200,
          state: "COMPLETED",
        });
      } catch (err) {
        app.error(err);
        res.status(500);
        res.json({
          statusCode: 500,
          state: "FAILED",
          message: "can't save config",
        });
      }
    }
  });

  router.post("/raiseAnchor", (req, res) => {
    try {
      plugin.raiseAnchor();
      res.json({
        statusCode: 200,
        state: "COMPLETED",
      });
    } catch (err) {
      app.error(err);
      res.status(500);
      res.json({
        statusCode: 500,
        state: "FAILED",
        message: "can't save config",
      });
    }
  });
}

module.exports = { register };
