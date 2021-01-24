/**
 * A JavaScript implementation for referrer handling
 *
 * ref: https://www.w3.org/TR/referrer-policy/#referrer-policies
 *
 * Copyright Danny Lin 2021
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory();
  } else {
    // Browser globals
    root.Referrer = factory();
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
      this.policy = policy;
      this.spoof = spoof;
    }

    get source() {
      if (this.spoof) {
        Object.defineProperty(this, 'source', {value: this.target});
        return this.source;
      }

      try {
        Object.defineProperty(this, 'source', {value: new URL(this.refUrl)});
      } catch (ex) {
        Object.defineProperty(this, 'source', {value: null});
      }
      return this.source;
    }

    get target() {
      try {
        Object.defineProperty(this, 'target', {value: new URL(this.targetUrl)});
      } catch (ex) {
        Object.defineProperty(this, 'target', {value: null});
      }
      return this.target;
    }

    get isValidSource() {
      Object.defineProperty(this, 'isValidSource', {value: this.source && ['https:', 'http:'].includes(this.source.protocol)});
      return this.isValidSource;
    }

    get isValidTarget() {
      Object.defineProperty(this, 'isValidTarget', {value: this.target && ['https:', 'http:'].includes(this.target.protocol)});
      return this.isValidTarget;
    }

    get isSameOrigin() {
      Object.defineProperty(this, 'isSameOrigin', {value: this.source && this.target && this.source.origin === this.target.origin && this.source.origin !== 'null' && this.target.origin !== 'null'});
      return this.isSameOrigin;
    }

    get isDownGrade() {
      Object.defineProperty(this, 'isDownGrade', {value: !this.source || !this.target || this.source.protocol === 'https:' && this.target.protocol !== 'https:'});
      return this.isDownGrade;
    }

    getReferrer() {
      if (!this.isValidSource || !this.isValidTarget) { return null; }

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
          mode = !this.isDownGrade ? (this.isSameOrigin ? 'all' : 'origin') : 'none';
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
          return null;
        }
      }
    }
  }

  return Referrer;
}));
