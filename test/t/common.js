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

function readFileAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  }).then((event) => {
    return event.target.result;
  });
}

async function readFileAsText(blob, charset = "UTF-8") {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsText(blob, charset);
  }).then((event) => {
    return event.target.result;
  });
}

async function readFileAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }).then((event) => {
    return event.target.result;
  });
}

async function readFileAsDocument(blob) {
  return xhr({
    url: URL.createObjectURL(blob),
    responseType: "document",
  }).then((xhr) => {
    return xhr.response;
  });
}

async function xhr(params = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (params.onreadystatechange) {
      xhr.onreadystatechange = function (event) {
        params.onreadystatechange(xhr);
      };
    }

    xhr.onload = function (event) {
      if (xhr.status == 200 || xhr.status == 0) {
        // we only care about real loading success
        resolve(xhr);
      } else {
        // treat "404 Not found" or so as error
        let statusText = xhr.statusText;
        statusText = xhr.status + (statusText ? " " + statusText : "");
        reject(new Error(statusText));
      }
    };

    xhr.onabort = function (event) {
      // resolve with no param
      resolve();
    };

    xhr.onerror = function (event) {
      // No additional useful information can be get from the event object.
      reject(new Error("Network request failed."));
    };

    xhr.ontimeout = function (event) {
      reject(new Error("Request timeout."));
    };

    xhr.responseType = params.responseType;
    xhr.open("GET", params.url, true);

    if (params.timeout) { xhr.timeout = params.timeout; }

    xhr.send();
  });
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
      if (!['open', 'closed'].includes(mode)) {
        if (mode[0] === '*') { mode = mode.slice(1); }
      }

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
  readFileAsArrayBuffer,
  readFileAsText,
  readFileAsDataURL,
  readFileAsDocument,
  xhr,
  loadIdlProperties,
  loadShadowDoms,
};

}));
