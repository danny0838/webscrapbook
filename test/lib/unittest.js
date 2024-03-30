/**
 * Cross-platform utilities for unit testing.
 *
 * Copyright Danny Lin 2024
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('../shared/lib/sha'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(['../shared/lib/sha'], factory);
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    global.unittest = factory(
      global.jsSHA,
    );
  }
}(this, function (jsSHA) {

  'use strict';

  class AssertionError extends Error {
    constructor(...args) {
      super(...args);
      this.name = 'AssertionError';
      this.message = this.message || "Assertion failed";
    }
  }

  /**
   * Simple assertion that outputs the error to the console for later tracing.
   */
  function assert(condition, message) {
    if (condition) { return; }
    const err = new AssertionError(message);
    console.error(err);
    throw err;
  }

  /**
   * Check two objects (JSONifiable) are deeply identical.
   */
  function assertEqual(obj1, obj2, message) {
    const s1 = JSON.stringify(obj1);
    const s2 = JSON.stringify(obj2);
    if (s1 === s2) { return; }
    const err = new AssertionError(`${s1} not equal to ${s2}${message ? ': ' + message : ''}`);
    console.error(err);
    throw err;
  }

  /**
   * An Error object that the thrown error object must be an instance of it.
   *
   * @typedef {Error} assertThrowsError
   */

  /**
   * An object that each property is tested against the thrown error object.
   *
   * If the property value is a RegExp, the error property value must match it;
   * otherwise the error property value must be equal to it.
   *
   * @typedef {Object<string, (RegExp|*)>} assertThrowsSpec
   */

  /**
   * @callback assertThrowsCallback
   * @param {Error} [error] - the thrown error object to be tested
   * @return {boolean} Truthy to pass the assersion.
   */

  /**
   * Check if the function throws with the exception
   *
   * @param {Function} func - the function to test
   * @param {assertThrowsError|assertThrowsSpec|assertThrowsCallback} [expected]
   *     the expected error
   */
  function assertThrows(func, expected, message) {
    let error;
    try {
      func();
    } catch (ex) {
      error = ex;
    }
    if (!error) {
      throw new AssertionError(`Expected error not thrown${message ? ': ' + message : ''}`);
    }
    if (!expected) { return; }
    if (expected.prototype instanceof Error) {
      if (!(error instanceof expected)) {
        throw new AssertionError(`Thrown error ${String(error)} is not an instance of ${expected.name}${message ? ': ' + message : ''}`);
      }
    } else if (typeof expected === 'function') {
      if (!expected(error)) {
        throw new AssertionError(`Thrown error ${String(error)} is not expected${message ? ': ' + message : ''}`);
      }
    } else {
      for (const key in expected) {
        const value = expected[key];
        const valueError = error[key];
        if (value instanceof RegExp) {
          if (!value.test(valueError)) {
            throw new AssertionError(`Thrown error property "${key}" ${JSON.stringify(valueError)} does not match ${value.toString()}${message ? ': ' + message : ''}`);
          }
        } else {
          if (valueError !== value) {
            throw new AssertionError(`Thrown error property "${key}" ${JSON.stringify(valueError)} not equal to ${JSON.stringify(value)}${message ? ': ' + message : ''}`);
          }
        }
      }
    }
  }

  /**
   * A jQuery-style extension of describe or it for chainable and conditional
   * skip or xfail.
   *
   * Also globally exposed as:
   *   - $it = $(it) = MochaQuery(it)
   *   - $describe = $(describe) = MochaQuery(describe)
   *
   * Usage:
   *   .skip([reason])           // skip (if not yet skipped)
   *   .skipIf(cond [, reason])  // skip if cond (and not yet skipped)
   *   .xfail([reason])          // expect fail (if not yet skipped/xfailed)
   *   .xfailIf(cond, [reason])  // expect fail if cond (and not yet skipped/xfailed)
   *
   *   $it
   *     .skipIf(cond1, skipReason1)
   *     .skipIf(cond2, skipReason2)
   *     .xfail(xfailReason)
   *     (title, callback)
   *
   *   $describe
   *     .skipIf(cond1, skipReason1)
   *     .skipIf(cond2, skipReason2)
   *     (title, callback)
   */
  function MochaQuery(func, data = {}) {
    return data.proxy = new Proxy(func, Object.entries(MochaQuery.handler).reduce((obj, [key, value]) => {
      obj[key] = value.bind(this, data);
      return obj;
    }, {}));
  }

  MochaQuery.handler = {
    get(data, func, prop) {
      if (prop in MochaQuery.methods) {
        return MochaQuery(func, Object.assign({}, data, {method: prop}));
      }
      return Reflect.get(func, prop);
    },
    apply(data, func, thisArg, args) {
      const methods = MochaQuery.methods, method = methods[data.method];
      if (method) {
        const d = Object.assign({}, data, {method: null});
        method.call(methods, d, ...args);
        return MochaQuery(func, d);
      }

      const [title, callback] = args;
      switch (data.mode) {
        case 'skip': {
          const reason = data.reason ? ` (${data.reason})` : '';
          const titleNew = `${title} - skipped${reason}`;
          return func.skip.call(thisArg, titleNew, callback);
        }
        case 'xfail': {
          const reason = data.reason ? ` (${data.reason})` : '';
          const titleNew = `${title} - expected failure${reason}`;
          const callbackNew = async function (...args) {
            try {
              await callback.apply(this, args);
            } catch (ex) {
              return;
            }
            throw new Error('unexpected success');
          };
          callbackNew.toString = () => callback.toString();
          return func.call(thisArg, titleNew, callbackNew);
        }
      }

      return Reflect.apply(func, thisArg, args);
    },
  };

  MochaQuery.methods = {
    skip(data, reason) {
      if (data.mode === 'skip') { return; }
      data.mode = 'skip';
      data.reason = reason;
    },
    skipIf(data, condition, reason) {
      if (data.mode === 'skip') { return; }
      if (condition instanceof MochaQuery.Query) {
        [condition, reason] = [condition.condition, reason || condition.reason];
      }
      if (!condition) { return; }
      data.mode = 'skip';
      data.reason = reason;
    },
    xfail(data, reason) {
      if (data.mode) { return; }
      data.mode = 'xfail';
      data.reason = reason;
    },
    xfailIf(data, condition, reason) {
      if (data.mode) { return; }
      if (condition instanceof MochaQuery.Query) {
        [condition, reason] = [condition.condition, reason || condition.reason];
      }
      if (!condition) { return; }
      data.mode = 'xfail';
      data.reason = reason;
    },
  };

  MochaQuery.Query = class Query {
    constructor(condition, reason) {
      this.condition = condition;
      this.reason = reason;
    }
  };

  Object.defineProperties(MochaQuery, Object.getOwnPropertyDescriptors({
    get noBrowser() {
      const value = new MochaQuery.Query(
        !(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        'no browser environment',
      );
      Object.defineProperty(this, 'noBrowser', {value});
      return value;
    },
    get noMultipleSelection() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const sel = document.getSelection();
          const origCount = sel.rangeCount;
          if (origCount > 1) {
            return false;
          }
          const origRanges = [];
          for (let i = 0; i < origCount; i++) {
            origRanges.push(sel.getRangeAt(i));
          }
          const dummyTextNode = document.createTextNode('dummy');
          try {
            document.body.appendChild(dummyTextNode);

            let range = document.createRange();
            range.setStart(dummyTextNode, 0);
            range.setEnd(dummyTextNode, 1);
            sel.addRange(range);

            range = document.createRange();
            range.setStart(dummyTextNode, 2);
            range.setEnd(dummyTextNode, 3);
            sel.addRange(range);

            if (sel.rangeCount <= 1) {
              return true;
            }
          } finally {
            sel.removeAllRanges();
            for (let i = 0; i < origCount; i++) {
              sel.addRange(origRanges[i]);
            }
            dummyTextNode.remove();
          }
          return false;
        })(),
        'multiple selection not supported',
      );
      Object.defineProperty(this, 'noMultipleSelection', {value});
      return value;
    },
    get noAdoptedStylesheet() {
      // Document.adoptedStyleSheets is not supported by Firefox < 101.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        !document.adoptedStyleSheets,
        'Document.adoptedStyleSheets not supported',
      );
      Object.defineProperty(this, 'noAdoptedStylesheet', {value});
      return value;
    },
    get noNestingCss() {
      // CSS nesting selector is supported in Firefox >= 117 and Chromium >= 120.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const d = document.implementation.createHTMLDocument();
          const style = d.head.appendChild(d.createElement('style'));
          style.textContent = 'a{b{}}';
          const rule = style.sheet.cssRules[0];
          if (!(rule.cssRules && rule.cssRules[0])) {
            return true;
          }
          return false;
        })(),
        'CSS nesting not supported',
      );
      Object.defineProperty(this, 'noNestingCss', {value});
      return value;
    },
    get noColumnCombinator() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector('col || td');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        'CSS column combinator ("||") not supported',
      );
      Object.defineProperty(this, 'noColumnCombinator', {value});
      return value;
    },
    get noPartPseudo() {
      // :part() CSS pseudo-element is supported in Firefox >= 72 and Chromium >= 73.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector('::part(dummy)');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        '::part() CSS pseudo-element not supported',
      );
      Object.defineProperty(this, 'noPartPseudo', {value});
      return value;
    },
    get noIsPseudo() {
      // :is() CSS pseudo-class is supported in Firefox >= 78 and Chromium >= 88.
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector(':is()');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        ':is() CSS pseudo-class not supported',
      );
      Object.defineProperty(this, 'noIsPseudo', {value});
      return value;
    },
    get noHostContextPseudo() {
      // :host-context() not suported in some browsers (e.g. Firefox)
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            document.querySelector(':host-context(*)');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        ':host-context() CSS pseudo-class not supported',
      );
      Object.defineProperty(this, 'noHostContextPseudo', {value});
      return value;
    },
    get noAtCounterStyle() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const d = document.implementation.createHTMLDocument();
          const style = d.head.appendChild(d.createElement('style'));
          style.textContent = '@counter-style my { symbols: "1"; }';
          if (!style.sheet.cssRules.length) {
            return true;
          }
          return false;
        })(),
        '@counter-style CSS rule not supported',
      );
      Object.defineProperty(this, 'noAtCounterStyle', {value});
      return value;
    },
    get noAtLayer() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          const d = document.implementation.createHTMLDocument();
          const style = d.head.appendChild(d.createElement('style'));
          style.textContent = '@layer mylayer;';
          if (!style.sheet.cssRules.length) {
            return true;
          }
          return false;
        })(),
        '@layer CSS rule not supported',
      );
      Object.defineProperty(this, 'noAtLayer', {value});
      return value;
    },
    get noRegexNamedGroup() {
      const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
        (() => {
          try {
            new RegExp('(?<group>foo)\k<group>');
          } catch (ex) {
            return true;
          }
          return false;
        })(),
        'named capture group of RegExp not supported',
      );
      Object.defineProperty(this, 'noRegexNamedGroup', {value});
      return value;
    },
  }));

  function sha1(data, type) {
    let shaObj = new jsSHA("SHA-1", type);
    shaObj.update(data);
    return shaObj.getHash("HEX");
  }

  function getToken(url, role) {
    let token = `${url}\t${role}`;
    token = sha1(token, "TEXT");
    return token;
  }

  function getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      let r = Math.random()*16|0, v = (c == 'x') ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  function byteStringToArrayBuffer(bstr) {
    let n = bstr.length, u8ar = new Uint8Array(n);
    while (n--) { u8ar[n] = bstr.charCodeAt(n); }
    return u8ar.buffer;
  }

  function getRulesFromCssText(cssText) {
    const d = document.implementation.createHTMLDocument('');
    const styleElem = d.createElement('style');
    styleElem.textContent = cssText;
    d.head.appendChild(styleElem);
    return styleElem.sheet.cssRules;
  }

  function escapeRegExp(str) {
    // Don't escape "-" as it causes an error for a RegExp with unicode flag.
    // Escaping "-" allows the result be embedded in a character class.
    // Escaping "/" allows the result be embedded in a JS regex literal.
    const regex = /[/\\^$*+?.|()[\]{}]/g;
    const fn = escapeRegExp = (str) => {
      return str.replace(regex, "\\$&");
    };
    return fn(str);
  }

  /**
   * A RegExp with raw string.
   *
   * This is similar to /.../ but allows "/".
   *
   * Usage:
   *     regex`^text/html$` === /^text\/html$/
   */
  function regex(strings, ...args) {
    const results = [strings.raw[0]];
    args.forEach((arg, i) => {
      results.push(String(arg));
      results.push(strings.raw[i + 1]);
    });
    return new RegExp(results.join(''));
  }

  /**
   * A RegExp with literal string and optional interpolated RegExp source fragments.
   *
   * Usage:
   *     rawRegex`${'^'}(function () {${'.+'}})()${'$'}` === /^\(function \(\) \{.+\}\)\(\)$/
   */
  function rawRegex(strings, ...args) {
    const results = [escapeRegExp(strings.raw[0])];
    args.forEach((arg, i) => {
      if (arg instanceof RegExp) {
        results.push(arg.source);
      } else {
        results.push(String(arg));
      }
      results.push(escapeRegExp(strings.raw[i + 1]));
    });
    return new RegExp(results.join(''));
  }

  /**
   * A RegExp with raw CSS string with permissive spacing and optional
   * interpolated RegExp source fragments.
   *
   * Usage:
   *     cssRegex`body { background: ${/\w+/} }` === /body\s*\{\s*background:\s*\w+\s*\}/
   */
  function cssRegex(strings, ...args) {
    const ASCII_WHITESPACE = String.raw`\t\n\f\r `;
    const permissiveSpacing = (s) => s.split(regex`[${ASCII_WHITESPACE}]+`).map(s => escapeRegExp(s)).join(`[${ASCII_WHITESPACE}]*`);
    const results = [permissiveSpacing(strings.raw[0])];
    args.forEach((arg, i) => {
      if (arg instanceof RegExp) {
        results.push(arg.source);
      } else {
        results.push(String(arg));
      }
      results.push(permissiveSpacing(strings.raw[i + 1]));
    });
    return new RegExp(results.join(''));
  }

  return {
    assert,
    assertEqual,
    assertThrows,
    MochaQuery,
    sha1,
    getToken,
    getUuid,
    byteStringToArrayBuffer,
    getRulesFromCssText,
    escapeRegExp,
    regex,
    rawRegex,
    cssRegex,
  };

}));
