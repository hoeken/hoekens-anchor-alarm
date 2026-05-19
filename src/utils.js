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

class Utils {
  static checkEngineState(app) {
    const propulsion = app.getSelfPath("propulsion");

    if (typeof propulsion !== "undefined") {
      const propulsionKeys = Object.keys(propulsion);

      for (let key of propulsionKeys) {
        if (
          propulsion[key] &&
          propulsion[key].revolutions &&
          Utils.isFresh(propulsion[key].revolutions) &&
          propulsion[key].revolutions.value > 0
        )
          return true;
        if (
          propulsion[key] &&
          propulsion[key].state &&
          Utils.isFresh(propulsion[key].state) &&
          propulsion[key].state.value === "started"
        )
          return true;
      }
    }

    return false;
  }

  static calc_distance(lat1, lon1, lat2, lon2) {
    var R = 6371000; // Radius of the earth in m
    var dLat = Utils.degsToRad(lat2 - lat1);
    var dLon = Utils.degsToRad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(Utils.degsToRad(lat1)) *
      Math.cos(Utils.degsToRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in m
    return d;
  }

  static degsToRad(degrees) {
    return degrees * (Math.PI / 180.0);
  }

  static isFresh(data, max_age = 300) {
    if (!data)
      return false;
    const date = new Date(data.timestamp);
    const ageInSecs = (Date.now() - date) / 1000;
    return ageInSecs <= max_age;
  }
}

module.exports = Utils;
