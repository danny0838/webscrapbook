/**
 * A JavaScript implementation for referrer handling
 *
 * ref: https://www.w3.org/TR/referrer-policy/#referrer-policies
 * ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
 *
 * Copyright Danny Lin 2021-2024
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
    global.Referrer = factory();
  }
}(this, function () {

'use strict';

class Referrer {
  /**
   * @param {string} refUrl - the source URL
   * @param {string} targetUrl - the target URL
   * @param {string} [policy] - the referrer policy
   * @param {boolean} [spoof] - true to take the target URL as the referrer
   */
  constructor(refUrl, targetUrl, policy, spoof = false) {
    this.refUrl = refUrl;
    this.targetUrl = targetUrl;
    this.policy = (policy || '').toLowerCase();
    this.spoof = spoof;
  }

  get source() {
    if (this.spoof) {
      const value = this.target;
      Object.defineProperty(this, 'source', {value});
      return value;
    }

    let value = null;
    try {
      value = new URL(this.refUrl);
    } catch (ex) {
      // pass
    }
    Object.defineProperty(this, 'source', {value});
    return value;
  }

  get target() {
    let value = null;
    try {
      value = new URL(this.targetUrl);
    } catch (ex) {
      // pass
    }
    Object.defineProperty(this, 'target', {value});
    return value;
  }

  get isSameOrigin() {
    const value = this.source.origin === this.target.origin
      && this.source.origin !== 'null' && this.target.origin !== 'null'
      && this.source.protocol !== 'file:' && this.target.protocol !== 'file:';
    Object.defineProperty(this, 'isSameOrigin', {value});
    return value;
  }

  get isDownGrade() {
    // ref: https://www.w3.org/TR/secure-contexts/#is-url-trustworthy
    const sourceIsTls = ['https:', 'wss:'].includes(this.source.protocol);
    const targetIsPotentiallyTrustworthy = ['about:blank', 'about:srcdoc'].includes(this.target.protocol + this.target.pathname)
      || this.trustworthyProtocols.includes(this.target.protocol)
      || this.target.hostname.match(/^127(?:\.\d{0,3}){3}$/)
      || ['[::1]', 'localhost', 'localhost.'].includes(this.target.hostname)
      || this.target.hostname.endsWith('.localhost') || this.target.hostname.endsWith('.localhost.');

    const value = sourceIsTls && !targetIsPotentiallyTrustworthy;
    Object.defineProperty(this, 'isDownGrade', {value});
    return value;
  }

  static get trustworthyProtocols() {
    let value = ['data:', 'https:', 'wss:', 'file:'];

    // browser extensions
    try {
      value.push(new URL(chrome.runtime.getURL('')).protocol);
    } catch (ex) {}
    try {
      value.push(new URL(browser.runtime.getURL('')).protocol);
    } catch (ex) {}

    value = [...new Set(value)];
    Object.defineProperty(Referrer, 'trustworthyProtocols', {value});
    return value;
  }

  get trustworthyProtocols() {
    return this.constructor.trustworthyProtocols;
  }

  toString() {
    if (!this.source || !this.target) { return ''; }

    let mode;
    switch (this.policy) {
      case 'no-referrer': {
        mode = 'none';
        break;
      }
      case 'origin': {
        mode = 'origin';
        break;
      }
      case 'unsafe-url': {
        mode = 'all';
        break;
      }
      case 'origin-when-cross-origin': {
        mode = this.isSameOrigin ? 'all' : 'origin';
        break;
      }
      case 'same-origin': {
        mode = this.isSameOrigin ? 'all' : 'none';
        break;
      }
      case 'no-referrer-when-downgrade': {
        mode = !this.isDownGrade ? 'all' : 'none';
        break;
      }
      case 'strict-origin': {
        mode = !this.isDownGrade ? 'origin' : 'none';
        break;
      }
      case 'strict-origin-when-cross-origin':
      default: {
        mode = this.isSameOrigin ? 'all' : (!this.isDownGrade ? 'origin' : 'none');
        break;
      }
    }

    switch (mode) {
      case 'all': {
        const u = this.source;
        u.username = u.password = u.hash = '';
        return u.href;
      }
      case 'origin': {
        const u = this.source;
        u.username = u.password = u.search = u.hash = '';
        u.pathname = '/';
        return u.href;
      }
      case 'none':
      default: {
        return '';
      }
    }
  }
}

return Referrer;
}));
