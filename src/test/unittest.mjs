/******************************************************************************
 * Cross-platform utilities for unit testing.
 *
 * Copyright Danny Lin 2024-2025
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 *****************************************************************************/

import {assert, config as chaiConfig} from "./lib/chai.mjs";
import sinon from "./lib/sinon-esm.js";
import {
  NS_XMLNS, NS_HTML, NS_SVG, NS_XLINK,
  userAgent, escapeRegExp, trim,
} from "../utils/common.mjs";
import {sha1} from "../utils/sha.mjs";

Object.assign(chaiConfig, {
  truncateThreshold: 1024,
});

const RED_BMP_B64 = 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA';
const GREEN_BMP_B64 = 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA';
const BLUE_BMP_B64 = 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA';
const YELLOW_BMP_B64 = 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA';

const RED_BMP_DATAURL = `data:image/bmp;base64,${RED_BMP_B64}`;
const GREEN_BMP_DATAURL = `data:image/bmp;base64,${GREEN_BMP_B64}`;
const BLUE_BMP_DATAURL = `data:image/bmp;base64,${BLUE_BMP_B64}`;
const YELLOW_BMP_DATAURL = `data:image/bmp;base64,${YELLOW_BMP_B64}`;

const RED_BMP_BYTES = atob(RED_BMP_B64);
const GREEN_BMP_BYTES = atob(GREEN_BMP_B64);
const BLUE_BMP_BYTES = atob(BLUE_BMP_B64);
const YELLOW_BMP_BYTES = atob(YELLOW_BMP_B64);

const INVALID_URL_SAMPLES = [
  "https://exa[mple.org/",
  "https://exa%23mple.org/",
  "https://#fragment",
  "https://:443",
  "https://example.org:70000",
  "https://example.org:7z",
];

/**
 * A jQuery-style extension of `describe` or `it` for chainable and conditional
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
 *   .xfailIf(cond [, reason]) // expect fail if cond (and not yet skipped/xfailed)
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
  get noExtensionBrowser() {
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      typeof browser === "undefined",
      'globalThis.browser does not exist',
    );
    Object.defineProperty(this, 'noExtensionBrowser', {value});
    return value;
  },
  get noExtensionChrome() {
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      typeof chrome === "undefined",
      'globalThis.chrome does not exist',
    );
    Object.defineProperty(this, 'noExtensionChrome', {value});
    return value;
  },
  get noMultipleSelection() {
    // Not supported in Chromium.
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
  get noShadowRootClonable() {
    // ShadowRoot.clonable is not supported in Chromium < 124 and Firefox < 123.
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      (() => {
        const div = document.createElement('div');
        const shadowRoot = div.attachShadow({mode: 'open', clonable: true});
        return typeof shadowRoot.clonable === 'undefined';
      })(),
      'ShadowRoot.clonable not supported',
    );
    Object.defineProperty(this, 'noShadowRootClonable', {value});
    return value;
  },
  get noShadowRootDelegatesFocus() {
    // ShadowRoot.delegatesFocus is not supported in Firefox < 94.
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      (() => {
        const div = document.createElement('div');
        const shadowRoot = div.attachShadow({mode: 'open', delegatesFocus: true});
        return typeof shadowRoot.delegatesFocus === 'undefined';
      })(),
      'ShadowRoot.delegatesFocus not supported',
    );
    Object.defineProperty(this, 'noShadowRootDelegatesFocus', {value});
    return value;
  },
  get noShadowRootSerializable() {
    // ShadowRoot.serializable is not supported in Chromium < 125 and Firefox < 128.
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      (() => {
        const div = document.createElement('div');
        const shadowRoot = div.attachShadow({mode: 'open', serializable: true});
        return typeof shadowRoot.serializable === 'undefined';
      })(),
      'ShadowRoot.serializable not supported',
    );
    Object.defineProperty(this, 'noShadowRootSerializable', {value});
    return value;
  },
  get noShadowRootSlotAssignment() {
    // ShadowRoot.slotAssignment is not supported in Chromium < 86 and Firefox < 92.
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      (() => {
        const div = document.createElement('div');
        const shadowRoot = div.attachShadow({mode: 'open', slotAssignment: 'manual'});
        return typeof shadowRoot.slotAssignment === 'undefined';
      })(),
      'ShadowRoot.slotAssignment not supported',
    );
    Object.defineProperty(this, 'noShadowRootSlotAssignment', {value});
    return value;
  },
  get noAdoptedStylesheet() {
    // Document.adoptedStyleSheets is not supported in Firefox < 101.
    const value = this.noBrowser.condition ? this.noBrowser : new MochaQuery.Query(
      !document.adoptedStyleSheets,
      'Document.adoptedStyleSheets not supported',
    );
    Object.defineProperty(this, 'noAdoptedStylesheet', {value});
    return value;
  },
  get noNestingCss() {
    // CSS nesting selector is not supported in Firefox < 117 and Chromium < 120.
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
    // Not supported by major browsers.
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
  get noIsPseudo() {
    // :is() CSS pseudo-class is not supported in Firefox < 78 and Chromium < 88.
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
    // :host-context() is not suported in Firefox.
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
    // @counter-style is not supported in Chromium < 91.
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
    // @layer is not supported in Chromium < 99 and Firefox < 97.
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
}));

function assertRangesEqual(actual, expected, message = 'Ranges are not equal') {
  assert.strictEqual(actual.startContainer, expected.startContainer, `${message} (startContainer)`);
  assert.strictEqual(actual.startOffset, expected.startOffset, `${message} (startOffset)`);
  assert.strictEqual(actual.endContainer, expected.endContainer, `${message} (endContainer)`);
  assert.strictEqual(actual.endOffset, expected.endOffset, `${message} (endOffset)`);
}

function getToken(url, role) {
  let token = `${url}\t${role}`;
  token = sha1(token, "TEXT");
  return token;
}

/**
 * Encode a string into bytes in the specified charset.
 *
 * @param {string} str - the string to encode
 * @param {string} [charset=UTF-8] - the target charset to encode into
 * @param {*} [replacement] - the replacement char for a non-encodable char,
 *   which should be a valid ASCII char. Empty string to replace with
 *   nothing. Falsy to throw an error instead.
 * @return {Promise<Uint8Array>} The encoded bytes.
 */
var encodeText = (() => {
  function escapeHtml(str) {
    const rv = [];
    for (let i = 0, I = str.length; i < I; i++) {
      const code = str.codePointAt(i);
      if (code > 0xFFFF) { i++; }
      rv.push(`&#${code};`);
    }
    return rv.join('');
  }

  function unescapeHtml(str, replacement) {
    return unescape(str).replace(/&#(?:(\d+)|x([\dA-Fa-f]+));/g, (_, dec, hex) => {
      if (hex) {
        return String.fromCharCode(parseInt(hex, 16));
      }
      if (typeof replacement === 'string') {
        return replacement;
      }
      throw parseInt(dec, 10);
    });
  }

  function byteStringToU8Array(bstr) {
    let n = bstr.length, u8ar = new Uint8Array(n);
    while (n--) { u8ar[n] = bstr.charCodeAt(n); }
    return u8ar;
  }

  async function encodeText(str, charset = "UTF-8", replacement = null) {
    // test if the charset is available
    try {
      new TextDecoder(charset);
    } catch (ex) {
      throw new RangeError(`Specified charset "${charset}" is not supported.`);
    }

    charset = charset.toLowerCase();

    // specially handle Unicode transformations
    // Available UTF names:
    // https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API/Encodings
    if (['utf-8', 'utf8', 'unicode-1-1-utf-8'].includes(charset)) {
      return new TextEncoder().encode(str);
    } else if (['utf-16be', 'utf-16le', 'utf-16'].includes(charset)) {
      const littleEndian = !(charset === 'utf-16be');
      const u8ar = new Uint8Array(str.length * 2);
      const view = new DataView(u8ar.buffer);
      for (let i = 0, I = str.length; i < I; i++) {
        const code = str.charCodeAt(i);
        view.setUint16(i * 2, code, littleEndian);
      }
      return u8ar;
    }

    const frame = document.createElement("iframe");
    frame.style.setProperty('display', 'none', 'important');
    {
      const js = browser.runtime.getURL('test/unittest-encoding.js');
      const _str = escapeHtml(str);

      // run script in a document with specific charset to get the encoded text
      // handle different CSP rule for Chromium and Gecko
      if (userAgent.is('chromium')) {
        frame.src = `data:text/html;charset=${encodeURIComponent(charset)},<script src="${js}" data-text="${encodeURIComponent(_str)}"></script>`;
      } else {
        const markup = `<script src="${js}" data-text="${_str}"></script>`;
        const blob = new Blob([markup], {type: `text/html;charset=${charset}`});
        frame.src = URL.createObjectURL(blob);
      }
    }
    document.body.append(frame);
    const aborter = new AbortController();
    let result = await new Promise((resolve) => {
      addEventListener("message", ({source, data}) => {
        if (source === frame.contentWindow) {
          aborter.abort();
          resolve(data);
        }
      }, {signal: aborter.signal});
    });
    frame.remove();
    try {
      result = unescapeHtml(result, replacement);
    } catch (code) {
      const _code = code.toString(16).toUpperCase();
      const idx = str.indexOf(String.fromCodePoint(code));
      throw new RangeError(`Unable to encode char U+${_code} at position ${idx}`);
    }
    return byteStringToU8Array(result);
  }

  return encodeText;
})();

function getRulesFromCssText(cssText) {
  const d = document.implementation.createHTMLDocument('');
  const styleElem = d.createElement('style');
  styleElem.textContent = cssText;
  d.head.appendChild(styleElem);
  return styleElem.sheet.cssRules;
}

/**
 * A RegExp with raw string.
 *
 * This is similar to /.../ but allows "/".
 *
 * Usage:
 *   regex`^text/html$` === /^text\/html$/
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
 *   rawRegex`${'^'}(function () {${'.+'}})()${'$'}` === /^\(function \(\) \{.+\}\)\(\)$/
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
 *   cssRegex`body { background: ${/\w+/} }` === /body\s*\{\s*background:\s*\w+\s*\}/
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

function getAttributes(node) {
  const attrs = {};
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (const {namespaceURI: _ns, prefix: _prefix, localName: local, nodeValue: value} of node.attributes) {
      const ns = _ns ? `{${_ns}}` : '';
      const prefix = _prefix ? `${_prefix}:` : '';
      attrs[`${ns}${prefix}${local}`] = value;
    }
  }
  return attrs;
}

function createFragFixture(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

function createDomFixture(html) {
  return createFragFixture(html).firstChild;
}

function createNodeFixture(nodeData) {
  if (typeof nodeData === 'string') {
    nodeData = {name: "#text", value: nodeData};
  }

  const {
    doc = document,
    tagName /* alias of name */,
    name = tagName, ns, value, attrs, children, shadow,
    id, class: classes, style: styles, rel: rels, textContent, innerHTML,
  } = nodeData;

  switch (name) {
    case "#text": {
      return doc.createTextNode(value || "");
    }
    case "#comment": {
      return doc.createComment(value || "");
    }
    case "#cdata-section": {
      return doc.createCDATASection(value || "");
    }
    case "#document-fragment": {
      const elem = doc.createDocumentFragment();
      if (children) {
        for (const child of children) {
          elem.appendChild(createNodeFixture(child));
        }
      }
      return elem;
    }
    default: {
      const elem = (ns === undefined) ? doc.createElement(name) : doc.createElementNS(ns, name);

      if (Array.isArray(attrs)) {
        for (const [key, value, ns] of attrs) {
          (ns === undefined) ? elem.setAttribute(key, value) : elem.setAttributeNS(ns, key, value);
        }
      } else if (typeof attrs === 'object') {
        for (const [key, value] of Object.entries(attrs)) {
          elem.setAttribute(key, value);
        }
      }

      if (id != null) {
        elem.id = id;
      }

      if (classes != null) {
        for (const cls of classes) {
          elem.classList.add(cls);
        }
      }

      if (rels != null) {
        for (const rel of rels) {
          elem.relList.add(rel);
        }
      }

      if (styles != null) {
        if (Array.isArray(styles)) {
          for (const [key, value, priority] of styles) {
            elem.style.setProperty(key, value, priority);
          }
        } else if (typeof styles === 'object') {
          for (const [key, value] of Object.entries(styles)) {
            elem.style[key] = value;
          }
        }
      }

      if (children) {
        for (const child of children) {
          elem.appendChild(createNodeFixture(child));
        }
      }

      if (value != null) {
        elem.textContent = value;
      }

      if (textContent != null) {
        elem.textContent = textContent;
      }

      if (innerHTML != null) {
        elem.innerHTML = innerHTML;
      }

      if (shadow != null) {
        const {virtual = false, children, innerHTML, mode = 'open', ...options} = shadow;
        if (virtual) {
          const host = doc.createElement('div');
          const shadowRoot = host.attachShadow({mode, ...options});
          if (children) {
            for (const child of children) {
              shadowRoot.appendChild(createNodeFixture(child));
            }
          }
          if (innerHTML) {
            shadowRoot.innerHTML = innerHTML;
          }

          elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
          if (shadowRoot.mode !== 'open') {
            elem.setAttribute("data-scrapbook-shadowdom-mode", shadowRoot.mode);
          }
          if (shadowRoot.clonable) {
            elem.setAttribute("data-scrapbook-shadowdom-clonable", "");
          }
          if (shadowRoot.delegatesFocus) {
            elem.setAttribute("data-scrapbook-shadowdom-delegates-focus", "");
          }
          if (shadowRoot.serializable) {
            elem.setAttribute("data-scrapbook-shadowdom-serializable", "");
          }
          if (shadowRoot.slotAssignment && shadowRoot.slotAssignment !== 'named') {
            elem.setAttribute("data-scrapbook-shadowdom-slot-assignment", shadowRoot.slotAssignment);
          }
        } else {
          const shadowRoot = elem.attachShadow({mode, ...options});
          if (children) {
            for (const child of children) {
              shadowRoot.appendChild(createNodeFixture(child));
            }
          }
          if (innerHTML) {
            shadowRoot.innerHTML = innerHTML;
          }
        }
      }

      return elem;
    }
  }
}

function createDocFixture({
  type = "html", code, nsmap,
  ...nodeData
} = {}) {
  let doc;

  switch (type) {
    case "html": {
      doc = new DOMParser().parseFromString(code ?? '<!DOCTYPE html><html><head></head><body></body></html>', "text/html");
      break;
    }
    case "xhtml": {
      doc = new DOMParser().parseFromString(code ?? `<!DOCTYPE html><html xmlns="${NS_HTML}"><head></head><body></body></html>`, "application/xhtml+xml");
      break;
    }
    case "svg": {
      doc = new DOMParser().parseFromString(code ?? `<svg xmlns="${NS_SVG}"></svg>`, "image/svg+xml");
      break;
    }
    case "xml": {
      doc = new DOMParser().parseFromString(code ?? `<root/>`, "text/xml");
      break;
    }
    default: {
      throw new Error(`Unsupported type: ${type}`);
    }
  }

  if (Object.keys(nodeData).length) {
    const node = createNodeFixture({doc, ...nodeData});
    initDocWithNode({doc, node});
  }

  generateXmlnsForDoc(doc, nsmap);

  return doc;
}

function initDocWithNode({doc, node}) {
  switch (doc.contentType) {
    case "text/html":
    case "application/xhtml+xml": {
      if (node.namespaceURI === NS_HTML) {
        switch (node.localName) {
          case "html": {
            doc.documentElement.replaceWith(node);
            return;
          }
          case "head": {
            doc.head.replaceWith(node);
            return;
          }
          case "body": {
            doc.body.replaceWith(node);
            return;
          }
          case "base":
          case "link":
          case "meta":
          case "script":
          case "style":
          case "template":
          case "title": {
            doc.head.appendChild(node);
            return;
          }
          case "noscript": {
            if (Array.prototype.every.call(node.childNodes, (elem) => {
              switch (elem.nodeType) {
                case 1: {
                  return elem.namespaceURI === NS_HTML &&
                    ["base", "link", "meta", "script", "style", "template", "title"].includes(elem.localName);
                }
                case 3:
                case 4: {
                  return !trim(elem.nodeValue);
                }
                case 8: {
                  return true;
                }
              }
              return false;
            })) {
              doc.head.appendChild(node);
              return;
            }
          }
        }
      }

      doc.body.appendChild(node);
      return;
    }
    case "image/svg+xml": {
      if (node.namespaceURI === NS_SVG && node.localName === 'svg') {
        doc.documentElement.replaceWith(node);
        return;
      }

      doc.documentElement.appendChild(node);
      return;
    }
    case "text/xml": {
      doc.documentElement.replaceWith(node);
      return;
    }
  }
}

function generateXmlnsForDoc(doc, nsmap) {
  if (nsmap === undefined) {
    switch (doc.contentType) {
      case "image/svg+xml": {
        nsmap = {
          "xlink": NS_XLINK,
        };
        break;
      }
    }
  }

  if (nsmap) {
    for (const [prefix, ns] of Object.entries(nsmap)) {
      doc.documentElement.setAttributeNS(NS_XMLNS, `xmlns${prefix ? ':' + prefix : ''}`, ns);
    }
  }
}

async function createIframeFixture({
  doc = document,
  hidden = true, src, srcdoc, sandbox, onload,
  docData,
} = {}) {
  return await new Promise((resolve) => {
    const iframe = doc.createElement('iframe');
    iframe.hidden = hidden;
    iframe.style.setProperty('visibility', 'hidden');
    iframe.style.setProperty('position', 'absolute');
    iframe.style.setProperty('top', '0');

    if (src) { iframe.src = src; }
    if (srcdoc) { iframe.srcdoc = srcdoc; }
    if (sandbox) { iframe.sandbox = sandbox; }

    let _doc;
    if (docData) {
      _doc = createDocFixture(docData);
      const blob = new Blob(['<html></html>'], {type: _doc.contentType});
      iframe.src = URL.createObjectURL(blob);
    }

    iframe.onload = async function (event) {
      if (docData) {
        // revoke the generated blob URL
        URL.revokeObjectURL(iframe.src);

        const doc = iframe.contentDocument;
        let child;
        while (child = doc.firstChild) {
          doc.removeChild(child);
        }
        while (child = _doc.firstChild) {
          doc.appendChild(child);
        }
      }

      if (typeof onload === 'function') {
        await onload.call(this, event);
      }

      resolve(iframe);
    };

    (doc.body ?? doc.documentElement).appendChild(iframe);
  });
}

async function runControlledTest(obj, method, fn, tester) {
  const doneSignal = {};
  const stub = sinon.stub(obj, method).callsFake(function (...args) {
    return tester.call(this, args, {stub, func: stub.wrappedMethod, doneSignal});
  });
  try {
    await fn.call(this);
  } catch (ex) {
    if (ex !== doneSignal) {
      throw ex;
    }
  } finally {
    stub.restore();
  }
  return stub;
}

export {
  RED_BMP_B64,
  GREEN_BMP_B64,
  BLUE_BMP_B64,
  YELLOW_BMP_B64,
  RED_BMP_DATAURL,
  GREEN_BMP_DATAURL,
  BLUE_BMP_DATAURL,
  YELLOW_BMP_DATAURL,
  RED_BMP_BYTES,
  GREEN_BMP_BYTES,
  BLUE_BMP_BYTES,
  YELLOW_BMP_BYTES,
  INVALID_URL_SAMPLES,
  assert,
  MochaQuery,
  assertRangesEqual,
  getToken,
  encodeText,
  getRulesFromCssText,
  regex,
  rawRegex,
  cssRegex,
  getAttributes,
  createFragFixture,
  createDomFixture,
  createNodeFixture,
  createDocFixture,
  createIframeFixture,
  runControlledTest,
};
