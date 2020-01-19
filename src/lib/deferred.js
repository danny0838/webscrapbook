/**
 * A JavaScript implementation for Deferred
 *
 * ref: https://stackoverflow.com/questions/51319147/map-default-value
 *
 * Copyright Danny Lin 2017-2020
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define(['promise'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory(require('promise'));
  } else {
    // Browser globals
    root.Deferred = factory(Promise);
  }
}(this, function (Promise) {

  'use strict';

  class Deferred {
    constructor() {
      const p = this.promise = new Promise((resolve, reject) => {
          this.resolve = resolve;
          this.reject = reject;
      });
      this.then = this.promise.then.bind(p);
      this.catch = this.promise.catch.bind(p);    
    }
  };

  return Deferred;
}));
