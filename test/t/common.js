'use strict';

var userAgent = (() => {
    const ua = navigator.userAgent;
    const soup = new Set(['webext']);
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
      soup.add('mozilla').add('firefox');
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
    } else if ((match = /\bSafari\/(\d+)/.exec(ua)) !== null) {
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('apple').add('safari');
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
  const fn = window.escapeRegExp = (str) => {
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
  const permissiveSpacing = (s) => s.split(/\s+/).map(s => escapeRegExp(s)).join('\\s*');
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

/**
 * Load template content as the parent node's shadowRoot.
 */
function loadShadowDoms(root = document, {
  recursive = true, clear = true, mode = 'open',
} = {}) {
  for (const t of root.querySelectorAll('template')) {
    const elem = t.parentNode;
    if (!elem.shadowRoot) {
      const shadow = elem.attachShadow({mode});
      shadow.innerHTML = t.innerHTML;
      if (recursive) {
        loadShadowDoms(shadow, {recursive, clear, mode});
      }
    }
    if (clear) {
      t.remove();
    }
  }
}
