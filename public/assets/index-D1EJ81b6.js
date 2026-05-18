//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn((fn = 0))), res);
var __commonJSMin = (cb, mod) => () => (
  mod || (cb((mod = { exports: {} }).exports, mod), (cb = null)),
  mod.exports
);
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
    });
  if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
  return target;
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === "object") || typeof from === "function")
    for (
      var keys = __getOwnPropNames(from), i = 0, n = keys.length, key;
      i < n;
      i++
    ) {
      key = keys[i];
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: ((k) => from[k]).bind(null, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
    }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, "default", {
          value: mod,
          enumerable: true,
        })
      : target,
    mod,
  )
);
var __toCommonJS = (mod) =>
  __hasOwnProp.call(mod, "module.exports")
    ? mod["module.exports"]
    : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
//#endregion
//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]'))
    processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes)
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true,
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
//#endregion
//#region node_modules/@signalk/client/node_modules/eventemitter3/index.js
var require_eventemitter3 = /* @__PURE__ */ __commonJSMin((exports, module) => {
  var has = Object.prototype.hasOwnProperty,
    prefix = "~";
  /**
   * Constructor to create a storage for our `EE` objects.
   * An `Events` instance is a plain object whose properties are event names.
   *
   * @constructor
   * @private
   */
  function Events() {}
  if (Object.create) {
    Events.prototype = Object.create(null);
    if (!new Events().__proto__) prefix = false;
  }
  /**
   * Representation of a single event listener.
   *
   * @param {Function} fn The listener function.
   * @param {*} context The context to invoke the listener with.
   * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
   * @constructor
   * @private
   */
  function EE(fn, context, once) {
    this.fn = fn;
    this.context = context;
    this.once = once || false;
  }
  /**
   * Add a listener for a given event.
   *
   * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn The listener function.
   * @param {*} context The context to invoke the listener with.
   * @param {Boolean} once Specify if the listener is a one-time listener.
   * @returns {EventEmitter}
   * @private
   */
  function addListener(emitter, event, fn, context, once) {
    if (typeof fn !== "function")
      throw new TypeError("The listener must be a function");
    var listener = new EE(fn, context || emitter, once),
      evt = prefix ? prefix + event : event;
    if (!emitter._events[evt])
      ((emitter._events[evt] = listener), emitter._eventsCount++);
    else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
    else emitter._events[evt] = [emitter._events[evt], listener];
    return emitter;
  }
  /**
   * Clear event by name.
   *
   * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
   * @param {(String|Symbol)} evt The Event name.
   * @private
   */
  function clearEvent(emitter, evt) {
    if (--emitter._eventsCount === 0) emitter._events = new Events();
    else delete emitter._events[evt];
  }
  /**
   * Minimal `EventEmitter` interface that is molded against the Node.js
   * `EventEmitter` interface.
   *
   * @constructor
   * @public
   */
  function EventEmitter() {
    this._events = new Events();
    this._eventsCount = 0;
  }
  /**
   * Return an array listing the events for which the emitter has registered
   * listeners.
   *
   * @returns {Array}
   * @public
   */
  EventEmitter.prototype.eventNames = function eventNames() {
    var names = [],
      events,
      name;
    if (this._eventsCount === 0) return names;
    for (name in (events = this._events))
      if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
    if (Object.getOwnPropertySymbols)
      return names.concat(Object.getOwnPropertySymbols(events));
    return names;
  };
  /**
   * Return the listeners registered for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @returns {Array} The registered listeners.
   * @public
   */
  EventEmitter.prototype.listeners = function listeners(event) {
    var evt = prefix ? prefix + event : event,
      handlers = this._events[evt];
    if (!handlers) return [];
    if (handlers.fn) return [handlers.fn];
    for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++)
      ee[i] = handlers[i].fn;
    return ee;
  };
  /**
   * Return the number of listeners listening to a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @returns {Number} The number of listeners.
   * @public
   */
  EventEmitter.prototype.listenerCount = function listenerCount(event) {
    var evt = prefix ? prefix + event : event,
      listeners = this._events[evt];
    if (!listeners) return 0;
    if (listeners.fn) return 1;
    return listeners.length;
  };
  /**
   * Calls each of the listeners registered for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @returns {Boolean} `true` if the event had listeners, else `false`.
   * @public
   */
  EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
    var evt = prefix ? prefix + event : event;
    if (!this._events[evt]) return false;
    var listeners = this._events[evt],
      len = arguments.length,
      args,
      i;
    if (listeners.fn) {
      if (listeners.once)
        this.removeListener(event, listeners.fn, void 0, true);
      switch (len) {
        case 1:
          return (listeners.fn.call(listeners.context), true);
        case 2:
          return (listeners.fn.call(listeners.context, a1), true);
        case 3:
          return (listeners.fn.call(listeners.context, a1, a2), true);
        case 4:
          return (listeners.fn.call(listeners.context, a1, a2, a3), true);
        case 5:
          return (listeners.fn.call(listeners.context, a1, a2, a3, a4), true);
        case 6:
          return (
            listeners.fn.call(listeners.context, a1, a2, a3, a4, a5),
            true
          );
      }
      for (i = 1, args = new Array(len - 1); i < len; i++)
        args[i - 1] = arguments[i];
      listeners.fn.apply(listeners.context, args);
    } else {
      var length = listeners.length,
        j;
      for (i = 0; i < length; i++) {
        if (listeners[i].once)
          this.removeListener(event, listeners[i].fn, void 0, true);
        switch (len) {
          case 1:
            listeners[i].fn.call(listeners[i].context);
            break;
          case 2:
            listeners[i].fn.call(listeners[i].context, a1);
            break;
          case 3:
            listeners[i].fn.call(listeners[i].context, a1, a2);
            break;
          case 4:
            listeners[i].fn.call(listeners[i].context, a1, a2, a3);
            break;
          default:
            if (!args)
              for (j = 1, args = new Array(len - 1); j < len; j++)
                args[j - 1] = arguments[j];
            listeners[i].fn.apply(listeners[i].context, args);
        }
      }
    }
    return true;
  };
  /**
   * Add a listener for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn The listener function.
   * @param {*} [context=this] The context to invoke the listener with.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.on = function on(event, fn, context) {
    return addListener(this, event, fn, context, false);
  };
  /**
   * Add a one-time listener for a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn The listener function.
   * @param {*} [context=this] The context to invoke the listener with.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.once = function once(event, fn, context) {
    return addListener(this, event, fn, context, true);
  };
  /**
   * Remove the listeners of a given event.
   *
   * @param {(String|Symbol)} event The event name.
   * @param {Function} fn Only remove the listeners that match this function.
   * @param {*} context Only remove the listeners that have this context.
   * @param {Boolean} once Only remove one-time listeners.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.removeListener = function removeListener(
    event,
    fn,
    context,
    once,
  ) {
    var evt = prefix ? prefix + event : event;
    if (!this._events[evt]) return this;
    if (!fn) {
      clearEvent(this, evt);
      return this;
    }
    var listeners = this._events[evt];
    if (listeners.fn) {
      if (
        listeners.fn === fn &&
        (!once || listeners.once) &&
        (!context || listeners.context === context)
      )
        clearEvent(this, evt);
    } else {
      for (var i = 0, events = [], length = listeners.length; i < length; i++)
        if (
          listeners[i].fn !== fn ||
          (once && !listeners[i].once) ||
          (context && listeners[i].context !== context)
        )
          events.push(listeners[i]);
      if (events.length)
        this._events[evt] = events.length === 1 ? events[0] : events;
      else clearEvent(this, evt);
    }
    return this;
  };
  /**
   * Remove all listeners, or those of the specified event.
   *
   * @param {(String|Symbol)} [event] The event name.
   * @returns {EventEmitter} `this`.
   * @public
   */
  EventEmitter.prototype.removeAllListeners = function removeAllListeners(
    event,
  ) {
    var evt;
    if (event) {
      evt = prefix ? prefix + event : event;
      if (this._events[evt]) clearEvent(this, evt);
    } else {
      this._events = new Events();
      this._eventsCount = 0;
    }
    return this;
  };
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
  EventEmitter.prototype.addListener = EventEmitter.prototype.on;
  EventEmitter.prefixed = prefix;
  EventEmitter.EventEmitter = EventEmitter;
  if ("undefined" !== typeof module) module.exports = EventEmitter;
});
//#endregion
//#region node_modules/isomorphic-ws/browser.js
var require_browser$1 = /* @__PURE__ */ __commonJSMin((exports, module) => {
  var ws = null;
  if (typeof WebSocket !== "undefined") ws = WebSocket;
  else if (typeof MozWebSocket !== "undefined") ws = MozWebSocket;
  else if (typeof global !== "undefined")
    ws = global.WebSocket || global.MozWebSocket;
  else if (typeof window !== "undefined")
    ws = window.WebSocket || window.MozWebSocket;
  else if (typeof self !== "undefined")
    ws = self.WebSocket || self.MozWebSocket;
  module.exports = ws;
});
//#endregion
//#region node_modules/cross-fetch/dist/browser-ponyfill.js
var require_browser_ponyfill = /* @__PURE__ */ __commonJSMin(
  (exports, module) => {
    var __global__ =
      (typeof globalThis !== "undefined" && globalThis) ||
      (typeof self !== "undefined" && self) ||
      (typeof global !== "undefined" && global);
    var __globalThis__ = (function () {
      function F() {
        this.fetch = false;
        this.DOMException = __global__.DOMException;
      }
      F.prototype = __global__;
      return new F();
    })();
    (function (globalThis) {
      (function (exports$1) {
        var g =
          (typeof globalThis !== "undefined" && globalThis) ||
          (typeof self !== "undefined" && self) ||
          (typeof global !== "undefined" && global) ||
          {};
        var support = {
          searchParams: "URLSearchParams" in g,
          iterable: "Symbol" in g && "iterator" in Symbol,
          blob:
            "FileReader" in g &&
            "Blob" in g &&
            (function () {
              try {
                new Blob();
                return true;
              } catch (e) {
                return false;
              }
            })(),
          formData: "FormData" in g,
          arrayBuffer: "ArrayBuffer" in g,
        };
        function isDataView(obj) {
          return obj && DataView.prototype.isPrototypeOf(obj);
        }
        if (support.arrayBuffer) {
          var viewClasses = [
            "[object Int8Array]",
            "[object Uint8Array]",
            "[object Uint8ClampedArray]",
            "[object Int16Array]",
            "[object Uint16Array]",
            "[object Int32Array]",
            "[object Uint32Array]",
            "[object Float32Array]",
            "[object Float64Array]",
          ];
          var isArrayBufferView =
            ArrayBuffer.isView ||
            function (obj) {
              return (
                obj &&
                viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
              );
            };
        }
        function normalizeName(name) {
          if (typeof name !== "string") name = String(name);
          if (/[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(name) || name === "")
            throw new TypeError(
              'Invalid character in header field name: "' + name + '"',
            );
          return name.toLowerCase();
        }
        function normalizeValue(value) {
          if (typeof value !== "string") value = String(value);
          return value;
        }
        function iteratorFor(items) {
          var iterator = {
            next: function () {
              var value = items.shift();
              return {
                done: value === void 0,
                value,
              };
            },
          };
          if (support.iterable)
            iterator[Symbol.iterator] = function () {
              return iterator;
            };
          return iterator;
        }
        function Headers(headers) {
          this.map = {};
          if (headers instanceof Headers)
            headers.forEach(function (value, name) {
              this.append(name, value);
            }, this);
          else if (Array.isArray(headers))
            headers.forEach(function (header) {
              if (header.length != 2)
                throw new TypeError(
                  "Headers constructor: expected name/value pair to be length 2, found" +
                    header.length,
                );
              this.append(header[0], header[1]);
            }, this);
          else if (headers)
            Object.getOwnPropertyNames(headers).forEach(function (name) {
              this.append(name, headers[name]);
            }, this);
        }
        Headers.prototype.append = function (name, value) {
          name = normalizeName(name);
          value = normalizeValue(value);
          var oldValue = this.map[name];
          this.map[name] = oldValue ? oldValue + ", " + value : value;
        };
        Headers.prototype["delete"] = function (name) {
          delete this.map[normalizeName(name)];
        };
        Headers.prototype.get = function (name) {
          name = normalizeName(name);
          return this.has(name) ? this.map[name] : null;
        };
        Headers.prototype.has = function (name) {
          return this.map.hasOwnProperty(normalizeName(name));
        };
        Headers.prototype.set = function (name, value) {
          this.map[normalizeName(name)] = normalizeValue(value);
        };
        Headers.prototype.forEach = function (callback, thisArg) {
          for (var name in this.map)
            if (this.map.hasOwnProperty(name))
              callback.call(thisArg, this.map[name], name, this);
        };
        Headers.prototype.keys = function () {
          var items = [];
          this.forEach(function (value, name) {
            items.push(name);
          });
          return iteratorFor(items);
        };
        Headers.prototype.values = function () {
          var items = [];
          this.forEach(function (value) {
            items.push(value);
          });
          return iteratorFor(items);
        };
        Headers.prototype.entries = function () {
          var items = [];
          this.forEach(function (value, name) {
            items.push([name, value]);
          });
          return iteratorFor(items);
        };
        if (support.iterable)
          Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
        function consumed(body) {
          if (body._noBody) return;
          if (body.bodyUsed)
            return Promise.reject(
              /* @__PURE__ */ new TypeError("Already read"),
            );
          body.bodyUsed = true;
        }
        function fileReaderReady(reader) {
          return new Promise(function (resolve, reject) {
            reader.onload = function () {
              resolve(reader.result);
            };
            reader.onerror = function () {
              reject(reader.error);
            };
          });
        }
        function readBlobAsArrayBuffer(blob) {
          var reader = new FileReader();
          var promise = fileReaderReady(reader);
          reader.readAsArrayBuffer(blob);
          return promise;
        }
        function readBlobAsText(blob) {
          var reader = new FileReader();
          var promise = fileReaderReady(reader);
          var match = /charset=([A-Za-z0-9_-]+)/.exec(blob.type);
          var encoding = match ? match[1] : "utf-8";
          reader.readAsText(blob, encoding);
          return promise;
        }
        function readArrayBufferAsText(buf) {
          var view = new Uint8Array(buf);
          var chars = new Array(view.length);
          for (var i = 0; i < view.length; i++)
            chars[i] = String.fromCharCode(view[i]);
          return chars.join("");
        }
        function bufferClone(buf) {
          if (buf.slice) return buf.slice(0);
          else {
            var view = new Uint8Array(buf.byteLength);
            view.set(new Uint8Array(buf));
            return view.buffer;
          }
        }
        function Body() {
          this.bodyUsed = false;
          this._initBody = function (body) {
            this.bodyUsed = this.bodyUsed;
            this._bodyInit = body;
            if (!body) {
              this._noBody = true;
              this._bodyText = "";
            } else if (typeof body === "string") this._bodyText = body;
            else if (support.blob && Blob.prototype.isPrototypeOf(body))
              this._bodyBlob = body;
            else if (support.formData && FormData.prototype.isPrototypeOf(body))
              this._bodyFormData = body;
            else if (
              support.searchParams &&
              URLSearchParams.prototype.isPrototypeOf(body)
            )
              this._bodyText = body.toString();
            else if (support.arrayBuffer && support.blob && isDataView(body)) {
              this._bodyArrayBuffer = bufferClone(body.buffer);
              this._bodyInit = new Blob([this._bodyArrayBuffer]);
            } else if (
              support.arrayBuffer &&
              (ArrayBuffer.prototype.isPrototypeOf(body) ||
                isArrayBufferView(body))
            )
              this._bodyArrayBuffer = bufferClone(body);
            else this._bodyText = body = Object.prototype.toString.call(body);
            if (!this.headers.get("content-type")) {
              if (typeof body === "string")
                this.headers.set("content-type", "text/plain;charset=UTF-8");
              else if (this._bodyBlob && this._bodyBlob.type)
                this.headers.set("content-type", this._bodyBlob.type);
              else if (
                support.searchParams &&
                URLSearchParams.prototype.isPrototypeOf(body)
              )
                this.headers.set(
                  "content-type",
                  "application/x-www-form-urlencoded;charset=UTF-8",
                );
            }
          };
          if (support.blob)
            this.blob = function () {
              var rejected = consumed(this);
              if (rejected) return rejected;
              if (this._bodyBlob) return Promise.resolve(this._bodyBlob);
              else if (this._bodyArrayBuffer)
                return Promise.resolve(new Blob([this._bodyArrayBuffer]));
              else if (this._bodyFormData)
                throw new Error("could not read FormData body as blob");
              else return Promise.resolve(new Blob([this._bodyText]));
            };
          this.arrayBuffer = function () {
            if (this._bodyArrayBuffer) {
              var isConsumed = consumed(this);
              if (isConsumed) return isConsumed;
              else if (ArrayBuffer.isView(this._bodyArrayBuffer))
                return Promise.resolve(
                  this._bodyArrayBuffer.buffer.slice(
                    this._bodyArrayBuffer.byteOffset,
                    this._bodyArrayBuffer.byteOffset +
                      this._bodyArrayBuffer.byteLength,
                  ),
                );
              else return Promise.resolve(this._bodyArrayBuffer);
            } else if (support.blob)
              return this.blob().then(readBlobAsArrayBuffer);
            else throw new Error("could not read as ArrayBuffer");
          };
          this.text = function () {
            var rejected = consumed(this);
            if (rejected) return rejected;
            if (this._bodyBlob) return readBlobAsText(this._bodyBlob);
            else if (this._bodyArrayBuffer)
              return Promise.resolve(
                readArrayBufferAsText(this._bodyArrayBuffer),
              );
            else if (this._bodyFormData)
              throw new Error("could not read FormData body as text");
            else return Promise.resolve(this._bodyText);
          };
          if (support.formData)
            this.formData = function () {
              return this.text().then(decode);
            };
          this.json = function () {
            return this.text().then(JSON.parse);
          };
          return this;
        }
        var methods = [
          "CONNECT",
          "DELETE",
          "GET",
          "HEAD",
          "OPTIONS",
          "PATCH",
          "POST",
          "PUT",
          "TRACE",
        ];
        function normalizeMethod(method) {
          var upcased = method.toUpperCase();
          return methods.indexOf(upcased) > -1 ? upcased : method;
        }
        function Request(input, options) {
          if (!(this instanceof Request))
            throw new TypeError(
              'Please use the "new" operator, this DOM object constructor cannot be called as a function.',
            );
          options = options || {};
          var body = options.body;
          if (input instanceof Request) {
            if (input.bodyUsed) throw new TypeError("Already read");
            this.url = input.url;
            this.credentials = input.credentials;
            if (!options.headers) this.headers = new Headers(input.headers);
            this.method = input.method;
            this.mode = input.mode;
            this.signal = input.signal;
            if (!body && input._bodyInit != null) {
              body = input._bodyInit;
              input.bodyUsed = true;
            }
          } else this.url = String(input);
          this.credentials =
            options.credentials || this.credentials || "same-origin";
          if (options.headers || !this.headers)
            this.headers = new Headers(options.headers);
          this.method = normalizeMethod(options.method || this.method || "GET");
          this.mode = options.mode || this.mode || null;
          this.signal =
            options.signal ||
            this.signal ||
            (function () {
              if ("AbortController" in g) return new AbortController().signal;
            })();
          this.referrer = null;
          if ((this.method === "GET" || this.method === "HEAD") && body)
            throw new TypeError("Body not allowed for GET or HEAD requests");
          this._initBody(body);
          if (this.method === "GET" || this.method === "HEAD") {
            if (options.cache === "no-store" || options.cache === "no-cache") {
              var reParamSearch = /([?&])_=[^&]*/;
              if (reParamSearch.test(this.url))
                this.url = this.url.replace(
                  reParamSearch,
                  "$1_=" + /* @__PURE__ */ new Date().getTime(),
                );
              else {
                var reQueryString = /\?/;
                this.url +=
                  (reQueryString.test(this.url) ? "&" : "?") +
                  "_=" +
                  /* @__PURE__ */ new Date().getTime();
              }
            }
          }
        }
        Request.prototype.clone = function () {
          return new Request(this, { body: this._bodyInit });
        };
        function decode(body) {
          var form = new FormData();
          body
            .trim()
            .split("&")
            .forEach(function (bytes) {
              if (bytes) {
                var split = bytes.split("=");
                var name = split.shift().replace(/\+/g, " ");
                var value = split.join("=").replace(/\+/g, " ");
                form.append(
                  decodeURIComponent(name),
                  decodeURIComponent(value),
                );
              }
            });
          return form;
        }
        function parseHeaders(rawHeaders) {
          var headers = new Headers();
          rawHeaders
            .replace(/\r?\n[\t ]+/g, " ")
            .split("\r")
            .map(function (header) {
              return header.indexOf("\n") === 0
                ? header.substr(1, header.length)
                : header;
            })
            .forEach(function (line) {
              var parts = line.split(":");
              var key = parts.shift().trim();
              if (key) {
                var value = parts.join(":").trim();
                try {
                  headers.append(key, value);
                } catch (error) {
                  console.warn("Response " + error.message);
                }
              }
            });
          return headers;
        }
        Body.call(Request.prototype);
        function Response(bodyInit, options) {
          if (!(this instanceof Response))
            throw new TypeError(
              'Please use the "new" operator, this DOM object constructor cannot be called as a function.',
            );
          if (!options) options = {};
          this.type = "default";
          this.status = options.status === void 0 ? 200 : options.status;
          if (this.status < 200 || this.status > 599)
            throw new RangeError(
              "Failed to construct 'Response': The status provided (0) is outside the range [200, 599].",
            );
          this.ok = this.status >= 200 && this.status < 300;
          this.statusText =
            options.statusText === void 0 ? "" : "" + options.statusText;
          this.headers = new Headers(options.headers);
          this.url = options.url || "";
          this._initBody(bodyInit);
        }
        Body.call(Response.prototype);
        Response.prototype.clone = function () {
          return new Response(this._bodyInit, {
            status: this.status,
            statusText: this.statusText,
            headers: new Headers(this.headers),
            url: this.url,
          });
        };
        Response.error = function () {
          var response = new Response(null, {
            status: 200,
            statusText: "",
          });
          response.ok = false;
          response.status = 0;
          response.type = "error";
          return response;
        };
        var redirectStatuses = [301, 302, 303, 307, 308];
        Response.redirect = function (url, status) {
          if (redirectStatuses.indexOf(status) === -1)
            throw new RangeError("Invalid status code");
          return new Response(null, {
            status,
            headers: { location: url },
          });
        };
        exports$1.DOMException = g.DOMException;
        try {
          new exports$1.DOMException();
        } catch (err) {
          exports$1.DOMException = function (message, name) {
            this.message = message;
            this.name = name;
            var error = Error(message);
            this.stack = error.stack;
          };
          exports$1.DOMException.prototype = Object.create(Error.prototype);
          exports$1.DOMException.prototype.constructor = exports$1.DOMException;
        }
        function fetch(input, init) {
          return new Promise(function (resolve, reject) {
            var request = new Request(input, init);
            if (request.signal && request.signal.aborted)
              return reject(
                new exports$1.DOMException("Aborted", "AbortError"),
              );
            var xhr = new XMLHttpRequest();
            function abortXhr() {
              xhr.abort();
            }
            xhr.onload = function () {
              var options = {
                statusText: xhr.statusText,
                headers: parseHeaders(xhr.getAllResponseHeaders() || ""),
              };
              if (
                request.url.indexOf("file://") === 0 &&
                (xhr.status < 200 || xhr.status > 599)
              )
                options.status = 200;
              else options.status = xhr.status;
              options.url =
                "responseURL" in xhr
                  ? xhr.responseURL
                  : options.headers.get("X-Request-URL");
              var body = "response" in xhr ? xhr.response : xhr.responseText;
              setTimeout(function () {
                resolve(new Response(body, options));
              }, 0);
            };
            xhr.onerror = function () {
              setTimeout(function () {
                reject(/* @__PURE__ */ new TypeError("Network request failed"));
              }, 0);
            };
            xhr.ontimeout = function () {
              setTimeout(function () {
                reject(
                  /* @__PURE__ */ new TypeError("Network request timed out"),
                );
              }, 0);
            };
            xhr.onabort = function () {
              setTimeout(function () {
                reject(new exports$1.DOMException("Aborted", "AbortError"));
              }, 0);
            };
            function fixUrl(url) {
              try {
                return url === "" && g.location.href ? g.location.href : url;
              } catch (e) {
                return url;
              }
            }
            xhr.open(request.method, fixUrl(request.url), true);
            if (request.credentials === "include") xhr.withCredentials = true;
            else if (request.credentials === "omit")
              xhr.withCredentials = false;
            if ("responseType" in xhr) {
              if (support.blob) xhr.responseType = "blob";
              else if (support.arrayBuffer) xhr.responseType = "arraybuffer";
            }
            if (
              init &&
              typeof init.headers === "object" &&
              !(
                init.headers instanceof Headers ||
                (g.Headers && init.headers instanceof g.Headers)
              )
            ) {
              var names = [];
              Object.getOwnPropertyNames(init.headers).forEach(function (name) {
                names.push(normalizeName(name));
                xhr.setRequestHeader(name, normalizeValue(init.headers[name]));
              });
              request.headers.forEach(function (value, name) {
                if (names.indexOf(name) === -1)
                  xhr.setRequestHeader(name, value);
              });
            } else
              request.headers.forEach(function (value, name) {
                xhr.setRequestHeader(name, value);
              });
            if (request.signal) {
              request.signal.addEventListener("abort", abortXhr);
              xhr.onreadystatechange = function () {
                if (xhr.readyState === 4)
                  request.signal.removeEventListener("abort", abortXhr);
              };
            }
            xhr.send(
              typeof request._bodyInit === "undefined"
                ? null
                : request._bodyInit,
            );
          });
        }
        fetch.polyfill = true;
        if (!g.fetch) {
          g.fetch = fetch;
          g.Headers = Headers;
          g.Request = Request;
          g.Response = Response;
        }
        exports$1.Headers = Headers;
        exports$1.Request = Request;
        exports$1.Response = Response;
        exports$1.fetch = fetch;
        Object.defineProperty(exports$1, "__esModule", { value: true });
        return exports$1;
      })({});
    })(__globalThis__);
    __globalThis__.fetch.ponyfill = true;
    delete __globalThis__.fetch.polyfill;
    var ctx = __global__.fetch ? __global__ : __globalThis__;
    exports = ctx.fetch;
    exports.default = ctx.fetch;
    exports.fetch = ctx.fetch;
    exports.Headers = ctx.Headers;
    exports.Request = ctx.Request;
    exports.Response = ctx.Response;
    module.exports = exports;
  },
);
//#endregion
//#region node_modules/ms/index.js
var require_ms = /* @__PURE__ */ __commonJSMin((exports, module) => {
  /**
   * Helpers.
   */
  var s = 1e3;
  var m = s * 60;
  var h = m * 60;
  var d = h * 24;
  var w = d * 7;
  var y = d * 365.25;
  /**
   * Parse or format the given `val`.
   *
   * Options:
   *
   *  - `long` verbose formatting [false]
   *
   * @param {String|Number} val
   * @param {Object} [options]
   * @throws {Error} throw an error if val is not a non-empty string or a number
   * @return {String|Number}
   * @api public
   */
  module.exports = function (val, options) {
    options = options || {};
    var type = typeof val;
    if (type === "string" && val.length > 0) return parse(val);
    else if (type === "number" && isFinite(val))
      return options.long ? fmtLong(val) : fmtShort(val);
    throw new Error(
      "val is not a non-empty string or a valid number. val=" +
        JSON.stringify(val),
    );
  };
  /**
   * Parse the given `str` and return milliseconds.
   *
   * @param {String} str
   * @return {Number}
   * @api private
   */
  function parse(str) {
    str = String(str);
    if (str.length > 100) return;
    var match =
      /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str,
      );
    if (!match) return;
    var n = parseFloat(match[1]);
    switch ((match[2] || "ms").toLowerCase()) {
      case "years":
      case "year":
      case "yrs":
      case "yr":
      case "y":
        return n * y;
      case "weeks":
      case "week":
      case "w":
        return n * w;
      case "days":
      case "day":
      case "d":
        return n * d;
      case "hours":
      case "hour":
      case "hrs":
      case "hr":
      case "h":
        return n * h;
      case "minutes":
      case "minute":
      case "mins":
      case "min":
      case "m":
        return n * m;
      case "seconds":
      case "second":
      case "secs":
      case "sec":
      case "s":
        return n * s;
      case "milliseconds":
      case "millisecond":
      case "msecs":
      case "msec":
      case "ms":
        return n;
      default:
        return;
    }
  }
  /**
   * Short format for `ms`.
   *
   * @param {Number} ms
   * @return {String}
   * @api private
   */
  function fmtShort(ms) {
    var msAbs = Math.abs(ms);
    if (msAbs >= d) return Math.round(ms / d) + "d";
    if (msAbs >= h) return Math.round(ms / h) + "h";
    if (msAbs >= m) return Math.round(ms / m) + "m";
    if (msAbs >= s) return Math.round(ms / s) + "s";
    return ms + "ms";
  }
  /**
   * Long format for `ms`.
   *
   * @param {Number} ms
   * @return {String}
   * @api private
   */
  function fmtLong(ms) {
    var msAbs = Math.abs(ms);
    if (msAbs >= d) return plural(ms, msAbs, d, "day");
    if (msAbs >= h) return plural(ms, msAbs, h, "hour");
    if (msAbs >= m) return plural(ms, msAbs, m, "minute");
    if (msAbs >= s) return plural(ms, msAbs, s, "second");
    return ms + " ms";
  }
  /**
   * Pluralization helper.
   */
  function plural(ms, msAbs, n, name) {
    var isPlural = msAbs >= n * 1.5;
    return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
  }
});
//#endregion
//#region node_modules/debug/src/common.js
var require_common = /* @__PURE__ */ __commonJSMin((exports, module) => {
  /**
   * This is the common logic for both the Node.js and web browser
   * implementations of `debug()`.
   */
  function setup(env) {
    createDebug.debug = createDebug;
    createDebug.default = createDebug;
    createDebug.coerce = coerce;
    createDebug.disable = disable;
    createDebug.enable = enable;
    createDebug.enabled = enabled;
    createDebug.humanize = require_ms();
    createDebug.destroy = destroy;
    Object.keys(env).forEach((key) => {
      createDebug[key] = env[key];
    });
    /**
     * The currently active debug mode names, and names to skip.
     */
    createDebug.names = [];
    createDebug.skips = [];
    /**
     * Map of special "%n" handling functions, for the debug "format" argument.
     *
     * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
     */
    createDebug.formatters = {};
    /**
     * Selects a color for a debug namespace
     * @param {String} namespace The namespace string for the debug instance to be colored
     * @return {Number|String} An ANSI color code for the given namespace
     * @api private
     */
    function selectColor(namespace) {
      let hash = 0;
      for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
      }
      return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
    }
    createDebug.selectColor = selectColor;
    /**
     * Create a debugger with the given `namespace`.
     *
     * @param {String} namespace
     * @return {Function}
     * @api public
     */
    function createDebug(namespace) {
      let prevTime;
      let enableOverride = null;
      let namespacesCache;
      let enabledCache;
      function debug(...args) {
        if (!debug.enabled) return;
        const self = debug;
        const curr = Number(/* @__PURE__ */ new Date());
        self.diff = curr - (prevTime || curr);
        self.prev = prevTime;
        self.curr = curr;
        prevTime = curr;
        args[0] = createDebug.coerce(args[0]);
        if (typeof args[0] !== "string") args.unshift("%O");
        let index = 0;
        args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
          if (match === "%%") return "%";
          index++;
          const formatter = createDebug.formatters[format];
          if (typeof formatter === "function") {
            const val = args[index];
            match = formatter.call(self, val);
            args.splice(index, 1);
            index--;
          }
          return match;
        });
        createDebug.formatArgs.call(self, args);
        (self.log || createDebug.log).apply(self, args);
      }
      debug.namespace = namespace;
      debug.useColors = createDebug.useColors();
      debug.color = createDebug.selectColor(namespace);
      debug.extend = extend;
      debug.destroy = createDebug.destroy;
      Object.defineProperty(debug, "enabled", {
        enumerable: true,
        configurable: false,
        get: () => {
          if (enableOverride !== null) return enableOverride;
          if (namespacesCache !== createDebug.namespaces) {
            namespacesCache = createDebug.namespaces;
            enabledCache = createDebug.enabled(namespace);
          }
          return enabledCache;
        },
        set: (v) => {
          enableOverride = v;
        },
      });
      if (typeof createDebug.init === "function") createDebug.init(debug);
      return debug;
    }
    function extend(namespace, delimiter) {
      const newDebug = createDebug(
        this.namespace +
          (typeof delimiter === "undefined" ? ":" : delimiter) +
          namespace,
      );
      newDebug.log = this.log;
      return newDebug;
    }
    /**
     * Enables a debug mode by namespaces. This can include modes
     * separated by a colon and wildcards.
     *
     * @param {String} namespaces
     * @api public
     */
    function enable(namespaces) {
      createDebug.save(namespaces);
      createDebug.namespaces = namespaces;
      createDebug.names = [];
      createDebug.skips = [];
      const split = (typeof namespaces === "string" ? namespaces : "")
        .trim()
        .replace(/\s+/g, ",")
        .split(",")
        .filter(Boolean);
      for (const ns of split)
        if (ns[0] === "-") createDebug.skips.push(ns.slice(1));
        else createDebug.names.push(ns);
    }
    /**
     * Checks if the given string matches a namespace template, honoring
     * asterisks as wildcards.
     *
     * @param {String} search
     * @param {String} template
     * @return {Boolean}
     */
    function matchesTemplate(search, template) {
      let searchIndex = 0;
      let templateIndex = 0;
      let starIndex = -1;
      let matchIndex = 0;
      while (searchIndex < search.length)
        if (
          templateIndex < template.length &&
          (template[templateIndex] === search[searchIndex] ||
            template[templateIndex] === "*")
        )
          if (template[templateIndex] === "*") {
            starIndex = templateIndex;
            matchIndex = searchIndex;
            templateIndex++;
          } else {
            searchIndex++;
            templateIndex++;
          }
        else if (starIndex !== -1) {
          templateIndex = starIndex + 1;
          matchIndex++;
          searchIndex = matchIndex;
        } else return false;
      while (templateIndex < template.length && template[templateIndex] === "*")
        templateIndex++;
      return templateIndex === template.length;
    }
    /**
     * Disable debug output.
     *
     * @return {String} namespaces
     * @api public
     */
    function disable() {
      const namespaces = [
        ...createDebug.names,
        ...createDebug.skips.map((namespace) => "-" + namespace),
      ].join(",");
      createDebug.enable("");
      return namespaces;
    }
    /**
     * Returns true if the given mode name is enabled, false otherwise.
     *
     * @param {String} name
     * @return {Boolean}
     * @api public
     */
    function enabled(name) {
      for (const skip of createDebug.skips)
        if (matchesTemplate(name, skip)) return false;
      for (const ns of createDebug.names)
        if (matchesTemplate(name, ns)) return true;
      return false;
    }
    /**
     * Coerce `val`.
     *
     * @param {Mixed} val
     * @return {Mixed}
     * @api private
     */
    function coerce(val) {
      if (val instanceof Error) return val.stack || val.message;
      return val;
    }
    /**
     * XXX DO NOT USE. This is a temporary stub function.
     * XXX It WILL be removed in the next major release.
     */
    function destroy() {
      console.warn(
        "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.",
      );
    }
    createDebug.enable(createDebug.load());
    return createDebug;
  }
  module.exports = setup;
});
//#endregion
//#region node_modules/debug/src/browser.js
var require_browser = /* @__PURE__ */ __commonJSMin((exports, module) => {
  /**
   * This is the web browser implementation of `debug()`.
   */
  exports.formatArgs = formatArgs;
  exports.save = save;
  exports.load = load;
  exports.useColors = useColors;
  exports.storage = localstorage();
  exports.destroy = (() => {
    let warned = false;
    return () => {
      if (!warned) {
        warned = true;
        console.warn(
          "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.",
        );
      }
    };
  })();
  /**
   * Colors.
   */
  exports.colors = [
    "#0000CC",
    "#0000FF",
    "#0033CC",
    "#0033FF",
    "#0066CC",
    "#0066FF",
    "#0099CC",
    "#0099FF",
    "#00CC00",
    "#00CC33",
    "#00CC66",
    "#00CC99",
    "#00CCCC",
    "#00CCFF",
    "#3300CC",
    "#3300FF",
    "#3333CC",
    "#3333FF",
    "#3366CC",
    "#3366FF",
    "#3399CC",
    "#3399FF",
    "#33CC00",
    "#33CC33",
    "#33CC66",
    "#33CC99",
    "#33CCCC",
    "#33CCFF",
    "#6600CC",
    "#6600FF",
    "#6633CC",
    "#6633FF",
    "#66CC00",
    "#66CC33",
    "#9900CC",
    "#9900FF",
    "#9933CC",
    "#9933FF",
    "#99CC00",
    "#99CC33",
    "#CC0000",
    "#CC0033",
    "#CC0066",
    "#CC0099",
    "#CC00CC",
    "#CC00FF",
    "#CC3300",
    "#CC3333",
    "#CC3366",
    "#CC3399",
    "#CC33CC",
    "#CC33FF",
    "#CC6600",
    "#CC6633",
    "#CC9900",
    "#CC9933",
    "#CCCC00",
    "#CCCC33",
    "#FF0000",
    "#FF0033",
    "#FF0066",
    "#FF0099",
    "#FF00CC",
    "#FF00FF",
    "#FF3300",
    "#FF3333",
    "#FF3366",
    "#FF3399",
    "#FF33CC",
    "#FF33FF",
    "#FF6600",
    "#FF6633",
    "#FF9900",
    "#FF9933",
    "#FFCC00",
    "#FFCC33",
  ];
  /**
   * Currently only WebKit-based Web Inspectors, Firefox >= v31,
   * and the Firebug extension (any Firefox version) are known
   * to support "%c" CSS customizations.
   *
   * TODO: add a `localStorage` variable to explicitly enable/disable colors
   */
  function useColors() {
    if (
      typeof window !== "undefined" &&
      window.process &&
      (window.process.type === "renderer" || window.process.__nwjs)
    )
      return true;
    if (
      typeof navigator !== "undefined" &&
      navigator.userAgent &&
      navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)
    )
      return false;
    let m;
    return (
      (typeof document !== "undefined" &&
        document.documentElement &&
        document.documentElement.style &&
        document.documentElement.style.WebkitAppearance) ||
      (typeof window !== "undefined" &&
        window.console &&
        (window.console.firebug ||
          (window.console.exception && window.console.table))) ||
      (typeof navigator !== "undefined" &&
        navigator.userAgent &&
        (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) &&
        parseInt(m[1], 10) >= 31) ||
      (typeof navigator !== "undefined" &&
        navigator.userAgent &&
        navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/))
    );
  }
  /**
   * Colorize log arguments if enabled.
   *
   * @api public
   */
  function formatArgs(args) {
    args[0] =
      (this.useColors ? "%c" : "") +
      this.namespace +
      (this.useColors ? " %c" : " ") +
      args[0] +
      (this.useColors ? "%c " : " ") +
      "+" +
      module.exports.humanize(this.diff);
    if (!this.useColors) return;
    const c = "color: " + this.color;
    args.splice(1, 0, c, "color: inherit");
    let index = 0;
    let lastC = 0;
    args[0].replace(/%[a-zA-Z%]/g, (match) => {
      if (match === "%%") return;
      index++;
      if (match === "%c") lastC = index;
    });
    args.splice(lastC, 0, c);
  }
  /**
   * Invokes `console.debug()` when available.
   * No-op when `console.debug` is not a "function".
   * If `console.debug` is not available, falls back
   * to `console.log`.
   *
   * @api public
   */
  exports.log = console.debug || console.log || (() => {});
  /**
   * Save `namespaces`.
   *
   * @param {String} namespaces
   * @api private
   */
  function save(namespaces) {
    try {
      if (namespaces) exports.storage.setItem("debug", namespaces);
      else exports.storage.removeItem("debug");
    } catch (error) {}
  }
  /**
   * Load `namespaces`.
   *
   * @return {String} returns the previously persisted debug modes
   * @api private
   */
  function load() {
    let r;
    try {
      r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
    } catch (error) {}
    if (!r && typeof process !== "undefined" && "env" in process) r = {}.DEBUG;
    return r;
  }
  /**
   * Localstorage attempts to return the localstorage.
   *
   * This is necessary because safari throws
   * when a user disables cookies/localstorage
   * and you attempt to access it.
   *
   * @return {LocalStorage}
   * @api private
   */
  function localstorage() {
    try {
      return localStorage;
    } catch (error) {}
  }
  module.exports = require_common()(exports);
  var { formatters } = module.exports;
  /**
   * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
   */
  formatters.j = function (v) {
    try {
      return JSON.stringify(v);
    } catch (error) {
      return "[UnexpectedJSONParseError]: " + error.message;
    }
  };
});
//#endregion
//#region __vite-browser-external
var require___vite_browser_external = /* @__PURE__ */ __commonJSMin(
  (exports, module) => {
    module.exports = {};
  },
);
//#endregion
//#region node_modules/@signalk/client/dist/lib/connection.js
var require_connection = /* @__PURE__ */ __commonJSMin((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default =
    exports.SUPPORTED_STREAM_BEHAVIOUR =
    exports.SUPPORTED_SEND_META =
      void 0;
  var _eventemitter = _interopRequireDefault(require_eventemitter3());
  var _isomorphicWs = _interopRequireDefault(require_browser$1());
  var _crossFetch = _interopRequireDefault(require_browser_ponyfill());
  var _debug = _interopRequireDefault(require_browser());
  var _https = _interopRequireDefault(require___vite_browser_external());
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  /**
   * @description   A Connection represents a single connection to a Signal K server.
   *                It manages both the HTTP connection (REST API) and the WS connection.
   * @author        Fabian Tollenaar <fabian@decipher.industries>
   * @copyright     2018-2019, Fabian Tollenaar. All rights reserved.
   * @license       Apache-2.0
   * @module        @signalk/signalk-js-sdk
   */
  var debug = (0, _debug.default)("signalk-js-sdk/Connection");
  var isNode =
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null;
  var SUPPORTED_STREAM_BEHAVIOUR = (exports.SUPPORTED_STREAM_BEHAVIOUR = {
    self: "self",
    all: "all",
    none: "none",
  });
  var SUPPORTED_SEND_META = (exports.SUPPORTED_SEND_META = { all: "all" });
  var Connection = class extends _eventemitter.default {
    constructor(options, subscriptions = []) {
      super();
      this.options = options;
      this.httpURI = this.buildURI("http");
      this.wsURI = this.buildURI("ws");
      this.shouldDisconnect = false;
      this.connected = false;
      this.socket = null;
      this.lastMessage = -1;
      this.isConnecting = false;
      this.wsKeepaliveIntervalMs = this.options.wsKeepaliveInterval * 1e3;
      this._fetchReady = false;
      this._bearerTokenPrefix = this.options.bearerTokenPrefix || "Bearer";
      this._authenticated = false;
      this._retries = 0;
      this._connection = null;
      this._self = "";
      this._subscriptions = subscriptions;
      this.sendKeepaliveWithReschedule =
        this.sendKeepaliveWithReschedule.bind(this);
      this.onWSMessage = this._onWSMessage.bind(this);
      this.onWSOpen = this._onWSOpen.bind(this);
      this.onWSClose = this._onWSClose.bind(this);
      this.onWSError = this._onWSError.bind(this);
      this._token = {
        kind: "",
        token: "",
      };
      this.reconnect(true);
    }
    get retries() {
      return this._retries;
    }
    set self(data) {
      if (data !== null) this.emit("self", data);
      this._self = data;
    }
    get self() {
      return this._self;
    }
    set connectionInfo(data) {
      if (data !== null) this.emit("connectionInfo", data);
      this._connection = data;
      this.self = data.self;
    }
    get connectionInfo() {
      return this._connection;
    }
    buildURI(protocol) {
      const {
        useTLS,
        hostname,
        port,
        version,
        deltaStreamBehaviour,
        sendMeta,
      } = this.options;
      let uri = useTLS === true ? `${protocol}s://` : `${protocol}://`;
      uri += hostname;
      uri += port === 80 ? "" : `:${port}`;
      uri += "/signalk/";
      uri += version;
      if (protocol === "ws") {
        uri += "/stream";
        const params = [];
        if (
          deltaStreamBehaviour &&
          SUPPORTED_STREAM_BEHAVIOUR.hasOwnProperty(deltaStreamBehaviour) &&
          SUPPORTED_STREAM_BEHAVIOUR[deltaStreamBehaviour] !== ""
        )
          params.push(
            `subscribe=${SUPPORTED_STREAM_BEHAVIOUR[deltaStreamBehaviour]}`,
          );
        if (
          sendMeta &&
          SUPPORTED_SEND_META.hasOwnProperty(sendMeta) &&
          SUPPORTED_SEND_META[sendMeta] !== ""
        )
          params.push(`sendMeta=${SUPPORTED_SEND_META[sendMeta]}`);
        if (params) uri += "?" + params.join("&");
      }
      if (protocol === "http") uri += "/api";
      return uri;
    }
    state() {
      return {
        connecting: this.isConnecting,
        connected: this.connected,
        ready: this.fetchReady,
      };
    }
    disconnect() {
      debug("[disconnect] called");
      this.shouldDisconnect = true;
      this.reconnect();
    }
    backOffAndReconnect() {
      if (this.isConnecting === true) return;
      const { maxTimeBetweenRetries } = this.options;
      let waitTime =
        this._retries < Math.round(maxTimeBetweenRetries / 250)
          ? this._retries * 250
          : maxTimeBetweenRetries;
      if (waitTime === 0) return this.reconnect();
      this.emit("backOffBeforeReconnect", waitTime);
      debug(`[backOffAndReconnect] waiting ${waitTime} ms before reconnecting`);
      setTimeout(() => this.reconnect(), waitTime);
    }
    reconnect(initial = false) {
      if (this.isConnecting === true) return;
      if (this.socket !== null) {
        debug("[reconnect] closing socket");
        this.socket.close();
        return;
      }
      if (initial === false) this._retries += 1;
      if (initial !== true && this._retries === this.options.maxRetries) {
        this.emit("hitMaxRetries");
        this.cleanupListeners();
        return;
      }
      if (initial !== true && this.options.reconnect === false) {
        debug("[reconnect] Not reconnecting, for reconnect is false");
        this.cleanupListeners();
        return;
      }
      if (initial !== true && this.shouldDisconnect === true) {
        debug("[reconnect] not reconnecting, shouldDisconnect is true");
        this.cleanupListeners();
        return;
      }
      debug(`[reconnect] socket is ${this.socket === null ? "" : "not "}NULL`);
      this._fetchReady = false;
      this.shouldDisconnect = false;
      this.isConnecting = true;
      if (this.options.useAuthentication === false) {
        this._fetchReady = true;
        this.emit("fetchReady");
        this.initiateSocket();
        return;
      }
      const authRequest = {
        method: "POST",
        mode: "cors",
        credentials: "same-origin",
        body: JSON.stringify({
          username: String(this.options.username || ""),
          password: String(this.options.password || ""),
        }),
      };
      return this.fetch("/auth/login", authRequest)
        .then((result) => {
          if (
            !result ||
            typeof result !== "object" ||
            !result.hasOwnProperty("token")
          )
            throw new Error(
              `Unexpected response from auth endpoint: ${JSON.stringify(result)}`,
            );
          debug(
            `[reconnect] successful auth request: ${JSON.stringify(result, null, 2)}`,
          );
          this._authenticated = true;
          this._token = {
            kind:
              typeof result.type === "string" && result.type.trim() !== ""
                ? result.type
                : this._bearerTokenPrefix,
            token: result.token,
          };
          this._fetchReady = true;
          this.emit("fetchReady");
          this.initiateSocket();
        })
        .catch((err) => {
          debug(`[reconnect] error logging in: ${err.message}, reconnecting`);
          this.emit("error", err);
          this._retries += 1;
          this.isConnecting = false;
          return this.backOffAndReconnect();
        });
    }
    setAuthenticated(token, kind = "JWT") {
      this.emit("fetchReady");
      this._authenticated = true;
      this._token = {
        kind,
        token,
      };
    }
    initiateSocket() {
      if (
        isNode &&
        this.options.useTLS &&
        this.options.rejectUnauthorized === false
      )
        this.socket = new _isomorphicWs.default(this.wsURI, {
          rejectUnauthorized: false,
        });
      else this.socket = new _isomorphicWs.default(this.wsURI);
      this.socket.addEventListener("message", this.onWSMessage);
      this.socket.addEventListener("open", this.onWSOpen);
      this.socket.addEventListener("error", this.onWSError);
      this.socket.addEventListener("close", this.onWSClose);
    }
    cleanupListeners() {
      debug(`[cleanupListeners] resetting auth and removing listeners`);
      this._authenticated = false;
      this._token = {
        kind: "",
        token: "",
      };
      this.removeAllListeners();
    }
    sendKeepaliveWithReschedule() {
      if (this.connected === true) {
        if (this.lastMessage < Date.now() - this.wsKeepaliveIntervalMs)
          this.socket.send("{}");
        setTimeout(
          this.sendKeepaliveWithReschedule,
          this.wsKeepaliveIntervalMs,
        );
      }
    }
    _onWSMessage(evt) {
      this.lastMessage = Date.now();
      let data = evt.data;
      try {
        if (typeof data === "string") data = JSON.parse(data);
      } catch (e) {
        console.error(
          `[Connection: ${this.options.hostname}] Error parsing data: ${e.message}`,
        );
      }
      if (
        data &&
        typeof data === "object" &&
        data.hasOwnProperty("name") &&
        data.hasOwnProperty("version") &&
        data.hasOwnProperty("roles")
      )
        this.connectionInfo = data;
      this.emit("message", data);
    }
    _onWSOpen() {
      this.connected = true;
      this.isConnecting = false;
      if (this._subscriptions.length > 0) {
        const subscriptions = flattenSubscriptions(this._subscriptions);
        this.subscribe(subscriptions);
      }
      this._retries = 0;
      if (this.options.wsKeepaliveInterval > 0)
        this.sendKeepaliveWithReschedule();
      this.emit("connect");
    }
    _onWSError(err) {
      debug("[_onWSError] WS error", err.message || "");
      this.emit("error", err);
      this.backOffAndReconnect();
    }
    _onWSClose(evt) {
      debug("[_onWSClose] called with wsURI:", this.wsURI);
      this.socket.removeEventListener("message", this.onWSMessage);
      this.socket.removeEventListener("open", this.onWSOpen);
      this.socket.removeEventListener("error", this.onWSError);
      this.socket.removeEventListener("close", this.onWSClose);
      this.connected = false;
      this.isConnecting = false;
      this.socket = null;
      this.emit("disconnect", evt);
      this.backOffAndReconnect();
    }
    unsubscribe() {
      if (this.connected !== true || this.socket === null) {
        debug("Not connected to socket");
        return;
      }
      this.send(
        JSON.stringify({
          context: "*",
          unsubscribe: [{ path: "*" }],
        }),
      );
    }
    subscribe(subscriptions = []) {
      if (
        !Array.isArray(subscriptions) &&
        subscriptions &&
        typeof subscriptions === "object" &&
        subscriptions.hasOwnProperty("subscribe")
      )
        subscriptions = [subscriptions];
      subscriptions.forEach((sub) => {
        this.send(JSON.stringify(sub));
      });
    }
    send(data) {
      if (this.connected !== true || this.socket === null)
        return Promise.reject(
          /* @__PURE__ */ new Error("Not connected to WebSocket"),
        );
      if (typeof data === "string")
        try {
          data = JSON.parse(data);
        } catch (e) {
          debug(`[send] data is string but not valid JSON: ${e.message}`);
        }
      const isObj = data && typeof data === "object";
      try {
        if (isObj) data = JSON.stringify(data);
      } catch (e) {
        return Promise.reject(e);
      }
      debug(`Sending data to socket: ${data}`);
      const result = this.socket.send(data);
      return Promise.resolve(result);
    }
    fetch(path, opts) {
      if (path.charAt(0) !== "/") path = `/${path}`;
      if (!opts || typeof opts !== "object") opts = { method: "GET" };
      if (!opts.headers || typeof opts.headers !== "object")
        opts.headers = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };
      if (this._authenticated === true && !path.includes("auth/login")) {
        opts.headers = {
          ...opts.headers,
          Authorization: `${this._token.kind} ${this._token.token}`,
        };
        opts.credentials = "same-origin";
        opts.mode = "cors";
        debug(`[fetch] enriching fetch options with in-memory token`);
      }
      if (
        isNode &&
        this.options.useTLS &&
        this.options.rejectUnauthorized === false
      )
        opts.agent = new _https.default.Agent({ rejectUnauthorized: false });
      let URI = `${this.httpURI}${path}`;
      if (URI.includes("/api/auth/login"))
        URI = URI.replace("/api/auth/login", "/auth/login");
      if (URI.includes("/api/access/requests"))
        URI = URI.replace("/api/access/requests", "/access/requests");
      if (URI.includes("/signalk/v1/api/security"))
        URI = URI.replace("/signalk/v1/api/security", "/security");
      debug(
        `[fetch] ${opts.method || "GET"} ${URI} ${JSON.stringify(opts, null, 2)}`,
      );
      return (0, _crossFetch.default)(URI, opts).then((response) => {
        if (!response.ok)
          throw new Error(
            `Error fetching ${URI}: ${response.status} ${response.statusText}`,
          );
        if (response.headers.get("content-type").includes("application/json"))
          return response.json();
        return response.text();
      });
    }
  };
  exports.default = Connection;
  var flattenSubscriptions = (subscriptionCommands) => {
    const commandPerContext = {};
    subscriptionCommands.forEach((command) => {
      if (!Array.isArray(commandPerContext[command.context]))
        commandPerContext[command.context] = [];
      commandPerContext[command.context] = commandPerContext[
        command.context
      ].concat(command.subscribe);
    });
    return Object.keys(commandPerContext).map((context) => {
      const subscription = {
        context,
        subscribe: commandPerContext[context],
      };
      if (subscription.subscribe.length > 0) {
        const paths = [];
        subscription.subscribe = subscription.subscribe.reduce(
          (list, command) => {
            if (!paths.includes(command.path)) paths.push(command.path);
            else {
              const index = list.findIndex(
                (candidate) => candidate.path === command.path,
              );
              if (index !== -1) list.splice(index, 1);
            }
            list.push(command);
            return list;
          },
          [],
        );
      }
      return subscription;
    });
  };
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/rng.js
function rng() {
  if (!getRandomValues) {
    getRandomValues =
      (typeof crypto !== "undefined" &&
        crypto.getRandomValues &&
        crypto.getRandomValues.bind(crypto)) ||
      (typeof msCrypto !== "undefined" &&
        typeof msCrypto.getRandomValues === "function" &&
        msCrypto.getRandomValues.bind(msCrypto));
    if (!getRandomValues)
      throw new Error(
        "crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported",
      );
  }
  return getRandomValues(rnds8);
}
var getRandomValues, rnds8;
var init_rng = __esmMin(() => {
  rnds8 = new Uint8Array(16);
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/regex.js
var regex_default;
var init_regex = __esmMin(() => {
  regex_default =
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/validate.js
function validate(uuid) {
  return typeof uuid === "string" && regex_default.test(uuid);
}
var init_validate = __esmMin(() => {
  init_regex();
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/stringify.js
function stringify(arr) {
  var offset =
    arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
  var uuid = (
    byteToHex[arr[offset + 0]] +
    byteToHex[arr[offset + 1]] +
    byteToHex[arr[offset + 2]] +
    byteToHex[arr[offset + 3]] +
    "-" +
    byteToHex[arr[offset + 4]] +
    byteToHex[arr[offset + 5]] +
    "-" +
    byteToHex[arr[offset + 6]] +
    byteToHex[arr[offset + 7]] +
    "-" +
    byteToHex[arr[offset + 8]] +
    byteToHex[arr[offset + 9]] +
    "-" +
    byteToHex[arr[offset + 10]] +
    byteToHex[arr[offset + 11]] +
    byteToHex[arr[offset + 12]] +
    byteToHex[arr[offset + 13]] +
    byteToHex[arr[offset + 14]] +
    byteToHex[arr[offset + 15]]
  ).toLowerCase();
  if (!validate(uuid)) throw TypeError("Stringified UUID is invalid");
  return uuid;
}
var byteToHex, i;
var init_stringify = __esmMin(() => {
  init_validate();
  byteToHex = [];
  for (i = 0; i < 256; ++i) byteToHex.push((i + 256).toString(16).substr(1));
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/v1.js
function v1(options, buf, offset) {
  var i = (buf && offset) || 0;
  var b = buf || new Array(16);
  options = options || {};
  var node = options.node || _nodeId;
  var clockseq = options.clockseq !== void 0 ? options.clockseq : _clockseq;
  if (node == null || clockseq == null) {
    var seedBytes = options.random || (options.rng || rng)();
    if (node == null)
      node = _nodeId = [
        seedBytes[0] | 1,
        seedBytes[1],
        seedBytes[2],
        seedBytes[3],
        seedBytes[4],
        seedBytes[5],
      ];
    if (clockseq == null)
      clockseq = _clockseq = ((seedBytes[6] << 8) | seedBytes[7]) & 16383;
  }
  var msecs = options.msecs !== void 0 ? options.msecs : Date.now();
  var nsecs = options.nsecs !== void 0 ? options.nsecs : _lastNSecs + 1;
  var dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
  if (dt < 0 && options.clockseq === void 0) clockseq = (clockseq + 1) & 16383;
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === void 0) nsecs = 0;
  if (nsecs >= 1e4)
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;
  msecs += 0xb1d069b5400;
  var tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
  b[i++] = (tl >>> 24) & 255;
  b[i++] = (tl >>> 16) & 255;
  b[i++] = (tl >>> 8) & 255;
  b[i++] = tl & 255;
  var tmh = ((msecs / 4294967296) * 1e4) & 268435455;
  b[i++] = (tmh >>> 8) & 255;
  b[i++] = tmh & 255;
  b[i++] = ((tmh >>> 24) & 15) | 16;
  b[i++] = (tmh >>> 16) & 255;
  b[i++] = (clockseq >>> 8) | 128;
  b[i++] = clockseq & 255;
  for (var n = 0; n < 6; ++n) b[i + n] = node[n];
  return buf || stringify(b);
}
var _nodeId, _clockseq, _lastMSecs, _lastNSecs;
var init_v1 = __esmMin(() => {
  init_rng();
  init_stringify();
  _lastMSecs = 0;
  _lastNSecs = 0;
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/parse.js
function parse(uuid) {
  if (!validate(uuid)) throw TypeError("Invalid UUID");
  var v;
  var arr = new Uint8Array(16);
  arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  arr[1] = (v >>> 16) & 255;
  arr[2] = (v >>> 8) & 255;
  arr[3] = v & 255;
  arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  arr[5] = v & 255;
  arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  arr[7] = v & 255;
  arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  arr[9] = v & 255;
  arr[10] = ((v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776) & 255;
  arr[11] = (v / 4294967296) & 255;
  arr[12] = (v >>> 24) & 255;
  arr[13] = (v >>> 16) & 255;
  arr[14] = (v >>> 8) & 255;
  arr[15] = v & 255;
  return arr;
}
var init_parse = __esmMin(() => {
  init_validate();
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/v35.js
function stringToBytes(str) {
  str = unescape(encodeURIComponent(str));
  var bytes = [];
  for (var i = 0; i < str.length; ++i) bytes.push(str.charCodeAt(i));
  return bytes;
}
function v35_default(name, version, hashfunc) {
  function generateUUID(value, namespace, buf, offset) {
    if (typeof value === "string") value = stringToBytes(value);
    if (typeof namespace === "string") namespace = parse(namespace);
    if (namespace.length !== 16)
      throw TypeError(
        "Namespace must be array-like (16 iterable integer values, 0-255)",
      );
    var bytes = new Uint8Array(16 + value.length);
    bytes.set(namespace);
    bytes.set(value, namespace.length);
    bytes = hashfunc(bytes);
    bytes[6] = (bytes[6] & 15) | version;
    bytes[8] = (bytes[8] & 63) | 128;
    if (buf) {
      offset = offset || 0;
      for (var i = 0; i < 16; ++i) buf[offset + i] = bytes[i];
      return buf;
    }
    return stringify(bytes);
  }
  try {
    generateUUID.name = name;
  } catch (err) {}
  generateUUID.DNS = DNS;
  generateUUID.URL = URL;
  return generateUUID;
}
var DNS, URL;
var init_v35 = __esmMin(() => {
  init_stringify();
  init_parse();
  DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/md5.js
function md5(bytes) {
  if (typeof bytes === "string") {
    var msg = unescape(encodeURIComponent(bytes));
    bytes = new Uint8Array(msg.length);
    for (var i = 0; i < msg.length; ++i) bytes[i] = msg.charCodeAt(i);
  }
  return md5ToHexEncodedArray(
    wordsToMd5(bytesToWords(bytes), bytes.length * 8),
  );
}
function md5ToHexEncodedArray(input) {
  var output = [];
  var length32 = input.length * 32;
  var hexTab = "0123456789abcdef";
  for (var i = 0; i < length32; i += 8) {
    var x = (input[i >> 5] >>> (i % 32)) & 255;
    var hex = parseInt(
      hexTab.charAt((x >>> 4) & 15) + hexTab.charAt(x & 15),
      16,
    );
    output.push(hex);
  }
  return output;
}
/**
 * Calculate output length with padding and bit length
 */
function getOutputLength(inputLength8) {
  return (((inputLength8 + 64) >>> 9) << 4) + 14 + 1;
}
function wordsToMd5(x, len) {
  x[len >> 5] |= 128 << (len % 32);
  x[getOutputLength(len) - 1] = len;
  var a = 1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d = 271733878;
  for (var i = 0; i < x.length; i += 16) {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    a = md5ff(a, b, c, d, x[i], 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, x[i], 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, x[i], 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = md5ii(a, b, c, d, x[i], 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }
  return [a, b, c, d];
}
function bytesToWords(input) {
  if (input.length === 0) return [];
  var length8 = input.length * 8;
  var output = new Uint32Array(getOutputLength(length8));
  for (var i = 0; i < length8; i += 8)
    output[i >> 5] |= (input[i / 8] & 255) << (i % 32);
  return output;
}
function safeAdd(x, y) {
  var lsw = (x & 65535) + (y & 65535);
  return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 65535);
}
function bitRotateLeft(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt));
}
function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function md5ff(a, b, c, d, x, s, t) {
  return md5cmn((b & c) | (~b & d), a, b, x, s, t);
}
function md5gg(a, b, c, d, x, s, t) {
  return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}
var init_md5 = __esmMin(() => {});
//#endregion
//#region node_modules/uuid/dist/esm-browser/v3.js
var v3;
var init_v3 = __esmMin(() => {
  init_v35();
  init_md5();
  v3 = v35_default("v3", 48, md5);
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/v4.js
function v4(options, buf, offset) {
  options = options || {};
  var rnds = options.random || (options.rng || rng)();
  rnds[6] = (rnds[6] & 15) | 64;
  rnds[8] = (rnds[8] & 63) | 128;
  if (buf) {
    offset = offset || 0;
    for (var i = 0; i < 16; ++i) buf[offset + i] = rnds[i];
    return buf;
  }
  return stringify(rnds);
}
var init_v4 = __esmMin(() => {
  init_rng();
  init_stringify();
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/sha1.js
function f(s, x, y, z) {
  switch (s) {
    case 0:
      return (x & y) ^ (~x & z);
    case 1:
      return x ^ y ^ z;
    case 2:
      return (x & y) ^ (x & z) ^ (y & z);
    case 3:
      return x ^ y ^ z;
  }
}
function ROTL(x, n) {
  return (x << n) | (x >>> (32 - n));
}
function sha1(bytes) {
  var K = [1518500249, 1859775393, 2400959708, 3395469782];
  var H = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
  if (typeof bytes === "string") {
    var msg = unescape(encodeURIComponent(bytes));
    bytes = [];
    for (var i = 0; i < msg.length; ++i) bytes.push(msg.charCodeAt(i));
  } else if (!Array.isArray(bytes)) bytes = Array.prototype.slice.call(bytes);
  bytes.push(128);
  var l = bytes.length / 4 + 2;
  var N = Math.ceil(l / 16);
  var M = new Array(N);
  for (var _i = 0; _i < N; ++_i) {
    var arr = new Uint32Array(16);
    for (var j = 0; j < 16; ++j)
      arr[j] =
        (bytes[_i * 64 + j * 4] << 24) |
        (bytes[_i * 64 + j * 4 + 1] << 16) |
        (bytes[_i * 64 + j * 4 + 2] << 8) |
        bytes[_i * 64 + j * 4 + 3];
    M[_i] = arr;
  }
  M[N - 1][14] = ((bytes.length - 1) * 8) / Math.pow(2, 32);
  M[N - 1][14] = Math.floor(M[N - 1][14]);
  M[N - 1][15] = ((bytes.length - 1) * 8) & 4294967295;
  for (var _i2 = 0; _i2 < N; ++_i2) {
    var W = new Uint32Array(80);
    for (var t = 0; t < 16; ++t) W[t] = M[_i2][t];
    for (var _t = 16; _t < 80; ++_t)
      W[_t] = ROTL(W[_t - 3] ^ W[_t - 8] ^ W[_t - 14] ^ W[_t - 16], 1);
    var a = H[0];
    var b = H[1];
    var c = H[2];
    var d = H[3];
    var e = H[4];
    for (var _t2 = 0; _t2 < 80; ++_t2) {
      var s = Math.floor(_t2 / 20);
      var T = (ROTL(a, 5) + f(s, b, c, d) + e + K[s] + W[_t2]) >>> 0;
      e = d;
      d = c;
      c = ROTL(b, 30) >>> 0;
      b = a;
      a = T;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
  }
  return [
    (H[0] >> 24) & 255,
    (H[0] >> 16) & 255,
    (H[0] >> 8) & 255,
    H[0] & 255,
    (H[1] >> 24) & 255,
    (H[1] >> 16) & 255,
    (H[1] >> 8) & 255,
    H[1] & 255,
    (H[2] >> 24) & 255,
    (H[2] >> 16) & 255,
    (H[2] >> 8) & 255,
    H[2] & 255,
    (H[3] >> 24) & 255,
    (H[3] >> 16) & 255,
    (H[3] >> 8) & 255,
    H[3] & 255,
    (H[4] >> 24) & 255,
    (H[4] >> 16) & 255,
    (H[4] >> 8) & 255,
    H[4] & 255,
  ];
}
var init_sha1 = __esmMin(() => {});
//#endregion
//#region node_modules/uuid/dist/esm-browser/v5.js
var v5;
var init_v5 = __esmMin(() => {
  init_v35();
  init_sha1();
  v5 = v35_default("v5", 80, sha1);
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/nil.js
var nil_default;
var init_nil = __esmMin(() => {
  nil_default = "00000000-0000-0000-0000-000000000000";
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/version.js
function version(uuid) {
  if (!validate(uuid)) throw TypeError("Invalid UUID");
  return parseInt(uuid.substr(14, 1), 16);
}
var init_version = __esmMin(() => {
  init_validate();
});
//#endregion
//#region node_modules/uuid/dist/esm-browser/index.js
var esm_browser_exports = /* @__PURE__ */ __exportAll({
  NIL: () => nil_default,
  parse: () => parse,
  stringify: () => stringify,
  v1: () => v1,
  v3: () => v3,
  v4: () => v4,
  v5: () => v5,
  validate: () => validate,
  version: () => version,
});
var init_esm_browser = __esmMin(() => {
  init_v1();
  init_v3();
  init_v4();
  init_v5();
  init_nil();
  init_version();
  init_validate();
  init_stringify();
  init_parse();
});
//#endregion
//#region node_modules/@signalk/client/dist/lib/request.js
var require_request = /* @__PURE__ */ __commonJSMin((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = void 0;
  var _eventemitter = _interopRequireDefault(require_eventemitter3());
  var _debug = _interopRequireDefault(require_browser());
  var _uuid = (init_esm_browser(), __toCommonJS(esm_browser_exports));
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  /**
   * @description   A Request represents an asynchronous request to a Signal K server.
   *                This class manages a single request and it's responses.
   * @author        Fabian Tollenaar <fabian@decipher.industries>
   * @copyright     2018-2019, Fabian Tollenaar. All rights reserved.
   * @license       Apache-2.0
   * @module        @signalk/signalk-js-sdk
   */
  var debug = (0, _debug.default)("signalk-js-sdk/Request");
  var Request = class extends _eventemitter.default {
    constructor(connection, name, body) {
      super();
      this.connection = connection;
      this.requestId = (0, _uuid.v4)();
      this.name = name;
      this.body = body;
      this.responses = [];
      this.sent = false;
      this.connection.on("message", (message) => {
        if (
          message &&
          typeof message === "object" &&
          message.hasOwnProperty("requestId") &&
          message.requestId === this.requestId
        )
          this.addResponse(message);
      });
    }
    query() {
      const request = {
        requestId: this.requestId,
        query: true,
      };
      debug(`Sending query: ${JSON.stringify(request, null, 2)}`);
      this.connection.send(request);
    }
    send() {
      if (this.sent === true) return;
      const request = {
        requestId: this.requestId,
        ...this.body,
      };
      debug(`Sending request: ${JSON.stringify(request, null, 2)}`);
      this.connection.send(request);
    }
    addResponse(response) {
      debug(
        `Got response for request "${this.name}": ${JSON.stringify(response, null, 2)}`,
      );
      const receivedAt = /* @__PURE__ */ new Date().toISOString();
      this.responses.push({
        response,
        receivedAt,
      });
      this.emit("response", {
        ...response,
        request: {
          receivedAt,
          name: this.name,
          requestId: this.requestId,
        },
      });
    }
    getRequestId() {
      return this.requestId;
    }
  };
  exports.default = Request;
});
//#endregion
//#region node_modules/@signalk/client/dist/lib/api.js
var require_api = /* @__PURE__ */ __commonJSMin((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = void 0;
  /**
   * @description   An API wraps the REST API for a Signal K server
   * @author        Fabian Tollenaar <fabian@decipher.industries>
   * @copyright     2018-2019, Fabian Tollenaar. All rights reserved.
   * @license       Apache-2.0
   * @module        @signalk/signalk-js-sdk
   */
  var API = class {
    constructor(connection) {
      this.connection = connection;
      this.selfMRN = this.connection.self;
    }
    get(path) {
      if (path.includes(".")) path = path.replace(/\./g, "/");
      if (typeof path !== "string" || path.trim() === "") path = "/";
      if (path.charAt(0) !== "/") path = `/${path}`;
      return this.connection.fetch(path);
    }
    put(path, body) {
      if (path.includes(".")) path = path.replace(/\./g, "/");
      if (typeof path !== "string" || path.trim() === "") path = "/";
      if (path.charAt(0) !== "/") path = `/${path}`;
      return this.connection.fetch(path, {
        method: "PUT",
        mode: "cors",
        body: body && typeof body === "object" ? JSON.stringify(body) : body,
      });
    }
    /**
     * Shortcut methods.
     * @TODO: investigate if we can generate these using a Proxy and signalk-schema, using this.options.version.
     */
    getMeta(path) {
      return this.get(path).then((result) => {
        if (!result || typeof result !== "object") return null;
        if (!result.hasOwnProperty("meta")) return null;
        return result.meta;
      });
    }
    sources() {
      return this.get("/sources");
    }
    resources() {
      return this.get("/resources");
    }
    mrn() {
      return this.get("/self");
    }
    vessels() {
      return this.get("/vessels");
    }
    aircraft() {
      return this.get("/aircraft");
    }
    aton() {
      return this.get("/aton");
    }
    sar() {
      return this.get("/sar");
    }
    version() {
      return this.get("/version");
    }
    self(path) {
      if (typeof path !== "string" || path.charAt(0) !== "/") path = "";
      return this.connection.fetch(`/vessels/self${path}`);
    }
    vessel(mrn, path) {
      if (typeof path !== "string" || path.charAt(0) !== "/") path = "";
      return this.connection.fetch(`/vessels/${mrn}${path}`);
    }
    name() {
      return this.self("/name");
    }
    getGroup(group, path, vessel = "self") {
      if (typeof path !== "string" || path.charAt(0) !== "/") path = "";
      if (vessel === "self") return this.self(`/${group}${path}`);
      return this.vessel(vessel, `/${group}${path}`);
    }
    communication(path = "", vessel = "self") {
      return this.getGroup("communication", path, vessel);
    }
    design(path = "", vessel = "self") {
      return this.getGroup("design", path, vessel);
    }
    electrical(path = "", vessel = "self") {
      return this.getGroup("electrical", path, vessel);
    }
    environment(path = "", vessel = "self") {
      return this.getGroup("environment", path, vessel);
    }
    navigation(path = "", vessel = "self") {
      return this.getGroup("navigation", path, vessel);
    }
    notifications(path = "", vessel = "self") {
      return this.getGroup("notifications", path, vessel);
    }
    performance(path = "", vessel = "self") {
      return this.getGroup("performance", path, vessel);
    }
    propulsion(path = "", vessel = "self") {
      return this.getGroup("propulsion", path, vessel);
    }
    sails(path = "", vessel = "self") {
      return this.getGroup("sails", path, vessel);
    }
    sensors(path = "", vessel = "self") {
      return this.getGroup("sensors", path, vessel);
    }
    steering(path = "", vessel = "self") {
      return this.getGroup("steering", path, vessel);
    }
    tanks(path = "", vessel = "self") {
      return this.getGroup("tanks", path, vessel);
    }
  };
  exports.default = API;
});
//#endregion
//#region node_modules/@signalk/client/dist/lib/client.js
var require_client$1 = /* @__PURE__ */ __commonJSMin((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default =
    exports.PERMISSIONS_READWRITE =
    exports.PERMISSIONS_READONLY =
    exports.PERMISSIONS_DENY =
    exports.AUTHENTICATION_REQUEST =
      void 0;
  var _eventemitter = _interopRequireDefault(require_eventemitter3());
  var _connection = _interopRequireDefault(require_connection());
  var _request = _interopRequireDefault(require_request());
  var _api = _interopRequireDefault(require_api());
  var _debug = _interopRequireDefault(require_browser());
  var _uuid = (init_esm_browser(), __toCommonJS(esm_browser_exports));
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  /**
   * @description   Client implements functionality to discover, connect to,
   *                retrieve data and receive data from a Signal K server.
   * @author        Fabian Tollenaar <fabian@decipher.industries>
   * @copyright     2018-2019, Fabian Tollenaar. All rights reserved.
   * @license       Apache-2.0
   * @module        @signalk/signalk-js-sdk
   */
  var debug = (0, _debug.default)("signalk-js-sdk/Client");
  var AUTHENTICATION_REQUEST = (exports.AUTHENTICATION_REQUEST =
    "__AUTHENTICATION_REQUEST__");
  exports.PERMISSIONS_READWRITE = "readwrite";
  exports.PERMISSIONS_READONLY = "readonly";
  exports.PERMISSIONS_DENY = "denied";
  var Client = class extends _eventemitter.default {
    constructor(options = {}) {
      super();
      this.options = {
        hostname: "localhost",
        port: 3e3,
        useTLS: true,
        useAuthentication: false,
        notifications: true,
        version: "v1",
        autoConnect: false,
        reconnect: true,
        maxRetries: Infinity,
        maxTimeBetweenRetries: 2500,
        mdns: null,
        username: null,
        password: null,
        deltaStreamBehaviour: "none",
        subscriptions: [],
        wsKeepaliveInterval: 0,
        ...options,
      };
      this.api = null;
      this.connection = null;
      this.services = [];
      this.notifications = {};
      this.requests = {};
      this.fetchReady = null;
      if (Array.isArray(this.options.subscriptions))
        this.subscribeCommands = this.options.subscriptions.filter((command) =>
          isValidSubscribeCommand(command),
        );
      if (this.options.notifications === true)
        this.subscribeCommands.push({
          context: "vessels.self",
          subscribe: [
            {
              path: "notifications.*",
              policy: "instant",
            },
          ],
        });
      if (this.options.autoConnect === true)
        this.connect().catch((err) => this.emit("error", err));
    }
    get self() {
      if (this.connection === null) return null;
      return this.connection.self;
    }
    set(key, value) {
      this.options[key] = value;
      return this;
    }
    get(key) {
      return this.options[key] || null;
    }
    get retries() {
      if (this.connection === null) return 0;
      return this.connection.retries;
    }
    requestDeviceAccess(description, _clientId) {
      const clientId =
        typeof _clientId === "string" ? _clientId : (0, _uuid.v4)();
      return this.connection
        .fetch("/access/requests", {
          method: "POST",
          mode: "cors",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            description,
          }),
        })
        .then((response) => {
          return {
            clientId,
            response,
          };
        });
    }
    respondToAccessRequest(uuid, permissions, expiration = "1y") {
      return this.connection.fetch(
        `/security/access/requests/${uuid}/${permissions === "denied" ? "denied" : "approved"}`,
        {
          method: "PUT",
          mode: "cors",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expiration,
            permissions,
          }),
        },
      );
    }
    authenticate(username, password) {
      const request = this.request(AUTHENTICATION_REQUEST, {
        login: {
          username,
          password,
        },
      });
      request.on("response", (response) => {
        if (
          response.statusCode === 200 &&
          response.hasOwnProperty("login") &&
          typeof response.login === "object" &&
          response.login.hasOwnProperty("token")
        ) {
          this.connection.setAuthenticated(response.login.token);
          return this.emit("authenticated", { token: response.login.token });
        }
        this.emit(
          "error",
          /* @__PURE__ */ new Error(
            `Error authenticating: status ${response.statusCode}`,
          ),
        );
      });
      request.send();
    }
    request(name, body = {}) {
      if (!this.requests.hasOwnProperty(name)) {
        this.requests[name] = new _request.default(this.connection, name, body);
        debug(
          `Registered request "${name}" with ID ${this.requests[name].getRequestId()}`,
        );
      }
      return this.requests[name];
    }
    subscribe(subscriptions = []) {
      if (this.connection === null) throw new Error("Not connected");
      if (
        subscriptions &&
        !Array.isArray(subscriptions) &&
        typeof subscriptions === "object" &&
        subscriptions.hasOwnProperty("subscribe")
      )
        subscriptions = [subscriptions];
      subscriptions = subscriptions.filter((command) =>
        isValidSubscribeCommand(command),
      );
      subscriptions.forEach((command) => {
        this.subscribeCommands.push(command);
      });
      this.connection.subscribe(subscriptions);
    }
    unsubscribe() {
      if (this.connection === null) throw new Error("Not connected");
      const { notifications } = this.options;
      this.subscribeCommands =
        notifications === true
          ? [
              {
                context: "vessels.self",
                subscribe: [
                  {
                    path: "notifications.*",
                    policy: "instant",
                  },
                ],
              },
            ]
          : [];
      this.connection.unsubscribe();
      if (this.subscribeCommands.length > 0)
        this.connection.subscribe(this.subscribeCommands);
    }
    connect() {
      if (this.connection !== null) {
        this.connection.reconnect(true);
        return Promise.resolve(this.connection);
      }
      return new Promise((resolve, reject) => {
        this.connection = new _connection.default(
          this.options,
          this.subscribeCommands,
        );
        this.connection.on("disconnect", (data) =>
          this.emit("disconnect", data),
        );
        this.connection.on("message", (data) => this.processWSMessage(data));
        this.connection.on("connectionInfo", (data) =>
          this.emit("connectionInfo", data),
        );
        this.connection.on("self", (data) => this.emit("self", data));
        this.connection.on("hitMaxRetries", () => this.emit("hitMaxRetries"));
        this.connection.on("backOffBeforeReconnect", (data) =>
          this.emit("backOffBeforeReconnect", data),
        );
        this.connection.on("connect", () => {
          this.getInitialNotifications();
          this.emit("connect");
          resolve(this.connection);
        });
        this.connection.on("fetchReady", () => {
          this.fetchReady = true;
        });
        this.connection.on("error", (err) => {
          this.emit("error", err);
          reject(err);
        });
      });
    }
    disconnect(returnPromise = false) {
      if (this.connection !== null) {
        this.connection.on("disconnect", () => {
          this.cleanupListeners();
          this.connection = null;
        });
        this.connection.unsubscribe();
        this.connection.disconnect();
      } else this.cleanupListeners();
      if (this.api !== null) this.api = null;
      if (returnPromise === true) return Promise.resolve(this);
      return this;
    }
    cleanupListeners() {
      this.removeAllListeners("self");
      this.removeAllListeners("connectionInfo");
      this.removeAllListeners("message");
      this.removeAllListeners("delta");
      this.removeAllListeners("connect");
      this.removeAllListeners("error");
      this.removeAllListeners("hitMaxRetries");
      this.removeAllListeners("backOffBeforeReconnect");
      this.removeAllListeners("disconnect");
      this.removeAllListeners("unsubscribe");
      this.removeAllListeners("subscribe");
    }
    API() {
      if (this.connection === null)
        return Promise.reject(
          /* @__PURE__ */ new Error(
            "There are no available connections. Please connect before you use the REST API.",
          ),
        );
      if (this.api !== null) return Promise.resolve(this.api);
      return new Promise((resolve) => {
        this.api = new _api.default(this.connection);
        if (
          this.fetchReady === true ||
          this.options.useAuthentication === false
        )
          return resolve(this.api);
        this.connection.on("fetchReady", () => {
          resolve(this.api);
        });
      });
    }
    processWSMessage(data) {
      this.emit("message", data);
      if (data && typeof data === "object" && data.hasOwnProperty("updates")) {
        this.checkAndEmitNotificationsInDelta(data);
        this.emit("delta", data);
      }
    }
    checkAndEmitNotificationsInDelta(delta) {
      if (
        this.options.notifications === false ||
        !delta ||
        typeof delta !== "object" ||
        !Array.isArray(delta.updates)
      )
        return;
      const notifications = {};
      delta.updates.forEach((update) => {
        (update.values || []).forEach((mut) => {
          if (
            typeof mut.path === "string" &&
            mut.path.includes("notifications.")
          )
            notifications[mut.path.replace("notifications.", "")] = {
              ...mut.value,
            };
        });
      });
      Object.keys(notifications).forEach((path) => {
        if (
          !this.notifications.hasOwnProperty(path) ||
          this.notifications[path].timestamp !== notifications[path].timestamp
        ) {
          this.notifications[path] = { ...notifications[path] };
          const notification = {
            path,
            ...this.notifications[path],
          };
          debug(
            `[checkAndEmitNotificationsInDelta] emitting notification: ${JSON.stringify(notification, null, 2)}`,
          );
          this.emit("notification", notification);
        }
      });
    }
    getInitialNotifications() {
      if (this.options.notifications === false) return;
      if (this.connection === null) return;
      if (this.api === null) this.api = new _api.default(this.connection);
      this.api
        .notifications()
        .then((result) => {
          this.notifications = {
            ...this.notifications,
            ...flattenTree(result),
          };
          Object.keys(this.notifications).forEach((path) => {
            const notification = {
              path,
              ...this.notifications[path],
            };
            debug(
              `[getInitialNotifications] emitting notification: ${JSON.stringify(notification, null, 2)}`,
            );
            this.emit("notification", notification);
          });
          return this.notifications;
        })
        .catch((err) => {
          console.error(
            `[getInitialNotifications] error getting notifications: ${err.message}`,
          );
        });
    }
  };
  exports.default = Client;
  var flattenTree = (tree) => {
    const flattened = {};
    let cursor = tree;
    let currentPath = "";
    const evaluateLeaf = (key) => {
      currentPath += `${currentPath === "" ? "" : "."}${key}`;
      cursor = cursor[key];
      if (!cursor || typeof cursor !== "object") return;
      if (
        cursor &&
        typeof cursor === "object" &&
        cursor.hasOwnProperty("value")
      )
        flattened[currentPath] = Object.assign({}, cursor.value);
      else Object.keys(cursor).forEach(evaluateLeaf);
    };
    Object.keys(cursor).forEach((key) => evaluateLeaf(key));
    return flattened;
  };
  var isValidSubscribeCommand = (command) => {
    if (!command || typeof command !== "object") return false;
    if (!command.hasOwnProperty("context") || !Array.isArray(command.subscribe))
      return false;
    return true;
  };
});
//#endregion
//#region node_modules/@signalk/client/dist/lib/discovery.js
var require_discovery = /* @__PURE__ */ __commonJSMin((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = exports.SKServer = void 0;
  var _eventemitter = _interopRequireDefault(require_eventemitter3());
  var _client = _interopRequireDefault(require_client$1());
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  /**
   * @description   A Discovery takes an mDNS instance and discovers Signal K
   *                servers on the local network.
   * @author        Fabian Tollenaar <fabian@decipher.industries>
   * @copyright     2018-2019, Fabian Tollenaar. All rights reserved.
   * @license       Apache-2.0
   * @module        @signalk/signalk-js-sdk
   */
  var SKServer = class {
    constructor(service) {
      this._roles = service.roles || ["master", "main"];
      this._self = service.self || "";
      this._version = service.version || "0.0.0";
      this._hostname = service.hostname;
      this._port = service.port;
    }
    get roles() {
      return this._roles;
    }
    get self() {
      return this._self;
    }
    get version() {
      return this._version;
    }
    get hostname() {
      return this._hostname;
    }
    get port() {
      return this._port;
    }
    isMain() {
      return this._roles.includes("main");
    }
    isMaster() {
      return this._roles.includes("master");
    }
    createClient(opts = {}) {
      return new _client.default({
        ...opts,
        hostname: this._hostname,
        port: this._port,
      });
    }
  };
  exports.SKServer = SKServer;
  var Discovery = class extends _eventemitter.default {
    constructor(bonjourOrMdns, timeout = 6e4) {
      super();
      this.found = [];
      if (!bonjourOrMdns || typeof bonjourOrMdns !== "object")
        throw new Error("No mDNS provider given");
      const bonjourProps = ["_server", "_registry"].join(",");
      const mdnsProps = [
        "dns_sd",
        "Advertisement",
        "createAdvertisement",
        "Browser",
      ].join(",");
      if (Object.keys(bonjourOrMdns).join(",").startsWith(bonjourProps))
        return this.discoverWithBonjour(bonjourOrMdns, timeout);
      if (Object.keys(bonjourOrMdns).join(",").startsWith(mdnsProps))
        return this.discoverWithMdns(bonjourOrMdns, timeout);
      throw new Error("Unrecognized mDNS provider given");
    }
    discoverWithBonjour(bonjour, timeout) {
      const browser = bonjour.find({ type: "signalk-http" });
      browser.on("up", (ad) =>
        this.handleDiscoveredService(ad, {
          ...ad.txt,
          name: ad.name || "",
          hostname: ad.host || "",
          port: parseInt(ad.port, 10),
          provider: "bonjour",
        }),
      );
      setTimeout(() => {
        if (this.found.length === 0) this.emit("timeout");
        browser.stop();
      }, timeout);
      browser.start();
    }
    discoverWithMdns(mDNS, timeout) {
      const browser = mDNS.createBrowser(mDNS.tcp("_signalk-http"));
      browser.on("serviceUp", (ad) =>
        this.handleDiscoveredService(ad, {
          ...ad.txtRecord,
          hostname: ad.host || "",
          port: parseInt(ad.port, 10),
          provider: "mdns",
        }),
      );
      browser.on("error", (err) => this.handleDiscoveryError(err));
      setTimeout(() => {
        if (this.found.length === 0) this.emit("timeout");
        browser.stop();
      }, timeout);
      browser.start();
    }
    handleDiscoveryError(err) {
      console.error(`Error during discovery: ${err.message}`);
    }
    handleDiscoveredService(ad, service) {
      if (typeof service.roles === "string")
        service.roles = service.roles
          .split(",")
          .map((role) => role.trim().toLowerCase());
      service.roles = Array.isArray(service.roles) ? service.roles : [];
      let ipv4 = service.hostname;
      if (Array.isArray(ad.addresses))
        ipv4 = ad.addresses.reduce((found, address) => {
          if (address && typeof address === "string" && address.includes("."))
            found = address;
          return found;
        }, service.hostname);
      if (ipv4.trim() !== "") service.hostname = ipv4;
      const server = new SKServer(service);
      this.found.push(server);
      this.emit("found", server);
    }
  };
  exports.default = Discovery;
});
//#endregion
//#region node_modules/@signalk/client/dist/index.js
var require_dist = /* @__PURE__ */ __commonJSMin((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = exports.Discovery = exports.Client = void 0;
  var _client = _interopRequireDefault(require_client$1());
  var _discovery = _interopRequireDefault(require_discovery());
  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : { default: obj };
  }
  /**
   * @author        Fabian Tollenaar <fabian@decipher.industries>
   * @copyright     2018-2019, Fabian Tollenaar. All rights reserved.
   * @license       Apache-2.0
   * @module        @signalk/signalk-js-sdk
   */
  exports.Client = _client.default;
  exports.Discovery = _discovery.default;
  exports.default = _client.default;
});
//#endregion
//#region ui/js/SignalKClient.js
var import_client = /* @__PURE__ */ __toESM(
  /* @__PURE__ */ __commonJSMin((exports, module) => {
    module.exports = require_dist();
  })(),
);
var SIGNALK_DEFAULT_FRESHNESS_SEC = 300;
var SignalKClient = class SignalKClient {
  constructor({ baseUrl = "", pluginName = null } = {}) {
    this.baseUrl = baseUrl;
    this.pluginName = pluginName;
  }
  request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("Request timed out"), 5e3);
    return fetch(`${this.baseUrl}/signalk/v1/api/${path}`, {
      signal: controller.signal,
    })
      .finally(() => clearTimeout(timer))
      .then(SignalKClient._toJsonOrReject);
  }
  raiseAnchor() {
    return this.pluginPost("raiseAnchor");
  }
  dropAnchor(position, radius) {
    return this.pluginPost("dropAnchor", {
      position,
      radius,
    });
  }
  setRadius(radius) {
    return this.pluginPost("setRadius", { radius });
  }
  pluginPost(action, data) {
    return fetch(`${this.baseUrl}/plugins/${this.pluginName}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    }).then((response) => {
      if (response.status === 401) location.href = "/admin/#/login";
      return SignalKClient._toJsonOrReject(response);
    });
  }
  static _toJsonOrReject(response) {
    if (!response.ok)
      return Promise.reject({
        status: response.status,
        statusText: response.statusText,
      });
    return response.json();
  }
  fetchSelf() {
    return this.request("vessels/self");
  }
  fetchAllVessels() {
    return this.request("vessels");
  }
  fetchTracks(radius) {
    return this.request(`tracks?radius=${radius}`);
  }
  static extract(tree, path = "") {
    if (!tree) return null;
    if (!path) return tree;
    let node = tree;
    for (const key of path.split(".")) {
      if (node == null || typeof node !== "object") return null;
      node = node[key];
    }
    return node ?? null;
  }
  static value(tree, path = "", fallback = void 0) {
    const node = this.extract(tree, path);
    return node && node.value !== void 0 ? node.value : fallback;
  }
  static freshValue(
    tree,
    path = "",
    { maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC, fallback = void 0 } = {},
  ) {
    const node = this.extract(tree, path);
    if (!node || node.value === void 0) return fallback;
    if (!this.isFresh(node, maxAge)) {
      const ageSec = node.timestamp
        ? Math.round((Date.now() - new Date(node.timestamp).getTime()) / 1e3)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKClient.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      return fallback;
    }
    return node.value;
  }
  static isFresh(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    if (!delta || !delta.timestamp) return false;
    return (Date.now() - new Date(delta.timestamp).getTime()) / 1e3 <= maxAge;
  }
  static isStale(delta, maxAge = SIGNALK_DEFAULT_FRESHNESS_SEC) {
    return !this.isFresh(delta, maxAge);
  }
};
//#endregion
//#region ui/js/ShipIcons.js
var RANGES = [
  {
    start: 20,
    end: 29,
    icon: "wing-in-ground.png",
  },
  {
    start: 30,
    end: 30,
    icon: "fishing.png",
  },
  {
    start: 31,
    end: 32,
    icon: "towing.png",
  },
  {
    start: 33,
    end: 33,
    icon: "dredging.png",
  },
  {
    start: 34,
    end: 34,
    icon: "diving.png",
  },
  {
    start: 35,
    end: 35,
    icon: "military.png",
  },
  {
    start: 37,
    end: 37,
    icon: "pleasure.png",
  },
  {
    start: 40,
    end: 49,
    icon: "high-speed-craft.png",
  },
  {
    start: 50,
    end: 50,
    icon: "pilot.png",
  },
  {
    start: 51,
    end: 51,
    icon: "sar.png",
  },
  {
    start: 52,
    end: 52,
    icon: "tug.png",
  },
  {
    start: 53,
    end: 53,
    icon: "port-tender.png",
  },
  {
    start: 54,
    end: 54,
    icon: "anti-pollution.png",
  },
  {
    start: 55,
    end: 55,
    icon: "police.png",
  },
  {
    start: 58,
    end: 58,
    icon: "medical.png",
  },
  {
    start: 59,
    end: 59,
    icon: "noncombatant.png",
  },
  {
    start: 60,
    end: 69,
    icon: "passenger.png",
  },
  {
    start: 70,
    end: 79,
    icon: "cargo.png",
  },
  {
    start: 80,
    end: 89,
    icon: "tanker.png",
  },
  {
    start: 90,
    end: 99,
    icon: "other.png",
  },
];
var ShipIcons = class {
  static iconFor(aisShipType, aspectRatio) {
    aisShipType = parseInt(aisShipType, 10);
    if (aisShipType === 36)
      return aspectRatio >= 2.5
        ? "icons/ships/png/sailboat.png"
        : "icons/ships/png/catamaran.png";
    const range = RANGES.find(
      (r) => aisShipType >= r.start && aisShipType <= r.end,
    );
    return range
      ? `icons/ships/png/${range.icon}`
      : "icons/ships/png/default.png";
  }
};
//#endregion
//#region ui/js/BoatConfig.js
var DEFAULTS = {
  name: "Unknown",
  loa: 14,
  beam: 4,
  anchorRollerHeight: 0,
  gpsBowXDistance: 0,
  gpsBowYDistance: 0,
  aisShipType: 36,
  mmsi: "",
  heading: 0,
};
var BoatConfig = class BoatConfig {
  constructor({
    loa,
    beam,
    anchorRollerHeight,
    gpsBowXDistance,
    gpsBowYDistance,
    aisShipType,
    mmsi,
    heading,
  }) {
    this.loa = loa;
    this.beam = beam;
    this.anchorRollerHeight = anchorRollerHeight;
    this.gpsBowXDistance = gpsBowXDistance;
    this.gpsBowYDistance = gpsBowYDistance;
    this.aisShipType = aisShipType;
    this.mmsi = mmsi;
    this.heading = heading;
  }
  static extract(data) {
    let config = {};
    config.name = data.name ?? DEFAULTS.name;
    config.mmsi = data.mmsi ?? DEFAULTS.mmsi;
    config.loa =
      SignalKClient.value(data, "design.length")?.overall ?? DEFAULTS.loa;
    config.beam = SignalKClient.value(data, "design.beam") ?? DEFAULTS.beam;
    config.anchorRollerHeight =
      SignalKClient.value(data, "design.bowAnchorRollerHeight") ??
      DEFAULTS.rollerHeight;
    if (data.sensors.gps) {
      config.gpsBowXDistance =
        SignalKClient.value(data, "sensors.gps.fromCenter") ??
        DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance =
        SignalKClient.value(data, "sensors.gps.fromBow") ??
        DEFAULTS.gpsBowYDistance;
    } else if (data.sensors.ais) {
      config.gpsBowXDistance =
        SignalKClient.value(data, "sensors.ais.fromCenter") ??
        DEFAULTS.gpsBowXDistance;
      config.gpsBowYDistance =
        SignalKClient.value(data, "sensors.ais.fromBow") ?? config.loa / 2;
    }
    config.aisShipType =
      SignalKClient.value(data, "design.aisShipType")?.id ??
      DEFAULTS.aisShipType;
    return new BoatConfig(config);
  }
  get bowOffset() {
    return {
      x: this.beam / 2 + this.gpsBowXDistance,
      y: this.gpsBowYDistance,
    };
  }
  get gpsOffset() {
    return {
      x: this.gpsBowXDistance,
      y: this.gpsBowYDistance,
    };
  }
  get loaToBeam() {
    return this.loa / this.beam;
  }
  get icon() {
    return ShipIcons.iconFor(this.aisShipType, this.loaToBeam);
  }
};
//#endregion
//#region ui/js/GeoMath.js
var MPS_TO_KNOTS = 1.94384;
var GeoMath = class GeoMath {
  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  static rad2deg(radians) {
    return (radians * 180) / Math.PI;
  }
  static normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }
  /**
   * Returns the length of the vector (x, y) from the origin.
   * @param {number} x – x-coordinate
   * @param {number} y – y-coordinate
   * @returns {number} distance from (0,0) to (x,y)
   */
  static calculateVectorDistance(x, y) {
    return Math.sqrt(x * x + y * y);
  }
  static calculateDistance(lat1, lon1, lat2, lon2) {
    let R = 6371e3;
    let dLat = GeoMath.deg2rad(lat2 - lat1);
    let dLon = GeoMath.deg2rad(lon2 - lon1);
    let a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(GeoMath.deg2rad(lat1)) *
        Math.cos(GeoMath.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  static calculateBearing(lat1, lon1, lat2, lon2) {
    var θa = GeoMath.deg2rad(lat1);
    var θb = GeoMath.deg2rad(lat2);
    var ΔL = GeoMath.deg2rad(lon2 - lon1);
    var X = Math.cos(θb) * Math.sin(ΔL);
    var Y =
      Math.cos(θa) * Math.sin(θb) - Math.sin(θa) * Math.cos(θb) * Math.cos(ΔL);
    var β = Math.atan2(X, Y);
    var bearing = GeoMath.rad2deg(β);
    bearing = (bearing + 360) % 360;
    return bearing;
  }
  /**
   * Calculates the destination point given starting latitude and longitude,
   * bearing, and distance using the haversine formula.
   *
   * @param {number} lat1 - Starting latitude in degrees.
   * @param {number} lon1 - Starting longitude in degrees.
   * @param {number} bearing - Bearing in degrees (clockwise from north).
   * @param {number} distance - Distance to travel from the starting point in meters.
   * @returns {{ latitude: number, longitude: number }} - The destination latitude and longitude.
   */
  static calculateDestinationPoint(lat1, lon1, bearing, distance) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const λ1 = (lon1 * Math.PI) / 180;
    const θ = (bearing * Math.PI) / 180;
    const δ = distance / R;
    const sinφ1 = Math.sin(φ1);
    const cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ);
    const cosδ = Math.cos(δ);
    const sinθ = Math.sin(θ);
    const cosθ = Math.cos(θ);
    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
    const φ2 = Math.asin(sinφ2);
    const y = sinθ * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);
    return {
      latitude: (φ2 * 180) / Math.PI,
      longitude: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
    };
  }
  static calculateBowCoordinates(current, heading, xOffset, yOffset) {
    let bc = GeoMath.calculateDestinationPoint(
      current.lat,
      current.lng,
      heading,
      yOffset,
    );
    if (xOffset != 0)
      bc = GeoMath.calculateDestinationPoint(
        bc.latitude,
        bc.longitude,
        heading - 90,
        xOffset,
      );
    return L.latLng(bc.latitude, bc.longitude);
  }
  /**
   * Estimate current tide height with sinusoidal easing
   *
   * @param {Date|string|number} lowTime      — time of low tide
   * @param {number}            lowHeight    — height at low tide
   * @param {Date|string|number} highTime     — time of high tide
   * @param {number}            highHeight   — height at high tide
   * @param {Date|string|number} [currentTime=new Date()] — time to estimate
   * @returns {number} smoothly interpolated tide height
   */
  static estimateTideHeightSmooth(
    lowTime,
    lowHeight,
    highTime,
    highHeight,
    currentTime = /* @__PURE__ */ new Date(),
  ) {
    const tLow = (
      lowTime instanceof Date ? lowTime : new Date(lowTime)
    ).getTime();
    const tHigh = (
      highTime instanceof Date ? highTime : new Date(highTime)
    ).getTime();
    const tCurrent = (
      currentTime instanceof Date ? currentTime : new Date(currentTime)
    ).getTime();
    let t0, h0, t1, h1;
    if (tLow < tHigh)
      if (tCurrent <= tLow) {
        t0 = tLow - (tHigh - tLow);
        h0 = highHeight;
        t1 = tLow;
        h1 = lowHeight;
      } else if (tCurrent >= tHigh) {
        t0 = tHigh;
        h0 = highHeight;
        t1 = tHigh + (tHigh - tLow);
        h1 = lowHeight;
      } else {
        t0 = tLow;
        h0 = lowHeight;
        t1 = tHigh;
        h1 = highHeight;
      }
    else if (tCurrent <= tHigh) {
      t0 = tHigh - (tLow - tHigh);
      h0 = lowHeight;
      t1 = tHigh;
      h1 = highHeight;
    } else if (tCurrent >= tLow) {
      t0 = tLow;
      h0 = lowHeight;
      t1 = tLow + (tLow - tHigh);
      h1 = highHeight;
    } else {
      t0 = tHigh;
      h0 = highHeight;
      t1 = tLow;
      h1 = lowHeight;
    }
    const frac = (tCurrent - t0) / (t1 - t0);
    const sineFrac = (1 - Math.cos(Math.PI * frac)) / 2;
    return h0 + (h1 - h0) * sineFrac;
  }
};
//#endregion
//#region ui/js/AppState.js
var DEFAULT_FRESHNESS_SEC = 300;
var AppState = class {
  constructor() {}
  getPosition() {
    if (this.currentCoordinates)
      return L.latLng(
        this.currentCoordinates.value.latitude,
        this.currentCoordinates.value.longitude,
      );
    else return L.latLng(0, 0);
  }
  getAnchorPosition() {
    if (this.anchor.position && this.anchor.position.value)
      return L.latLng(
        this.anchor.position.value.latitude,
        this.anchor.position.value.longitude,
      );
    else return L.latLng(0, 0);
  }
  extract(tree, path, fresh = true, maxAge = DEFAULT_FRESHNESS_SEC) {
    let data = SignalKClient.extract(tree, path);
    if (!data) return null;
    if (fresh && !SignalKClient.isFresh(data, maxAge)) {
      const ageSec = data.timestamp
        ? Math.round((Date.now() - new Date(data.timestamp).getTime()) / 1e3)
        : "unknown";
      const msg = `Stale SignalK value: ${path || "(root)"} — Age ${ageSec}s, Max ${maxAge}s`;
      SignalKClient.errorHandler?.(msg);
      console.warn(msg);
      console.trace();
      return null;
    }
    return data;
  }
  extractAll(data) {
    this.boatConfig = BoatConfig.extract(data);
    this.currentCoordinates = this.extract(data, "navigation.position");
    this.heading = this.extract(data, "navigation.headingTrue") ?? this.heading;
    this.belowKeel =
      this.extract(data, "environment.depth.belowKeel") ?? this.belowKeel;
    this.belowSurface =
      this.extract(data, "environment.depth.belowSurface") ?? this.belowSurface;
    this.twa = this.extract(data, "environment.wind.directionTrue") ?? this.twa;
    this.aws = this.extract(data, "environment.wind.speedApparent") ?? this.aws;
    this.tide = this.extract(data, "environment.tide", false) ?? this.tide;
    if (!this.anchor) this.anchor = {};
    this.anchor.position =
      this.extract(data, "navigation.anchor.position", false) ??
      this.anchor.position;
    this.anchor.state =
      this.extract(data, "navigation.anchor.state", false) ?? this.anchor.state;
    this.anchor.maxRadius =
      this.extract(data, "navigation.anchor.maxRadius", false) ??
      this.anchor.maxRadius;
    this.anchor.notification =
      this.extract(data, "notifications.navigation.anchor", false) ??
      this.anchor.notification;
  }
  handleDelta(timestamp, delta) {
    let data = null;
    const path = delta.path;
    if (path == "navigation.position") data = this.currentCoordinates;
    else if (path == "navigation.headingTrue") data = this.heading;
    else if (path == "environment.depth.belowKeel") data = this.belowKeel;
    else if (path == "environment.depth.belowSurface") data = this.belowSurface;
    else if (path == "environment.wind.directionTrue") data = this.twa;
    else if (path == "environment.wind.speedApparent") data = this.aws;
    else if (path == "environment.tide") data = this.tide;
    else if (path == "navigation.anchor.position") data = this.anchor.position;
    else if (path == "navigation.anchor.state") data = this.anchor.state;
    else if (path == "navigation.anchor.maxRadius")
      data = this.anchor.maxRadius;
    else if (path == "notifications.navigation.anchor")
      data = this.anchor.notification;
    else console.log(delta);
    if (data) {
      data.timestamp = timestamp;
      data.value = delta.value;
    }
  }
  calculate() {
    this.calculateTides();
    this.boatConfig.heading = this.computeOwnHeading();
    this.calculateScopes();
  }
  calculateTides() {
    if (!this.tide) return;
    this.currentTide = GeoMath.estimateTideHeightSmooth(
      this.tide.timeLow.value,
      this.tide.heightLow.value,
      this.tide.timeHigh.value,
      this.tide.heightHigh.value,
    );
    this.tidalRise = this.tide.heightHigh.value - this.currentTide;
    this.tidalFall = this.currentTide - this.tide.heightLow.value;
  }
  calculateScopes() {
    this.scope7 = this.calculateScope(7);
    this.scope5 = this.calculateScope(5);
    this.scope4 = this.calculateScope(4);
    this.scope3 = this.calculateScope(3);
  }
  calculateScope(scope) {
    let maxHeight = this.belowSurface.value;
    maxHeight += this.boatConfig.anchorRollerHeight;
    maxHeight += this.tidalRise;
    return maxHeight * scope;
  }
  computeOwnHeading() {
    if (this.heading) return GeoMath.rad2deg(this.heading.value);
    if (this.anchorPosition && this.currentCoordinates)
      return Math.round(
        GeoMath.calculateBearing(
          this.currentCoordinates.value.latitude,
          this.currentCoordinates.value.longitude,
          this.anchorPosition.value.latitude,
          this.anchorPosition.value.longitude,
        ),
      );
    if (this.twa) return GeoMath.rad2deg(this.twa.value);
    return 0;
  }
};
//#endregion
//#region ui/js/FleetLayer.js
var MAX_OWN_TRACK_POINTS = 3600 * 24;
var POLL_INTERVAL_MS$1 = 5e3;
var DEFAULT_FILTER_RADIUS = 500;
var GPS_ANTENNA_ICON = L.icon({
  iconUrl: "icons/antenna.svg",
  iconSize: [25, 25],
  iconAnchor: [13, 25],
});
var FleetLayer = class {
  constructor({ app, map, ownMmsi }) {
    this.app = app;
    this.map = map;
    this.ownMmsi = ownMmsi;
    this.vessels = {};
    this.vesselTracks = {};
    this.ownVessel = void 0;
    this.ownAntenna = void 0;
    this.ownBoatConfig = void 0;
    this.fleetTimer = null;
    this._pollInFlight = false;
    this.filterRadius = DEFAULT_FILTER_RADIUS;
    this.setOwnVessel(this.app.state.getPosition(), this.app.state.boatConfig);
    this.loadInitialData();
  }
  loadInitialData() {
    this.app.signalK
      .fetchTracks(this.filterRadius)
      .then((tracks) => {
        this.loadHistoricalTracks(
          tracks,
          this.app.state.getPosition(),
          this.filterRadius,
        );
      })
      .catch((err) => {
        const detail = err.statusText || err.message || "unknown error";
        this.app.statusBar.setWarning(`Tracks plugin not available: ${detail}`);
      });
    this.fleetTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS$1);
    this.poll();
  }
  poll() {
    if (this._pollInFlight) return;
    this._pollInFlight = true;
    this.app.signalK
      .fetchAllVessels()
      .then((vessels) => {
        this.syncOtherVessels(vessels, {
          ownLatLng: this.app.state.getPosition(),
          filterRadius: this.filterRadius,
          twa: this.app.state.twa,
        });
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const msg = `Fleet update failed: ${error.status ? `${error.status} ` : ""}${detail}`;
        this.statusBar.setWarning(msg);
        console.error(msg, error);
      })
      .finally(() => {
        this._pollInFlight = false;
      });
  }
  update(state) {
    this.updateOwnPosition(state.getPosition(), state.boatConfig.heading);
    this.appendOwnTrack(state.getPosition());
  }
  setOwnVessel(coords, boatConfig) {
    this.ownBoatConfig = boatConfig;
    this.ownVessel = new L.BoatMarker(coords, {
      beam: boatConfig.beam,
      loa: boatConfig.loa,
      gpsOffset: boatConfig.bowOffset,
      heading: boatConfig.heading,
      icon: boatConfig.icon,
    }).addTo(this.map);
    this.ownAntenna = L.marker(coords, { icon: GPS_ANTENNA_ICON }).addTo(
      this.map,
    );
  }
  updateOwnPosition(coords, heading) {
    this.ownVessel.setLatLng(coords);
    this.ownVessel.setHeading(heading);
    this.ownAntenna.setLatLng(coords);
  }
  loadHistoricalTracks(tracks, ownLatLng, filterRadius) {
    const mmsiRegex = /urn:mrn:imo:mmsi:(\d+)$/;
    for (let uri in tracks) {
      const match = uri.match(mmsiRegex);
      if (!match) continue;
      const mmsi = match[1];
      const history = tracks[uri].coordinates?.[0];
      if (!history || !history.length) continue;
      const points = [];
      let i = 0;
      for (let position of history) {
        const lat = position[1];
        const lon = position[0];
        if (
          GeoMath.calculateDistance(ownLatLng.lat, ownLatLng.lng, lat, lon) <
          filterRadius
        ) {
          points.push([lat, lon, i]);
          i++;
        }
      }
      if (!points.length) continue;
      this.vesselTracks[mmsi] = this.createTrack(points, points.length);
    }
  }
  appendOwnTrack(latLng) {
    const ownTrack = this.vesselTracks[this.ownMmsi];
    if (!ownTrack) return;
    ownTrack.addLatLng([latLng.lat, latLng.lng, ownTrack.getLatLngs().length]);
    ownTrack.options.max++;
    const pts = ownTrack.getLatLngs();
    if (pts.length > MAX_OWN_TRACK_POINTS) {
      const trimmed = pts.slice(-MAX_OWN_TRACK_POINTS);
      ownTrack.setLatLngs(trimmed);
      ownTrack.options.min = trimmed[0].alt;
    }
  }
  syncOtherVessels(vessels, { ownLatLng, filterRadius, twa }) {
    const detected = [];
    for (let key in vessels) {
      const vessel = vessels[key];
      if (vessel.mmsi == this.ownMmsi) continue;
      if (!("navigation" in vessel) || !("position" in vessel.navigation))
        continue;
      const position = vessel.navigation.position.value;
      const distance = GeoMath.calculateDistance(
        position.latitude,
        position.longitude,
        ownLatLng.lat,
        ownLatLng.lng,
      );
      if (distance > filterRadius) continue;
      detected.push(vessel.mmsi);
      const heading = this.deriveVesselHeading(vessel, twa);
      const distanceRounded = Math.round(distance);
      if (vessel.mmsi in this.vessels)
        this.updateExistingVessel(vessel, position, heading, distanceRounded);
      else this.addNewVessel(vessel, position, heading, distanceRounded);
    }
    const detectedSet = new Set(detected.map(String));
    for (let mmsi in this.vessels)
      if (!detectedSet.has(mmsi)) {
        const marker = this.vessels[mmsi];
        if (marker.gpsAntennaMarker)
          this.map.removeLayer(marker.gpsAntennaMarker);
        this.map.removeLayer(marker);
        delete this.vessels[mmsi];
        if (this.vesselTracks[mmsi]) {
          this.map.removeLayer(this.vesselTracks[mmsi]);
          delete this.vesselTracks[mmsi];
        }
      }
  }
  deriveVesselHeading(vessel, twa) {
    let sog = 0;
    const sogVal = SignalKClient.value(vessel, "navigation.speedOverGround");
    if (sogVal !== void 0) sog = sogVal * MPS_TO_KNOTS;
    const headingTrue = SignalKClient.value(vessel, "navigation.headingTrue");
    if (headingTrue !== void 0) return GeoMath.rad2deg(headingTrue);
    const cog = SignalKClient.value(vessel, "navigation.courseOverGroundTrue");
    if (cog !== void 0 && sog > 1) return GeoMath.rad2deg(cog);
    if (twa) return GeoMath.rad2deg(twa.value);
    return 0;
  }
  updateExistingVessel(vessel, position, heading, distance) {
    const marker = this.vessels[vessel.mmsi];
    marker.setLatLng([position.latitude, position.longitude]);
    marker.setHeading(heading);
    marker.setPopupContent(`${vessel.name} at ${distance} meters`);
    marker.gpsAntennaMarker.setLatLng([position.latitude, position.longitude]);
    const track = this.vesselTracks[vessel.mmsi];
    if (!track) return;
    const last = track.getLatLngs().at(-1);
    if (
      last &&
      (last.lat != position.latitude || last.lng != position.longitude)
    ) {
      track.addLatLng([
        position.latitude,
        position.longitude,
        track.options.max,
      ]);
      track.options.max++;
    }
  }
  addNewVessel(vessel, position, heading, distance) {
    const config = BoatConfig.extract(vessel);
    const marker = new L.BoatMarker([position.latitude, position.longitude], {
      beam: config.beam,
      loa: config.loa,
      gpsOffset: config.bowOffset,
      heading,
      icon: config.icon,
    });
    marker.addTo(this.map).bindPopup(`${vessel.name} at ${distance} meters`);
    marker.gpsAntennaMarker = L.marker(
      [position.latitude, position.longitude],
      { icon: GPS_ANTENNA_ICON },
    ).addTo(this.map);
    this.vessels[vessel.mmsi] = marker;
    if (!(vessel.mmsi in this.vesselTracks))
      this.vesselTracks[vessel.mmsi] = this.createTrack(
        [[position.latitude, position.longitude, 0]],
        1,
      );
  }
  createTrack(points, max) {
    return L.hotline(points, {
      color: "red",
      weight: 1,
      min: 0,
      max,
      palette: {
        0: "red",
        0.5: "yellow",
        1: "green",
      },
      outlineWidth: 0,
      text: "",
    }).addTo(this.map);
  }
};
//#endregion
//#region ui/js/WindBarb.js
var WindBarb = Object.freeze({
  knot0:
    '<path fill="#1A232D" d="M125,120c2.762,0,5,2.239,5,5c0,2.762-2.238,5-5,5c-2.761,0-5-2.238-5-5C120,122.239,122.239,120,125,120z"/><path fill="none" stroke="#1A232D" stroke-width="2" d="M125,115c5.523,0,10,4.477,10,10c0,5.523-4.477,10-10,10 c-5.523,0-10-4.477-10-10C115,119.477,119.477,115,125,115z "/>',
  knot2: '<path class="svg-wb" d="M125,112V76 M125,125l7-12.1h-14L125,125z"/>',
  knot5:
    '<path class="svg-wb" d="M125,112V76 M125,89l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot10:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot15:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot20:
    '<path class="svg-wb" d="M125,112V89 M125,89l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot25:
    '<path class="svg-wb" d="M125,112V79 M125,79l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot30:
    '<path class="svg-wb" d="M125,112V79 M125,79l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot35:
    '<path class="svg-wb" d="M125,112V69 M125,69l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot40:
    '<path class="svg-wb" d="M125,112V69 M125,69l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot45:
    '<path class="svg-wb" d="M125,112V59 M125,59l14-14 M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14 L125,125z"/>',
  knot50:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot55:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot60:
    '<path class="svg-wb" d="M125,112V76 M125,76h14l-14,14V76z M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot65:
    '<path class="svg-wb" d="M125,112V66 M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot70:
    '<path class="svg-wb" d="M125,112V66 M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot75:
    '<path class="svg-wb" d="M125,112V56 M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot80:
    '<path class="svg-wb" d="M125,112V56 M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot85:
    '<path class="svg-wb" d="M125,112V46 M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1 h-14L125,125z"/>',
  knot90:
    '<path class="svg-wb" d="M125,112V46 M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1 h-14L125,125z"/>',
  knot95:
    '<path class="svg-wb" d="M125,112V36 M125,36h14l-14,14V36z M125,60l14-14 M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot100:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot105:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot110:
    '<path class="svg-wb" d="M125,112V62 M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot115:
    '<path class="svg-wb" d="M125,112V52 M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14 L125,125z"/>',
  knot120:
    '<path class="svg-wb" d="M125,112V52 M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14 L125,125z"/>',
  knot125:
    '<path class="svg-wb" d="M125,112V42 M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125 l7-12.1h-14L125,125z"/>',
  knot130:
    '<path class="svg-wb" d="M125,112V42 M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125 l7-12.1h-14L125,125z"/>',
  knot135:
    '<path class="svg-wb" d="M125,112V32 M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100 l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot140:
    '<path class="svg-wb" d="M125,112V32 M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100 l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot145:
    '<path class="svg-wb" d="M125,112V22 M125,22h14l-14,14V22z M125,36h14l-14,14V36z M125,60l14-14 M125,70l14-14 M125,80l14-14 M125,90 l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot150:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,125l7-12.1h-14L125,125z"/>',
  knot155:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l7-7 M125,125l7-12.1 h-14L125,125z"/>',
  knot160:
    '<path class="svg-wb" d="M125,112V48 M125,48h14l-14,14V48z M125,62h14l-14,14V62z M125,76h14l-14,14V76z M125,100l14-14 M125,125 l7-12.1h-14L125,125z"/>',
  knot165:
    '<path class="svg-wb" d="M125,112V38 M125,38h14l-14,14V38z M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot170:
    '<path class="svg-wb" d="M125,112V38 M125,38h14l-14,14V38z M125,52h14l-14,14V52z M125,66h14l-14,14V66z M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot175:
    '<path class="svg-wb" d="M125,112V28 M125,28h14l-14,14V28z M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot180:
    '<path class="svg-wb" d="M125,112V28 M125,28h14l-14,14V28z M125,42h14l-14,14V42z M125,56h14l-14,14V56z M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
  knot185:
    '<path class="svg-wb" d="M125,112V18 M125,18h14l-14,14V18z M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l7-7 M125,125l7-12.1h-14L125,125z"/>',
  knot190:
    '<path class="svg-wb" d="M125,112V18 M125,18h14l-14,14V18z M125,32h14l-14,14V32z M125,46h14l-14,14V46z M125,70l14-14 M125,80l14-14 M125,90l14-14 M125,100l14-14 M125,125l7-12.1h-14L125,125z"/>',
});
var computeMinY = function (svgInner) {
  let minY = Infinity;
  const dAttrRe = /\bd="([^"]+)"/g;
  let dMatch;
  while ((dMatch = dAttrRe.exec(svgInner)) !== null) {
    const tokens = dMatch[1].match(/-?\d+(?:\.\d+)?|[a-zA-Z]/g) || [];
    let cx = 0,
      cy = 0,
      cmd = null;
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/[a-zA-Z]/.test(t)) {
        cmd = t;
        i++;
        continue;
      }
      switch (cmd) {
        case "M":
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          cmd = "L";
          break;
        case "m":
          cx += +tokens[i++];
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          cmd = "l";
          break;
        case "L":
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "l":
          cx += +tokens[i++];
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "V":
          cy = +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "v":
          cy += +tokens[i++];
          minY = Math.min(minY, cy);
          break;
        case "H":
          cx = +tokens[i++];
          break;
        case "h":
          cx += +tokens[i++];
          break;
        case "C": {
          +tokens[i++];
          const y1 = +tokens[i++];
          +tokens[i++];
          const y2 = +tokens[i++];
          cx = +tokens[i++];
          cy = +tokens[i++];
          minY = Math.min(minY, y1, y2, cy);
          break;
        }
        case "c": {
          +tokens[i++];
          const dy1 = +tokens[i++];
          +tokens[i++];
          const dy2 = +tokens[i++];
          const dx = +tokens[i++],
            dy = +tokens[i++];
          minY = Math.min(minY, cy + dy1, cy + dy2, cy + dy);
          cx += dx;
          cy += dy;
          break;
        }
        case "Z":
        case "z":
          break;
        default:
          i++;
          break;
      }
    }
  }
  return minY;
};
var VIEWBOX_X = 113;
var VIEWBOX_WIDTH = 28;
var VIEWBOX_BOTTOM = 137;
var VIEWBOX_TOP_PADDING = 2;
var WindBarbViewBox = Object.freeze(
  Object.fromEntries(
    Object.entries(WindBarb).map(([key, path]) => {
      const minY = computeMinY(path);
      const top = Math.floor(minY - VIEWBOX_TOP_PADDING);
      return [
        key,
        `${VIEWBOX_X} ${top} ${VIEWBOX_WIDTH} ${VIEWBOX_BOTTOM - top}`,
      ];
    }),
  ),
);
var roundToNearest = function (value, nearest) {
  return Math.round(value / nearest) * nearest;
};
var roundDownToNearest = function (value, nearest) {
  return Math.floor(value / nearest) * nearest;
};
var metersPerSecondToKnots = function (mps) {
  return mps * 1.943844;
};
var hasNestedProperty = (obj, prop, ...rest) => {
  if (obj === void 0) return false;
  if (rest.length === 0 && Object.prototype.hasOwnProperty.call(obj, prop))
    return true;
  return hasNestedProperty(obj[prop], ...rest);
};
var getSvgKey = function (windSpeed) {
  if (windSpeed >= 1 && windSpeed < 2.5) return "knot2";
  const windBarbName = `knot${roundToNearest(metersPerSecondToKnots(roundDownToNearest(windSpeed, 2.5)), 5)}`;
  if (hasNestedProperty(WindBarb, windBarbName)) return windBarbName;
  return "knot0";
};
var getWindBarb = function (windSpeed) {
  const key = getSvgKey(windSpeed);
  return `
        <svg xmlns="http://www.w3.org/2000/svg" class="wind-barb" viewBox="${WindBarbViewBox[key]}">
            ${WindBarb[key]}
        </svg>
    `;
};
//#endregion
//#region ui/js/HudPanels.js
var StatusBar = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "statusBar leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "statusBarUI";
    container.style.display = "none";
    this._container = container;
    return container;
  },
  setStatus: function (text) {
    this._render(text, "black");
  },
  setWarning: function (text) {
    this._render(text, "#d97706");
  },
  setError: function (text) {
    this._render(text, "red");
  },
  _render: function (text, color) {
    if (!this._container) return;
    this._container.textContent = text;
    this._container.style.color = color;
    this._container.style.display = "";
  },
  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
var HomeButtonControl = L.Control.extend({
  options: {
    position: "topright",
    onHome: null,
  },
  onAdd: function (map) {
    const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const homeButton = L.DomUtil.create("a", "leaflet-control-home", container);
    homeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="0.75" class="bi bi-house" viewBox="0 0 16 16">
  <path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z"/>
</svg>`;
    homeButton.href = "#";
    homeButton.title = "Center on Boat";
    homeButton.setAttribute("role", "button");
    L.DomEvent.disableClickPropagation(container);
    const onHome = this.options.onHome;
    L.DomEvent.on(homeButton, "click", function (e) {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      if (onHome) onHome(map);
    });
    return container;
  },
});
var InfoPanel = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "info leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "infoUI";
    container.innerHTML = `
        <table>
          <tr>
            <th>Depth:</th>
            <td><span title="Below Surface" id='belowSurface'>~</span></td>
          </tr>
          <tr>
            <th>Status:</th>
            <td><span id='pluginStatus'>Loading</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._belowSurface = container.querySelector("#belowSurface");
    this._pluginStatus = container.querySelector("#pluginStatus");
    return container;
  },
  update: function (state) {
    this.setBelowSurface(state.belowSurface);
    this.setStatus(state.anchor.notification);
  },
  setBelowSurface: function (dbs) {
    if (dbs)
      this._belowSurface.textContent = `${parseFloat(dbs.value).toFixed(1)}m`;
    else this._belowSurface.textContent = "~";
  },
  setStatus: function (notification) {
    if (notification) {
      this._pluginStatus.textContent = notification.value.message;
      this._pluginStatus.className = "";
      if (notification.value.message !== "Off" && notification.value.state)
        this._pluginStatus.classList.add(notification.value.state);
    } else this._pluginStatus.textContent = "Unknown";
  },
  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
var WindPanel = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "windBarbControl leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "windBarbUI";
    container.innerHTML = `
      <div><b>Wind</b></div>
      <div id="windBarbContainer"></div>
      <div id="awsValue">~</div>
    `;
    this._container = container;
    this._aws = container.querySelector("#awsValue");
    this._barb = container.querySelector("#windBarbContainer");
    return container;
  },
  setSpeed: function (aws, twa) {
    if (!aws) {
      this._aws.innerHTML = "~";
      return;
    }
    const kts = Math.round(aws.value * MPS_TO_KNOTS);
    this._aws.innerHTML = `${kts}kts`;
    const windBarbIcon = getWindBarb(aws.value);
    this._barb.innerHTML = windBarbIcon;
    const svg = this._barb.querySelector("svg");
    if (svg) {
      let angle = 0;
      if (twa) angle = GeoMath.rad2deg(Math.round(twa.value));
      svg.style.transform = `rotate(${Math.round(angle)}deg)`;
    }
  },
  setAngle: function (twa) {
    if (!twa) return;
    const angle = GeoMath.rad2deg(Math.round(twa.value));
    const svg = this._barb.querySelector("svg");
    if (svg) svg.style.transform = `rotate(${angle}deg)`;
  },
  update: function (state) {
    this.setSpeed(state.aws, state.twa);
  },
  clearSpeed: function () {
    this._aws.innerHTML = "~";
  },
});
var ScopePanel = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const container = L.DomUtil.create("div", "scope leaflet-bar");
    L.DomEvent.disableClickPropagation(container);
    container.id = "scopeUI";
    container.innerHTML = `
        <table>
          <tr>
            <th>Water&nbsp;Depth</th>
            <td><span id='scopeDepth'>~</span></td>
          </tr>
          <tr>
            <th>Bow&nbsp;Height</th>
            <td>+ <span id='bowHeight'>~</span></td>
          </tr>
          <tr>
            <th>Tidal&nbsp;Rise</th>
            <td>+ <span id='tidalRise'>~</span></td>
          </tr>
          <tr>
            <th>Total</th>
            <td>= <span id='scopeTotal'>~</span></td>
          </tr>
          <tr>
            <th colspan="2">&nbsp;</th>
          </tr>
          <tr>
            <th>7:1&nbsp;Scope</th>
            <td><span id='scope7to1'>~</span></td>
          </tr>
          <tr>
            <th>5:1&nbsp;Scope</th>
            <td><span id='scope5to1'>~</span></td>
          </tr>
          <tr>
            <th>4:1&nbsp;Scope</th>
            <td><span id='scope4to1'>~</span></td>
          </tr>
          <tr>
            <th>3:1&nbsp;Scope</th>
            <td><span id='scope3to1'>~</span></td>
          </tr>
          <tr>
            <th colspan="2">&nbsp;</th>
          </tr>
          <tr>
            <th>Below&nbsp;Keel</th>
            <td><span id='belowKeel'>~</span></td>
          </tr>
          <tr>
            <th>Tidal&nbsp;Fall</th>
            <td>- <span id='tidalFall'>~</span></td>
          </tr>
          <tr class="minimumDepthRow">
            <th>Minimum&nbsp;Depth</th>
            <td>= <span id='minimumDepth'>~</span></td>
          </tr>
        </table>
    `;
    this._container = container;
    this._refs = {
      scopeDepth: container.querySelector("#scopeDepth"),
      bowHeight: container.querySelector("#bowHeight"),
      tidalRise: container.querySelector("#tidalRise"),
      scopeTotal: container.querySelector("#scopeTotal"),
      scope7to1: container.querySelector("#scope7to1"),
      scope5to1: container.querySelector("#scope5to1"),
      scope4to1: container.querySelector("#scope4to1"),
      scope3to1: container.querySelector("#scope3to1"),
      belowKeel: container.querySelector("#belowKeel"),
      tidalFall: container.querySelector("#tidalFall"),
      minimumDepth: container.querySelector("#minimumDepth"),
      minimumDepthRow: container.querySelector(".minimumDepthRow"),
    };
    return container;
  },
  update: function (state) {
    if (state.belowSurface && state.belowKeel) {
      const maxHeight =
        state.belowSurface.value +
        state.boatConfig.anchorRollerHeight +
        state.tidalRise;
      this._refs.scopeTotal.innerHTML = `${maxHeight.toFixed(1)}m`;
      this._refs.scopeDepth.innerHTML = `${state.belowSurface.value.toFixed(1)}m`;
      this._refs.belowKeel.innerHTML = `${state.belowKeel.value.toFixed(1)}m`;
    } else {
      this._refs.scopeTotal.innerHTML = "~";
      this._refs.scopeDepth.innerHTML = "~";
      this._refs.belowKeel.innerHTML = "~";
    }
    if (state.tide && state.belowKeel) {
      const minimumDepth = state.belowKeel.value - state.tidalFall;
      this._refs.minimumDepth.innerHTML = `${minimumDepth.toFixed(1)}m`;
      if (minimumDepth > 1) this._refs.minimumDepthRow.style.color = "green";
      else if (minimumDepth > 0)
        this._refs.minimumDepthRow.style.color = "orange";
      else this._refs.minimumDepthRow.style.color = "red";
    } else this._refs.minimumDepth.innerHTML = "~";
    if (state.tide) {
      this._refs.tidalRise.innerHTML = `${state.tidalRise.toFixed(1)}m`;
      this._refs.tidalFall.innerHTML = `${state.tidalFall.toFixed(1)}m`;
    } else {
      this._refs.tidalRise.innerHTML = "~";
      this._refs.tidalFall.innerHTML = "~";
    }
    this._refs.scope7to1.innerHTML = `${state.scope7.toFixed(1)}m`;
    this._refs.scope5to1.innerHTML = `${state.scope5.toFixed(1)}m`;
    this._refs.scope4to1.innerHTML = `${state.scope4.toFixed(1)}m`;
    this._refs.scope3to1.innerHTML = `${state.scope3.toFixed(1)}m`;
    this._refs.bowHeight.innerHTML = `${state.boatConfig.anchorRollerHeight.toFixed(1)}m`;
  },
  show: function () {
    if (this._container) this._container.style.display = "";
  },
  hide: function () {
    if (this._container) this._container.style.display = "none";
  },
});
//#endregion
//#region ui/js/StaleReloader.js
var StaleReloader = class {
  constructor({ staleThresholdMs }) {
    this.staleThresholdMs = staleThresholdMs;
    this.hiddenAt = null;
  }
  start() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.hiddenAt = Date.now();
      else if (this.hiddenAt !== null) {
        const elapsed = Date.now() - this.hiddenAt;
        this.hiddenAt = null;
        if (elapsed >= this.staleThresholdMs) window.location.reload();
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.location.reload();
    });
  }
};
//#endregion
//#region ui/js/AnchorOverlay.js
var ANCHOR_ICON = L.icon({
  iconUrl: "icons/anchor.png",
  iconSize: [24, 24],
  iconAnchor: [12, 4],
});
var CROSSHAIR_ICON = L.icon({
  iconUrl: "icons/crosshair.png",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
var AnchorOverlay = class {
  constructor({ map, radius }) {
    this.map = map;
    this.radius = radius;
    this.dropped = false;
    this.anchorPosition = map.getCenter();
    this.boatPosition = null;
    this.heading = 0;
    this.gpsOffsets = {
      x: 0,
      y: 0,
    };
    this.dragHandler = null;
    this.radiusCircle = L.circle(this.anchorPosition, this.radius, {
      color: "green",
    }).addTo(map);
    this.anchorLine = L.polyline([this.anchorPosition, this.anchorPosition], {
      color: "grey",
      weight: 2,
    }).addTo(map);
    this.anchorLineAngle = L.polyline(
      [this.anchorPosition, this.anchorPosition],
      {
        color: "grey",
        weight: 0,
      },
    ).addTo(map);
    this.anchorMarker = null;
    this.crosshairMarker = null;
  }
  drop(position, radius) {
    this.dropped = true;
    this.anchorPosition = position;
    this.radius = parseInt(radius, 10);
    if (!(this.radius > 0)) this.radius = 20;
    this._removeCrosshair();
    this._removeAnchorMarker();
    this.radiusCircle.setLatLng(position);
    this.radiusCircle.setRadius(this.radius);
    this.anchorMarker = L.marker(position, { icon: ANCHOR_ICON }).addTo(
      this.map,
    );
    this._refreshLine();
    this._refreshColor();
    return this;
  }
  raise(position) {
    this.dropped = false;
    this.anchorPosition = position;
    this._removeAnchorMarker();
    this._removeCrosshair();
    this.crosshairMarker = L.marker(position, {
      icon: CROSSHAIR_ICON,
      draggable: true,
    }).addTo(this.map);
    this.crosshairMarker.on("drag", () => {
      this.anchorPosition = this.crosshairMarker.getLatLng();
      this.radiusCircle.setLatLng(this.anchorPosition);
      this._refreshLine();
      this._refreshColor();
      if (this.dragHandler) this.dragHandler(this.anchorPosition);
    });
    this.radiusCircle.setLatLng(position);
    this._refreshLine();
    this._refreshColor();
    return this;
  }
  setRadius(r) {
    this.radius = r;
    this.radiusCircle.setRadius(r);
    this._refreshColor();
    return this;
  }
  setBoatPosition(coords, heading, gpsOffsets) {
    this.boatPosition = coords;
    this.heading = heading;
    this.gpsOffsets = gpsOffsets;
    this._refreshLine();
    this._refreshColor();
    return this;
  }
  onCrosshairDrag(cb) {
    this.dragHandler = cb;
    return this;
  }
  getCrosshairPosition() {
    return this.crosshairMarker ? this.crosshairMarker.getLatLng() : null;
  }
  getBounds() {
    return this.radiusCircle.getBounds();
  }
  update(state) {
    this.setBoatPosition(
      state.getPosition(),
      state.boatConfig.heading,
      state.boatConfig.gpsOffset,
    );
  }
  _refreshLine() {
    if (!this.boatPosition) return;
    const bow = GeoMath.calculateBowCoordinates(
      this.boatPosition,
      this.heading,
      this.gpsOffsets.x,
      this.gpsOffsets.y,
    );
    this.anchorLine.setLatLngs([bow, this.anchorPosition]);
    this.anchorLineAngle.setLatLngs([bow, this.anchorPosition]);
    const flip = bow.lng > this.anchorPosition.lng;
    let distance = GeoMath.calculateDistance(
      bow.lat,
      bow.lng,
      this.anchorPosition.lat,
      this.anchorPosition.lng,
    );
    distance = Math.round(distance * 10) / 10;
    this.anchorLine.setText("");
    this.anchorLine.setText(`${distance}m`, {
      orientation: flip ? "flip" : 0,
      offset: 12,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });
    const bearing = Math.round(
      GeoMath.calculateBearing(
        bow.lat,
        bow.lng,
        this.anchorPosition.lat,
        this.anchorPosition.lng,
      ),
    );
    this.anchorLineAngle.setText("");
    this.anchorLineAngle.setText(`${bearing}°`, {
      orientation: flip ? "flip" : 0,
      offset: -3,
      center: true,
      attributes: { class: "anchorLineLabel" },
    });
  }
  _refreshColor() {
    const baseColor = this.dropped ? "green" : "blue";
    if (!this.boatPosition) {
      this.radiusCircle.setStyle({ color: baseColor });
      return;
    }
    const distance = GeoMath.calculateDistance(
      this.anchorPosition.lat,
      this.anchorPosition.lng,
      this.boatPosition.lat,
      this.boatPosition.lng,
    );
    this.radiusCircle.setStyle({
      color: distance > this.radius ? "red" : baseColor,
    });
  }
  _removeAnchorMarker() {
    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }
  }
  _removeCrosshair() {
    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = null;
    }
  }
};
//#endregion
//#region ui/js/AnchorController.js
var AnchorState = Object.freeze({
  UP: "UP",
  DROPPING: "DROPPING",
  ANCHORED: "ANCHORED",
  RAISING: "RAISING",
});
var AnchorController = class {
  constructor({ overlay, toolbar, signalK, infoPanel, scopePanel, onError }) {
    this._overlay = overlay;
    this._toolbar = toolbar;
    this._signalK = signalK;
    this._infoPanel = infoPanel;
    this._scopePanel = scopePanel;
    this._onError = onError;
    this.state = AnchorState.UP;
    this.anchorCoordinates = null;
    this.maxRadius = 0;
  }
  _reportError(prefix, err) {
    const detail = err?.statusText || err?.message || "unknown error";
    this._onError?.(`${prefix}: ${detail}`);
  }
  requestDrop() {
    if (this.state !== AnchorState.UP) return;
    const pos = this._overlay.getCrosshairPosition();
    if (!pos) return;
    this.state = AnchorState.DROPPING;
    this._enterDropped(pos, this.maxRadius);
    this._signalK
      .dropAnchor(
        {
          latitude: pos.lat,
          longitude: pos.lng,
        },
        this.maxRadius,
      )
      .then(() => {
        this.state = AnchorState.ANCHORED;
        this._toolbar.setState(this.state);
      })
      .catch((err) => {
        this.state = AnchorState.UP;
        this._enterRaised();
        this._reportError("Failed to drop anchor", err);
      });
  }
  requestRaise() {
    if (this.state !== AnchorState.ANCHORED) return;
    const previousAnchor = this.anchorCoordinates;
    const previousRadius = this.maxRadius;
    this.state = AnchorState.RAISING;
    this._enterRaised();
    this._signalK
      .raiseAnchor()
      .then(() => {
        this.state = AnchorState.UP;
        this._toolbar.setState(this.state);
      })
      .catch((err) => {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(previousAnchor, previousRadius);
        this._reportError("Failed to raise anchor", err);
      });
  }
  setRadius(newRadius) {
    this.maxRadius = newRadius;
    this._toolbar.setRadius(newRadius);
    this._overlay.setRadius(newRadius);
    if (this.state === AnchorState.ANCHORED)
      this._signalK
        .setRadius(newRadius)
        .catch((err) => this._reportError("Failed to set radius", err));
  }
  estimateAnchorPosition(appState) {
    if (!appState.currentCoordinates) return;
    if (this.state !== AnchorState.UP) return;
    const distance = appState.calculateScope(5);
    this.setRadius(
      this.computeDefaultRadius(
        distance,
        appState.boatConfig.gpsBowXDistance,
        appState.boatConfig.gpsBowYDistance,
      ),
    );
    const bow = GeoMath.calculateBowCoordinates(
      appState.getPosition(),
      appState.boatConfig.heading,
      appState.boatConfig.gpsBowXDistance,
      appState.boatConfig.gpsBowYDistance,
    );
    const guess = GeoMath.calculateDestinationPoint(
      bow.lat,
      bow.lng,
      appState.boatConfig.heading,
      distance,
    );
    this.restoreRaised(L.latLng(guess.latitude, guess.longitude));
  }
  computeDefaultRadius(anchorDistanceGuess, xOffset, yOffset) {
    let r = anchorDistanceGuess;
    r += GeoMath.calculateVectorDistance(xOffset, yOffset);
    r *= 1.5;
    r = Math.round(r / 5) * 5;
    r = Math.max(0, r);
    r = Math.min(200, r);
    return r;
  }
  reconcile(appState) {
    if (this.state !== AnchorState.UP && this.state !== AnchorState.ANCHORED)
      return;
    if (appState.anchor.position && appState.anchor.position.value) {
      this.anchorCoordinates = appState.getAnchorPosition();
      this.maxRadius = appState.anchor.maxRadius.value;
      if (this.state === AnchorState.UP) {
        this.state = AnchorState.ANCHORED;
        this._enterDropped(this.anchorCoordinates, this.maxRadius);
      } else {
        this._toolbar.setRadius(this.maxRadius);
        this._overlay.setRadius(this.maxRadius);
      }
    } else if (this.state === AnchorState.ANCHORED) {
      this.state = AnchorState.UP;
      this._enterRaised();
    }
  }
  restoreDropped(position, radius) {
    this.state = AnchorState.ANCHORED;
    this._enterDropped(position, radius);
  }
  restoreRaised(guessPosition) {
    this.anchorCoordinates = guessPosition;
    this._enterRaised();
  }
  updateCrosshairPosition(pos) {
    if (this.state === AnchorState.ANCHORED) return;
    this.anchorCoordinates = pos;
  }
  _enterDropped(position, radius) {
    this.anchorCoordinates = position;
    this.maxRadius = parseInt(radius, 10);
    if (!(this.maxRadius > 0)) this.maxRadius = 20;
    this._toolbar.setState(this.state);
    this._toolbar.setRadius(this.maxRadius);
    this._scopePanel.hide();
    this._infoPanel.show();
    this._overlay.drop(position, this.maxRadius);
  }
  _enterRaised() {
    this._toolbar.setState(this.state);
    this._infoPanel.hide();
    this._scopePanel.show();
    this._overlay.raise(this.anchorCoordinates);
  }
};
//#endregion
//#region ui/js/ControlToolbar.js
var ControlToolbar = class {
  constructor({ parent, getMapContainer, onDrop, onRaise, onSetRadius }) {
    this._getMapContainer = getMapContainer;
    this._onDrop = onDrop;
    this._onRaise = onRaise;
    this._onSetRadius = onSetRadius;
    this._radius = 0;
    this._state = null;
    this._container = document.createElement("div");
    this._container.id = "controlToolbar";
    this._container.innerHTML = `
      <div id="anchorDown">
        <button id="raiseAnchor">Raise Anchor</button>
      </div>
      <div id="anchorUp">
        <button id="dropAnchor">Drop Anchor</button>
      </div>
      <div id="radiusControl">
        <button id="decreaseRadius">-</button>
        <button id="setRadius"><span id="radius">0</span>m</button>
        <button id="increaseRadius">+</button>
      </div>
    `;
    parent.appendChild(this._container);
    this._anchorUp = this._container.querySelector("#anchorUp");
    this._anchorDown = this._container.querySelector("#anchorDown");
    this._radiusEl = this._container.querySelector("#radius");
    this._container
      .querySelector("#raiseAnchor")
      .addEventListener("click", () => {
        if (this._state !== AnchorState.ANCHORED) return;
        if (!confirm("Do you really want to disable your anchor alarm?"))
          return;
        if (this._onRaise) this._onRaise();
      });
    this._container
      .querySelector("#dropAnchor")
      .addEventListener("click", () => {
        if (this._onDrop) this._onDrop();
      });
    this._container
      .querySelector("#setRadius")
      .addEventListener("click", () => {
        const input = prompt("Enter Radius (m)", this._radius);
        if (input === null) return;
        const newRadius = parseInt(input, 10);
        if (isNaN(newRadius) || newRadius <= 0) return;
        if (this._onSetRadius) this._onSetRadius(newRadius);
      });
    this._container
      .querySelector("#increaseRadius")
      .addEventListener("click", () => {
        if (this._onSetRadius) this._onSetRadius(this._radius + 5);
      });
    this._container
      .querySelector("#decreaseRadius")
      .addEventListener("click", () => {
        if (this._radius <= 5) return;
        if (this._onSetRadius) this._onSetRadius(this._radius - 5);
      });
    this._container.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const target = this._getMapContainer && this._getMapContainer();
        if (!target) return;
        target.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            ctrlKey: e.ctrlKey,
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: false,
            cancelable: true,
          }),
        );
      },
      { passive: false },
    );
  }
  setState(anchorState) {
    this._state = anchorState;
    const isDown =
      anchorState === AnchorState.ANCHORED ||
      anchorState === AnchorState.DROPPING;
    this._anchorDown.style.display = isDown ? "block" : "none";
    this._anchorUp.style.display = isDown ? "none" : "block";
  }
  setRadius(radius) {
    this._radius = radius;
    this._radiusEl.innerHTML = radius;
  }
};
//#endregion
//#region ui/js/AnchorAlarm.js
var UPDATE_INTERVAL_MS = 500;
var POLL_INTERVAL_MS = 1e3;
var INITIAL_LOAD_RETRY_MS = 5e3;
var DELTA_FAST_SPEED = 250;
var DELTA_SLOW_SPEED = 1e3;
(class AnchorAlarm {
  constructor() {
    this.signalK = new SignalKClient({ pluginName: "hoekens-anchor-alarm" });
    this.state = new AppState();
    this.map = void 0;
    this.fleetLayer = void 0;
    this.anchorOverlay = void 0;
    this.anchorController = void 0;
    this.infoPanel = void 0;
    this.scopePanel = void 0;
    this.windPanel = void 0;
    this.homeButton = void 0;
    this.toolbar = void 0;
    this.useWebsockets = true;
    this.updateTimer = null;
    this.pollTimer = null;
    this._pollInFlight = false;
  }
  static startup() {
    new AnchorAlarm().init();
  }
  setupWebsockets() {
    this.client = new import_client.default({
      hostname: window.location.hostname,
      port:
        Number(window.location.port) ||
        (window.location.protocol === "https:" ? 443 : 80),
      useTLS: window.location.protocol === "https:",
      reconnect: true,
      autoConnect: true,
      notifications: false,
      sendMeta: true,
    });
    this.client.on("delta", (delta) => this.handleDeltas(delta));
    this.client.on("connect", () => {
      this.client.subscribe([
        {
          context: "vessels.self",
          subscribe: [
            {
              path: "navigation.position",
              policy: "fixed",
              period: DELTA_FAST_SPEED,
            },
            {
              path: "navigation.headingTrue",
              policy: "fixed",
              period: DELTA_FAST_SPEED,
            },
            {
              path: "environment.depth.belowKeel",
              policy: "fixed",
              period: DELTA_SLOW_SPEED,
            },
            {
              path: "environment.depth.belowSurface",
              policy: "fixed",
              period: DELTA_SLOW_SPEED,
            },
            {
              path: "environment.wind.directionTrue",
              policy: "fixed",
              period: DELTA_SLOW_SPEED,
            },
            {
              path: "environment.wind.speedApparent",
              policy: "fixed",
              period: DELTA_SLOW_SPEED,
            },
            {
              path: "environment.tide",
              policy: "fixed",
              period: 900 * 1e3,
            },
            {
              path: "navigation.anchor.position",
              policy: "instant",
              minPeriod: DELTA_FAST_SPEED,
            },
            {
              path: "navigation.anchor.state",
              policy: "instant",
              minPeriod: DELTA_FAST_SPEED,
            },
            {
              path: "navigation.anchor.maxRadius",
              policy: "instant",
              minPeriod: DELTA_FAST_SPEED,
            },
            {
              path: "notifications.navigation.anchor",
              policy: "instant",
              minPeriod: DELTA_FAST_SPEED,
            },
          ],
        },
      ]);
    });
  }
  handleDeltas(delta) {
    if (delta.updates) {
      for (const update of delta.updates)
        if (update.values) {
          let timestamp = update.timestamp;
          for (const value of update.values)
            this.state.handleDelta(timestamp, value);
        }
    }
  }
  init() {
    if (this.useWebsockets) {
      console.log("Using Websockets");
      this.setupWebsockets();
    } else console.log("Using REST Polling");
    new StaleReloader({ staleThresholdMs: 300 * 1e3 }).start();
    this.satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        maxZoom: 23,
        maxNativeZoom: 17,
        tileSize: 256,
        noWrap: true,
        keepBuffer: 5,
      },
    );
    this.osmLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "Map data from OpenStreetMap (OSM)",
        maxZoom: 23,
      },
    );
    this.baseMaps = {
      OpenStreetMap: this.osmLayer,
      Satellite: this.satelliteLayer,
    };
    this.map = L.map("map", { zoomControl: false }).setView([0, 0], 5);
    this.statusBar = new StatusBar();
    this.map.addControl(this.statusBar);
    SignalKClient.errorHandler = (msg) => this.statusBar.setWarning(msg);
    this.toolbar = new ControlToolbar({
      parent: document.getElementById("map_container"),
      getMapContainer: () => this.map && this.map.getContainer(),
      onRaise: () => this.anchorController.requestRaise(),
      onDrop: () => this.anchorController.requestDrop(),
      onSetRadius: (newRadius) => this.anchorController.setRadius(newRadius),
    });
    this.loadInitialData();
  }
  loadInitialData() {
    this.signalK
      .fetchSelf()
      .then((data) => {
        this.state.extractAll(data);
        if (!this.state.currentCoordinates) {
          this.statusBar.setError("Waiting for GPS position...");
          setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
          return;
        }
        this.state.calculate();
        this.buildMap();
        this.updateMap();
        this.map.fitBounds(this.anchorOverlay.getBounds());
        if (this.useWebsockets)
          this.updateTimer = setInterval(
            () => this.update(),
            UPDATE_INTERVAL_MS,
          );
        else this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const msg = `Failed to load initial data: ${error.status ? `${error.status} ` : ""}${detail}`;
        this.statusBar.setError(msg);
        console.error(msg, error);
        setTimeout(() => this.loadInitialData(), INITIAL_LOAD_RETRY_MS);
      });
  }
  buildMap() {
    this.map.setView(this.state.getPosition(), 5);
    this.satelliteLayer.addTo(this.map);
    L.control.zoom({ position: "topright" }).addTo(this.map);
    this.homeButton = new HomeButtonControl({
      onHome: (map) => {
        this.anchorController.estimateAnchorPosition(this.state);
        map.fitBounds(this.anchorOverlay.getBounds());
      },
    });
    this.map.addControl(this.homeButton);
    L.control
      .layers(this.baseMaps, {}, { position: "topright" })
      .addTo(this.map);
    this.infoPanel = new InfoPanel();
    this.scopePanel = new ScopePanel();
    this.windPanel = new WindPanel();
    this.map.addControl(this.infoPanel);
    this.map.addControl(this.scopePanel);
    this.map.addControl(this.windPanel);
    L.control.scale({ position: "topleft" }).addTo(this.map);
    this.fleetLayer = new FleetLayer({
      app: this,
      map: this.map,
      ownMmsi: this.state.boatConfig.mmsi,
    });
    this.buildAnchorWidgets();
  }
  buildAnchorWidgets() {
    this.anchorOverlay = new AnchorOverlay({
      map: this.map,
      radius: 0,
    }).setBoatPosition(
      this.state.getPosition(),
      this.state.boatConfig.heading,
      this.state.boatConfig.gpsOffset,
    );
    this.anchorController = new AnchorController({
      overlay: this.anchorOverlay,
      toolbar: this.toolbar,
      signalK: this.signalK,
      infoPanel: this.infoPanel,
      scopePanel: this.scopePanel,
      onError: (msg) => this.statusBar.setError(msg),
    });
    this.anchorOverlay.onCrosshairDrag((pos) =>
      this.anchorController.updateCrosshairPosition(pos),
    );
    this.anchorController.estimateAnchorPosition(this.state);
  }
  updateMap() {
    this.windPanel.update(this.state);
    this.infoPanel.update(this.state);
    this.scopePanel.update(this.state);
    this.anchorController.reconcile(this.state);
    this.anchorOverlay.update(this.state);
    this.fleetLayer.update(this.state);
  }
  poll() {
    if (this._pollInFlight) return;
    this._pollInFlight = true;
    this.signalK
      .fetchSelf()
      .then((data) => {
        this.state.extractAll(data);
        this.state.calculate();
        this.updateMap();
      })
      .catch((error) => {
        const detail = error.statusText || error.message || "unknown error";
        const msg = `Self update failed: ${error.status ? `${error.status} ` : ""}${detail}`;
        this.statusBar.setWarning(msg);
        console.error(msg, error);
      })
      .finally(() => {
        this._pollInFlight = false;
      });
  }
  update() {
    try {
      this.state.calculate();
      this.updateMap();
    } catch (error) {
      const detail = error.statusText || error.message || "unknown error";
      const msg = `Update failed: ${error.status ? `${error.status} ` : ""}${detail}`;
      this.statusBar.setWarning(msg);
      console.error(msg, error);
    }
  }
  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}).startup();
//#endregion

//# sourceMappingURL=index-D1EJ81b6.js.map
