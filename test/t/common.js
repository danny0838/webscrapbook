/**
 * Utilities for unit testing in server or browser extension.
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
    global.utils = factory();
  }
}(this, function () {

'use strict';

// Polyfill for Chromium 73
if (!Object.fromEntries) {
  Object.defineProperty(Object, 'fromEntries', {
    value(entries) {
      if (!entries || !entries[Symbol.iterator]) {
        throw new Error('Object.fromEntries() requires a single iterable argument');
      }

      const o = {};

      Object.keys(entries).forEach((key) => {
        const [k, v] = entries[key];

        o[k] = v;
      });

      return o;
    },
  });
}

/**
 * Slightly different from WebScrapBook version as checking
 * `browser_specific_settings` doesn't work for the test extension.
 */
var userAgent = (() => {
  const ua = navigator.userAgent;
  const soup = new Set();
  const flavor = {
    major: 0,
    soup: soup,
    is: (value) => soup.has(value),
  };

  if (/\bMobile\b/.test(ua)) {
    soup.add('mobile');
  }

  // Synchronous -- order of tests is important
  let match;
  if ((match = /\bFirefox\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('mozilla').add('firefox').add('gecko');
  } else if ((match = /\bEdge\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('microsoft').add('edge');
  } else if ((match = /\bOPR\/(\d+)/.exec(ua)) !== null) {
    const reEx = /\bChrom(?:e|ium)\/([\d.]+)/;
    if (reEx.test(ua)) { match = reEx.exec(ua); }
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('opera').add('chromium');
  } else if ((match = /\bChromium\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('chromium');
  } else if ((match = /\bChrome\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('google').add('chromium');
    if (/\bEdg\/([\d.]+)/.test(ua)) {
      // Chromium based Edge
      soup.add('microsoft').add('edge');
    }
  } else if ((match = /\bSafari\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('apple').add('safari');
  } else if ((match = /\bNode\.js\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('node.js');
  }
  return flavor;
})();

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Load data-<attr>='<value>' as IDL property.
 */
function loadIdlProperties(root = document, {clear = true} = {}) {
  for (const elem of root.querySelectorAll('*')) {
    for (const key in elem.dataset) {
      const value = JSON.parse(elem.dataset[key]);
      elem[key] = value;
      if (clear) {
        delete elem.dataset[key];
      }
    }
  }
}

/**
 * Load template content as the parent node's shadowRoot.
 *
 * Mostly a polyfill for compatibility with older browsers.
 */
function loadShadowDoms(root = document, {recursive = true, clear = true} = {}) {
  for (const t of root.querySelectorAll('template[shadowrootmode]')) {
    const elem = t.parentNode;
    if (!elem.shadowRoot) {
      // Allow using e.g. shadowrootmode="*open" for downward compatibility,
      // e.g. to prevent an issue that ShadowRoot.delegatesFocus is supported
      // while template[shadowrootdelegatesfocus] is not supported.
      let mode = t.getAttribute('shadowrootmode');
      if (mode[0] === '*') { mode = mode.slice(1); }

      const clonable = t.hasAttribute('shadowrootclonable');
      const delegatesFocus = t.hasAttribute('shadowrootdelegatesfocus');
      const serializable = t.hasAttribute('shadowrootserializable');
      const slotAssignment = t.getAttribute('shadowrootslotassignment') || undefined;
      const shadow = elem.attachShadow({mode, clonable, delegatesFocus, serializable, slotAssignment});
      shadow.innerHTML = t.innerHTML;
      if (recursive) {
        loadShadowDoms(shadow, {recursive, clear});
      }
    }
    if (clear) {
      t.remove();
    }
  }
}

return {
  userAgent,
  delay,
  loadIdlProperties,
  loadShadowDoms,
};

}));
