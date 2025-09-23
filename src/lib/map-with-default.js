/**
 * A JavaScript implementation for MapWithDefault
 *
 * ref: https://stackoverflow.com/questions/51319147/map-default-value
 *
 * Copyright Danny Lin 2017-2024
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(factory);
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    global.MapWithDefault = factory();
  }
}(this, function () {

'use strict';

class MapWithDefault extends Map {
  constructor(fn, entries) {
    super(entries);
    this.default = fn;
  }

  get(key) {
    if (!super.has(key)) {
      super.set(key, this.default.call(this, key));
    }
    return super.get(key);
  }
}

return MapWithDefault;
}));
