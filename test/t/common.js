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
  loadIdlProperties,
  loadShadowDoms,
};

}));
