/**
 * What a script sees, written in JavaScript because it runs inside the
 * QuickJS VM, not here. The host evaluates this once per run, before the
 * user's script, and calls the function with its bindings.
 *
 * `host` is reachable from this closure only: it is never put on the global,
 * so a script can call a host function only through `pm`, `console`, `atob`,
 * `btoa`, `setTimeout` and `require` below. Every host function takes and returns
 * strings, numbers and booleans, never an object; the host checks the types
 * itself, since a script can replace `String` or `JSON` under this code.
 *
 * The surface is the one `docs/scripts.md` documents. P3.3 widens it.
 */
export const VM_BOOTSTRAP = `(function (host, responseText) {
  "use strict";
  var own = Object.prototype.hasOwnProperty;
  // The engine's own eval, kept before a script can replace the name. It runs a library's text.
  var evaluate = eval;

  function show(value) {
    if (typeof value === "string") return value;
    try {
      var json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch (error) {
      return String(value);
    }
  }
  function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function expect(actual) {
    return {
      to: {
        equal: function (expected) { assert(actual === expected, "Expected " + JSON.stringify(actual) + " to equal " + JSON.stringify(expected)); },
        eql: function (expected) { assert(JSON.stringify(actual) === JSON.stringify(expected), "Expected " + JSON.stringify(actual) + " to deep-equal " + JSON.stringify(expected)); },
        include: function (expected) {
          if (typeof actual === "string") assert(actual.includes(String(expected)), 'Expected "' + actual + '" to include "' + expected + '"');
          else if (Array.isArray(actual)) assert(actual.includes(expected), "Expected array to include " + JSON.stringify(expected));
          else assert(false, "Expected value to include " + JSON.stringify(expected));
        },
        be: {
          ok: function () { assert(!!actual, "Expected " + JSON.stringify(actual) + " to be truthy"); },
          null: function () { assert(actual === null, "Expected " + JSON.stringify(actual) + " to be null"); },
          undefined: function () { assert(actual === undefined, "Expected value to be undefined"); },
          a: function (type) { assert(typeof actual === type, "Expected " + JSON.stringify(actual) + " to be a " + type); },
          an: function (type) { assert(typeof actual === type, "Expected " + JSON.stringify(actual) + " to be an " + type); },
          below: function (n) { assert(actual < n, "Expected " + actual + " to be below " + n); },
          above: function (n) { assert(actual > n, "Expected " + actual + " to be above " + n); },
        },
        have: {
          status: function (code) { assert(actual != null && actual.code === code, "Expected status " + (actual == null ? undefined : actual.code) + " to equal " + code); },
          property: function (key) { assert(key in actual, 'Expected object to have property "' + key + '"'); },
        },
        not: {
          equal: function (expected) { assert(actual !== expected, "Expected " + JSON.stringify(actual) + " to not equal " + JSON.stringify(expected)); },
          include: function (expected) {
            if (typeof actual === "string") assert(!actual.includes(String(expected)), 'Expected "' + actual + '" to not include "' + expected + '"');
          },
        },
      },
    };
  }

  var response = null;
  if (responseText !== undefined) {
    var given = JSON.parse(responseText);
    response = {
      code: given.code,
      status: given.status,
      responseTime: given.responseTime,
      text: function () { return given.body; },
      json: function () {
        try { return JSON.parse(given.body); } catch (error) { return null; }
      },
      headers: {
        get: function (name) {
          var key = String(name);
          if (own.call(given.headers, key)) return given.headers[key];
          key = key.toLowerCase();
          return own.call(given.headers, key) ? given.headers[key] : null;
        },
      },
    };
  }

  globalThis.pm = {
    environment: {
      get: function (key) { var value = host.envGet(String(key)); return value === undefined ? null : value; },
      set: function (key, value) { host.envSet(String(key), String(value == null ? "" : value)); },
      unset: function (key) { host.envSet(String(key), ""); },
    },
    response: response,
    test: function (label, fn) {
      var name = String(label == null ? "" : label);
      try {
        fn();
      } catch (error) {
        host.test(name, false, messageOf(error));
        return;
      }
      host.test(name, true, "");
    },
    expect: expect,
  };

  function logger(prefix) {
    return function () {
      host.log(prefix + Array.prototype.map.call(arguments, show).join(" "));
    };
  }
  globalThis.console = { log: logger(""), info: logger(""), warn: logger("[warn] "), error: logger("[error] ") };

  globalThis.atob = function (text) { return host.atob(String(text)); };
  globalThis.btoa = function (text) { return host.btoa(String(text)); };

  // What a library finds where it looks for the browser's \`crypto\`: random bytes, from the host.
  var randomSource = {
    getRandomValues: function (array) {
      var bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      var hex = host.random(bytes.length);
      for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      return array;
    },
  };

  // chai announces a plugin through an EventTarget. Nothing listens here.
  function NoEvents() {}
  NoEvents.prototype.addEventListener = NoEvents.prototype.removeEventListener = function () {};
  NoEvents.prototype.dispatchEvent = function () { return true; };
  function NoEvent(type) { this.type = String(type); }

  // crypto-js with its hashes, HMACs and encodings done by the host: the
  // engine is an interpreter, and a megabyte hashed in it takes seconds.
  // A WordArray crosses as JSON text, [sigBytes, word, word, ...].
  function nativeCrypto(C) {
    function words(value) {
      if (value == null || !Array.isArray(value.words) || typeof value.sigBytes !== "number") throw new TypeError("Expected a WordArray.");
      return JSON.stringify([value.sigBytes].concat(value.words));
    }
    function wordArray(json) {
      var list = JSON.parse(json);
      return C.lib.WordArray.create(list.slice(1), list[0]);
    }
    function data(value) {
      return typeof value === "string" ? ["utf8", value] : ["words", words(value)];
    }
    ["MD5", "SHA1", "SHA256"].forEach(function (name) {
      C[name] = function (message) {
        var m = data(message);
        return wordArray(host.hash(name, m[0], m[1]));
      };
    });
    ["SHA1", "SHA256"].forEach(function (name) {
      C["Hmac" + name] = function (message, key) {
        var m = data(message), k = data(key);
        return wordArray(host.hmac(name, k[0], k[1], m[0], m[1]));
      };
    });
    [["Utf8", "utf8"], ["Hex", "hex"], ["Base64", "base64"]].forEach(function (pair) {
      C.enc[pair[0]] = {
        parse: function (text) { return wordArray(host.encode(pair[1], String(text))); },
        stringify: function (value) { return host.decode(pair[1], words(value)); },
      };
    });
    return C;
  }

  // The modules of Postman's sandbox that exist here. A library is text the
  // host hands over, evaluated by this engine: it can reach what a script can.
  var modules = new Map([["atob", globalThis.atob], ["btoa", globalThis.btoa]]);
  globalThis.require = function (name) {
    var id = String(name);
    if (modules.has(id)) return modules.get(id);
    var source = host.library(id);
    if (source === undefined) {
      var error = new Error("require('" + id + "') is not supported — see docs/postman-compatibility.md#require");
      error.name = "WayfarerUnsupportedError";
      throw error;
    }
    var module = { exports: {} };
    var loaded = evaluate(source)(module, module.exports, { crypto: randomSource }, randomSource, NoEvents, NoEvent);
    modules.set(id, id === "crypto-js" ? nativeCrypto(loaded) : loaded);
    return loaded;
  };

  // A timer's callback stays in the VM. The host is told a number and a
  // delay, and asks for that number to be run when the time has come.
  var timers = new Map();
  var nextTimer = 1;
  globalThis.setTimeout = function (fn, delay) {
    // A browser would evaluate a string given here. Nothing is evaluated: it is refused at once.
    if (typeof fn !== "function") throw new TypeError("setTimeout: the callback is not a function");
    var id = nextTimer++;
    var rest = Array.prototype.slice.call(arguments, 2);
    timers.set(id, function () { fn.apply(undefined, rest); });
    host.timer(id, Number(delay) || 0);
    return id;
  };

  return function fire(id) {
    var run = timers.get(id);
    timers.delete(id);
    if (run) run();
  };
})`;
