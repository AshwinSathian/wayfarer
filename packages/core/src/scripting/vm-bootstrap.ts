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
 * The surface is Postman's `pm`, as far as `docs/postman-compatibility.md`
 * lists it. What Postman has and this does not throws a
 * `WayfarerUnsupportedError` that names it.
 *
 * The function returns one function, which the host calls with a word and
 * plain values: a timer that is due, a request that was answered, the end
 * of the script.
 */
export const VM_BOOTSTRAP = `(function (host, contextText) {
  "use strict";
  var own = Object.prototype.hasOwnProperty;
  // The engine's own eval, kept before a script can replace the name. It runs a library's text.
  var evaluate = eval;
  var given = JSON.parse(contextText);

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
  function named(name, message) {
    var error = new Error(message);
    error.name = name;
    return error;
  }
  function unsupported(what, anchor) {
    return named("WayfarerUnsupportedError", what + " is not supported — see docs/postman-compatibility.md#" + anchor);
  }
  /** An object whose listed methods all refuse, by name. */
  function refusing(name, methods) {
    var object = {};
    methods.forEach(function (method) {
      object[method] = function () { throw unsupported(name + "." + method + "()", name.toLowerCase().replace(/[^a-z]+/g, "-")); };
    });
    return object;
  }
  /** JSON with an object's keys in order, so that two equal values give equal text. */
  function canonical(value) {
    return JSON.stringify(value, function (key, inner) {
      if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return inner;
      var sorted = {};
      Object.keys(inner).sort().forEach(function (name) { sorted[name] = inner[name]; });
      return sorted;
    });
  }

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
  function load(name) {
    var id = String(name);
    if (modules.has(id)) return modules.get(id);
    var source = host.library(id);
    if (source === undefined) throw unsupported("require('" + id + "')", "require");
    var module = { exports: {} };
    var loaded = evaluate(source)(module, module.exports, { crypto: randomSource }, randomSource, NoEvents, NoEvent);
    modules.set(id, id === "crypto-js" ? nativeCrypto(loaded) : loaded);
    return loaded;
  }
  globalThis.require = load;

  // Variables. The host keeps every scope and what the script changed in it;
  // a value is text. "any" reads the nearest scope that has the name.
  function variables(scope, writable) {
    var api = {
      get: function (key) { return host.varGet(scope, String(key)); },
      has: function (key) { return host.varHas(scope, String(key)); },
      toObject: function () { return Object.fromEntries(JSON.parse(host.varAll(scope))); },
      replaceIn: function (text) { return typeof text === "string" ? host.replaceIn(text) : text; },
    };
    if (writable) {
      api.set = function (key, value) { host.varSet(scope, String(key), String(value == null ? "" : value)); };
      api.unset = function (key) { host.varUnset(scope, String(key)); };
      api.clear = function () { host.varClear(scope); };
    }
    return api;
  }

  // A list of headers, as Postman's HeaderList: names are compared without case.
  function headerList(pairs, writable) {
    function index(name) {
      var wanted = String(name).toLowerCase();
      for (var i = 0; i < pairs.length; i++) if (pairs[i][0].toLowerCase() === wanted) return i;
      return -1;
    }
    function pair(header) {
      if (header == null || typeof header !== "object") throw new TypeError("Expected a header: { key, value }");
      return [String(header.key), String(header.value == null ? "" : header.value)];
    }
    var list = {
      get: function (name) { var at = index(name); return at === -1 ? undefined : pairs[at][1]; },
      has: function (name) { return index(name) !== -1; },
      toObject: function () { return Object.fromEntries(pairs); },
      each: function (fn) { pairs.forEach(function (entry) { fn({ key: entry[0], value: entry[1] }); }); },
      all: function () { return pairs.map(function (entry) { return { key: entry[0], value: entry[1] }; }); },
      count: function () { return pairs.length; },
    };
    if (writable) {
      list.add = function (header) { pairs.push(pair(header)); };
      list.upsert = function (header) {
        var next = pair(header), at = index(next[0]);
        if (at === -1) pairs.push(next); else pairs[at] = next;
      };
      list.remove = function (name) {
        var wanted = String(name).toLowerCase();
        for (var i = pairs.length - 1; i >= 0; i--) if (pairs[i][0].toLowerCase() === wanted) pairs.splice(i, 1);
      };
    }
    return list;
  }

  // A response: the one the request got, or the answer to pm.sendRequest.
  // Each is remembered with its assertions, for pm.expect(response).
  var responses = new WeakMap();
  function responseOf(data) {
    var response = {
      code: data.code,
      status: data.status,
      responseTime: data.responseTime,
      responseSize: data.responseSize,
      headers: headerList(Object.keys(data.headers).map(function (name) { return [name, data.headers[name]]; }), false),
      text: function () { return data.body; },
      json: function () { return JSON.parse(data.body); },
    };
    function assertions(negated) {
      function check(holds, positive, negative) {
        if (negated ? holds : !holds) throw named("AssertionError", negated ? negative : positive);
      }
      function status(name, holds, range) {
        return function () {
          check(holds(data.code), "expected response to " + range + " but got " + data.code, "expected response not to " + range + " but got " + data.code);
          return chain;
        };
      }
      var be = {};
      [
        ["ok", function (code) { return code === 200; }, "have status code 200"],
        ["success", function (code) { return code >= 200 && code < 300; }, "have a status code of 2XX"],
        ["error", function (code) { return code >= 400 && code < 600; }, "have a status code of 4XX or 5XX"],
        ["clientError", function (code) { return code >= 400 && code < 500; }, "have a status code of 4XX"],
        ["serverError", function (code) { return code >= 500 && code < 600; }, "have a status code of 5XX"],
      ].forEach(function (row) {
        Object.defineProperty(be, row[0], { enumerable: true, get: status(row[0], row[1], row[2]) });
      });
      var have = {
        status: function (expected) {
          var holds = typeof expected === "number" ? data.code === expected : data.status === String(expected);
          var what = typeof expected === "number" ? "status code " + expected : "status reason '" + expected + "'";
          check(holds, "expected response to have " + what + " but got " + (typeof expected === "number" ? data.code : "'" + data.status + "'"), "expected response not to have " + what);
          return chain;
        },
        header: function (name, value) {
          var actual = response.headers.get(name);
          check(actual !== undefined, "expected response to have header with key '" + name + "'", "expected response not to have header with key '" + name + "'");
          if (arguments.length > 1 && !negated) check(actual === String(value), "expected '" + name + "' response header to be '" + value + "' but got '" + actual + "'", "");
          return chain;
        },
        body: function (expected) {
          if (arguments.length === 0) check(data.body.length > 0, "expected response to have content in body", "expected response not to have content in body");
          else if (expected instanceof RegExp) check(expected.test(data.body), "expected response body text to match " + expected, "expected response body text not to match " + expected);
          else check(data.body === String(expected), "expected response body to equal '" + expected + "' but got '" + data.body + "'", "expected response body not to equal '" + expected + "'");
          return chain;
        },
        jsonBody: function (expected) {
          var parsed, isJson = true;
          try { parsed = JSON.parse(data.body); } catch (error) { isJson = false; }
          if (arguments.length === 0) check(isJson, "expected response body to be a valid json", "expected response body not to be a valid json");
          else if (arguments.length > 1 || typeof expected === "string") throw unsupported("pm.response.to.have.jsonBody(path, value)", "pm-response");
          else check(isJson && canonical(parsed) === canonical(expected), "expected response body json to equal " + canonical(expected) + " but got " + (isJson ? canonical(parsed) : "text that is not JSON"), "expected response body json not to equal " + canonical(expected));
          return chain;
        },
      };
      var chain = { be: be, have: have };
      if (!negated) chain.not = assertions(true);
      return chain;
    }
    response.to = assertions(false);
    responses.set(response, response.to);
    return response;
  }

  // The address of the request. It is text, and may hold {{variables}}.
  function urlOf(text) {
    var parts = /^(?:[a-z][a-z0-9+.-]*:\\/\\/)?(?:[^@\\/?#]*@)?([^\\/?#]*)([^?#]*)(?:\\?([^#]*))?/i.exec(text);
    return {
      toString: function () { return text; },
      getRaw: function () { return text; },
      getHost: function () { return parts[1].replace(/:\\d+$/, ""); },
      getPath: function () { return parts[2] || "/"; },
      getQueryString: function () { return parts[3] || ""; },
    };
  }

  // The request. A pre-request script may change it; the host reads it back, as text, when the script has ended.
  var request = null;
  if (given.request) {
    var requestState = { method: given.request.method, url: urlOf(given.request.url), body: given.request.body };
    var requestHeaders = given.request.headers;
    var body = {
      toString: function () { return requestState.body.mode === "raw" ? requestState.body.raw : ""; },
      update: function (next) {
        if (typeof next === "string") requestState.body = { mode: "raw", raw: next };
        else if (next && next.mode === "raw") requestState.body = { mode: "raw", raw: String(next.raw == null ? "" : next.raw) };
        else if (next && next.mode === "urlencoded" && Array.isArray(next.urlencoded)) requestState.body = { mode: "urlencoded", urlencoded: next.urlencoded.map(function (row) { return [String(row.key), String(row.value == null ? "" : row.value)]; }) };
        else throw unsupported("pm.request.body.update() with a mode other than raw and urlencoded", "pm-request");
      },
    };
    Object.defineProperties(body, {
      mode: { enumerable: true, get: function () { return requestState.body.mode; } },
      raw: {
        enumerable: true,
        get: function () { return requestState.body.mode === "raw" ? requestState.body.raw : undefined; },
        set: function (next) { requestState.body = { mode: "raw", raw: String(next == null ? "" : next) }; },
      },
      urlencoded: {
        enumerable: true,
        get: function () { return requestState.body.mode === "urlencoded" ? headerList(requestState.body.urlencoded, true) : undefined; },
      },
    });
    request = { id: given.info.requestId, name: given.info.requestName, headers: headerList(requestHeaders, true), body: body };
    Object.defineProperties(request, {
      method: {
        enumerable: true,
        get: function () { return requestState.method; },
        set: function (next) { requestState.method = String(next).toUpperCase(); },
      },
      url: {
        enumerable: true,
        get: function () { return requestState.url; },
        set: function (next) { requestState.url = urlOf(String(next)); },
      },
    });
  }

  // pm.sendRequest: the host makes the request and comes back with the answer.
  var calls = new Map();
  var nextCall = 1;
  function resolved(value) {
    return host.replaceIn(String(value == null ? "" : value));
  }
  function outgoing(spec) {
    if (typeof spec === "string") return { method: "GET", url: resolved(spec), headers: [] };
    if (spec == null || typeof spec !== "object") throw new TypeError("pm.sendRequest: expected an address or a request object");
    var headers = [];
    var header = spec.header == null ? spec.headers : spec.header;
    if (Array.isArray(header)) header.forEach(function (row) { if (row && !row.disabled) headers.push([resolved(row.key), resolved(row.value)]); });
    else if (header && typeof header === "object") Object.keys(header).forEach(function (name) { headers.push([resolved(name), resolved(header[name])]); });
    // Each property is read once: a getter cannot give one value to a check and another to the request.
    var method = spec.method, url = spec.url, body = spec.body;
    var raw = url && typeof url === "object" ? url.raw : undefined;
    var out = { method: String(method == null ? "GET" : method).toUpperCase(), url: resolved(typeof raw === "string" ? raw : url), headers: headers };
    if (typeof body === "string") out.body = resolved(body);
    else if (body && body.mode === "raw") out.body = resolved(body.raw);
    else if (body && body.mode === "urlencoded" && Array.isArray(body.urlencoded)) {
      out.body = body.urlencoded.filter(function (row) { return row && !row.disabled; }).map(function (row) { return encodeURIComponent(resolved(row.key)) + "=" + encodeURIComponent(resolved(row.value)); }).join("&");
      if (!headers.some(function (entry) { return entry[0].toLowerCase() === "content-type"; })) headers.push(["Content-Type", "application/x-www-form-urlencoded"]);
    } else if (body && body.mode && body.mode !== "none") throw unsupported("pm.sendRequest with a " + body.mode + " body", "pm-sendrequest");
    return out;
  }
  function sendRequest(spec, callback) {
    var call = nextCall++;
    var promise = new Promise(function (resolve, reject) { calls.set(call, { resolve: resolve, reject: reject, callback: typeof callback === "function" ? callback : null }); });
    var text;
    try {
      text = JSON.stringify(outgoing(spec));
    } catch (error) {
      text = "";
      host.sendFailed(call, error instanceof Error ? error.name : "Error", messageOf(error));
    }
    if (text) host.send(call, text);
    if (typeof callback === "function") {
      // The callback is called by the host's answer; an error it throws ends the script.
      promise.catch(function () {});
      return undefined;
    }
    return promise;
  }

  var pm = {
    environment: variables("environment", true),
    globals: variables("global", true),
    collectionVariables: variables("collection", true),
    variables: variables("any", false),
    iterationData: variables("data", false),
    request: request,
    response: given.response ? responseOf(given.response) : null,
    info: { eventName: given.info.eventName, iteration: 0, iterationCount: 1, requestName: given.info.requestName, requestId: given.info.requestId },
    test: function (label, fn) {
      var name = String(label == null ? "" : label);
      var outcome;
      try {
        outcome = fn();
      } catch (error) {
        host.test(name, false, messageOf(error));
        return;
      }
      if (outcome && typeof outcome.then === "function") {
        outcome.then(function () { host.test(name, true, ""); }, function (error) { host.test(name, false, messageOf(error)); });
        return;
      }
      host.test(name, true, "");
    },
    sendRequest: sendRequest,
    execution: {
      setNextRequest: function (next) { host.next(next == null ? "" : String(next), next == null); },
      skipRequest: function () { host.skip(); },
      location: [given.info.requestName],
    },
    cookies: refusing("pm.cookies", ["get", "has", "toObject", "jar"]),
    visualizer: refusing("pm.visualizer", ["set", "clear"]),
    vault: refusing("pm.vault", ["get", "set", "unset"]),
    require: function (name) { throw unsupported("pm.require('" + name + "')", "pm-require"); },
  };
  pm.environment.name = given.environmentName;
  pm.variables.set = function (key, value) { host.varSet("local", String(key), String(value == null ? "" : value)); };
  pm.test.skip = function (label) { host.test(String(label == null ? "" : label) + " (skipped)", true, ""); };
  // Chai's expect, loaded when a script first asks for it, with Postman's
  // additions: pm.expect(pm.response).to.have.status(200) and the rest.
  var expect;
  function withResponses(chai, utils) {
    function to(assertion) {
      var chain = responses.get(utils.flag(assertion, "object"));
      if (!chain) throw new TypeError("expected a response, as in pm.expect(pm.response)");
      return utils.flag(assertion, "negate") ? chain.not : chain;
    }
    ["status", "header", "body", "jsonBody"].forEach(function (name) {
      chai.Assertion.addMethod(name, function () { var have = to(this).have; have[name].apply(have, arguments); });
    });
    ["success", "error", "clientError", "serverError"].forEach(function (name) {
      chai.Assertion.addProperty(name, function () { void to(this).be[name]; });
    });
    // Chai's own "ok" is "truthy"; for a response it is "status 200".
    chai.Assertion.overwriteProperty("ok", function (inherited) {
      return function () {
        if (responses.has(utils.flag(this, "object"))) void to(this).be.ok;
        else inherited.call(this);
      };
    });
  }
  Object.defineProperty(pm, "expect", {
    enumerable: true,
    get: function () {
      if (!expect) {
        var chai = load("chai");
        chai.use(withResponses);
        expect = chai.expect;
      }
      return expect;
    },
  });
  globalThis.pm = pm;

  function logger(prefix) {
    return function () {
      host.log(prefix + Array.prototype.map.call(arguments, show).join(" "));
    };
  }
  globalThis.console = { log: logger(""), info: logger(""), warn: logger("[warn] "), error: logger("[error] ") };

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

  return function tell(what, id, ok, text) {
    if (what === "timer") {
      var run = timers.get(id);
      timers.delete(id);
      if (run) run();
    } else if (what === "sent") {
      var call = calls.get(id);
      calls.delete(id);
      if (!call) return;
      var answer = JSON.parse(text);
      var outcome = ok ? responseOf(answer) : named(answer.name, answer.message);
      if (call.callback) call.callback(ok ? null : outcome, ok ? outcome : null);
      if (ok) call.resolve(outcome); else call.reject(outcome);
    } else if (what === "end" && request && given.info.eventName === "prerequest") {
      host.requestOut(JSON.stringify({ method: String(request.method), url: String(request.url), headers: requestHeaders, body: requestState.body }));
    }
  };
})`;
