/**
 * Polyfill for general browser APIs.
 *
 * This script should be able to be imported as module or injected as content
 * script.
 *
 * Copyright Danny Lin 2025
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */

(function () {

"use strict";

// Polyfill for Chrome < 119 and Firefox < 121
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {promise, resolve, reject};
  };
}

})();
