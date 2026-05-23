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

export class SignalKBus {
  constructor(app, pluginId) {
    this.app = app;
    this.pluginId = pluginId;
    this.deltaQueue = [];
    this.metaQueue = [];
  }

  queueDelta(path, value) {
    this.deltaQueue.push({ path, value });
  }

  queueMeta(path, value) {
    this.metaQueue.push({ path, value });
  }

  sendDeltas() {
    if (!this.deltaQueue.length)
      return;

    this.app.handleMessage(this.pluginId, {
      updates: [{ values: this.deltaQueue }],
    });

    this.deltaQueue = [];
  }

  sendMetas() {
    if (!this.metaQueue.length)
      return;

    this.app.handleMessage(this.pluginId, {
      updates: [{ meta: this.metaQueue }],
    });

    this.metaQueue = [];
  }

  sendUpdates() {
    this.sendDeltas();
    this.sendMetas();
  }
}
