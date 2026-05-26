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

export class Utils {
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

  static isFresh(data, max_age = 300) {
    if (!data)
      return false;
    const date = new Date(data.timestamp);
    const ageInSecs = (Date.now() - date) / 1000;
    return ageInSecs <= max_age;
  }
}
