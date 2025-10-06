/******************************************************************************
 * Common capture utilities shared among background and content scripts.
 *
 * @external isDebug
 * @requires scrapbook
 * @module capturer
 *****************************************************************************/

(function (global, factory) {
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      global.isDebug,
      require('../core/common'),
      require('../lib/map-with-default'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['../core/common', '../lib/map-with-default'],
      (...args) => factory(
        global.isDebug,
        ...args,
      ),
    );
  } else {
    // Browser globals
    if (global.hasOwnProperty('capturer')) { return; }
    global.capturer = factory(
      global.isDebug,
      global.scrapbook,
      global.MapWithDefault,
    );
  }
}(this, function (isDebug, scrapbook, MapWithDefault) {

'use strict';

// ref: https://html.spec.whatwg.org/#meta-referrer
const META_REFERRER_POLICY = new Set([
  "",
  "no-referrer",
  "no-referrer-when-downgrade",
  "same-origin",
  "origin",
  "strict-origin",
  "origin-when-cross-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
]);

const META_REFERRER_POLICY_LEGACY = new Map([
  ['never', 'no-referrer'],
  ['default', ''],
  ['always', 'unsafe-url'],
  ['origin-when-crossorigin', 'origin-when-cross-origin'],
]);

const CUSTOM_ELEMENT_NAME_PATTERN = /^[a-z](.+)-(.+)$/;

// ref: https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const CUSTOM_ELEMENT_NAME_FORBIDDEN = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

const REWRITABLE_SPECIAL_OBJECTS = new Set([false, 'adoptedStyleSheet']);

const REMOVE_HIDDEN_EXCLUDE_HTML = new Set(["html", "head", "title", "meta", "link", "style", "script", "body", "noscript", "template", "source", "track"]);
const REMOVE_HIDDEN_EXCLUDE_SVG = new Set(["svg"]);
const REMOVE_HIDDEN_EXCLUDE_MATH = new Set(["math"]);

/**
 * @global
 * @namespace
 */
const capturer = {};

/**
 * Settings of the current capture.
 * @typedef {Object} captureSettings
 * @property {string} missionId - missionId ID for the current capture tasks
 * @property {string} timeId - scrapbook ID for the current capture task
 * @property {?string} documentName - document name for registering
 * @property {?string} indexFilename
 * @property {string[]} recurseChain
 * @property {number} depth
 * @property {boolean} isMainPage
 * @property {boolean} isMainFrame
 * @property {boolean} fullPage
 * @property {string} type - item type
 * @property {string} title - item title
 * @property {string} favIconUrl - item favicon
 */

/**
 * Options of the current capture which is the "capture.*" subgroup of
 * scrapbookOptions.
 * @typedef {scrapbookOptions} captureOptions
 */

/**
 * Invoke an invokable capturer method from another script.
 *
 * - To invoke a background script, provide details.missionId or
 *   args.settings.missionId.
 * - To invoke a content script method in a frame, provide
 *   details.frameWindow.
 *
 * @memberof capturer
 * @variation 2
 * @param {string} method - The capturer method to invoke.
 * @param {Object} [args] - The arguments to pass to the capturer method.
 * @param {Object} [details] - Data to determine invocation behavior.
 * @param {Window} [details.frameWindow]
 * @param {string} [details.missionId]
 * @return {Promise<Object>}
 */
capturer.invoke = async function (method, args, details = {}) {
  const {frameWindow, missionId} = details;
  if (frameWindow) {
    // to frame
    const cmd = "capturer." + method;
    return await scrapbook.invokeFrameScript({frameWindow, cmd, args});
  } else {
    // to capturer.html page
    const id = missionId || args?.settings?.missionId;
    if (!id) {
      throw new Error(`missionId is required to invoke from a content script.`);
    }
    const cmd = "capturer." + method;
    return await scrapbook.invokeExtensionScript({id, cmd, args});
  }
};

/**
 * @type invokable
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.downloadFile}.
 * @return {Promise<downloadBlobResponse>}
 */
capturer.downloadFile = async function (params) {
  isDebug && console.debug("call: downloadFile", params);

  const {url} = params;

  // In Firefox, the background script cannot download a blob URI in a
  // content page, pass the blob object as overrideBlob to workaround that.
  if (url.startsWith('blob:') && scrapbook.userAgent.is('gecko')) {
    try {
      const xhr = await scrapbook.xhr({
        url,
        responseType: 'blob',
        allowAnyStatus: true,
      });
      const overrideBlob = xhr.response;
      params = Object.assign({}, params, {overrideBlob});
    } catch (ex) {
      // skip Error when the blob is not retrievable
    }
  }

  return await capturer.invoke("downloadFile", params);
};

/**
 * @type invokable
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.fetchCss}.
 * @return {Promise<fetchCssResponse>}
 */
capturer.fetchCss = async function (params) {
  isDebug && console.debug("call: fetchCss", params);

  const {url} = params;

  // In Firefox, the background script cannot download a blob URI in a
  // content page, pass the blob object as overrideBlob to workaround that.
  if (url.startsWith('blob:') && scrapbook.userAgent.is('gecko')) {
    try {
      const xhr = await scrapbook.xhr({
        url,
        responseType: 'blob',
        allowAnyStatus: true,
      });
      const overrideBlob = xhr.response;
      params = Object.assign({}, params, {overrideBlob});
    } catch (ex) {
      // skip Error when the blob is not retrievable
    }
  }

  return await capturer.invoke("fetchCss", params);
};

/**
 * @type invokable
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.captureUrl}.
 * @return {Promise<captureDocumentResponse|transferableBlob|null>}
 */
capturer.captureUrl = async function (params) {
  isDebug && console.debug("call: captureUrl", params);

  const {url} = params;

  // In Firefox, the background script cannot download a blob URI in a
  // content page, pass the blob object as overrideBlob to workaround that.
  if (url.startsWith('blob:') && scrapbook.userAgent.is('gecko')) {
    try {
      const xhr = await scrapbook.xhr({
        url,
        responseType: 'blob',
        allowAnyStatus: true,
      });
      const overrideBlob = xhr.response;
      params = Object.assign({}, params, {overrideBlob});
    } catch (ex) {
      // skip Error when the blob is not retrievable
    }
  }

  return await capturer.invoke("captureUrl", params);
};

/**
 * @type invokable
 * @memberof capturer
 * @variation 2
 * @param {Object} params - See {@link capturer.saveDocument}.
 * @return {Promise<saveMainDocumentResponse|downloadBlobResponse|transferableBlob>}
 */
capturer.saveDocument = async function (params) {
  isDebug && console.debug("call: saveDocument", params);

  // pass blob data to the extention script through cache
  params.data.blob = await capturer.saveBlobCache(params.data.blob);

  return await capturer.invoke("saveDocument", params);
};

/**
 * @type invokable
 * @memberof capturer
 * @param {Object} params
 * @param {Document} [params.doc]
 * @param {string} [params.metaDocUrl] - an overriding meta document URL
 * @param {string} [params.docUrl] - an overriding document URL
 * @param {string} [params.baseUrl] - an overriding document base URL
 * @param {string} [params.refUrl] - the referrer URL
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {captureSettings} params.settings
 * @param {string} [params.settings.title] - item title
 * @param {string} [params.settings.favIconUrl] - item favicon
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|downloadBlobResponse|transferableBlob>}
 */
capturer.captureDocumentOrFile = async function (params) {
  isDebug && console.debug("call: captureDocumentOrFile", params);

  const {doc = document, metaDocUrl, docUrl, baseUrl, refUrl, refPolicy, settings, options} = params;

  // if not HTML|SVG document, capture as file
  if (!["text/html", "application/xhtml+xml", "image/svg+xml"].includes(doc.contentType)) {
    // handle saveFileAsHtml
    // if the document can be rendered as HTML, save as a normal HTML file
    if (doc.documentElement.nodeName.toLowerCase() === "html" && options["capture.saveFileAsHtml"]) {
      return await capturer.captureDocument({
        doc,
        metaDocUrl,
        docUrl,
        baseUrl,
        refPolicy,
        mime: "text/html",
        settings,
        options,
      });
    }

    return await capturer.invoke("captureFile", {
      url: doc.URL,
      refUrl,
      refPolicy,
      charset: doc.characterSet,
      settings: Object.assign({}, settings, {
        title: settings.title || doc.title,
      }),
      options,
    });
  }

  // otherwise, capture as document
  return await capturer.captureDocument({
    doc,
    metaDocUrl,
    docUrl,
    baseUrl,
    refPolicy,
    settings,
    options,
  });
};

/**
 * @typedef {saveMainDocumentResponse|registerDocumentResponse} captureDocumentResponse
 * @property {string} url - URL of the saved filename (with hash).
 */

/**
 * @type invokable
 * @memberof capturer
 * @param {Object} params
 * @param {Document} [params.doc]
 * @param {string} [params.metaDocUrl] - an overriding meta document URL (real
 *   doc URL like about:srcdoc, for handling document metadata)
 * @param {string} [params.docUrl] - an overriding document URL (for request
 *   referrers)
 * @param {string} [params.baseUrl] - an overriding document base URL (for
 *   resolving relative URLs)
 * @param {string} [params.refPolicy] - the default document referrer policy
 * @param {string} [params.mime] - an overriding document contentType
 * @param {captureSettings} params.settings
 * @param {string} [params.settings.title] - item title
 * @param {string} [params.settings.favIconUrl] - item favicon
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|transferableBlob>}
 */
capturer.captureDocument = async function (params) {
  isDebug && console.debug("call: captureDocument", params);

  const warn = async (...msg) => {
    return capturer.invoke("remoteMsg", {
      msg,
      type: 'warn',
      settings, // for missionId
    });
  };

  // add hash and error handling
  const downloadFile = async (params) => {
    const {url, options} = params;

    // keep original URL for non-supported protocols
    if (!['http:', 'https:', 'file:', 'data:', 'blob:'].some(p => url.startsWith(p))) {
      return {url};
    }

    return capturer.downloadFile(params)
      .then(response => {
        return Object.assign({}, response, {
          url: capturer.getRedirectedUrl(response.url, scrapbook.splitUrlByAnchor(url)[1]),
        });
      })
      .catch((ex) => {
        console.error(ex);
        warn(scrapbook.lang("ErrorFileDownloadError", [url, ex.message]));
        return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
      });
  };

  // Map cloned nodes and the original for later reference
  // since cloned nodes may lose some information,
  // e.g. cloned iframes has no content, cloned canvas has no image,
  // and cloned form elements has no current status.
  const cloneNodeMapping = (node, deep = false) => {
    return scrapbook.cloneNode(node, deep, {
      newDoc,
      origNodeMap,
      clonedNodeMap,
      includeShadowDom: options["capture.shadowDom"] === "save",
    });
  };

  const captureRecordAddedNode = (elem, record = options["capture.recordRewrites"]) => {
    if (record) {
      const recordAttr = `data-scrapbook-orig-null-node-${timeId}`;
      if (!elem.hasAttribute(recordAttr)) {
        elem.setAttribute(recordAttr, '');
      }
    }
  };

  // remove the specified node, record it if option set
  const captureRemoveNode = (elem, record = options["capture.recordRewrites"]) => {
    if (!elem.parentNode) { return; }

    if (record) {
      const comment = newDoc.createComment(`scrapbook-orig-node-${timeId}=${scrapbook.escapeHtmlComment(elem.outerHTML)}`);
      elem.parentNode.replaceChild(comment, elem);
    } else {
      elem.parentNode.removeChild(elem);
    }
  };

  // rewrite the specified attr, record it if option set
  // if value is false/null/undefined, remove the attr
  // if value is true, set attr to "" iff attr not exist
  const captureRewriteAttr = (elem, attr, value, record = options["capture.recordRewrites"]) => {
    const [ns, att] = scrapbook.splitXmlAttribute(attr);

    if (elem.hasAttribute(attr)) {
      if (value === true) { return; }

      const oldValue = elem.getAttribute(attr);
      if (oldValue === value) { return; }

      if ([false, null, undefined].includes(value)) {
        elem.removeAttribute(attr);
      } else {
        elem.setAttribute(attr, value);
      }

      if (record) {
        const recordAttr = `${ns ? ns + ":" : ""}data-scrapbook-orig-attr-${att}-${timeId}`;
        const recordAttr2 = `${ns ? ns + ":" : ""}data-scrapbook-orig-null-attr-${att}-${timeId}`;
        const recordAttr3 = `data-scrapbook-orig-null-node-${timeId}`;
        if (!elem.hasAttribute(recordAttr) && !elem.hasAttribute(recordAttr2) && !elem.hasAttribute(recordAttr3)) {
          elem.setAttribute(recordAttr, oldValue);
        }
      }
    } else {
      if ([false, null, undefined].includes(value)) { return; }

      if (value === true) { value = ''; }

      elem.setAttribute(attr, value);

      if (record) {
        const recordAttr = `${ns ? ns + ":" : ""}data-scrapbook-orig-null-attr-${att}-${timeId}`;
        const recordAttr2 = `${ns ? ns + ":" : ""}data-scrapbook-orig-attr-${att}-${timeId}`;
        const recordAttr3 = `data-scrapbook-orig-null-node-${timeId}`;
        if (!elem.hasAttribute(recordAttr) && !elem.hasAttribute(recordAttr2)) {
          elem.setAttribute(recordAttr, "");
        }
      }
    }
  };

  // rewrite the textContent, record it if option set
  const captureRewriteTextContent = (elem, value, record = options["capture.recordRewrites"]) => {
    const oldValue = elem.textContent;
    if (oldValue === value) { return; }

    elem.textContent = value;

    if (record) {
      const recordAttr = `data-scrapbook-orig-textContent-${timeId}`;
      if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
    }
  };

  const resolveRelativeUrl = (relativeUrl, baseUrl, {checkJavascript = false, skipLocal} = {}) => {
    // scripts: script-like URLs
    if (checkJavascript && capturer.isJavascriptUrl(relativeUrl)) {
      switch (options["capture.script"]) {
        case "save":
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
        default:
          relativeUrl = "javascript:";
          break;
      }
    }

    return capturer.resolveRelativeUrl(relativeUrl, baseUrl, {skipLocal});
  };

  const resolveLocalLink = (relativeUrl, baseUrl) => {
    const url = capturer.resolveRelativeUrl(relativeUrl, baseUrl, {skipLocal: false});

    // This link targets the current page
    const [urlMain, urlHash] = scrapbook.splitUrlByAnchor(url);
    if (urlMain === metaDocUrl && !capturer.isAboutUrl(metaDocUrl)) {
      // @TODO: for iframe whose URL is about:blank or about:srcdoc,
      // this link should point to the captured page
      if (urlHash === "" || urlHash === "#") {
        return urlHash;
      }

      // For fullPage capture (no selection), relink to the captured page.
      // For partial capture, the captured page could be incomplete,
      // relink to the captured page only when the target node is included in the selected fragment.
      let hasLocalTarget = !selection;
      if (!hasLocalTarget) {
        const targetId = CSS.escape(scrapbook.decodeURIComponent(urlHash.slice(1)));
        if (rootNode.querySelector(`#${targetId}, a[name="${targetId}"]`)) {
          hasLocalTarget = true;
        }
      }
      if (hasLocalTarget) {
        return urlHash;
      }
    }

    return url;
  };

  const rewriteAnchor = (elem, attr, {isHtml = true} = {}) => {
    if (!elem.hasAttribute(attr)) { return; }

    let url = elem.getAttribute(attr);

    // scripts: script-like anchors
    if (capturer.isJavascriptUrl(url)) {
      switch (options["capture.script"]) {
        case "save":
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
        default:
          captureRewriteAttr(elem, attr, "javascript:");
          break;
      }
      return;
    }

    // check local link and rewrite url
    url = resolveLocalLink(url, baseUrlFinal);
    captureRewriteAttr(elem, attr, url);

    // check downLink
    if (['http:', 'https:', 'file:', 'blob:'].some(p => url.startsWith(p))) {
      if (["header", "url"].includes(options["capture.downLink.file.mode"]) ||
          (parseInt(options["capture.downLink.doc.depth"], 10) > 0 && options['capture.saveAs'] !== 'singleHtml')) {
        let refPolicy = docRefPolicy;
        if (isHtml) {
          refPolicy = (elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy) || refPolicy;
        }
        downLinkTasks.push(async () => {
          const isAttachment = isHtml ? elem.hasAttribute('download') : false;
          const downLinkSettings = Object.assign({}, settings, {
            depth: settings.depth + 1,
            isMainPage: false,
            isMainFrame: true,
          });
          const response = await capturer.captureUrl({
            url,
            refUrl,
            refPolicy,
            isAttachment,
            downLink: true,
            settings: downLinkSettings,
            options,
          })
          .catch((ex) => {
            console.error(ex);
            warn(scrapbook.lang("ErrorFileDownloadError", [url, ex.message]));
            return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
          });

          if (response) {
            captureRewriteAttr(elem, attr, response.url);
          }
          return response;
        });
      }
    }
  };

  const rewriteSvgHref = (elem, attr) => {
    if (!elem.hasAttribute(attr)) { return; }

    let url = elem.getAttribute(attr);

    // check local link and rewrite url
    url = resolveLocalLink(url, baseUrlFinal);
    captureRewriteAttr(elem, attr, url);

    switch (options["capture.image"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        if (elem.hasAttribute(attr)) {
          captureRewriteAttr(elem, attr, null);
        }
        break;
      case "remove":
        captureRemoveNode(elem);
        return;
      case "save-current":
      case "save":
      default: {
        // skip further processing for non-absolute links
        if (!scrapbook.isUrlAbsolute(url)) {
          break;
        }

        const refPolicy = docRefPolicy;
        tasks.push(async () => {
          const response = await downloadFile({
            url,
            refUrl,
            refPolicy,
            settings,
            options,
          });
          captureRewriteAttr(elem, attr, response.url);
          return response;
        });
        break;
      }
    }
  };

  // the callback should return a falsy value if the elem is removed from DOM
  const rewriteRecursively = (elem, rootName, callback) => {
    const nodeName = elem.nodeName.toLowerCase();

    // switch rootName for a foreign element
    if (!rootName && ["svg", "math"].includes(nodeName)) {
      rootName = nodeName;
    }

    const result = callback.call(this, elem, rootName);

    // skip processing children if elem is removed from DOM
    if (result) {
      let child = elem.firstElementChild, next;
      while (child) {
        // record next child in prior so that we don't get a problem if child
        // is removed in this run
        next = child.nextElementSibling;

        rewriteRecursively(child, rootName, callback);

        child = next;
      }
    }
    return result;
  };

  const rewriteNode = (node, rootName) => {
    // skip non-element nodes
    if (node.nodeType !== 1) {
      return node;
    }

    // skip processing a special node
    if (!REWRITABLE_SPECIAL_OBJECTS.has(scrapbook.getScrapbookObjectType(node))) {
      return node;
    }

    const elem = node;
    const elemOrig = origNodeMap.get(elem);

    // remove hidden elements
    if (!isHeadless && elemOrig) {
      switch (options["capture.removeHidden"]) {
        case "undisplayed": {
          const excludeNodes =
              rootName === "svg" ? REMOVE_HIDDEN_EXCLUDE_SVG :
              rootName === "math" ? REMOVE_HIDDEN_EXCLUDE_MATH :
              REMOVE_HIDDEN_EXCLUDE_HTML;
          if (!excludeNodes.has(elem.nodeName.toLowerCase())) {
            const styles = doc.defaultView.getComputedStyle(elemOrig, null);
            if (styles.getPropertyValue("display") === "none") {
              captureRemoveNode(elem);
              return;
            }
          }
          break;
        }
      }
    }

    if (rootName === "svg") {
      switch (elem.nodeName.toLowerCase()) {
        case "a": {
          for (const attr of ["href", "xlink:href"]) {
            rewriteAnchor(elem, attr, {isHtml: false});
          }
          break;
        }

        case "script": {
          for (const attr of ["href", "xlink:href"]) {
            if (!elem.hasAttribute(attr)) { continue; }
            const newUrl = resolveRelativeUrl(elem.getAttribute(attr), baseUrl);
            captureRewriteAttr(elem, attr, newUrl);
          }

          switch (options["capture.script"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              for (const attr of ["href", "xlink:href"]) {
                if (!elem.hasAttribute(attr)) { continue; }
                captureRewriteAttr(elem, attr, null);
              }
              captureRewriteTextContent(elem, "");
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default: {
              const refPolicy = docRefPolicy;
              for (const attr of ["href", "xlink:href"]) {
                if (!elem.hasAttribute(attr)) { continue; }
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute(attr),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, attr, response.url);
                  return response;
                });
              }
              break;
            }
          }
          break;
        }

        case "style": {
          const baseUrlCurrent = baseUrl;
          const refPolicy = docRefPolicy;
          const css = cssHandler.getElemCss(elem);
          if (css) {
            cssTasks.push(async () => {
              await cssResourcesHandler.inspectCss({
                css,
                baseUrl: baseUrlCurrent,
                refUrl,
                refPolicy,
                envCharset: charset,
                root: elem.getRootNode(),
              });
            });
          }
          switch (options["capture.style"]) {
            case "blank": {
              captureRewriteTextContent(elem, "");
              break;
            }
            case "remove": {
              captureRemoveNode(elem);
              return;
            }
            case "save":
            case "link":
            default: {
              tasks.push(async () => {
                await cssHandler.rewriteCss({
                  elem,
                  baseUrl: baseUrlCurrent,
                  refUrl,
                  refPolicy,
                  envCharset: charset,
                  settings,
                  callback: (elem, response) => {
                    // escape </style> as textContent can contain HTML
                    captureRewriteTextContent(elem, response.cssText.replace(/<\/(style>)/gi, "<\\/$1"));
                  },
                });
              });
              break;
            }
          }
          break;
        }

        default: {
          // SVG spec is quite complicated, but generally we can treat every
          // href and xlink:href as an image link, except for "a" and "script"
          for (const attr of ["href", "xlink:href"]) {
            rewriteSvgHref(elem, attr);
          }
          break;
        }
      }
    } else if (rootName === "math") {
      rewriteAnchor(elem, "href", {isHtml: false});
    } else {
      switch (elem.nodeName.toLowerCase()) {
        case "base": {
          if (!elem.hasAttribute("href")) { break; }

          // resolve using baseUrlFallback
          const newUrl = resolveRelativeUrl(elem.getAttribute("href"), baseUrlFallback, {skipLocal: false});
          captureRewriteAttr(elem, "href", newUrl);

          // Update baseUrl for the first base[href].
          // Note: don't consider a <base> elem in a shadowRoot.
          if (!seenBaseElem && elem.getRootNode().nodeType !== 11) {
            baseUrl = scrapbook.splitUrlByAnchor(newUrl)[0];
            seenBaseElem = true;
          }

          switch (options["capture.base"]) {
            case "blank":
              captureRewriteAttr(elem, "href", null);
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              // do nothing
              break;
          }
          break;
        }

        case "meta": {
          // <meta> elements in a shadowRoot never works. Don't process or
          // rewrite them.
          if (elem.getRootNode().nodeType === 11) { break; }

          // Exactly one of the name, http-equiv, charset, and itemprop
          // attributes must be specified, according to the spec. Though we
          // check all of them in case that a bad element contains multiple
          // attributes. It's tested that Firefox and Chromium will take the
          // charset of meta[charset] or meta[http-equiv=content-type][content]
          // even if another http-equiv or name also exists.

          if (elem.matches('[charset]') && !metaCharsetNode) {
            // force UTF-8
            metaCharsetNode = elem;
            captureRewriteAttr(elem, "charset", "UTF-8");
          }

          // spaced value e.g. http-equiv=" refresh " doesn't take effect
          if (elem.matches('[http-equiv][content]')) {
            switch (elem.getAttribute("http-equiv").toLowerCase()) {
              case "content-type": {
                const contentType = scrapbook.parseHeaderContentType(elem.getAttribute("content"));
                if (contentType.parameters.charset && !metaCharsetNode) {
                  // force UTF-8
                  metaCharsetNode = elem;
                  const regexToken = /^[!#$%&'*+.0-9A-Z^_`a-z|~-]+$/;
                  let value = contentType.type;
                  for (const field in contentType.parameters) {
                    let v = contentType.parameters[field];
                    if (field === 'charset') { v = 'UTF-8'; }
                    value += '; ' + field + '=' + (regexToken.test(v) ? v : '"' + scrapbook.escapeQuotes(v) + '"');
                  }
                  captureRewriteAttr(elem, "content", value);
                }
                break;
              }
              case "refresh": {
                // rewrite meta refresh
                const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
                if (metaRefresh.url) {
                  const url = resolveLocalLink(metaRefresh.url, baseUrl);
                  captureRewriteAttr(elem, "content", metaRefresh.time + (url ? "; url=" + url : ""));

                  // check downLink
                  if (['http:', 'https:', 'file:'].some(p => url.startsWith(p))) {
                    if (["header", "url"].includes(options["capture.downLink.file.mode"]) ||
                        (parseInt(options["capture.downLink.doc.depth"], 10) > 0 && options['capture.saveAs'] !== 'singleHtml')) {
                      downLinkTasks.push(async () => {
                        const downLinkSettings = Object.assign({}, settings, {
                          depth: settings.depth + 1,
                          isMainPage: false,
                          isMainFrame: true,
                        });
                        const response = await capturer.captureUrl({
                          url,
                          refUrl,
                          downLink: true,
                          settings: downLinkSettings,
                          options,
                        })
                        .catch((ex) => {
                          console.error(ex);
                          warn(scrapbook.lang("ErrorFileDownloadError", [url, ex.message]));
                          return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
                        });

                        if (response) {
                          const url = response.url;
                          captureRewriteAttr(elem, "content", metaRefresh.time + (url ? "; url=" + url : ""));
                        }
                        return response;
                      });
                    }
                  }
                }
                break;
              }
              case "content-security-policy": {
                // content security policy could make resources not loaded when viewed offline
                switch (options["capture.contentSecurityPolicy"]) {
                  case "save":
                    // do nothing
                    break;
                  case "remove":
                  default:
                    captureRemoveNode(elem);
                    return;
                }
                break;
              }
            }
          }

          // dynamically update document referrer policy
          // spaced value e.g. name=" referrer " or content=" origin " doesn't take effect
          // ref: https://html.spec.whatwg.org/multipage/semantics.html#meta-referrer
          if (elem.matches('[name="referrer" i]')) {
            const policy = elem.getAttribute('content').toLowerCase();
            if (META_REFERRER_POLICY.has(policy)) {
              docRefPolicy = policy;
            } else {
              const policyLegacy = META_REFERRER_POLICY_LEGACY.get(policy);
              if (policyLegacy !== undefined) {
                docRefPolicy = policy;
              }
            }
          }

          // An open graph URL does not acknowledge <base> and should always use an absolute URL,
          // and thus we simply skip meta[property="og:*"].
          break;
        }

        case "link": {
          if (elem.hasAttribute("href")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("href"), baseUrl);
            captureRewriteAttr(elem, "href", newUrl);
          }

          if (elem.hasAttribute("imagesrcset")) {
            const rewriteSrcset = scrapbook.rewriteSrcset(elem.getAttribute("imagesrcset"), (url) => {
              return resolveRelativeUrl(url, baseUrl);
            });
            captureRewriteAttr(elem, "imagesrcset", rewriteSrcset);
          }

          // integrity won't work due to rewriting or crossorigin issue
          captureRewriteAttr(elem, "integrity", null);

          if (elem.matches('[rel~="stylesheet"][href]')) {
            // styles: link element
            const baseUrlCurrent = baseUrl;
            const refPolicy = elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy || docRefPolicy;
            const envCharset = elem.getAttribute("charset") || charset;
            let disableCss = false;
            const css = cssHandler.getElemCss(elem);
            if (css) {
              if (css.title) {
                if (!cssHandler.isBrowserPick) {
                  captureRewriteAttr(elem, "title", null);

                  // Chromium has a bug that alternative stylesheets has disabled = false,
                  // but actually not enabled and cannot be enabled.
                  // https://bugs.chromium.org/p/chromium/issues/detail?id=965554
                  if (!scrapbook.userAgent.is("chromium")) {
                    // In Firefox, stylesheets with [rel~="alternate"]:not([title]) is
                    // disabled initially. Remove "alternate" to get it work.
                    if (elem.matches('[rel~="alternate"]')) {
                      const rel = Array.prototype.filter.call(
                        elem.relList, x => x.toLowerCase() !== "alternate",
                      ).join(" ");
                      captureRewriteAttr(elem, "rel", rel);
                    }
                  }

                  if (css.disabled) {
                    disableCss = true;
                  }
                }
              } else {
                if (css.disabled) {
                  disableCss = true;
                }
              }
              cssTasks.push(async () => {
                await cssResourcesHandler.inspectCss({
                  css,
                  baseUrl: css.href || baseUrlCurrent,
                  refUrl: css.href || refUrl,
                  refPolicy,
                  envCharset,
                  root: elem.getRootNode(),
                });
              });
            }

            switch (options["capture.style"]) {
              case "link": {
                if (disableCss) {
                  captureRewriteAttr(elem, "href", null);
                  elem.setAttribute("data-scrapbook-css-disabled", "");
                  break;
                }
                break;
              }
              case "blank": {
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // If the href attribute is absent, then the element does not define a link.
                captureRewriteAttr(elem, "href", null);
                break;
              }
              case "remove": {
                captureRemoveNode(elem);
                return;
              }
              case "save":
              default: {
                if (disableCss) {
                  captureRewriteAttr(elem, "href", null);
                  elem.setAttribute("data-scrapbook-css-disabled", "");
                  break;
                }
                tasks.push(async () => {
                  await cssHandler.rewriteCss({
                    elem,
                    baseUrl: baseUrlCurrent,
                    refUrl,
                    refPolicy,
                    envCharset,
                    settings,
                    callback: (elem, response) => {
                      captureRewriteAttr(elem, "href", response.url);
                      captureRewriteAttr(elem, "charset", null);
                    },
                  });
                });

                // remove crossorigin as the origin has changed
                captureRewriteAttr(elem, "crossorigin", null);
                break;
              }
            }
            break;
          } else if (elem.matches('[rel~="icon"][href]')) {
            // favicon: the link element
            switch (options["capture.favicon"]) {
              case "link":
                if (typeof favIconUrl === 'undefined' && elem.getRootNode().nodeType !== 11) {
                  favIconUrl = elem.getAttribute("href");
                }
                break;
              case "blank":
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // If the href attribute is absent, then the element does not define a link.
                captureRewriteAttr(elem, "href", null);
                if (typeof favIconUrl === 'undefined' && elem.getRootNode().nodeType !== 11) {
                  favIconUrl = "";
                }
                break;
              case "remove":
                captureRemoveNode(elem);
                if (typeof favIconUrl === 'undefined' && elem.getRootNode().nodeType !== 11) {
                  favIconUrl = "";
                }
                return;
              case "save":
              default: {
                let useFavIcon = false;
                if (typeof favIconUrl === 'undefined' && elem.getRootNode().nodeType !== 11) {
                  favIconUrl = elem.getAttribute("href");
                  useFavIcon = true;
                }
                const refPolicy = elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy || docRefPolicy;
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("href"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "href", response.url);
                  if (useFavIcon) {
                    if (options["capture.saveAs"] === 'folder') {
                      favIconUrl = response.url;
                    }
                  }
                  return response;
                });

                // remove crossorigin as the origin has changed
                captureRewriteAttr(elem, "crossorigin", null);
                break;
              }
            }
          } else if (elem.matches('[rel~="preload"][href], [rel~="preload"][imagesrcset], [rel~="modulepreload"][href], [rel~="dns-prefetch"][href], [rel~="preconnect"][href]')) {
            // @TODO: handle preloads according to its "as" attribute
            switch (options["capture.preload"]) {
              case "blank":
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // If the href attribute is absent, then the element does not define a link.
                captureRewriteAttr(elem, "href", null);
                captureRewriteAttr(elem, "imagesrcset", null);
                break;
              case "remove":
              default:
                captureRemoveNode(elem);
                return;
            }
          } else if (elem.matches('[rel~="prefetch"][href], [rel~="prerender"][href]')) {
            // @TODO: handle prefetches according to its "as" attribute
            switch (options["capture.prefetch"]) {
              case "blank":
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // If the href attribute is absent, then the element does not define a link.
                captureRewriteAttr(elem, "href", null);
                break;
              case "remove":
              default:
                captureRemoveNode(elem);
                return;
            }
          } else if (favIconSelector && elem.matches(favIconSelector)) {
            // favicon-like
            switch (options["capture.favicon"]) {
              case "link":
                break;
              case "blank":
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // If the href attribute is absent, then the element does not define a link.
                captureRewriteAttr(elem, "href", null);
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default: {
                const refPolicy = elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy || docRefPolicy;
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("href"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "href", response.url);
                  return response;
                });

                // remove crossorigin as the origin has changed
                captureRewriteAttr(elem, "crossorigin", null);
                break;
              }
            }
          }
          break;
        }

        // styles: style element
        case "style": {
          const baseUrlCurrent = baseUrl;
          const refPolicy = docRefPolicy;
          let disableCss = false;
          const css = cssHandler.getElemCss(elem);
          if (css) {
            if (css.title) {
              if (!cssHandler.isBrowserPick) {
                captureRewriteAttr(elem, "title", null);
                if (css.disabled) {
                  disableCss = true;
                }
              }
            } else {
              if (css.disabled) {
                disableCss = true;
              }
            }
            cssTasks.push(async () => {
              await cssResourcesHandler.inspectCss({
                css,
                baseUrl: baseUrlCurrent,
                refUrl,
                refPolicy,
                envCharset: charset,
                root: elem.getRootNode(),
              });
            });
          }

          switch (options["capture.style"]) {
            case "blank": {
              captureRewriteTextContent(elem, "");
              break;
            }
            case "remove": {
              captureRemoveNode(elem);
              return;
            }
            case "save":
            case "link":
            default: {
              if (disableCss) {
                captureRewriteTextContent(elem, "");
                elem.setAttribute("data-scrapbook-css-disabled", "");
                break;
              }
              tasks.push(async () => {
                await cssHandler.rewriteCss({
                  elem,
                  baseUrl: baseUrlCurrent,
                  refUrl,
                  refPolicy,
                  envCharset: charset,
                  settings,
                  callback: (elem, response) => {
                    // escape </style> as textContent can contain HTML
                    captureRewriteTextContent(elem, response.cssText.replace(/<\/(style>)/gi, "<\\/$1"));

                    // For an HTML document the CSS content must not be HTML-escaped.
                    // However the innerHTML/outerHTML property of the <style> element
                    // is escaped if the element is in another namespace. Replace it
                    // with the default namespace to fix it.
                    if (elem.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
                      const newElem = newDoc.createElement('style');
                      for (const attr of elem.attributes) {
                        newElem.setAttribute(attr.name, attr.value);
                      }
                      newElem.textContent = elem.textContent;
                      elem.replaceWith(newElem);
                    }
                  },
                });
              });
              break;
            }
          }
          break;
        }

        // scripts: script
        case "script": {
          if (elem.hasAttribute("src")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("src"), baseUrl);
            captureRewriteAttr(elem, "src", newUrl);
          }

          // integrity won't work due to rewriting or crossorigin issue
          captureRewriteAttr(elem, "integrity", null);

          switch (options["capture.script"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              // HTML 5.1 2nd Edition / W3C Recommendation:
              // If src is specified, it must be a valid non-empty URL.
              //
              // script with src="about:blank" can cause an error in some contexts
              if (elem.hasAttribute("src")) {
                captureRewriteAttr(elem, "src", null);
              }
              captureRewriteTextContent(elem, "");
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                const refPolicy = elem.referrerPolicy || docRefPolicy;
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("src"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "src", response.url);
                  return response;
                });
              }

              // remove crossorigin as the origin has changed
              captureRewriteAttr(elem, "crossorigin", null);
              break;
          }

          // escape </script> as textContent can contain HTML
          elem.textContent = elem.textContent.replace(/<\/(script>)/gi, "<\\/$1");

          // For an HTML document the script content must not be HTML-escaped.
          // However the innerHTML/outerHTML property of the <script> element
          // is escaped if the element is in another namespace. Replace it
          // with the default namespace to fix it.
          if (elem.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
            const newElem = newDoc.createElement('script');
            for (const attr of elem.attributes) {
              newElem.setAttribute(attr.name, attr.value);
            }
            newElem.textContent = elem.textContent;
            elem.replaceWith(newElem);
          }
          break;
        }

        // scripts: noscript
        case "noscript": {
          switch (options["capture.noscript"]) {
            case "blank":
              captureRewriteTextContent(elem, "");
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default: {
              // In browsers conforming the spec, elem contains only text
              // (innerHTML and textContent work like <style>)
              // when JavaScript is enabled. Replace with normal HTML content.
              // https://html.spec.whatwg.org/multipage/scripting.html#the-noscript-element
              const elemOrig = origNodeMap.get(elem);
              if (elemOrig && elemOrig.innerHTML === elemOrig.textContent) {
                // elemOrig may not exist for nested <noscript> when handling the inner level,
                // skip as the replacement should have been done in the outer level
                const tempElem = newDoc.createElement('scrapbook-noscript');
                tempElem.innerHTML = elem.textContent;
                let child;
                elem.textContent = '';
                while (child = tempElem.firstChild) {
                  elem.appendChild(child);
                }
              }
              break;
            }
          }
          break;
        }

        case "body":
        case "table":
        case "tr":
        case "th":
        case "td": {
          // deprecated: background attribute (deprecated since HTML5)
          if (elem.hasAttribute("background")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("background"), baseUrl);
            captureRewriteAttr(elem, "background", newUrl);

            switch (options["capture.imageBackground"]) {
              case "link":
                // do nothing
                break;
              case "blank":
              case "remove": // deprecated
                captureRewriteAttr(elem, "background", null);
                break;
              case "save-used":
              case "save":
              default: {
                const refPolicy = docRefPolicy;
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: newUrl,
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "background", response.url);
                  return response;
                });
                break;
              }
            }
          }
          break;
        }

        case "frame":
        case "iframe": {
          const frame = elem;
          const frameSrc = origNodeMap.get(frame);
          let sourceUrl;
          if (frame.hasAttribute("src")) {
            sourceUrl = resolveRelativeUrl(frame.getAttribute("src"), baseUrl, {checkJavascript: true});
            captureRewriteAttr(frame, "src", sourceUrl);
          }

          // @TODO: javascript: URL content is preserved only when the frame
          // page content is not saved.
          const baseUrlCurrent = baseUrl;
          const refPolicy = frame.referrerPolicy || docRefPolicy;
          switch (options["capture.frame"]) {
            case "link": {
              // if the frame has srcdoc, use it
              if (frame.nodeName.toLowerCase() === 'iframe' &&
                  frame.hasAttribute("srcdoc")) {
                const captureFrameCallback = async (response) => {
                  isDebug && console.debug("captureFrameCallback", response);
                  const file = scrapbook.dataUriToFile(response.url);
                  const content = await scrapbook.readFileAsText(file);
                  captureRewriteAttr(frame, "srcdoc", content);
                  return response;
                };

                const captureFrameErrorHandler = async (ex) => {
                  console.error(ex);
                  warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
                  // don't rewrite srcdoc if error
                };

                const frameSettings = Object.assign({}, settings, {
                  recurseChain: [...settings.recurseChain],
                  isMainFrame: false,
                  fullPage: true,
                  usedCssFontUrl: undefined,
                  usedCssImageUrl: undefined,
                });

                // save resources in srcdoc as data URL
                const frameOptions = Object.assign({}, options, {
                  "capture.saveAs": "singleHtml",
                });

                sourceUrl = 'about:srcdoc';

                tasks.push(async () => {
                  const frameDoc = (() => {
                    try {
                      return frameSrc.contentDocument;
                    } catch (ex) {
                      // console.debug(ex);
                    }
                  })();

                  // frame document accessible:
                  // capture the content document directly
                  if (frameDoc) {
                    return capturer.captureDocumentOrFile({
                      doc: frameDoc,
                      metaDocUrl: sourceUrl,
                      docUrl,
                      baseUrl: baseUrlCurrent,
                      refUrl,
                      refPolicy,
                      settings: frameSettings,
                      options: frameOptions,
                    }).then(captureFrameCallback).catch(captureFrameErrorHandler);
                  }

                  // frame document inaccessible (headless capture):
                  // contentType of srcdoc is always text/html
                  const doc = (new DOMParser()).parseFromString(frame.getAttribute("srcdoc"), 'text/html');

                  return capturer.captureDocument({
                    doc,
                    metaDocUrl: sourceUrl,
                    docUrl,
                    baseUrl: baseUrlCurrent,
                    refPolicy,
                    settings: frameSettings,
                    options: frameOptions,
                  }).then(captureFrameCallback).catch(captureFrameErrorHandler);
                });
              }
              break;
            }
            case "blank": {
              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The src attribute, if present, must be a valid non-empty URL.
              captureRewriteAttr(frame, "src", null);
              if (frame.nodeName.toLowerCase() === 'iframe') {
                captureRewriteAttr(frame, "srcdoc", null);
              }
              break;
            }
            case "remove": {
              captureRemoveNode(frame);
              return;
            }
            case "save":
            default: {
              const captureFrameCallback = async (response) => {
                isDebug && console.debug("captureFrameCallback", response);

                // use srcdoc for data URL document for iframe
                if (response.url.startsWith('data:') &&
                    frame.nodeName.toLowerCase() === 'iframe' &&
                    options["capture.saveDataUriAsSrcdoc"]) {
                  const file = scrapbook.dataUriToFile(response.url);
                  const {type: mime, parameters: {charset}} = scrapbook.parseHeaderContentType(file.type);
                  if (mime === "text/html") {
                    // assume the charset is UTF-8 if not defined
                    const content = await scrapbook.readFileAsText(file, charset || "UTF-8");
                    captureRewriteAttr(frame, "srcdoc", content);
                    captureRewriteAttr(frame, "src", null);
                    return response;
                  }
                }

                captureRewriteAttr(frame, "src", response.url);
                if (frame.nodeName.toLowerCase() === 'iframe') {
                  captureRewriteAttr(frame, "srcdoc", null);
                }
                return response;
              };

              const captureFrameErrorHandler = async (ex) => {
                console.error(ex);
                warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
                return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
              };

              const frameSettings = Object.assign({}, settings, {
                recurseChain: [...settings.recurseChain],
                isMainFrame: false,
                fullPage: true,
                usedCssFontUrl: undefined,
                usedCssImageUrl: undefined,
              });

              sourceUrl = frame.getAttribute("src");

              tasks.push(async () => {
                const frameDoc = (() => {
                  try {
                    return frameSrc.contentDocument;
                  } catch (ex) {
                    // console.debug(ex);
                  }
                })();

                // frame document accessible:
                // capture the content document directly
                if (frameDoc) {
                  sourceUrl = frameDoc.URL;
                  return capturer.captureDocumentOrFile({
                    doc: frameDoc,
                    docUrl: capturer.isAboutUrl(sourceUrl) ? docUrl : sourceUrl,
                    baseUrl: capturer.isAboutUrl(sourceUrl) ? baseUrlCurrent : sourceUrl,
                    refUrl,
                    refPolicy,
                    settings: frameSettings,
                    options,
                  }).catch(captureFrameErrorHandler).then(captureFrameCallback);
                }

                const frameWindow = (() => {
                  try {
                    return frameSrc.contentWindow;
                  } catch (ex) {
                    // console.debug(ex);
                  }
                })();

                // frame window accessible:
                // capture the content document through messaging if viable
                if (frameWindow) {
                  const response = await capturer.invoke("captureDocumentOrFile", {
                    refUrl,
                    refPolicy,
                    settings: frameSettings,
                    options,
                  }, {frameWindow}).catch(captureFrameErrorHandler);
                  // undefined for data URL, sandboxed blob URL, etc.
                  if (response) {
                    return captureFrameCallback(response);
                  }
                }

                // frame window accessible with special cases:
                // frame window inaccessible: (headless capture)

                // if the frame has srcdoc, use it
                if (frame.nodeName.toLowerCase() === 'iframe' &&
                    frame.hasAttribute("srcdoc")) {
                  sourceUrl = 'about:srcdoc';

                  // contentType of srcdoc is always text/html
                  const doc = (new DOMParser()).parseFromString(frame.getAttribute("srcdoc"), 'text/html');

                  return capturer.captureDocument({
                    doc,
                    metaDocUrl: sourceUrl,
                    docUrl,
                    baseUrl: baseUrlCurrent,
                    refPolicy,
                    settings: frameSettings,
                    options,
                  }).catch(captureFrameErrorHandler).then(captureFrameCallback);
                }

                // if the frame src is not absolute,
                // skip further processing and keep current src
                // (point to self, or not resolvable)
                if (!scrapbook.isUrlAbsolute(sourceUrl)) {
                  return;
                }

                // keep original about:blank etc. if the real content is not
                // accessible
                if (sourceUrl.startsWith('about:')) {
                  return;
                }

                // otherwise, headlessly capture src
                let frameOptions = options;

                // special handling for data URL
                if (sourceUrl.startsWith("data:") &&
                    !options["capture.saveDataUriAsFile"] &&
                    !(frame.nodeName.toLowerCase() === 'iframe' && options["capture.saveDataUriAsSrcdoc"]) &&
                    options["capture.saveAs"] !== "singleHtml") {
                  // Save frame document and inner URLs as data URL since data URL
                  // is null origin and no relative URL is allowed in it.
                  frameOptions = Object.assign({}, options, {
                    "capture.saveAs": "singleHtml",
                  });
                }

                const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
                frameSettings.recurseChain.push(docUrl);

                // check circular reference if saving as data URL
                if (frameOptions["capture.saveAs"] === "singleHtml") {
                  if (frameSettings.recurseChain.includes(sourceUrlMain)) {
                    warn(scrapbook.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                    captureRewriteAttr(frame, "src", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                    return;
                  }
                }

                return capturer.captureUrl({
                  url: sourceUrl,
                  refUrl,
                  refPolicy,
                  settings: frameSettings,
                  options: frameOptions,
                }).catch(captureFrameErrorHandler).then(captureFrameCallback);
              });
              break;
            }
          }
          break;
        }

        case "a":
        case "area": {
          if (elem.hasAttribute("ping")) {
            switch (options["capture.ping"]) {
              case "link": {
                const newUrls = scrapbook.rewriteUrls(elem.getAttribute("ping"), (url) => {
                  return resolveRelativeUrl(url, baseUrlFinal);
                });
                captureRewriteAttr(elem, "ping", newUrls);
                break;
              }
              case "blank":
              default: {
                captureRewriteAttr(elem, "ping", null);
                break;
              }
            }
          }

          rewriteAnchor(elem, "href");
          break;
        }

        // images: img
        case "img": {
          if (elem.hasAttribute("src")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("src"), baseUrl);
            captureRewriteAttr(elem, "src", newUrl);
          }

          if (elem.hasAttribute("srcset")) {
            const rewriteSrcset = scrapbook.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
              return resolveRelativeUrl(url, baseUrl);
            });
            captureRewriteAttr(elem, "srcset", rewriteSrcset);
          }

          const refPolicy = elem.referrerPolicy || docRefPolicy;
          switch (options["capture.image"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The src attribute must be present, and must contain a valid non-empty URL.
              if (elem.hasAttribute("src")) {
                captureRewriteAttr(elem, "src", "about:blank");
              }

              if (elem.hasAttribute("srcset")) {
                captureRewriteAttr(elem, "srcset", null);
              }

              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save-current":
              if (!isHeadless) {
                if (elemOrig?.currentSrc) {
                  const url = elemOrig.currentSrc;
                  captureRewriteAttr(elem, "srcset", null);
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url,
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "src", response.url);
                    return response;
                  });
                }
                break;
              }
              // Headless capture doesn't support currentSrc, fallback to "save".
              // eslint-disable-next-line no-fallthrough
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("src"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "src", response.url);
                  return response;
                });
              }

              if (elem.hasAttribute("srcset")) {
                tasks.push(async () => {
                  const response = await scrapbook.rewriteSrcset(elem.getAttribute("srcset"), async (url) => {
                    return (await downloadFile({
                      url,
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    })).url;
                  });
                  captureRewriteAttr(elem, "srcset", response);
                  return response;
                });
              }

              // remove crossorigin as the origin has changed
              captureRewriteAttr(elem, "crossorigin", null);
              break;
          }
          break;
        }

        // images: picture
        case "picture": {
          for (const subElem of elem.querySelectorAll('source[srcset]')) {
            const rewriteSrcset = scrapbook.rewriteSrcset(subElem.getAttribute("srcset"), (url) => {
              return resolveRelativeUrl(url, baseUrl);
            });
            captureRewriteAttr(subElem, "srcset", rewriteSrcset);
          }

          switch (options["capture.image"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              for (const subElem of elem.querySelectorAll('source[srcset]')) {
                captureRewriteAttr(subElem, "srcset", null);
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save-current":
              if (!isHeadless) {
                for (const subElem of elem.querySelectorAll('img')) {
                  const subElemOrig = origNodeMap.get(subElem);

                  if (subElemOrig?.currentSrc) {
                    // subElem will be further processed in the following loop that handles "img"
                    captureRewriteAttr(subElem, "src", subElemOrig.currentSrc);
                    captureRewriteAttr(subElem, "srcset", null);
                  }
                }

                for (const subElem of elem.querySelectorAll('source[srcset]')) {
                  captureRemoveNode(subElem);
                }

                break;
              }
              // Headless capture doesn't support currentSrc, fallback to "save".
              // eslint-disable-next-line no-fallthrough
            case "save":
            default: {
              const refPolicy = docRefPolicy;
              for (const subElem of elem.querySelectorAll('source[srcset]')) {
                tasks.push(async () => {
                  const response = await scrapbook.rewriteSrcset(subElem.getAttribute("srcset"), async (url) => {
                    const newUrl = resolveRelativeUrl(url, baseUrl);
                    return (await downloadFile({
                      url: newUrl,
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    })).url;
                  });
                  captureRewriteAttr(subElem, "srcset", response);
                  return response;
                });
              }
              break;
            }
          }
          break;
        }

        // media: audio
        case "audio": {
          if (elem.hasAttribute("src")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("src"), baseUrl);
            captureRewriteAttr(elem, "src", newUrl);
          }

          for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
            const newUrl = resolveRelativeUrl(subElem.getAttribute("src"), baseUrl);
            captureRewriteAttr(subElem, "src", newUrl);
          }

          const refPolicy = docRefPolicy;
          switch (options["capture.audio"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("src")) {
                captureRewriteAttr(elem, "src", "about:blank");
              }

              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The src attribute must be present and be a valid non-empty URL.
              for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
                captureRewriteAttr(subElem, "src", "about:blank");
              }

              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save-current":
              if (!isHeadless) {
                if (elemOrig?.currentSrc) {
                  const url = elemOrig.currentSrc;
                  for (const subElem of elem.querySelectorAll('source[src]')) {
                    captureRemoveNode(subElem);
                  }
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url,
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "src", response.url);
                    return response;
                  });
                }

                for (const subElem of elem.querySelectorAll('track[src]')) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: subElem.getAttribute("src"),
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    });
                    captureRewriteAttr(subElem, "src", response.url);
                    return response;
                  });
                }

                break;
              }
              // Headless capture doesn't support currentSrc, fallback to "save".
              // eslint-disable-next-line no-fallthrough
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("src"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "src", response.url);
                  return response;
                });
              }

              for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: subElem.getAttribute("src"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(subElem, "src", response.url);
                  return response;
                });
              }

              // remove crossorigin as the origin has changed
              captureRewriteAttr(elem, "crossorigin", null);
              break;
          }
          break;
        }

        // media: video
        case "video": {
          if (elem.hasAttribute("poster")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("poster"), baseUrl);
            captureRewriteAttr(elem, "poster", newUrl);
          }

          if (elem.hasAttribute("src")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("src"), baseUrl);
            captureRewriteAttr(elem, "src", newUrl);
          }

          for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
            const newUrl = resolveRelativeUrl(subElem.getAttribute("src"), baseUrl);
            captureRewriteAttr(subElem, "src", newUrl);
          }

          const refPolicy = docRefPolicy;
          switch (options["capture.video"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The attribute, if present, must contain a valid non-empty URL.
              if (elem.hasAttribute("poster")) {
                captureRewriteAttr(elem, "poster", null);
              }

              if (elem.hasAttribute("src")) {
                captureRewriteAttr(elem, "src", "about:blank");
              }

              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The src attribute must be present and be a valid non-empty URL.
              for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
                captureRewriteAttr(subElem, "src", "about:blank");
              }

              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save-current":
              if (!isHeadless) {
                if (elem.hasAttribute("poster")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("poster"),
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "poster", response.url);
                    return response;
                  });
                }

                if (elemOrig?.currentSrc) {
                  const url = elemOrig.currentSrc;
                  for (const subElem of elem.querySelectorAll('source[src]')) {
                    captureRemoveNode(subElem);
                  }
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url,
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "src", response.url);
                    return response;
                  });
                }

                for (const subElem of elem.querySelectorAll('track[src]')) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: subElem.getAttribute("src"),
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    });
                    captureRewriteAttr(subElem, "src", response.url);
                    return response;
                  });
                }

                break;
              }
              // Headless capture doesn't support currentSrc, fallback to "save".
              // eslint-disable-next-line no-fallthrough
            case "save":
            default:
              if (elem.hasAttribute("poster")) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("poster"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "poster", response.url);
                  return response;
                });
              }

              if (elem.hasAttribute("src")) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("src"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "src", response.url);
                  return response;
                });
              }

              for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: subElem.getAttribute("src"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(subElem, "src", response.url);
                  return response;
                });
              }

              // remove crossorigin as the origin has changed
              captureRewriteAttr(elem, "crossorigin", null);
              break;
          }
          break;
        }

        // media: embed
        case "embed": {
          if (elem.hasAttribute("src")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("src"), baseUrl);
            captureRewriteAttr(elem, "src", newUrl);
          }

          if (elem.hasAttribute("pluginspage")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("pluginspage"), baseUrl);
            captureRewriteAttr(elem, "pluginspage", newUrl);
          }

          switch (options["capture.embed"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The src attribute, if present, must contain a valid non-empty URL.
              if (elem.hasAttribute("src")) {
                captureRewriteAttr(elem, "src", null);
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              if (elem.hasAttribute("src")) {
                const refPolicy = docRefPolicy;
                tasks.push(async () => {
                  const sourceUrl = elem.getAttribute("src");

                  // skip further processing and keep current src
                  // (point to self, or not resolvable)
                  if (!scrapbook.isUrlAbsolute(sourceUrl)) {
                    return;
                  }

                  // keep original about:blank etc. as the real content is
                  // not accessible
                  if (sourceUrl.startsWith('about:')) {
                    return;
                  }

                  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

                  // headlessly capture
                  const embedSettings = Object.assign({}, settings, {
                    recurseChain: [...settings.recurseChain, refUrl],
                    isMainFrame: false,
                    fullPage: true,
                    usedCssFontUrl: undefined,
                    usedCssImageUrl: undefined,
                  });

                  let embedOptions = options;

                  // special handling for data URL
                  if (sourceUrl.startsWith("data:") &&
                      !options["capture.saveDataUriAsFile"] &&
                      options["capture.saveAs"] !== "singleHtml") {
                    // Save object document and inner URLs as data URL since data URL
                    // is null origin and no relative URL is allowed in it.
                    embedOptions = Object.assign({}, options, {
                      "capture.saveAs": "singleHtml",
                    });
                  }

                  // check circular reference if saving as data URL
                  if (embedOptions["capture.saveAs"] === "singleHtml") {
                    if (embedSettings.recurseChain.includes(sourceUrlMain)) {
                      warn(scrapbook.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                      captureRewriteAttr(elem, "src", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                      return;
                    }
                  }

                  return capturer.captureUrl({
                    url: sourceUrl,
                    refUrl,
                    refPolicy,
                    settings: embedSettings,
                    options: embedOptions,
                  }).catch((ex) => {
                    console.error(ex);
                    warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
                    return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
                  }).then((response) => {
                    captureRewriteAttr(elem, "src", response.url);
                    return response;
                  });
                });
              }
              break;
          }
          break;
        }

        // media: object
        case "object": {
          let objectBaseUrl = baseUrl;

          // Some browsers ignore the codebase attribute (e.g. Chromium).
          // We follow it anyway.
          if (elem.hasAttribute("codebase")) {
            objectBaseUrl = resolveRelativeUrl(elem.getAttribute("codebase"), objectBaseUrl);
            captureRewriteAttr(elem, "codebase", null);
          }

          // According to doc, classid is resolved using codebase, although
          // it's usually an absolute non-http URI.
          // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/object
          if (elem.hasAttribute("classid")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("classid"), objectBaseUrl);
            captureRewriteAttr(elem, "classid", newUrl);
          }

          if (elem.hasAttribute("data")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("data"), objectBaseUrl);
            captureRewriteAttr(elem, "data", newUrl);
          }

          if (elem.hasAttribute("archive")) {
            const newUrls = scrapbook.rewriteUrls(elem.getAttribute("archive"), (url) => {
              return resolveRelativeUrl(url, objectBaseUrl);
            });
            captureRewriteAttr(elem, "archive", newUrls);
          }

          switch (options["capture.object"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              // HTML 5.1 2nd Edition / W3C Recommendation:
              // The data attribute, if present, must be a valid non-empty URL.
              if (elem.hasAttribute("data")) {
                captureRewriteAttr(elem, "data", null);
              }

              if (elem.hasAttribute("archive")) {
                captureRewriteAttr(elem, "archive", null);
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default: {
              const refPolicy = docRefPolicy;
              if (elem.hasAttribute("data")) {
                tasks.push(async () => {
                  const sourceUrl = elem.getAttribute("data");

                  // skip further processing and keep current src
                  // (point to self, or not resolvable)
                  if (!scrapbook.isUrlAbsolute(sourceUrl)) {
                    return;
                  }

                  // keep original about:blank etc. as the real content is
                  // not accessible
                  if (sourceUrl.startsWith('about:')) {
                    return;
                  }

                  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

                  // headlessly capture
                  const objectSettings = Object.assign({}, settings, {
                    recurseChain: [...settings.recurseChain, refUrl],
                    isMainFrame: false,
                    fullPage: true,
                    usedCssFontUrl: undefined,
                    usedCssImageUrl: undefined,
                  });

                  let objectOptions = options;

                  // special handling for data URL
                  if (sourceUrl.startsWith("data:") &&
                      !options["capture.saveDataUriAsFile"] &&
                      options["capture.saveAs"] !== "singleHtml") {
                    // Save object document and inner URLs as data URL since data URL
                    // is null origin and no relative URL is allowed in it.
                    objectOptions = Object.assign({}, options, {
                      "capture.saveAs": "singleHtml",
                    });
                  }

                  // check circular reference if saving as data URL
                  if (objectOptions["capture.saveAs"] === "singleHtml") {
                    if (objectSettings.recurseChain.includes(sourceUrlMain)) {
                      warn(scrapbook.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                      captureRewriteAttr(elem, "data", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                      return;
                    }
                  }

                  return capturer.captureUrl({
                    url: sourceUrl,
                    refUrl,
                    refPolicy,
                    settings: objectSettings,
                    options: objectOptions,
                  }).catch(async (ex) => {
                    console.error(ex);
                    warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
                    return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
                  }).then(async (response) => {
                    captureRewriteAttr(elem, "data", response.url);
                    return response;
                  });
                });
              }

              // plugins referenced by legacy archive are static and do not require rewriting
              if (elem.hasAttribute("archive")) {
                tasks.push(async () => {
                  const response = await scrapbook.rewriteUrls(elem.getAttribute("archive"), async (url) => {
                    return (await downloadFile({
                      url,
                      refUrl,
                      refPolicy,
                      settings,
                      options,
                    })).url;
                  });
                  captureRewriteAttr(elem, "archive", response);
                  return response;
                });
              }
              break;
            }
          }
          break;
        }

        // media: applet
        case "applet": {
          let appletBaseUrl = baseUrl;

          if (elem.hasAttribute("codebase")) {
            appletBaseUrl = resolveRelativeUrl(elem.getAttribute("codebase"), appletBaseUrl);
            captureRewriteAttr(elem, "codebase", null);
          }

          // According to doc, classid is used by applet.
          // http://help.dottoro.com/lhbvlpge.php
          if (elem.hasAttribute("classid")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("classid"), appletBaseUrl);
            captureRewriteAttr(elem, "classid", newUrl);
          }

          if (elem.hasAttribute("code")) {
            let newUrl = resolveRelativeUrl(elem.getAttribute("code"), appletBaseUrl);
            captureRewriteAttr(elem, "code", newUrl);
          }

          if (elem.hasAttribute("archive")) {
            let newUrl = resolveRelativeUrl(elem.getAttribute("archive"), appletBaseUrl);
            captureRewriteAttr(elem, "archive", newUrl);
          }

          switch (options["capture.applet"]) {
            case "link":
              // do nothing
              break;
            case "blank":
              if (elem.hasAttribute("code")) {
                captureRewriteAttr(elem, "code", null);
              }

              if (elem.hasAttribute("archive")) {
                captureRewriteAttr(elem, "archive", null);
              }
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default: {
              const refPolicy = docRefPolicy;
              if (elem.hasAttribute("code")) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("code"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "code", response.url);
                  return response;
                });
              }

              if (elem.hasAttribute("archive")) {
                tasks.push(async () => {
                  const response = await downloadFile({
                    url: elem.getAttribute("archive"),
                    refUrl,
                    refPolicy,
                    settings,
                    options,
                  });
                  captureRewriteAttr(elem, "archive", response.url);
                  return response;
                });
              }
              break;
            }
          }
          break;
        }

        // media: canvas
        case "canvas": {
          switch (options["capture.canvas"]) {
            case "blank":
              // do nothing
              break;
            case "remove":
              captureRemoveNode(elem);
              return;
            case "save":
            default:
              // we get only blank canvas in headless capture
              if (isHeadless || !elemOrig) { break; }

              try {
                const data = elemOrig.toDataURL();
                if (data !== scrapbook.getBlankCanvasData(elemOrig)) {
                  elem.setAttribute("data-scrapbook-canvas", data);
                  requireBasicLoader = true;
                }
              } catch (ex) {
                console.error(ex);
              }

              break;
          }
          break;
        }

        case "form": {
          if (elem.hasAttribute("action")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("action"), baseUrlFinal, {checkJavascript: true});
            captureRewriteAttr(elem, "action", newUrl);
          }
          break;
        }

        // form: input
        case "input": {
          switch (elem.type.toLowerCase()) {
            // form: input (image)
            // images: input
            case "image": {
              if (elem.hasAttribute("formaction")) {
                const newUrl = resolveRelativeUrl(elem.getAttribute("formaction"), baseUrlFinal, {checkJavascript: true});
                captureRewriteAttr(elem, "formaction", newUrl);
              }

              if (elem.hasAttribute("src")) {
                const newUrl = resolveRelativeUrl(elem.getAttribute("src"), baseUrl);
                captureRewriteAttr(elem, "src", newUrl);
              }
              switch (options["capture.image"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The src attribute must be present, and must contain a valid non-empty URL.
                  if (elem.hasAttribute("src")) {
                    captureRewriteAttr(elem, "src", "about:blank");
                  }
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save-current":
                  // srcset and currentSrc are not supported, do the same as save
                  // eslint-disable-next-line no-fallthrough
                case "save":
                default: {
                  if (elem.hasAttribute("src")) {
                    const refPolicy = docRefPolicy;
                    tasks.push(async () => {
                      const response = await downloadFile({
                        url: elem.getAttribute("src"),
                        refUrl,
                        refPolicy,
                        settings,
                        options,
                      });
                      captureRewriteAttr(elem, "src", response.url);
                      return response;
                    });
                  }
                  break;
                }
              }
              break;
            }
            // form: input (file)
            case "file": {
              break;
            }
            // form: input (password)
            case "password": {
              switch (options["capture.formStatus"]) {
                case "save-all":
                  if (elemOrig) {
                    const value = elemOrig.value;
                    if (value !== elem.getAttribute('value')) {
                      elem.setAttribute("data-scrapbook-input-value", value);
                      requireBasicLoader = true;
                    }
                  }
                  break;
                case "keep-all":
                case "html-all":
                  if (elemOrig) {
                    captureRewriteAttr(elem, "value", elemOrig.value);
                  }
                  break;
                case "save":
                case "keep":
                case "html":
                case "reset":
                default:
                  // do nothing
                  break;
              }
              break;
            }
            // form: input (radio, checkbox)
            case "radio":
            case "checkbox": {
              switch (options["capture.formStatus"]) {
                case "save-all":
                case "save":
                  if (elemOrig) {
                    const checked = elemOrig.checked;
                    if (checked !== elem.hasAttribute('checked')) {
                      elem.setAttribute("data-scrapbook-input-checked", checked);
                      requireBasicLoader = true;
                    }
                    const indeterminate = elemOrig.indeterminate;
                    if (indeterminate && elem.type.toLowerCase() === 'checkbox') {
                      elem.setAttribute("data-scrapbook-input-indeterminate", "");
                      requireBasicLoader = true;
                    }
                  }
                  break;
                case "keep-all":
                case "keep":
                  if (elemOrig) {
                    const indeterminate = elemOrig.indeterminate;
                    if (indeterminate && elem.type.toLowerCase() === 'checkbox') {
                      elem.setAttribute("data-scrapbook-input-indeterminate", "");
                      requireBasicLoader = true;
                    }
                  }
                  // eslint-disable-next-line no-fallthrough
                case "html-all":
                case "html":
                  if (elemOrig) {
                    captureRewriteAttr(elem, "checked", elemOrig.checked);
                  }
                  break;
                case "reset":
                default:
                  // do nothing
                  break;
              }
              break;
            }
            // form: input (submit)
            case "submit": {
              if (elem.hasAttribute("formaction")) {
                const newUrl = resolveRelativeUrl(elem.getAttribute("formaction"), baseUrlFinal, {checkJavascript: true});
                captureRewriteAttr(elem, "formaction", newUrl);
              }
            }
            // form: input (other)
            // eslint-disable-next-line no-fallthrough
            default: {
              switch (options["capture.formStatus"]) {
                case "save-all":
                case "save":
                  if (elemOrig) {
                    const value = elemOrig.value;
                    if (value !== elem.getAttribute('value')) {
                      elem.setAttribute("data-scrapbook-input-value", value);
                      requireBasicLoader = true;
                    }
                  }
                  break;
                case "keep-all":
                case "keep":
                case "html-all":
                case "html":
                  if (elemOrig) {
                    captureRewriteAttr(elem, "value", elemOrig.value);
                  }
                  break;
                case "reset":
                default:
                  // do nothing
                  break;
              }
              break;
            }
          }
          break;
        }

        // form: button
        case "button": {
          if (elem.hasAttribute("formaction")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("formaction"), baseUrlFinal, {checkJavascript: true});
            captureRewriteAttr(elem, "formaction", newUrl);
          }
          break;
        }

        // form: option
        case "option": {
          switch (options["capture.formStatus"]) {
            case "save-all":
            case "save":
              if (elemOrig) {
                const selected = elemOrig.selected;
                if (selected !== elem.hasAttribute('selected')) {
                  elem.setAttribute("data-scrapbook-option-selected", selected);
                  requireBasicLoader = true;
                }
              }
              break;
            case "keep-all":
            case "keep":
            case "html-all":
            case "html":
              if (elemOrig) {
                captureRewriteAttr(elem, "selected", elemOrig.selected);
              }
              break;
            case "reset":
            default:
              // do nothing
              break;
          }
          break;
        }

        // form: textarea
        case "textarea": {
          switch (options["capture.formStatus"]) {
            case "save-all":
            case "save":
              if (elemOrig) {
                const value = elemOrig.value;
                if (value !== elem.textContent) {
                  elem.setAttribute("data-scrapbook-textarea-value", value);
                  requireBasicLoader = true;
                }
              }
              break;
            case "keep-all":
            case "keep":
            case "html-all":
            case "html":
              if (elemOrig) {
                captureRewriteTextContent(elem, elemOrig.value);
              }
              break;
            case "reset":
            default:
              // do nothing
              break;
          }
          break;
        }

        // cite
        case "q":
        case "blockquote":
        case "ins":
        case "del": {
          if (elem.hasAttribute("cite")) {
            const newUrl = resolveRelativeUrl(elem.getAttribute("cite"), baseUrlFinal);
            captureRewriteAttr(elem, "cite", newUrl);
          }
          break;
        }

        // slot
        case "slot": {
          const root = elem.getRootNode();
          if (!(root instanceof ShadowRoot && root.slotAssignment === 'manual')) {
            break;
          }

          const elemOrig = origNodeMap.get(elem);
          const ids = [];
          for (const targetNodeOrig of elemOrig.assignedNodes()) {
            const targetNode = clonedNodeMap.get(targetNodeOrig);
            let id = slotMap.get(targetNode);
            if (typeof id === 'undefined') {
              id = slotMap.size;
              slotMap.set(targetNode, id);
            }
            if (targetNode.nodeType === 1) {
              targetNode.setAttribute("data-scrapbook-slot-index", id);
            } else {
              targetNode.before(document.createComment(`scrapbook-slot-index=${id}`));
              targetNode.after(document.createComment(`/scrapbook-slot-index`));
            }
            ids.push(id);
          }
          if (ids.length) {
            elem.setAttribute("data-scrapbook-slot-assigned", ids.join(','));
          }
          break;
        }

        // xmp
        case "xmp": {
          // escape </xmp> as textContent can contain HTML
          elem.textContent = elem.textContent.replace(/<\/(xmp>)/gi, "<\\/$1");
          break;
        }
      }

      // handle shadow DOM
      if (options["capture.shadowDom"] === "save") {
        const shadowRoot = scrapbook.getShadowRoot(elem);
        if (shadowRoot) {
          const shadowRootOrig = origNodeMap.get(shadowRoot);
          cssTasks.push(() => { cssResourcesHandler.scopePush(shadowRootOrig); });
          addAdoptedStyleSheets(shadowRootOrig, shadowRoot);
          rewriteRecursively(shadowRoot, rootName, rewriteNode);
          cssTasks.push(() => { cssResourcesHandler.scopePop(); });
          shadowRootList.push(shadowRoot);
          requireBasicLoader = true;
        }
      }

      // handle nonce
      switch (options["capture.contentSecurityPolicy"]) {
        case "save":
          // do nothing
          break;
        case "remove":
        default:
          captureRewriteAttr(elem, "nonce", null); // this is meaningless as CSP is removed
          break;
      }
    }

    // styles: style attribute
    if (elem.hasAttribute("style")) {
      const baseUrlCurrent = baseUrl;
      const refPolicy = docRefPolicy;
      const style = elem.style;
      if (style) {
        cssTasks.push(async () => {
          await cssResourcesHandler.inspectStyle({
            style,
            baseUrl: baseUrlCurrent,
            isInline: true,
          });
        });
      }

      switch (options["capture.styleInline"]) {
        case "blank":
          captureRewriteAttr(elem, "style", "");
          break;
        case "remove":
          captureRewriteAttr(elem, "style", null);
          break;
        case "save":
        default:
          switch (options["capture.rewriteCss"]) {
            case "url": {
              tasks.push(async () => {
                const response = await cssHandler.rewriteCssText({
                  cssText: elem.getAttribute("style"),
                  baseUrl: baseUrlCurrent,
                  refUrl,
                  refPolicy,
                  envCharset: charset,
                  isInline: true,
                  settings: {
                    usedCssFontUrl: undefined,
                    usedCssImageUrl: undefined,
                  },
                });
                captureRewriteAttr(elem, "style", response);
                return response;
              });
              break;
            }
            case "tidy":
            case "match": {
              tasks.push(async () => {
                const response = await cssHandler.rewriteCssText({
                  cssText: elem.style.cssText,
                  baseUrl: baseUrlCurrent,
                  refUrl,
                  refPolicy,
                  envCharset: charset,
                  isInline: true,
                  settings: {
                    usedCssFontUrl: undefined,
                    usedCssImageUrl: undefined,
                  },
                });
                captureRewriteAttr(elem, "style", response);
                return response;
              });
              break;
            }
            case "none":
            default: {
              // do nothing
              break;
            }
          }
          break;
      }
    }

    // scripts: script-like attributes (on* attributes)
    switch (options["capture.script"]) {
      case "save":
      case "link":
        // do nothing
        break;
      case "blank":
      case "remove":
      default:
        // removing an attribute shrinks elem.attributes list
        Array.prototype.filter.call(
          elem.attributes,
          attr => attr.name.toLowerCase().startsWith("on"),
        ).forEach((attr) => {
          captureRewriteAttr(elem, attr.name, null);
        });
        break;
    }

    // record custom elements
    {
      const nodeName = elem.nodeName.toLowerCase();
      if (CUSTOM_ELEMENT_NAME_PATTERN.test(nodeName) && !CUSTOM_ELEMENT_NAME_FORBIDDEN.has(nodeName)) {
        customElementNames.add(nodeName);
      }
    }

    return elem;
  };

  const addAdoptedStyleSheets = (docOrShadowRoot, root) => {
    if (['blank', 'remove'].includes(options["capture.style"]) || options["capture.adoptedStyleSheet"] !== "save") {
      return;
    }
    const baseUrlCurrent = baseUrl;
    const refPolicy = docRefPolicy;
    const infos = [];
    for (const css of scrapbook.getAdoptedStyleSheets(docOrShadowRoot)) {
      let info = adoptedStyleSheetMap.get(css);
      if (info) {
        info.roots.push(root);
      } else {
        info = {
          id: adoptedStyleSheetMap.size,
          roots: [root],
        };
        adoptedStyleSheetMap.set(css, info);
      }
      infos.push(info);
      cssTasks.push(async () => {
        await cssResourcesHandler.inspectCss({
          css,
          baseUrl: baseUrlCurrent,
          refUrl,
          refPolicy,
          envCharset: charset,
          root,
        });
      });
    }
    if (infos.length) {
      const elem = root.host || root;
      elem.setAttribute("data-scrapbook-adoptedstylesheets", infos.map(x => x.id).join(','));
    }
  };

  const {doc = document, settings, options} = params;
  const {timeId, isMainPage, isMainFrame} = settings;
  const {documentElement: docElemNode, characterSet: charset} = doc;
  const isHeadless = !doc.defaultView;

  // determine docUrl, baseUrl, etc.
  const [metaDocUrl, metaDocUrlHash] = scrapbook.splitUrlByAnchor(params.metaDocUrl || doc.URL);
  const [docUrl, docUrlHash] = scrapbook.splitUrlByAnchor(params.docUrl || doc.URL);

  // baseUrl: updates dynamically when the first base[href] is parsed.
  // baseUrlFallback: the initial baseUrl, used for resolving base elements.
  // baseUrlFinal: the final baseUrl, used for resolving links etc.
  // refUrl: used as the referrer when retrieving resources. Actually same
  //     as baseUrlFallback.
  //
  // URLs in the document are usually resolved using baseUrl, which can be
  // dynamically changed when the first <base href="..."> element is parsed
  // or when it's "href" attribute changes.
  //
  // Nevertheless, links and citations should be updated when the baseUrl
  // changes, such as a[href], a[ping], q[cite]. As a result, they should
  // be resolved using baseUrlFinal.
  //
  // Normally baseUrl should be equivalent to baseUrlFinal as base[href]
  // should appear at first according to spec. Though we still implement
  // dynamic baseUrl for a bad document with an URL before base[href].
  //
  // ref: https://html.spec.whatwg.org/#dynamic-changes-to-base-urls
  const baseUrlFallback = scrapbook.splitUrlByAnchor(params.baseUrl || docUrl)[0];
  let baseUrl = baseUrlFallback;
  const baseUrlFinal = (() => {
    let base = baseUrlFallback;
    for (const elem of doc.querySelectorAll('base[href]')) {
      if (elem.closest('svg, math')) { continue; }
      base = new URL(elem.getAttribute('href'), baseUrlFallback).href;
      base = scrapbook.splitUrlByAnchor(base)[0];
      break;
    }
    return base;
  })();
  const refUrl = docUrl;
  let seenBaseElem = false;

  // determine mime
  const mime = params.mime || doc.contentType;

  let docRefPolicy = capturer.isAboutUrl(metaDocUrl) ? (params.refPolicy || "") : "";

  if (isMainPage && isMainFrame) {
    if (!settings.type) {
      settings.type = (parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options['capture.saveAs'] !== 'singleHtml') ?
        'site' :
        'document';
    }
    settings.indexFilename = settings.indexFilename || await capturer.formatIndexFilename({
      title: settings.title || doc.title || scrapbook.filenameParts(scrapbook.urlToFilename(docUrl))[0] || "untitled",
      sourceUrl: docUrl,
      isFolder: options["capture.saveAs"] === "folder",
      settings,
      options,
    });
  }

  // register the main document before parsing so that it goes before
  // sub-frame documents.
  const registry = await capturer.invoke("registerDocument", {
    docUrl,
    mime,
    role: (options["capture.saveAs"] === "singleHtml" || (docUrl.startsWith("data:") && !options["capture.saveDataUriAsFile"])) ? undefined :
        (isMainFrame || (isHeadless && !capturer.isAboutUrl(metaDocUrl))) ? "document" :
        `document-${scrapbook.getUuid()}`,
    settings,
    options,
  });

  // if a previous registry exists, return it (except for the main document,
  // which should only happen during a merge capture)
  if (registry.isDuplicate && !(isMainPage && isMainFrame)) {
    return Object.assign({}, registry, {
      url: capturer.getRedirectedUrl(registry.url, docUrlHash),
      sourceUrl: docUrl,
    });
  }

  const documentFileName = registry.filename;

  // group sub-frames with same filename
  if (isMainFrame) {
    settings.documentName = scrapbook.filenameParts(documentFileName)[0];
  }

  // construct the cloned node tree
  const origNodeMap = new WeakMap();
  const clonedNodeMap = new WeakMap();
  const shadowRootList = [];
  const slotMap = new Map();
  const adoptedStyleSheetMap = new Map();
  const customElementNames = new Set();

  // create a new document to replicate nodes via import
  const newDoc = scrapbook.cloneDocument(doc, {origNodeMap, clonedNodeMap});

  let rootNode, headNode;
  let selection = settings.fullPage ? null : scrapbook.getSelection(doc);
  {
    if (selection?.type !== 'Range') {
      selection = null;
    }

    if (selection) {
      // capture selection: clone selected ranges
      const cloneNodeAndAncestors = (node) => {
        const nodeChain = [];
        let tmpNode = node;

        while (!clonedNodeMap.has(tmpNode)) {
          nodeChain.unshift(tmpNode);
          tmpNode = tmpNode.parentNode;
        }

        for (tmpNode of nodeChain) {
          const newParentNode = clonedNodeMap.get(tmpNode.parentNode);
          const newNode = cloneNodeMapping(tmpNode, false);
          newParentNode.appendChild(newNode);
        }
      };

      // #text, CDATA, COMMENT
      const isTextNode = (node) => {
        return [3, 4, 8].includes(node.nodeType);
      };

      // @FIXME: handle sparsely selected table cells
      let curRange, caNode, scNode, ecNode, lastTextNode;
      for (curRange of scrapbook.getSelectionRanges(selection)) {
        // skip a collapsed range
        if (curRange.collapsed) {
          continue;
        }

        caNode = curRange.commonAncestorContainer;

        // @TODO:
        // A selection in a shadow root requires special care.
        // Currently treat as selecting the topmost host for simplicity and
        // prevent an issue if capturing shadow DOM is disabled.
        handleShadowRoot: {
          let selNode = caNode;
          let selNodeRoot = selNode.getRootNode();
          while (selNodeRoot instanceof ShadowRoot) {
            selNode = selNodeRoot.host;
            selNodeRoot = selNode.getRootNode();
          }
          if (selNode !== caNode) {
            curRange = new Range();
            curRange.selectNode(selNode);
            caNode = curRange.commonAncestorContainer;
          }
        }

        scNode = curRange.startContainer;
        ecNode = curRange.endContainer;

        // Clone nodes from root to common ancestor.
        // (with special handling of text nodes)
        const refNode = (isTextNode(caNode)) ? caNode.parentNode : caNode;
        let clonedRefNode = clonedNodeMap.get(refNode);
        if (!clonedRefNode) {
          cloneNodeAndAncestors(refNode);
          clonedRefNode = clonedNodeMap.get(refNode);
        }

        // Add splitter between multiple ranges of the same text-like node.
        if (scNode === lastTextNode) {
          clonedRefNode.appendChild(newDoc.createComment("scrapbook-capture-selected-splitter"));
          if (scNode.nodeType === 8) {
            clonedRefNode.appendChild(newDoc.createComment(" … "));
          } else {
            clonedRefNode.appendChild(newDoc.createTextNode(" … "));
          }
          clonedRefNode.appendChild(newDoc.createComment("/scrapbook-capture-selected-splitter"));
        }

        // Clone sparingly selected nodes in the common ancestor.
        // (with special handling of text nodes)
        clonedRefNode.appendChild(newDoc.createComment("scrapbook-capture-selected"));
        {
          const iterator = doc.createNodeIterator(refNode, NodeFilter.SHOW_ALL & ~NodeFilter.SHOW_DOCUMENT);
          let node;
          let nodeRange = doc.createRange();
          while (node = iterator.nextNode()) {
            nodeRange.selectNode(node);

            if (nodeRange.compareBoundaryPoints(Range.START_TO_START, curRange) < 0) {
              // before start
              if (node === scNode && isTextNode(node) &&
                  nodeRange.compareBoundaryPoints(Range.START_TO_END, curRange) > 0) {
                let start = curRange.startOffset;
                let end = (node === ecNode) ? curRange.endOffset : undefined;
                cloneNodeAndAncestors(node.parentNode);
                const newParentNode = clonedNodeMap.get(node.parentNode);
                const newNode = node.cloneNode(false);
                newNode.nodeValue = node.nodeValue.slice(start, end);
                newParentNode.appendChild(newNode);
                lastTextNode = node;
              }
              continue;
            }

            if (nodeRange.compareBoundaryPoints(Range.END_TO_END, curRange) > 0) {
              // after end
              if (node === ecNode && isTextNode(node) &&
                  nodeRange.compareBoundaryPoints(Range.END_TO_START, curRange) < 0) {
                let start = 0;
                let end = curRange.endOffset;
                cloneNodeAndAncestors(node.parentNode);
                const newParentNode = clonedNodeMap.get(node.parentNode);
                const newNode = node.cloneNode(false);
                newNode.nodeValue = node.nodeValue.slice(start, end);
                newParentNode.appendChild(newNode);
                lastTextNode = node;
              }
              continue;
            }

            // clone the node
            cloneNodeAndAncestors(node);
          }
        }
        clonedRefNode.appendChild(newDoc.createComment("/scrapbook-capture-selected"));
      }

      // clone doctype if not yet done
      {
        const doctypeNode = doc.doctype;
        if (doctypeNode) {
          if (!clonedNodeMap.has(doctypeNode)) {
            newDoc.insertBefore(cloneNodeMapping(doctypeNode, false), newDoc.firstChild);
          }
        }
      }

      // clone html if not yet done
      rootNode = clonedNodeMap.get(docElemNode);
      if (!rootNode) {
        cloneNodeAndAncestors(docElemNode);
        rootNode = clonedNodeMap.get(docElemNode);
      }

      // clone head if not yet done
      // (treated as all head is selected if not involved yet)
      // generate one if not exist
      if (rootNode.nodeName.toLowerCase() === "html") {
        headNode = doc.head;
        let headNodeNew = clonedNodeMap.get(headNode);
        if (headNodeNew) {
          headNode = headNodeNew;
        } else {
          if (headNode) {
            headNode = cloneNodeMapping(headNode, true);
          } else {
            headNode = newDoc.createElement("head");
            captureRecordAddedNode(headNode);
          }
          rootNode.insertBefore(headNode, rootNode.firstChild);
        }
      }
    } else {
      // not capture selection: clone all nodes
      for (const node of doc.childNodes) {
        newDoc.appendChild(cloneNodeMapping(node, true));
      }
      rootNode = newDoc.documentElement;

      // generate head if not exists
      if (rootNode.nodeName.toLowerCase() === "html") {
        headNode = newDoc.head;
        if (!headNode) {
          headNode = rootNode.insertBefore(newDoc.createElement("head"), rootNode.firstChild);
          captureRecordAddedNode(headNode);
        }
      }
    }

    // add linefeeds to head and body to improve layout
    if (options["capture.prettyPrint"]) {
      if (rootNode.nodeName.toLowerCase() === "html") {
        const headNodeBefore = headNode.previousSibling;
        if (!headNodeBefore || headNodeBefore.nodeType != 3) {
          headNode.before("\n");
        }
        const headNodeStart = headNode.firstChild;
        if (!headNodeStart || headNodeStart.nodeType != 3) {
          headNode.prepend("\n");
        }
        const headNodeEnd = headNode.lastChild;
        if (!headNodeEnd || headNodeEnd.nodeType != 3) {
          headNode.append("\n");
        }
        const headNodeAfter = headNode.nextSibling;
        if (!headNodeAfter || headNodeAfter.nodeType != 3) {
          headNode.after("\n");
        }
        const bodyNode = rootNode.querySelector("body");
        if (bodyNode) {
          const bodyNodeAfter = bodyNode.nextSibling;
          if (!bodyNodeAfter) {
            bodyNode.after("\n");
          }
        }
      }
    }
  }

  // remove webscrapbook toolbar related
  rootNode.removeAttribute('data-scrapbook-toolbar-active');
  for (const elem of rootNode.querySelectorAll(`[data-scrapbook-elem|="toolbar"]`)) {
    elem.remove();
  }

  // preprocess with helpers
  // Expect options["capture.helpers"] to be parsable when
  // options["capture.helpersEnabled"] is trthy, as validated in
  // `capturer.captureGeneral`.
  if (options["capture.helpersEnabled"]) {
    const helpers = scrapbook.parseOption("capture.helpers", options["capture.helpers"]);
    const parser = new CaptureHelperHandler({
      helpers,
      rootNode,
      docUrl,
      origNodeMap,
      options,
    });
    const result = parser.run();

    if (result.errors.length) {
      (async () => {
        for (const error of result.errors) {
          await warn(error);
        }
      })();
    }
  }

  // init cssHandler
  const cssHandler = new DocumentCssHandler({
    doc, rootNode: newDoc,
    origNodeMap, clonedNodeMap,
    settings, options,
  });
  const cssResourcesHandler = new DocumentCssResourcesHandler(cssHandler);

  // prepare favicon selector
  const favIconSelector = scrapbook.split(options["capture.faviconAttrs"])
    .map(attr => `[rel~="${CSS.escape(attr)}"][href]`)
    .join(', ');

  // inspect all nodes (and register async tasks) -->
  // some additional tasks that requires some data after nodes are inspected -->
  // start async tasks and wait for them to complete -->
  // finalize
  const cssTasks = [];
  const tasks = [];
  const downLinkTasks = [];

  // add extra URLs with depth 0
  if (settings.isMainPage && settings.isMainFrame) {
    if (["header", "url"].includes(options["capture.downLink.file.mode"]) ||
        (parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options['capture.saveAs'] !== 'singleHtml')) {
      const downLinkSettings = Object.assign({}, settings, {
        depth: 0,
        isMainPage: false,
        isMainFrame: true,
      });
      const urls = scrapbook.parseOption("capture.downLink.urlExtra", options["capture.downLink.urlExtra"]);
      for (const url of urls) {
        downLinkTasks.push(async () => {
          const response = await capturer.captureUrl({
            url,
            refUrl,
            downLink: true,
            downLinkExtra: true,
            settings: downLinkSettings,
            options,
          })
          .catch((ex) => {
            console.error(ex);
            warn(scrapbook.lang("ErrorFileDownloadError", [url, ex.message]));
            return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
          });
          return response;
        });
      }
    }
  }

  // inspect nodes
  let metaCharsetNode;
  let favIconUrl;
  let requireBasicLoader = false;
  addAdoptedStyleSheets(doc, rootNode);
  rewriteRecursively(rootNode, null, rewriteNode);

  // record metadata
  if (options["capture.recordDocumentMeta"]) {
    let url = metaDocUrl.startsWith("data:") ? "data:" : metaDocUrl;

    // add hash only for index.html as subframes with different hash
    // must share the same file and record (e.g. foo.html and foo.html#bar)
    if (isMainPage && isMainFrame && mime === "text/html") {
      url += docUrlHash;
    }

    rootNode.setAttribute("data-scrapbook-source", url);

    // record item metadata for index.html
    if (isMainPage && isMainFrame && mime === "text/html") {
      rootNode.setAttribute("data-scrapbook-create", timeId);

      if (settings.title) {
        rootNode.setAttribute("data-scrapbook-title", settings.title);
      }

      if (settings.favIconUrl) {
        rootNode.setAttribute("data-scrapbook-icon", settings.favIconUrl);
      }

      if (settings.type !== 'document') {
        rootNode.setAttribute("data-scrapbook-type", settings.type);
      }
    }
  }

  // handle meta charset and favicon
  if (rootNode.nodeName.toLowerCase() === "html") {
    if (!metaCharsetNode) {
      metaCharsetNode = headNode.insertBefore(newDoc.createElement("meta"), headNode.firstChild);
      metaCharsetNode.setAttribute("charset", "UTF-8");
      captureRecordAddedNode(metaCharsetNode);
      if (options["capture.prettyPrint"]) {
        metaCharsetNode.before("\n");
      }
    }

    // attempt to take site favicon if none yet
    if (!favIconUrl) {
      switch (options["capture.favicon"]) {
        case "blank":
        case "remove":
          break;
        case "link":
        case "save":
        default: {
          const u = new URL(docUrl);
          if (!['http:', 'https:'].includes(u.protocol)) {
            break;
          }

          const refPolicy = docRefPolicy;
          const url = u.origin + '/' + 'favicon.ico';
          tasks.push(async () => {
            const fetchResponse = await capturer.invoke("fetch", {
              url: url,
              refUrl,
              refPolicy,
              settings,
              options,
            });
            if (!fetchResponse.error) {
              const favIconNode = headNode.appendChild(newDoc.createElement('link'));
              favIconNode.rel = 'shortcut icon';
              favIconNode.href = favIconUrl = url;
              captureRecordAddedNode(favIconNode);
              if (options["capture.prettyPrint"]) {
                favIconNode.after("\n");
              }
              if (options["capture.favicon"] !== "link") {
                const response = await downloadFile({
                  url,
                  refUrl,
                  refPolicy,
                  settings,
                  options,
                });
                favIconNode.href = favIconUrl = response.url;
              }
            }
          });
          break;
        }
      }
    }
  }

  // handle adoptedStyleSheets
  if (adoptedStyleSheetMap.size && !["blank", "remove"].includes(options["capture.style"])) {
    const baseUrlCurrent = baseUrl;
    const refPolicy = docRefPolicy;
    const option = options["capture.rewriteCss"];
    for (const [css, {id, roots}] of adoptedStyleSheetMap) {
      tasks.push(async () => {
        let cssText;
        switch (option) {
          case "url":
          case "tidy":
          case "match": {
            cssText = await cssHandler.rewriteCssRules({
              cssRules: css.cssRules,
              baseUrl: baseUrlCurrent,
              refUrl,
              refPolicy,
              envCharset: charset,
              refCss: css,
              rootNode: option === 'match' ? roots : null,
              sep: '\n\n',
              settings,
              options,
            });
            break;
          }
          case "none":
          default: {
            cssText = Array.prototype.map.call(css.cssRules, x => x.cssText).join('\n\n');
            break;
          }
        }
        rootNode.setAttribute(`data-scrapbook-adoptedstylesheet-${id}`, cssText);
      });
    }
    requireBasicLoader = true;
  }

  // map used background images and fonts
  if ((options["capture.imageBackground"] === "save-used" || options["capture.font"] === "save-used") && !isHeadless) {
    cssTasks.unshift(() => { cssResourcesHandler.start(); });
    cssTasks.push(() => { cssResourcesHandler.stop(); });
    await cssTasks.reduce((prevTask, curTask) => {
      return prevTask.then(curTask);
    }, Promise.resolve());

    // expose filter to settings
    if (options["capture.imageBackground"] === "save-used") {
      settings.usedCssImageUrl = cssResourcesHandler.usedImageUrls;
    }
    if (options["capture.font"] === "save-used") {
      settings.usedCssFontUrl = cssResourcesHandler.usedFontUrls;
    }
  }

  // run async downloading tasks
  if (options["capture.saveResourcesSequentially"]) {
    await tasks.reduce((prevTask, curTask) => {
      return prevTask.then(curTask);
    }, Promise.resolve());
  } else {
    await Promise.all(tasks.map(task => task()));
  }

  // run downLink tasks sequentially
  await downLinkTasks.reduce((prevTask, curTask) => {
    return prevTask.then(curTask);
  }, Promise.resolve());

  // record after the content of all nested shadow roots have been processed
  for (const shadowRoot of shadowRootList) {
    const host = shadowRoot.host;
    host.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
    if (shadowRoot.mode !== 'open') {
      host.setAttribute("data-scrapbook-shadowdom-mode", shadowRoot.mode);
    }
    if (shadowRoot.clonable) {
      host.setAttribute("data-scrapbook-shadowdom-clonable", "");
    }
    if (shadowRoot.delegatesFocus) {
      host.setAttribute("data-scrapbook-shadowdom-delegates-focus", "");
    }
    if (shadowRoot.serializable) {
      host.setAttribute("data-scrapbook-shadowdom-serializable", "");
    }
    if (shadowRoot.slotAssignment && shadowRoot.slotAssignment !== 'named') {
      host.setAttribute("data-scrapbook-shadowdom-slot-assignment", shadowRoot.slotAssignment);
    }
  }

  // attach CSS resource map
  if (cssHandler.resourceMap && Object.keys(cssHandler.resourceMap).length) {
    const elem = newDoc.createElement('style');
    elem.setAttribute("data-scrapbook-elem", "css-resource-map");
    elem.textContent = ':root {'
        + Object.entries(cssHandler.resourceMap).map(([k, v]) => `${v}:url("${k}");`).join('')
        + '}';
    headNode.appendChild(elem);
  }

  // add a dummy custom element registration to prevent breaking :defined css rule
  // if scripts are not captured
  if (customElementNames.size > 0 && !['save', 'link'].includes(options["capture.script"])) {
    const elem = newDoc.createElement('script');
    elem.setAttribute("data-scrapbook-elem", "custom-elements-loader");
    elem.textContent = "(" + scrapbook.compressJsFunc(function (names) {
      if (!customElements) { return; }
      for (const name of names) {
        customElements.define(name, class CustomElement extends HTMLElement {});
      }
    }) + ")(" + JSON.stringify([...customElementNames]) + ")";
    headNode.appendChild(elem);
  }

  // common pre-save process
  await capturer.preSaveProcess({
    rootNode,
    isMainDocument: isMainPage && isMainFrame,
    deleteErased: options["capture.deleteErasedOnCapture"],
    requireBasicLoader,
    insertInfoBar: options["capture.insertInfoBar"],
  });

  // save document
  const content = scrapbook.documentToString(newDoc, options["capture.prettyPrint"]);
  const blob = new Blob([content], {type: `${mime};charset=UTF-8`});
  const response = await capturer.saveDocument({
    sourceUrl: capturer.getRedirectedUrl(docUrl, docUrlHash),
    documentFileName,
    settings,
    options,
    data: {
      blob,
      title: settings.title || doc.title,
      favIconUrl: settings.favIconUrl || favIconUrl,
    },
  });

  // special handling for blob response
  if (!('url' in response)) {
    return response;
  }

  return Object.assign({}, response, {
    url: capturer.getRedirectedUrl(response.url, docUrlHash),
    sourceUrl: docUrl,
  });
};

/**
 * @typedef {Object} retrieveDocumentContentResponseItem
 * @property {Blob} blob
 * @property {Object} info
 * @property {string} info.isMainFrame
 * @property {string} info.title
 * @property {Object} resources
 * @property {string} resources.uuid
 * @property {string} resources.url
 */

/**
 * @typedef {Object<string~docUrl, retrieveDocumentContentResponseItem>} retrieveDocumentContentResponse
 */

/**
 * @type invokable
 * @memberof capturer
 * @param {Object} params
 * @param {Document} [params.doc]
 * @param {boolean} [params.internalize]
 * @param {boolean} params.isMainPage
 * @param {Object} params.item
 * @param {captureOptions} params.options
 * @return {Promise<retrieveDocumentContentResponse>}
 */
capturer.retrieveDocumentContent = async function (params) {
  isDebug && console.debug("call: retrieveDocumentContent", params);

  const {doc = document, internalize = false, isMainPage, item, options} = params;

  const data = {};
  const docs = scrapbook.flattenFrames(doc);
  for (let i = 0, I = docs.length; i < I; i++) {
    const doc = docs[i];
    const docUrl = scrapbook.normalizeUrl(scrapbook.splitUrl(doc.URL)[0]);
    if (docUrl in data) { continue; }

    // skip non-HTML documents
    if (!["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
      continue;
    }

    const cloneNodeMapping = (node, deep = false) => {
      return scrapbook.cloneNode(node, deep, {
        newDoc,
        origNodeMap,
        clonedNodeMap,
        includeShadowDom: true,
      });
    };

    const addResource = (url) => {
      const uuid = scrapbook.getUuid();
      const key = "urn:scrapbook:url:" + uuid;
      resources[uuid] = url;
      return key;
    };

    const processRootNode = (rootNode) => {
      // handle adoptedStyleSheet
      // don't refresh related attributes if not supported by the browser
      if ('adoptedStyleSheets' in document) {
        const docOrShadowRoot = origNodeMap.get(rootNode).getRootNode();

        const elem = rootNode.host || rootNode;
        elem.removeAttribute("data-scrapbook-adoptedstylesheets");

        const ids = [];
        for (const css of scrapbook.getAdoptedStyleSheets(docOrShadowRoot)) {
          let id = adoptedStyleSheetMap.get(css);
          if (typeof id === 'undefined') {
            id = adoptedStyleSheetMap.size;
            adoptedStyleSheetMap.set(css, id);
          }
          ids.push(id);
        }
        if (ids.length) {
          elem.setAttribute("data-scrapbook-adoptedstylesheets", ids.join(','));
        }
      }

      // fix noscript
      // noscript cannot be nested
      for (const elem of rootNode.querySelectorAll('noscript')) {
        const elemOrig = origNodeMap.get(elem);
        if (elemOrig.innerHTML === elemOrig.textContent) {
          const tempElem = newDoc.createElement('scrapbook-noscript');
          tempElem.innerHTML = elem.textContent;
          let child;
          elem.textContent = '';
          while (child = tempElem.firstChild) {
            elem.appendChild(child);
          }
        }
      }

      // handle internalization
      if (internalize) {
        for (const elem of rootNode.querySelectorAll('img')) {
          if (elem.hasAttribute('src')) {
            elem.setAttribute('src', addResource(elem.getAttribute('src')));
          }
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset", scrapbook.rewriteSrcset(elem.getAttribute("srcset"), url => addResource(url)));
          }
        }

        for (const elem of rootNode.querySelectorAll('input[type="image"]')) {
          if (elem.hasAttribute('src')) {
            elem.setAttribute('src', addResource(elem.getAttribute('src')));
          }
        }

        for (const elem of rootNode.querySelectorAll('audio')) {
          if (elem.hasAttribute('src')) {
            elem.setAttribute('src', addResource(elem.getAttribute('src')));
          }
        }

        for (const elem of rootNode.querySelectorAll('video')) {
          if (elem.hasAttribute('src')) {
            elem.setAttribute('src', addResource(elem.getAttribute('src')));
          }
          if (elem.hasAttribute('poster')) {
            elem.setAttribute('poster', addResource(elem.getAttribute('poster')));
          }
        }

        for (const elem of rootNode.querySelectorAll('audio source, video source, picture source')) {
          if (elem.hasAttribute('src')) {
            elem.setAttribute('src', addResource(elem.getAttribute('src')));
          }
          if (elem.hasAttribute("srcset")) {
            elem.setAttribute("srcset", scrapbook.rewriteSrcset(elem.getAttribute("srcset"), url => addResource(url)));
          }
        }

        for (const elem of rootNode.querySelectorAll('audio track, video track')) {
          if (elem.hasAttribute('src')) {
            elem.setAttribute('src', addResource(elem.getAttribute('src')));
          }
        }
      }

      // record form element status
      for (const elem of rootNode.querySelectorAll("input")) {
        const elemOrig = origNodeMap.get(elem);
        if (!elemOrig) { continue; }
        switch (elem.type.toLowerCase()) {
          case "checkbox": {
            // indeterminate
            if (elemOrig.indeterminate) {
              elem.setAttribute("data-scrapbook-input-indeterminate", "");
              requireBasicLoader = true;
            } else {
              elem.removeAttribute("data-scrapbook-input-indeterminate");
            }
          }
          // eslint-disable-next-line no-fallthrough
          case "radio":
            if (elemOrig.checked) {
              elem.setAttribute("checked", "");
            } else {
              elem.removeAttribute("checked");
            }
            break;
          case "password":
          case "file":
            // skip for security
            // eslint-disable-next-line no-fallthrough
          case "image":
            // skip image
            break;
          case "text":
          default:
            elem.setAttribute("value", elemOrig.value);
            break;
        }
      }

      for (const elem of rootNode.querySelectorAll("option")) {
        const elemOrig = origNodeMap.get(elem);
        if (!elemOrig) { continue; }
        if (elemOrig.selected) {
          elem.setAttribute("selected", "");
        } else {
          elem.removeAttribute("selected");
        }
      }

      for (const elem of rootNode.querySelectorAll("textarea")) {
        const elemOrig = origNodeMap.get(elem);
        if (!elemOrig) { continue; }
        elem.textContent = elemOrig.value;
      }

      // handle special scrapbook elements
      // -- "title", "title-src" elements
      {
        const titleNodes = [];
        const titleSrcNodes = [];
        for (const elem of rootNode.querySelectorAll("*")) {
          switch (scrapbook.getScrapbookObjectType(elem)) {
            case "title":
              titleNodes.push(elem);
              break;
            case "title-src":
              titleSrcNodes.push(elem);
              break;
          }
        }
        for (const elem of titleSrcNodes) {
          const text = elem.textContent;
          if (text) { info.title = text; }
        }
        for (const elem of titleNodes.concat(titleSrcNodes)) {
          if (elem.textContent !== info.title) {
            elem.textContent = info.title;
          }
        }
      }

      // update canvas data
      for (const elem of rootNode.querySelectorAll("canvas")) {
        elem.removeAttribute("data-scrapbook-canvas");
        const elemOrig = origNodeMap.get(elem);
        if (!elemOrig) { continue; }
        try {
          const data = elemOrig.toDataURL();
          if (data !== scrapbook.getBlankCanvasData(elemOrig)) {
            elem.setAttribute("data-scrapbook-canvas", data);
            requireBasicLoader = true;
          }
        } catch (ex) {
          console.error(ex);
        }
      }

      // update slot data
      // don't refresh related attributes if not supported by the browser
      if (rootNode instanceof ShadowRoot && rootNode.slotAssignment === 'manual') {
        // clear attributes for all slottables
        const regexes = [/^scrapbook-slot-index=(\d+)$/, /^\/scrapbook-slot-index$/];
        const children = rootNode.host.childNodes;
        for (let i = children.length - 1; i >= 0; i--) {
          const node = children[i];
          switch (node.nodeType) {
            case Node.ELEMENT_NODE: {
              node.removeAttribute("data-scrapbook-slot-index");
              break;
            }
            case Node.COMMENT_NODE: {
              if (regexes.some(r => r.test(node.nodeValue))) {
                node.remove();
              }
              break;
            }
          }
        }

        for (const elem of rootNode.querySelectorAll("slot")) {
          elem.removeAttribute("data-scrapbook-slot-assigned");
          const elemOrig = origNodeMap.get(elem);
          if (!elemOrig) { continue; }
          const ids = [];
          for (const targetNodeOrig of elemOrig.assignedNodes()) {
            const targetNode = clonedNodeMap.get(targetNodeOrig);
            let id = slotMap.get(targetNode);
            if (typeof id === 'undefined') {
              id = slotMap.size;
              slotMap.set(targetNode, id);
            }
            if (targetNode.nodeType === 1) {
              targetNode.setAttribute("data-scrapbook-slot-index", id);
            } else {
              targetNode.before(document.createComment(`scrapbook-slot-index=${id}`));
              targetNode.after(document.createComment(`/scrapbook-slot-index`));
            }
            ids.push(id);
          }
          if (ids.length) {
            elem.setAttribute("data-scrapbook-slot-assigned", ids.join(','));
          }
        }
      }

      // update shadow root data
      for (const elem of rootNode.querySelectorAll("*")) {
        elem.removeAttribute("data-scrapbook-shadowdom");
        elem.removeAttribute("data-scrapbook-shadowdom-mode");
        elem.removeAttribute("data-scrapbook-shadowdom-clonable");
        elem.removeAttribute("data-scrapbook-shadowdom-delegates-focus");
        elem.removeAttribute("data-scrapbook-shadowdom-serializable");
        elem.removeAttribute("data-scrapbook-shadowdom-slot-assignment");
        const shadowRoot = scrapbook.getShadowRoot(elem);
        if (!shadowRoot) { continue; }
        processRootNode(shadowRoot);
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
        requireBasicLoader = true;
      }
    };

    const {contentType: mime, characterSet: charset, documentElement: docElemNode} = doc;

    const origNodeMap = new WeakMap();
    const clonedNodeMap = new WeakMap();
    const slotMap = new Map();
    const adoptedStyleSheetMap = new Map();

    // create a new document to replicate nodes via import
    const newDoc = scrapbook.cloneDocument(doc, {origNodeMap, clonedNodeMap});

    for (const node of doc.childNodes) {
      newDoc.appendChild(cloneNodeMapping(node, true));
    }

    const rootNode = newDoc.documentElement;
    const isMainFrame = i === 0;
    const info = {
      isMainFrame,
      title: (isMainPage && isMainFrame ? item?.title : doc.title) || "",
    };
    const resources = {};
    let requireBasicLoader = false;

    // remove webscrapbook toolbar related
    rootNode.removeAttribute('data-scrapbook-toolbar-active');
    for (const elem of rootNode.querySelectorAll(`[data-scrapbook-elem|="toolbar"]`)) {
      elem.remove();
    }

    processRootNode(rootNode);

    // handle adoptedStyleSheet
    // don't refresh related attributes if not supported by the browser
    if ('adoptedStyleSheets' in document) {
      const regex = /^data-scrapbook-adoptedstylesheet-(\d+)$/;
      for (const attrNode of rootNode.attributes) {
        const attr = attrNode.nodeName;
        if (regex.test(attr)) {
          rootNode.removeAttribute(attr);
        }
      }
      if (adoptedStyleSheetMap.size) {
        for (const [css, id] of adoptedStyleSheetMap) {
          const cssTexts = Array.prototype.map.call(
            css.cssRules,
            cssRule => cssRule.cssText,
          );
          rootNode.setAttribute(`data-scrapbook-adoptedstylesheet-${id}`, cssTexts.join('\n\n'));
        }
        requireBasicLoader = true;
      }
    }

    // common pre-save process
    await capturer.preSaveProcess({
      rootNode,
      isMainDocument: isMainPage && isMainFrame,
      deleteErased: options["capture.deleteErasedOnSave"],
      requireBasicLoader,
      insertInfoBar: options["capture.insertInfoBar"],
    });

    const content = scrapbook.documentToString(newDoc, options["capture.prettyPrint"]);
    let blob = new Blob([content], {type: `${mime};charset=${charset}`});
    blob = await capturer.saveBlobCache(blob);

    data[docUrl] = {
      blob,
      info,
      resources,
    };
  }
  return data;
};

/**
 * Process DOM before capture or resave.
 *
 * @param {Object} params
 * @param {Document} params.rootNode
 * @param {boolean} params.isMainDocument
 * @param {boolean} params.deleteErased
 * @param {boolean} params.requireBasicLoader
 * @param {boolean} params.insertInfoBar
 * @return {Promise<Object>}
 */
capturer.preSaveProcess = async function (params) {
  isDebug && console.debug("call: preSaveProcess", params);

  const {rootNode, isMainDocument, deleteErased, requireBasicLoader, insertInfoBar} = params;
  const doc = rootNode.ownerDocument;

  // delete all erased contents
  if (deleteErased) {
    const selectedNodes = [];
    const nodeIterator = doc.createNodeIterator(
      rootNode,
      NodeFilter.SHOW_COMMENT,
      node => scrapbook.getScrapBookObjectRemoveType(node) === 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    );
    let node;
    while (node = nodeIterator.nextNode()) {
      selectedNodes.push(node);
    }

    for (const node of selectedNodes) {
      node.remove();
    }
  }

  // update loader
  for (const elem of rootNode.querySelectorAll([
        'style[data-scrapbook-elem="annotation-css"]',
        'script[data-scrapbook-elem="basic-loader"]',
        'script[data-scrapbook-elem="annotation-loader"]',
        'script[data-scrapbook-elem="canvas-loader"]', // WebScrapBook < 0.69
        'script[data-scrapbook-elem="shadowroot-loader"]', // WebScrapBook < 0.69
        '[data-scrapbook-elem="infobar"]',
        'script[data-scrapbook-elem="infobar-loader"]',
      ].join(','))) {
    elem.remove();
  }
  const bodyNode = rootNode.querySelector('body') || rootNode;
  if (requireBasicLoader) {
    const loader = bodyNode.appendChild(doc.createElement("script"));
    loader.setAttribute("data-scrapbook-elem", "basic-loader");
    // Keep downward compatibility with IE8.
    // indeterminate checkbox: IE >= 6, getAttribute: IE >= 8
    // HTMLCanvasElement: Firefox >= 1.5, querySelectorAll: Firefox >= 3.5
    // getElementsByTagName is not implemented for DocumentFragment (shadow root)
    loader.textContent = "(" + scrapbook.compressJsFunc(function () {
      var k1 = "data-scrapbook-shadowdom",
          k2 = "data-scrapbook-canvas",
          k3 = "data-scrapbook-input-indeterminate",
          k4 = "data-scrapbook-input-checked",
          k5 = "data-scrapbook-option-selected",
          k6 = "data-scrapbook-input-value",
          k7 = "data-scrapbook-textarea-value",
          k8 = "data-scrapbook-adoptedstylesheets",
          k9 = /^data-scrapbook-adoptedstylesheet-(\d+)$/,
          k10 = "data-scrapbook-shadowdom-mode",
          k11 = "data-scrapbook-shadowdom-clonable",
          k12 = "data-scrapbook-shadowdom-delegates-focus",
          k13 = "data-scrapbook-shadowdom-serializable",
          k14 = "data-scrapbook-shadowdom-slot-assignment",
          k15 = "data-scrapbook-slot-assigned",
          k16 = "data-scrapbook-slot-index",
          k17 = /^scrapbook-slot-index=(\d+)$/,
          k18 = '/scrapbook-slot-index',
          d = document,
          r = d.documentElement,
          $s = !!r.attachShadow,
          $as = !!d.adoptedStyleSheets,
          $c = !!window.HTMLCanvasElement,
          $sa = !!d.createElement('slot').assign,
          sle = [],
          sls = [],
          slt = function (r) {
            if ($sa) {
              var E = r.childNodes, i, e, s, m;
              for (i = 0; i < E.length; i++) {
                e = E[i];
                if (e.nodeType === 8) {
                  s = e.nodeValue;
                  if (m = s.match(k17)) {
                    s = e.nextSibling;
                    if (s.nodeType === 3) {
                      sls[m[1]] = s;
                    }
                    r.removeChild(e);
                    i--;
                  } else if (s === k18) {
                    r.removeChild(e);
                    i--;
                  }
                }
              }
            }
          },
          sl = function () {
            var i = sle.length, j, d, e;
            while (i--) {
              d = sle[i];
              e = d.elem;
              d = d.value.split(',');
              j = d.length;
              while (j--) {
                d[j] = sls[parseInt(d[j], 10)];
              }
              try {
                try {
                  e.assign.apply(e, d);
                } catch (ex) {
                  if (ex.message.includes('must have a callable @@iterator')) {
                    e.assign(d);
                  } else {
                    throw ex;
                  }
                }
              } catch (ex) {
                console.error(ex);
              }
            }
          },
          asl = (function (r) {
            var l = [], E, i, e, m, c, j;
            if ($as) {
              E = r.attributes;
              i = E.length;
              while (i--) {
                e = E[i];
                if (!(m = e.nodeName.match(k9))) { continue; }
                c = l[m[1]] = new CSSStyleSheet();
                r.removeAttribute(m[0]);
                m = e.nodeValue.split('\n\n');
                j = m.length;
                while (j--) {
                  try {
                    m[j] && c.insertRule(m[j]);
                  } catch (ex) {
                    console.error(ex);
                  }
                }
              }
            }
            return l;
          })(r),
          as = function (d, e) {
            var l, i, I;
            if ($as && (l = e.getAttribute(k8)) !== null) {
              l = l.split(',').map(i => asl[i]);
              d.adoptedStyleSheets = d.adoptedStyleSheets.concat(l);
              e.removeAttribute(k8);
            }
          },
          fn = function (r) {
            var E = r.querySelectorAll ? r.querySelectorAll("*") : r.getElementsByTagName("*"), i = E.length, e, d, s, m;
            while (i--) {
              e = E[i];
              s = e.shadowRoot;
              if ($s && (d = e.getAttribute(k1))) {
                if (!s) {
                  try {
                    s = e.attachShadow({
                      mode: (m = e.getAttribute(k10)) !== null ? m : 'open',
                      clonable: e.hasAttribute(k11),
                      delegatesFocus: e.hasAttribute(k12),
                      serializable: e.hasAttribute(k13),
                      slotAssignment: (m = e.getAttribute(k14)) !== null ? m : void 0,
                    });
                    s.innerHTML = d;
                  } catch (ex) {
                    console.error(ex);
                  }
                }
                e.removeAttribute(k1);
                e.removeAttribute(k10);
                e.removeAttribute(k11);
                e.removeAttribute(k12);
                e.removeAttribute(k13);
                e.removeAttribute(k14);
              }
              if ($c && (d = e.getAttribute(k2)) !== null) {
                (function () {
                  var c = e, g = new Image();
                  g.onload = function () { c.getContext('2d').drawImage(g, 0, 0); };
                  g.src = d;
                })();
                e.removeAttribute(k2);
              }
              if ((d = e.getAttribute(k3)) !== null) {
                e.indeterminate = true;
                e.removeAttribute(k3);
              }
              if ((d = e.getAttribute(k4)) !== null) {
                e.checked = d === 'true';
                e.removeAttribute(k4);
              }
              if ((d = e.getAttribute(k5)) !== null) {
                e.selected = d === 'true';
                e.removeAttribute(k5);
              }
              if ((d = e.getAttribute(k6)) !== null) {
                e.value = d;
                e.removeAttribute(k6);
              }
              if ((d = e.getAttribute(k7)) !== null) {
                e.value = d;
                e.removeAttribute(k7);
              }
              if ($sa && (d = e.getAttribute(k15)) !== null) {
                sle.push({elem: e, value: d});
                e.removeAttribute(k15);
              }
              if ($sa && (d = e.getAttribute(k16)) !== null) {
                sls[d] = e;
                e.removeAttribute(k16);
              }
              if (s) {
                slt(e);
                as(s, e);
                fn(s);
              }
            }
          };
      as(d, r);
      fn(d);
      sl();
    }) + ")()";
  }
  if (insertInfoBar && isMainDocument) {
    insertInfoBar: {
      let data;
      try {
        const itemSource = rootNode.getAttribute('data-scrapbook-source');
        const itemCreate = rootNode.getAttribute('data-scrapbook-create');

        const url = scrapbook.normalizeUrl(itemSource);
        const domain = new URL(url).origin;
        const date = scrapbook.idToDate(itemCreate).toString();
        data = {url, domain, date};
      } catch (ex) {
        console.error(ex);
        break insertInfoBar;
      }

      const loader = bodyNode.appendChild(doc.createElement("script"));
      loader.setAttribute("data-scrapbook-elem", "infobar-loader");

      // This is compatible with IE5 (though position: fixed doesn't work in IE < 7).
      // setAttribute('style', ...) doesn't work for IE < 8
      loader.textContent = ("(" + scrapbook.compressJsFunc(function () {
        var d = document, b = d.body,
            i = d.createElement('scrapbook-infobar'),
            c = i.appendChild(d.createElement('span')),
            t = i.appendChild(d.createElement('span')),
            a = i.appendChild(d.createElement('a'));

        i.setAttribute('data-scrapbook-elem', 'infobar');
        i.style.position = 'fixed';
        i.style.display = 'block';
        i.style.clear = 'both';
        i.style.zIndex = '2147483647';
        i.style.top = '0';
        i.style.left = '0';
        i.style.right = '0';
        i.style.margin = '0';
        i.style.border = '0';
        i.style.padding = '0';
        i.style.width = '100%';
        i.style.backgroundColor = '#FFFFE1';
        i.style.fontSize = '14px';

        a.style.display = 'block';
        a.style.float = '%@@bidi_start_edge%';
        a.style.margin = '0';
        a.style.border = '0';
        a.style.padding = '.35em';
        a.style.color = 'black';
        a.style.fontSize = '1em';
        a.style.textDecoration = 'none';
        a.href = "%url%";
        a.appendChild(d.createTextNode("%domain%"));

        t.style.display = 'block';
        t.style.float = '%@@bidi_end_edge%';
        t.style.margin = '0';
        t.style.border = '0';
        t.style.padding = '.35em';
        t.style.color = 'black';
        t.style.fontSize = '1em';
        t.appendChild(d.createTextNode("%date%"));

        c.style.display = 'block';
        c.style.float = '%@@bidi_end_edge%';
        c.style.margin = '0';
        c.style.border = '0';
        c.style.padding = '.35em';
        c.style.color = 'black';
        c.style.fontSize = '1em';
        c.style.cursor = 'pointer';
        c.appendChild(d.createTextNode('✕'));
        c.onclick = function () { i.parentNode.removeChild(i); };

        b.appendChild(i);
      }) + ")()").replace(/%([\w@]*)%/g, (_, key) => data[key] || scrapbook.lang(key) || '');
    }
  }
  if (rootNode.querySelector('[data-scrapbook-elem="linemarker"][title], [data-scrapbook-elem="sticky"]')) {
    const css = bodyNode.appendChild(doc.createElement("style"));
    css.setAttribute("data-scrapbook-elem", "annotation-css");
    css.textContent = scrapbook.compressCode(scrapbook.ANNOTATION_CSS);
    const loader = bodyNode.appendChild(doc.createElement("script"));
    loader.setAttribute("data-scrapbook-elem", "annotation-loader");
    // Mobile support with showing title on long touch.
    // Firefox >= 52, Chrome >= 22, Edge >= 12
    loader.textContent = ("(" + scrapbook.compressJsFunc(function () {
      var w = window, d = document, r = d.documentElement, e;
      d.addEventListener('click', function (E) {
        if (r.hasAttribute('data-scrapbook-toolbar-active')) { return; }
        if (!w.getSelection().isCollapsed) { return; }
        e = E.target;
        if (e.matches('[data-scrapbook-elem="linemarker"]')) {
          if (e.title) {
            if (!confirm(e.title)) {
              E.preventDefault();
              E.stopPropagation();
            }
          }
        } else if (e.matches('[data-scrapbook-elem="sticky"]')) {
          if (confirm('%EditorDeleteAnnotationConfirm%')) {
            e.parentNode.removeChild(e);
            E.preventDefault();
            E.stopPropagation();
          }
        }
      }, true);
    }) + ")()").replace(/%(\w*)%/g, (_, key) => scrapbook.lang(key) || '');
  }
};

/**
 * @type invokable
 * @param {Object} params
 * @param {Document} [params.doc]
 * @param {string} [params.select]
 * @param {string[]} [params.filter]
 * @return {Promise<Array>}
 */
capturer.retrieveSelectedLinks = async function ({
  doc = document,
  select = 'auto',
  filter = ['http:', 'https:'],
} = {}) {
  switch (select) {
    case 'selected':
    case 'all':
      break;
    default:
      select = scrapbook.getSelection().type !== 'Range' ? 'all' : 'selected';
      break;
  }

  let nodes;
  switch (select) {
    case 'selected': {
      nodes = scrapbook.getSelectedNodes({
        whatToShow: NodeFilter.SHOW_ELEMENT,
        nodeFilter: (node) => {
          return node.matches('a[href], area[href]');
        },
        fuzzy: true,
      });
      break;
    }
    case 'all': {
      nodes = doc.querySelectorAll('a[href], area[href]');
      break;
    }
  }

  let rv = Array.prototype.map.call(nodes, a => ({
    url: a.href,
    title: a.textContent,
  }));

  if (filter) {
    rv = rv.filter(x => filter.some(f => x.url.startsWith(f)));
  }

  return rv;
};

class ItemInfoFormatter extends scrapbook.ItemInfoFormatter {
  format_uuid() {
    return scrapbook.getUuid();
  }
}

/**
 * Format filename of the main item file to save.
 *
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.sourceUrl
 * @param {boolean} params.isFolder
 * @param {captureSettings} [params.settings]
 * @param {captureOptions} [params.options]
 * @return {string} The formatted filename.
 */
capturer.formatIndexFilename = async function ({
  title, sourceUrl, isFolder,
  settings: {
    timeId: id,
  } = {},
  options: {
    "capture.saveFilename": template,
    "capture.saveAsciiFilename": saveAsciiFilename,
    "capture.saveFilenameMaxLenUtf16": saveFilenameMaxLenUtf16,
    "capture.saveFilenameMaxLenUtf8": saveFilenameMaxLenUtf8,
  } = {},
}) {
  // a dummy scrapbook item for formatting
  const item = {
    id,
    create: id,
    title,
    source: sourceUrl,
  };

  const formatter = new ItemInfoFormatter(item);
  let filename = template
    .split('/')
    .map(x => scrapbook.validateFilename(formatter.format(x), saveAsciiFilename))
    .join('/');

  // see capturer.getUniqueFilename for limitation details
  filename = scrapbook.crop(filename, saveFilenameMaxLenUtf16, saveFilenameMaxLenUtf8, "");

  // in case the cropped filename has invalid ending chars
  filename = filename
    .split('/')
    .map(x => scrapbook.validateFilename(x))
    .join('/');

  return filename;
};

capturer.getRedirectedUrl = function (redirectedUrl, sourceUrlHash) {
  const [redirectedUrlMain, redirectedUrlHash] = scrapbook.splitUrlByAnchor(redirectedUrl);

  // Some browsers may encounter an error for a data URL with hash.
  if (redirectedUrl.startsWith('data:')) {
    return redirectedUrlMain;
  }

  // @FIXME:
  // Browsers usually take the redirected URL hash if it exists.
  // Unfortunately, XMLHttpRequest and fetch does not keep response URL hash,
  // and thus this may not actually happen.
  if (redirectedUrlHash) {
    return redirectedUrl;
  }

  // Browsers usually keep source URL hash if the redirected URL has no hash.
  return redirectedUrlMain + sourceUrlHash;
};

capturer.resolveRelativeUrl = function (url, baseUrl, {skipLocal = true} = {}) {
  // do not resolve an empty or pure hash URL
  if (skipLocal) {
    if (!url || url.startsWith("#")) {
      return url;
    }
  }

  try {
    return new URL(url, baseUrl).href;
  } catch (ex) {
    return url;
  }
};

/**
 * Check if the URL matches about:blank or about:srcdoc
 *
 * ref: https://html.spec.whatwg.org/#determining-the-origin
 */
capturer.isAboutUrl = function (url) {
  if (url === 'about:srcdoc') {
    return true;
  }
  if (/^about:blank(?=[?#]|$)/.test(url)) {
    return true;
  }
  return false;
};

capturer.isJavascriptUrl = function (url) {
  try {
    return new URL(url).protocol === "javascript:";
  } catch {
    return false;
  }
};

capturer.getErrorUrl = function (sourceUrl, options) {
  if (!options?.["capture.linkUnsavedUri"]) {
    if (['http:', 'https:', 'file:', 'about:'].some(p => sourceUrl.startsWith(p))) {
      return `urn:scrapbook:download:error:${sourceUrl}`;
    } else if (sourceUrl.startsWith("data:")) {
      return `urn:scrapbook:download:error:data:`;
    } else if (sourceUrl.startsWith("blob:")) {
      return `urn:scrapbook:download:error:blob:`;
    }
  }
  return sourceUrl;
};

/**
 * @typedef {Object} blobCacheObject
 * @property {string} __key__ - UUID to retrieve the Blob data
 */

/**
 * An object that can be transmitted through messaging.
 * @typedef {Blob|serializedBlob|blobCacheObject} transferableBlob
 */

/**
 * Save a Blob in the cache and return a transferableBlob.
 *
 * @param {Blob} blob
 * @param {number} threshold - cache only when size greater than this
 * @return {Promise<transferableBlob>}
 */
capturer.saveBlobCache = async function (blob, threshold = 32 * 1024 * 1024) {
  // Return the original Blob if the browser supports tramsmitting Blob
  // through message natively.
  if (scrapbook.userAgent.is('gecko')) {
    return blob;
  }

  // for a small Blob, simply serialize to an object
  if (blob.size < threshold) {
    return await scrapbook.serializeObject(blob);
  }

  const uuid = scrapbook.getUuid();
  const key = {table: "blobCache", key: uuid};
  await scrapbook.cache.set(key, blob, 'storage');
  return {__key__: uuid};
};

/**
 * Load a Blob from a transferableBlob.
 *
 * @param {transferableBlob} blob
 * @return {Promise<Blob>}
 */
capturer.loadBlobCache = async function (blob) {
  if (blob instanceof Blob) {
    return blob;
  }

  if (blob.__type__) {
    return await scrapbook.deserializeObject(blob);
  }

  const key = {table: "blobCache", key: blob.__key__};
  const rv = await scrapbook.cache.get(key, 'storage');
  await scrapbook.cache.remove(key, 'storage');
  return rv;
};


/**
 * A class that tokenizes a CSS selector.
 *
 * Expect a selector text which is validated and tidied by the browser.
 */
class CssSelectorTokenizer {
  constructor() {
    this.regexLiteral = /(?:[0-9A-Za-z_\-\u00A0-\uFFFF]|\\(?:[0-9A-Fa-f]{1,6} ?|.))+|(.)/g;
    this.regexQuote = /[^"]*(?:\\.[^"]*)*"/g;
  }

  static tokensToString(tokens) {
    return tokens.reduce((result, current) => {
      return result + current.value;
    }, '');
  }

  tokensToString(...args) {
    return this.constructor.tokensToString.apply(this, args);
  }

  run(selectorText) {
    this.tokens = [];
    this.depth = -1;
    this.parse(selectorText, 0);
    return this.tokens;
  }

  parse(selectorText, start, endSymbol = null) {
    this.depth++;
    this.regexLiteral.lastIndex = start;
    let match;
    while (match = this.regexLiteral.exec(selectorText)) {
      switch (match[1]) {
        case endSymbol: {
          this.depth--;
          this.tokens.push({
            type: 'operator',
            value: match[0],
            depth: this.depth,
          });
          return this.regexLiteral.lastIndex;
        }
        case '(': {
          this.tokens.push({
            type: 'operator',
            value: match[0],
            depth: this.depth,
          });
          this.regexLiteral.lastIndex = this.parse(
            selectorText,
            this.regexLiteral.lastIndex,
            ')',
          );
          break;
        }
        case '[': {
          const start = this.regexLiteral.lastIndex;
          const end = this.regexLiteral.lastIndex = this.matchBracket(selectorText, start);
          this.tokens.push({
            type: 'selector',
            value: selectorText.slice(start - 1, end),
            depth: this.depth,
          });
          break;
        }
        case ':': {
          const isPseudoElement = selectorText[this.regexLiteral.lastIndex] === ':';
          if (isPseudoElement) {
            this.regexLiteral.lastIndex++;
          }
          this.tokens.push({
            type: 'operator',
            value: isPseudoElement ? '::' : ':',
            depth: this.depth,
          });
          this.regexLiteral.lastIndex = this.parsePseudo(
            selectorText,
            this.regexLiteral.lastIndex,
          );
          break;
        }
        case '|': {
          // Special handling for || (column combinator in CSS4 draft)
          // to prevent misinterpreted as double | operator.
          const isColumnCombinator = selectorText[this.regexLiteral.lastIndex] === '|';
          if (isColumnCombinator) {
            this.regexLiteral.lastIndex++;
          }
          this.tokens.push({
            type: 'operator',
            value: isColumnCombinator ? '||' : '|',
            depth: this.depth,
          });
          break;
        }
        default: {
          if (match[1]) {
            this.tokens.push({
              type: 'operator',
              value: match[0],
              depth: this.depth,
            });
          } else {
            this.tokens.push({
              type: 'name',
              value: match[0],
              depth: this.depth,
            });
          }
          break;
        }
      }
    }
    this.depth--;
    return selectorText.length;
  }

  parsePseudo(selectorText, start) {
    let _tokens = this.tokens;
    this.tokens = [];
    let lastIndex = selectorText.length;
    this.regexLiteral.lastIndex = start;
    let match;
    while (match = this.regexLiteral.exec(selectorText)) {
      switch (match[1]) {
        case '(': {
          this.tokens.push({
            type: 'operator',
            value: match[0],
            depth: this.depth,
          });
          this.regexLiteral.lastIndex = this.parse(
            selectorText,
            this.regexLiteral.lastIndex,
            ')',
          );
          break;
        }
        default: {
          if (match[1]) {
            lastIndex = this.regexLiteral.lastIndex - 1;
            this.regexLiteral.lastIndex = selectorText.length;
          } else {
            this.tokens.push({
              type: 'name',
              value: match[0],
              depth: this.depth,
            });
          }
          break;
        }
      }
    }

    this.tokens = _tokens.concat(this.tokens);
    return lastIndex;
  }

  matchBracket(selectorText, start) {
    this.regexLiteral.lastIndex = start;
    let match;
    while (match = this.regexLiteral.exec(selectorText)) {
      switch (match[1]) {
        case ']': {
          return this.regexLiteral.lastIndex;
        }
        case '"': {
          this.regexLiteral.lastIndex = this.matchQuote(selectorText, this.regexLiteral.lastIndex);
          break;
        }
      }
    }
    return selectorText.length;
  }

  matchQuote(selectorText, start) {
    this.regexQuote.lastIndex = start;
    const m = this.regexQuote.exec(selectorText);
    if (m) { return this.regexQuote.lastIndex; }
    return selectorText.length;
  }
}

capturer.CssSelectorTokenizer = CssSelectorTokenizer;


/**
 * A class that handles document CSS analysis.
 */
class DocumentCssHandler {
  constructor({doc, rootNode, origNodeMap, clonedNodeMap, settings, options}) {
    this.doc = doc;
    this.rootNode = rootNode;
    this.origNodeMap = origNodeMap;
    this.clonedNodeMap = clonedNodeMap;
    this.settings = settings;
    this.options = options;
    this.resourceMap = ((options['capture.saveAs'] === 'singleHtml') && options['capture.mergeCssResources']) ? {} : null;
  }

  warn(msg) {
    return capturer.invoke("remoteMsg", {
      msg,
      type: 'warn',
      settings: this.settings, // for missionId
    });
  }

  /**
   * Check whether the current status of document stylesheets can be resulted
   * from normal browser pick mechanism.
   *
   * CSS status:
   * 1. Persistent (no rel="alternate", no non-empty title)
   * 2. Preferred (no rel="alternate", has non-empty title)
   * 3. Alternate (has rel="alternate", has non-empty title)
   */
  get isBrowserPick() {
    const result = (() => {
      if (!this.doc.styleSheets) {
        return true;
      }

      const groups = new Map();

      for (const css of this.doc.styleSheets) {
        // ignore imported CSS
        if (!css.ownerNode) {
          continue;
        }

        const title = css.title?.trim();

        // ignore persistent CSS
        if (!title) {
          continue;
        }

        // preferred or alternate
        if (!groups.has(title)) {
          groups.set(title, []);
        }
        groups.get(title).push(css);
      }

      const arr = Array.from(groups.values());

      // For a browser not supporting alternative stylesheets, the disabled
      // property of every stylesheet is false.
      // Chromium has a bug that the disabled property of every alternative
      // stylesheet is false, causing the same result:
      // https://bugs.chromium.org/p/chromium/issues/detail?id=965554
      if (scrapbook.userAgent.is('chromium')) {
        return arr.every(r => r.every(x => !x.disabled));
      }

      if (arr.length === 0) {
        // no non-persistent stylesheets
        return true;
      }

      return (
        // exactly one group has all stylesheets enabled
        arr.filter(r => r.every(x => !x.disabled)).length === 1 &&
        // and others has all stylesheets disabled
        arr.filter(r => r.every(x => !!x.disabled)).length === arr.length - 1
      );
    })();

    // cache the result
    Object.defineProperty(this, 'isBrowserPick', {value: result});

    return result;
  }

  /**
   * Return the equivalent selector text for a possibly nested CSSStyleRule.
   *
   * ref: https://drafts.csswg.org/css-nesting-1/
   *
   * @param {CSSStyleRule} rule
   * @return {string} The equivalent selector text.
   */
  static getSelectorText(...args) {
    const tokenizer = new CssSelectorTokenizer();
    const getParentStyleRule = (rule) => {
      let ruleCurrent = rule;
      while (ruleCurrent = ruleCurrent.parentRule) {
        if (ruleCurrent.type === 1) {
          return ruleCurrent;
        }
      }
      return null;
    };
    const rewriteRule = (rule) => {
      let selectorText = rule.selectorText;
      const parent = getParentStyleRule(rule);
      if (parent) {
        const parentSelectorText = `:is(${rewriteRule(parent)})`;

        // get the top-level selectors separated by ","
        const tokens = tokenizer.run(selectorText);
        let selectors = [], lastSplitIndex = 0;
        for (let i = 0, I = tokens.length; i < I; i++) {
          const token = tokens[i];
          if (token.value === ',' && token.type === 'operator' && token.depth === 0) {
            selectors.push(tokens.slice(lastSplitIndex, i));
            lastSplitIndex = i + 1;
          }
        }
        selectors.push(tokens.slice(lastSplitIndex));

        // combine with parentSelectorText
        selectorText = selectors.map(tokens => {
          let firstToken = null;
          let hasAmp = false;
          for (let i = 0, I = tokens.length; i < I; i++) {
            const token = tokens[i];
            if (!firstToken && !(!scrapbook.trim(token.value) && token.type === 'operator')) {
              firstToken = token;
            }
            if (token.value === '&' && token.type === 'operator') {
              hasAmp = true;
              tokens[i] = {
                type: 'selector',
                value: parentSelectorText,
                depth: token.depth,
              };
            }
          }
          if (!hasAmp || (['>', '+', '~', '||'].includes(firstToken.value) && firstToken.type === 'operator')) {
            tokens.splice(0, 0,
              {
                type: 'selector',
                value: parentSelectorText,
                depth: 0,
              },
              {
                type: 'operator',
                value: ' ',
                depth: 0,
              },
            );
          }
          return tokenizer.tokensToString(tokens);
        }).join(', ');
      }
      return selectorText;
    };
    const fn = (rule) => {
      return rewriteRule(rule);
    };
    Object.defineProperty(this, 'getSelectorText', {value: fn});
    return fn(...args);
  }

  getSelectorText(...args) {
    return this.constructor.getSelectorText.apply(this, args);
  }

  /**
   * Rewrite the given CSS selector to cover a reasonably broader cases and
   * can be used in querySelector().
   *
   * 1. Rewrite namespace in the selector. (e.g. svg|a => a,
   *    [attr=value] => [*|attr=value])
   * 2. Recursively remove pseudoes (including pseudo-classes(:*) and
   *    pseudo-elements(::*)) unless it's listed in ALLOWED_PSEUDO.
   *    (e.g. div:hover => div).
   * 3. Add * in place if the non-pseudo version becomes empty.
   *    (e.g. :hover => *)
   * 4. Return "" if the selector contains a special pseudo that cannot be
   *    reliably rewritten.
   *    (e.g. :host and :host-context represent the shadow host, which can
   *    not be matched by ShadowRoot.querySelector() using any selector.
   */
  static getSelectorVerifier(...args) {
    // Do not include :not as the semantic is reversed and the rule could be
    // narrower after rewriting (e.g. :not(:hover) => :not(*)).
    const ALLOWED_PSEUDO = new Set([
      'root', 'scope',
      'is', 'matches', 'any', 'where', 'has',
      'first-child', 'first-of-type', 'last-child', 'last-of-type',
      'nth-child', 'nth-of-type', 'nth-last-child', 'nth-last-of-type',
      'only-child', 'only-of-type',
    ]);

    // @TODO: rewrite only standalone ':host', as ':host > div' etc. can
    //        still match using ShadowRoot.querySelector().
    const SPECIAL_PSEUDO = new Set(['host', 'host-context']);

    const regexAttrNs = /^\[[^\\|=\]]*(?:\\.[^\\|=\]]*)*\|(?!=)/g;

    const tokenizer = new CssSelectorTokenizer();

    const fn = (selectorText) => {
      const tokens = tokenizer.run(selectorText);
      const result = [];
      for (let i = 0, I = tokens.length; i < I; i++) {
        const token = tokens[i];

        // Remove namespaced type selector to match any namespace.
        // - document.querySelector('elem') matches elem or ns:elem in any namespace
        // - document.querySelector('*|elem') matches elem or ns:elem in any namespace
        //   (seems no difference to the previous one)
        // - document.querySelector('ns|elem') throws an error
        if (token.value === '|' && token.type === 'operator') {
          const prevToken = result[result.length - 1];
          if (prevToken && (prevToken.type === 'name' || (prevToken.value === '*' && prevToken.type === 'operator'))) {
            result.pop();
          }
          continue;
        }

        // Force attribute selector namespace to be *. Do this for any namespace since
        // the namespace and prefix can be defined by a @namespace rule and different
        // from the docuemnt, which is difficult to trace reliably.
        // - document.querySelector('[*|attr]') matches attr or ns:attr in any namespace
        // - document.querySelector('[attr]') matches attr in any namespace
        // - document.querySelector('[ns|attr]') throws an error
        if (token.type === 'selector' && token.value.startsWith('[')) {
          regexAttrNs.lastIndex = 0;
          if (regexAttrNs.test(token.value)) {
            token.value = '[*|' + token.value.slice(regexAttrNs.lastIndex);
          } else {
            token.value = '[*|' + token.value.slice(1);
          }
        }

        // handle pseudo-classes/elements
        if ((token.value === ':' || token.value === '::') && token.type === 'operator') {
          const name = tokens[i + 1].value;

          if (SPECIAL_PSEUDO.has(name)) {
            return "";
          }

          if (!ALLOWED_PSEUDO.has(name)) {
            skipPseudoAndGetNextPos: {
              let j = i = i + 2;
              const parenToken = tokens[j];
              if (parenToken?.value === '(' && parenToken.type === 'operator') {
                const depth = parenToken.depth;
                for (j += 1; j < I; j++) {
                  const token = tokens[j];
                  if (token?.depth === depth) {
                    i = j + 1;
                    break skipPseudoAndGetNextPos;
                  }
                }
                i = j;
                break skipPseudoAndGetNextPos;
              }
            }
            i -= 1;

            addUniversalSelector: {
              const prevToken = result[result.length - 1];
              if (!prevToken || (prevToken.type === 'operator' && prevToken.value !== ')')) {
                result.push({
                  type: 'name',
                  value: '*',
                  depth: token.depth,
                });
              }
            }

            continue;
          }
        }

        result.push(token);
      }

      return tokenizer.tokensToString(result);
    };

    Object.defineProperty(this, 'getSelectorVerifier', {value: fn});
    return fn(...args);
  }

  getSelectorVerifier(...args) {
    return this.constructor.getSelectorVerifier.apply(this, args);
  }

  /**
   * Verify whether rule matches something in root.
   *
   * @param {Element|DocumentFragment} root
   * @param {CSSStyleRule} rule
   */
  verifySelector(root, rule) {
    const selectorText = this.getSelectorText(rule);

    let selectorTextInvalid = false;
    try {
      // querySelector of a pseudo selector like a:hover always return null
      if (root.querySelector(selectorText)) { return true; }
    } catch (ex) {
      // As CSSStyleRule.selectorText is already a valid selector,
      // an error means it's valid but not supported by querySelector.
      // One example is a namespaced selector like: svg|a,
      // as querySelector cannot consume a @namespace rule in prior.
      // Mark selectorText as invalid and test the rewritten selector text
      // instead.
      selectorTextInvalid = true;
    }

    let selectorTextRewritten = this.getSelectorVerifier(selectorText);
    if (!selectorTextRewritten) {
      // The selector cannot be reliably rewritten.
      return true;
    }
    if (selectorTextInvalid || selectorTextRewritten !== selectorText) {
      try {
        if (root.querySelector(selectorTextRewritten)) {
          return true;
        }
      } catch (ex) {
        // Rewritten selector still not supported by querySelector due to an
        // unexpected reason.
        // Return true as false positive is safer than false negative.
        return true;
      }
    }

    return false;
  }

  getElemCss(elem) {
    const {origNodeMap} = this;
    const origElem = origNodeMap.get(elem);

    // origElem.sheet may be null for a headless document in some browsers
    return origElem?.sheet;
  }

  static getRulesFromCssText(cssText) {
    // In Chromium, BOM causes returned cssRules be empty.
    // Remove it to prevent the issue.
    if (cssText[0] === '\uFEFF') {
      cssText = cssText.slice(1);
    }

    const d = document.implementation.createHTMLDocument('');
    const styleElem = d.createElement('style');
    styleElem.textContent = cssText;
    d.head.appendChild(styleElem);
    return styleElem.sheet.cssRules;
  }

  getRulesFromCssText(...args) {
    return this.constructor.getRulesFromCssText.apply(this, args);
  }

  /**
   * @param {Object} params
   * @param {?CSSStyleSheet} params.css - The CSS to get rules from.
   * @param {string} [params.url] - The overriding source URL for retrieving a
   *   cross-orign CSS.
   * @param {string} [params.refUrl] - The referrer URL for retrieving a
   *   cross-orign CSS.
   * @param {string} [params.refPolicy] - the referrer policy for retrieving a
   *   cross-orign CSS.
   * @param {string} [params.envCharset] - the environment charset for
   *   retrieving a cross-orign CSS.
   * @param {boolean} [params.crossOrigin] - Whether to retrieve CSS via web
   *   request if it's cross origin.
   * @param {boolean} [params.errorWithNull] - Whether to return null if CSS
   *   not retrievable.
   * @return {?CSSStyleRule[]}
   */
  async getRulesFromCss({css, url, refUrl, refPolicy, envCharset, crossOrigin = true, errorWithNull = false}) {
    let rules = null;
    try {
      // Firefox may get this for a stylesheet with relative URL imported from
      // a stylesheet with null href (mostly when the owner document is created
      // using document.implementation.createHTMLDocument). In such case
      // css.cssRules is an empty CSSRuleList.
      if (css.href === 'about:invalid') {
        throw new Error('cssRules not accessible.');
      }

      // If cross-origin, css.cssRules may return null or throw an error.
      // In Chromium >= 120, css (CSSImportRule.styleSheet) is null for an
      // imported CSS.
      rules = css.cssRules;

      if (!rules) {
        throw new Error('cssRules not accessible.');
      }
    } catch (ex) {
      // cssRules not accessible, probably a cross-domain CSS.
      if (crossOrigin) {
        if (css?.ownerNode?.nodeName.toLowerCase() === 'style') {
          rules = this.getRulesFromCssText(css.ownerNode.textContent);
        } else {
          const {settings, options} = this;

          try {
            const response = await capturer.fetchCss({
              url: url || css.href,
              refUrl,
              refPolicy,
              envCharset,
              settings,
              options,
            });
            rules = this.getRulesFromCssText(response.text);
          } catch (ex) {
            console.error(ex);
          }
        }
      }
    }

    if (!rules && !errorWithNull) {
      return [];
    }

    return rules;
  }

  /**
   * Rewrite a given CSS Text.
   *
   * @param {Object} params
   * @param {string} params.cssText - the CSS text to rewrite.
   * @param {string} params.baseUrl - the base URL for URL resolving.
   * @param {string} params.refUrl - the referrer URL for fetching resources.
   * @param {string} [params.refPolicy] - the referrer policy for fetching
   *   resources.
   * @param {string} [params.envCharset] - the environment charset for fetching
   *   resources.
   * @param {CSSStyleSheet} [params.refCss] - the reference CSS (which holds
   *   the @import rule(s), for an imported CSS).
   * @param {Node} [params.rootNode] - the reference root node for an imported
   *   CSS.
   * @param {boolean} [params.isInline] - whether cssText is inline.
   * @param {captureSettings} [params.settings]
   * @param {captureOptions} [params.options]
   */
  async rewriteCssText({cssText, baseUrl, refUrl, refPolicy, envCharset, refCss = null, rootNode, isInline = false, settings, options}) {
    settings = Object.assign({}, this.settings, settings);
    settings = Object.assign(settings, {
      recurseChain: [...settings.recurseChain, scrapbook.splitUrlByAnchor(refUrl)[0]],
    });
    options = options ? Object.assign({}, this.options, options) : this.options;

    const {usedCssFontUrl, usedCssImageUrl} = settings;

    const resolveCssUrl = (sourceUrl, baseUrl) => {
      const url = capturer.resolveRelativeUrl(sourceUrl, baseUrl);
      let valid = true;

      // do not fetch if the URL is not resolved
      if (!scrapbook.isUrlAbsolute(url)) {
        valid = false;
      }

      return {
        url,
        recordUrl: options["capture.recordRewrites"] ? sourceUrl : "",
        valid,
      };
    };

    const downloadFileInCss = async (url) => {
      // keep original URL for non-supported protocols
      if (!['http:', 'https:', 'file:', 'data:', 'blob:'].some(p => url.startsWith(p))) {
        return url;
      }

      const response = await capturer.downloadFile({
        url,
        refUrl,
        refPolicy,
        settings,
        options,
      }).catch((ex) => {
        console.error(ex);
        this.warn(scrapbook.lang("ErrorFileDownloadError", [url, ex.message]));
        return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
      });
      return response.url;
    };

    const importRules = [];
    let importRuleIdx = 0;
    if (refCss) {
      const rules = await this.getRulesFromCss({css: refCss, url: refUrl, refUrl, refPolicy, envCharset});
      for (const rule of rules) {
        if (rule.type === 3) {
          importRules.push(rule);
        }
      }
    }

    const rewriteImportUrl = async (sourceUrl) => {
      let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, baseUrl);
      switch (options["capture.style"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
          url = "";
          break;
        case "save":
        default:
          if (valid) {
            const rule = importRules[importRuleIdx++];
            await this.rewriteCss({
              url,
              refCss: rule?.styleSheet,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              rootNode,
              settings,
              options,
              callback: (elem, response) => {
                url = response.url;
              },
            });
          }
          break;
      }
      return {url, recordUrl};
    };

    const rewriteFontFaceUrl = async (sourceUrl) => {
      let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, baseUrl);
      switch (options["capture.font"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove": // deprecated
          url = "";
          break;
        case "save-used":
        case "save":
        default:
          if (usedCssFontUrl && !usedCssFontUrl[url]) {
            url = "";
            break;
          }

          if (valid) {
            url = await downloadFileInCss(url);
          }
          break;
      }
      return {url, recordUrl};
    };

    const rewriteBackgroundUrl = async (sourceUrl) => {
      let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, baseUrl);
      switch (options["capture.imageBackground"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove": // deprecated
          url = "";
          break;
        case "save-used":
        case "save":
        default:
          if (usedCssImageUrl && !usedCssImageUrl[url]) {
            url = "";
            break;
          }

          if (valid) {
            url = await downloadFileInCss(url);
          }
          break;
      }
      return {url, recordUrl};
    };

    const rewriteDummy = (x) => ({url: x, recordUrl: ''});

    return await scrapbook.rewriteCssText(cssText, {
      rewriteImportUrl: !isInline ? rewriteImportUrl : rewriteDummy,
      rewriteFontFaceUrl: !isInline ? rewriteFontFaceUrl : rewriteDummy,
      rewriteBackgroundUrl,
      resourceMap: this.resourceMap,
    });
  }

  /**
   * Rewrite given cssRules to cssText.
   *
   * @param {Object} params
   * @param {CSSRuleList|CSSRule[]} params.cssRules - the CSS rules to rewrite.
   * @param {string} params.baseUrl - the base URL for URL resolving.
   * @param {string} params.refUrl - the referrer URL for fetching resources.
   * @param {string} [params.refPolicy] - the referrer policy for fetching
   *   resources.
   * @param {string} [params.envCharset] - the environment charset for fetching
   *   resources.
   * @param {CSSStyleSheet} [params.refCss] - the reference CSS (which holds
   *   the @import rule(s), for an imported CSS).
   * @param {Node|Node[]} [params.rootNode] - the document or ShadowRoot nodes
   *   for verifying selectors.
   * @param {string} [params.indent] - the string to indent the output CSS
   *   text.
   * @param {string} [params.sep] - the string to separate each CSS rule.
   * @param {captureSettings} [params.settings]
   * @param {captureOptions} [params.options]
   */
  async rewriteCssRules({cssRules, baseUrl, refUrl, refPolicy, envCharset, refCss, rootNode, indent = '', sep = '\n', settings, options}) {
    const rules = [];
    for (const cssRule of cssRules) {
      switch (cssRule.type) {
        case CSSRule.STYLE_RULE: {
          // skip if this CSS rule applies to no node in the related root nodes
          if (rootNode) {
            if (!Array.isArray(rootNode)) {
              rootNode = [rootNode];
            }
            if (rootNode.every(rootNode => !this.verifySelector(rootNode, cssRule))) {
              break;
            }
          }

          if (cssRule.cssRules?.length) {
            // nesting CSS

            // style declarations of this rule
            const cssText1 = await this.rewriteCssText({
              cssText: cssRule.style.cssText,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              refCss,
              settings,
              options,
            });

            // recurse into sub-rules
            const cssText2 = (await this.rewriteCssRules({
              cssRules: cssRule.cssRules,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              refCss,
              rootNode,
              indent: indent + '  ',
              settings,
              options,
            }));

            const cssText = (cssText1 ? indent + '  ' + cssText1 + '\n' : '') + cssText2;
            if (cssText) {
              rules[rules.length] = indent + cssRule.selectorText + ' {\n'
                + cssText + '\n'
                + indent + '}';
            }
          } else {
            const cssText = await this.rewriteCssText({
              cssText: cssRule.cssText,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              refCss,
              settings,
              options,
            });
            if (cssText) {
              rules[rules.length] = indent + cssText;
            }
          }
          break;
        }
        case CSSRule.IMPORT_RULE: {
          const cssText = await this.rewriteCssText({
            cssText: cssRule.cssText,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            settings,
            options,
          });
          if (cssText) {
            rules[rules.length] = indent + cssText;
          }
          break;
        }
        case CSSRule.MEDIA_RULE: {
          const cssText = (await this.rewriteCssRules({
            cssRules: cssRule.cssRules,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            indent: indent + '  ',
            settings,
            options,
          }));
          if (cssText) {
            rules[rules.length] = indent + '@media ' + cssRule.conditionText + ' {\n'
                + cssText + '\n'
                + indent + '}';
          }
          break;
        }
        case CSSRule.KEYFRAMES_RULE: {
          const cssText = (await this.rewriteCssRules({
            cssRules: cssRule.cssRules,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            indent: indent + '  ',
            settings,
            options,
          }));
          if (cssText) {
            rules[rules.length] = indent + '@keyframes ' + CSS.escape(cssRule.name) + ' {\n'
                + cssText + '\n'
                + indent + '}';
          }
          break;
        }
        case CSSRule.SUPPORTS_RULE: {
          const cssText = (await this.rewriteCssRules({
            cssRules: cssRule.cssRules,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            indent: indent + '  ',
            settings,
            options,
          }));
          if (cssText) {
            rules[rules.length] = indent + '@supports ' + cssRule.conditionText + ' {\n'
                + cssText + '\n'
                + indent + '}';
          }
          break;
        }
        case CSSRule.NAMESPACE_RULE: {
          const cssText = cssRule.cssText;
          if (cssText) {
            rules[rules.length] = indent + cssText;
          }
          break;
        }
        case CSSRule.FONT_FACE_RULE:
        case CSSRule.PAGE_RULE:
        case CSSRule.KEYFRAME_RULE:
        case 11/* CSSRule.COUNTER_STYLE_RULE */:
        default: {
          const cssText = await this.rewriteCssText({
            cssText: cssRule.cssText,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            settings,
            options,
          });
          if (cssText) {
            rules[rules.length] = indent + cssText;
          }
          break;
        }
      }
    }
    return rules.join(sep);
  }

  /**
   * @callback rewriteCssRewriter
   * @param {Element} elem
   * @param {fetchCssResponse} response
   */

  /**
   * Rewrite an internal, external, or imported CSS.
   *
   * - Pass {elem, callback} for internal or external CSS.
   * - Pass {url, refCss, callback} for imported CSS.
   *
   * @param {Object} params
   * @param {HTMLElement} [params.elem] - the elem to have CSS rewritten.
   * @param {string} [params.url] - the source URL of the imported CSS.
   * @param {?CSSStyleSheet} [params.refCss] - the reference CSS of the
   *   imported CSS (CSSImportRule.styleSheet).
   * @param {string} [params.baseUrl] - the base URL for URL resolving.
   * @param {string} [params.refUrl] - the referrer URL for fetching
   *   resources.
   * @param {string} [params.refPolicy] - the referrer policy for fetching
   *   resources.
   * @param {string} [params.envCharset] - the environment charset for
   *   fetching resources.
   * @param {Node} [params.rootNode] - the reference root node for an
   *   imported CSS.
   * @param {rewriteCssRewriter} params.callback
   * @param {captureSettings} [params.settings]
   * @param {captureOptions} [params.options]
   */
  async rewriteCss({elem, url, refCss, baseUrl, refUrl, refPolicy, envCharset, rootNode, callback, settings, options}) {
    settings = settings ? Object.assign({}, this.settings, settings) : this.settings;
    options = options ? Object.assign({}, this.options, options) : this.options;

    let sourceUrl;
    let cssType = !elem ? 'imported' : elem.nodeName.toLowerCase() === 'link' ? 'external' : 'internal';
    let cssText = "";
    let cssRules;
    let charset;
    let newFilename = "";
    let isCircular = false;
    let isDynamic = false;

    init: {
      if (cssType === 'internal') {
        // prevent missing rootNode
        rootNode = rootNode || elem.getRootNode();

        refCss = this.getElemCss(elem);
        cssText = elem.textContent;
        charset = envCharset;
        break init;
      }

      if (cssType === 'external') {
        // prevent missing rootNode
        rootNode = rootNode || elem.getRootNode();

        refCss = this.getElemCss(elem);
        sourceUrl = elem.getAttribute("href");
      } else if (cssType === 'imported') {
        // rootNode should exist (passed by the importer CSS)

        sourceUrl = url;
      }

      let response;
      try {
        response = await capturer.fetchCss({
          url: sourceUrl,
          refUrl,
          refPolicy,
          envCharset,
          settings,
          options,
        });
      } catch (ex) {
        console.error(ex);
        this.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
        response = {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
        await callback(elem, response);
        return;
      }

      cssText = response.text;
      charset = response.charset;

      isCircular = settings.recurseChain.includes(scrapbook.splitUrlByAnchor(sourceUrl)[0]);
    }

    checkDynamicCss: {
      // Ignore refCss if sourceUrl is circularly referenced, as we cannot get
      // original cssRules from CSSOM in this case and thus cannot reliably
      // determine whether it's dynamic.
      //
      // If style1.css => style2.css => style3.css => style1.css
      // - Chromium: styleSheet of StyleSheet "style3.css" is null
      // - Firefox: cssRules of the circularly referenced StyleSheet "style1.css"
      //            is empty, but can be modified by scripts.
      if (isCircular) {
        break checkDynamicCss;
      }

      if (!refCss) {
        break checkDynamicCss;
      }

      // real rules from CSSOM
      cssRules = await this.getRulesFromCss({
        css: refCss,
        crossOrigin: false,
        errorWithNull: true,
      });

      if (!cssRules) {
        break checkDynamicCss;
      }

      // if charset is not known, force conversion to UTF-8
      // scrapbook.utf8ToUnicode throws an error if cssText contains a UTF-8 invalid char
      const cssTextUnicode = charset ? cssText : await scrapbook.readFileAsText(new Blob([scrapbook.byteStringToArrayBuffer(cssText)]));

      // rules from source CSS text
      const cssRulesSource = this.getRulesFromCssText(cssTextUnicode);

      // difference between cssRulesSource and cssRules is considered dynamic
      // use CSSOM rules instead
      if (cssRulesSource.length !== cssRules.length ||
          !Array.prototype.every.call(
            cssRulesSource,
            (cssRule, i) => (cssRule.cssText === cssRules[i].cssText),
          )) {
        isDynamic = true;

        // Force UTF-8 charset since rules from CSSOM is already parsed by JS
        // and cannot be converted to other charset even if it's gibberish.
        charset = "UTF-8";

        cssText = Array.prototype.map.call(
          cssRules,
          cssRule => cssRule.cssText,
        ).join("\n");
      }
    }

    // register the filename to save (for imported or external CSS)
    // and store in newFilename
    registerFilename: {
      if (cssType === 'internal') {
        break registerFilename;
      }

      // special management for a data URI to be saved as data URI
      if (sourceUrl.startsWith("data:") &&
          (!options["capture.saveDataUriAsFile"] || options["capture.saveAs"] === "singleHtml")) {
        // Save inner URLs as data URL since data URL is null origin
        // and no relative URLs are allowed in it.
        options = Object.assign({}, options, {
          "capture.saveAs": "singleHtml",
        });
        break registerFilename;
      }

      const registry = await capturer.invoke("registerFile", {
        url: sourceUrl,
        role: options["capture.saveAs"] === "singleHtml" ? undefined :
            isDynamic ? `css-${scrapbook.getUuid()}` :
            envCharset ? `css-${envCharset.toLowerCase()}` : 'css',
        settings,
        options,
      });

      // handle circular CSS if it's a file to be saved as data URI
      if (isCircular && options["capture.saveAs"] === "singleHtml") {
        const target = sourceUrl;
        const source = settings.recurseChain[settings.recurseChain.length - 1];
        this.warn(scrapbook.lang("WarnCaptureCircular", [source, target]));
        await callback(elem, Object.assign({}, registry, {
          url: `urn:scrapbook:download:circular:url:${sourceUrl}`,
        }));
        return;
      }

      // handle duplicated CSS
      if (registry.isDuplicate) {
        await callback(elem, Object.assign({}, registry, {
          url: registry.url + scrapbook.splitUrlByAnchor(sourceUrl)[1],
        }));
        return;
      }

      newFilename = registry.filename;
    }

    // do the rewriting according to options
    switch (options["capture.rewriteCss"]) {
      case "url": {
        cssText = await this.rewriteCssText({
          cssText,
          baseUrl: sourceUrl || baseUrl,
          refUrl: sourceUrl || refUrl,
          refPolicy,
          envCharset,
          refCss,
          settings,
          options,
        });
        break;
      }
      case "tidy": {
        if (!isDynamic) {
          charset = "UTF-8";
          if (!isCircular) {
            cssRules = cssRules || this.getRulesFromCssText(cssText);
            cssText = Array.prototype.map.call(
              cssRules,
              cssRule => cssRule.cssText,
            ).join("\n");
          } else {
            cssText = '';
          }
        }
        cssText = await this.rewriteCssText({
          cssText,
          baseUrl: sourceUrl || baseUrl,
          refUrl: sourceUrl || refUrl,
          refPolicy,
          envCharset,
          refCss,
          settings,
          options,
        });
        break;
      }
      case "match": {
        if (!cssRules) {
          charset = "UTF-8";
          if (!isCircular) {
            cssRules = this.getRulesFromCssText(cssText);
          }
        }
        if (cssRules) {
          cssText = await this.rewriteCssRules({
            cssRules,
            baseUrl: sourceUrl || baseUrl,
            refUrl: sourceUrl || refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            settings,
            options,
          });
        } else {
          cssText = '';
        }
        break;
      }
      case "none":
      default: {
        // do nothing
        break;
      }
    }

    // save result back
    {
      if (cssType === 'internal') {
        await callback(elem, {cssText});
        return;
      }

      // Save as byte string when charset is unknown so that the user can
      // convert the saved CSS file if the assumed charset is incorrect.
      let blob = new Blob(
        [charset ? cssText : scrapbook.byteStringToArrayBuffer(cssText)],
        {type: charset ? "text/css;charset=UTF-8" : "text/css"},
      );
      blob = await capturer.saveBlobCache(blob);

      // imported or external CSS
      const response = await capturer.invoke("downloadBlob", {
        blob,
        filename: newFilename,
        sourceUrl,
        settings,
        options,
      });

      await callback(elem, Object.assign({}, response, {
        url: response.url + scrapbook.splitUrlByAnchor(sourceUrl)[1],
      }));
    }
  }
}

capturer.DocumentCssHandler = DocumentCssHandler;


/**
 * A class that calculates used CSS resources of a document.
 *
 * - Currently we only check whether a font is USED (font-family referred
 *   by CSS) rather than LOADED due to performance consideration and
 *   technical restriction—even if Document.fonts can be checked, it's
 *   hard to trace whether a "loading" status will become "loaded" or
 *   "error".
 * - Implement scoping of @font-face, @keyframes, etc., according to the
 *   spec (https://drafts.csswg.org/css-scoping/#shadow-names), regardless
 *   that it's not yet correctly implemented by most browsers:
 *   - e.g. In Chromium 121 and Firefox 124, @font-face in a shadow DOM
 *     doesn't work.
 *   - e.g. In Chromium 121 and Firefox 124, animation in a shadow DOM
 *     does not search @keyframes from the ancestor scopes.
 *   - ref: https://wiki.csswg.org/spec/css-scoping
 * - A font/keyframe name referenced in a shadow DOM is treated as referenced
 *   in local and all upper scopes, since the local @font-face/@keyframes rule
 *   may be inside a conditional rule and not really used.
 */
class DocumentCssResourcesHandler {
  constructor(cssHandler) {
    this.cssHandler = cssHandler;
  }

  /** @public */
  start() {
    this.scopes = [];
    this.usedFontUrls = {};
    this.usedImageUrls = {};

    this.scopePush(this.cssHandler.doc);
  }

  /** @public */
  stop() {
    while (this.scopes.length) {
      this.scopePop();
    }
  }

  /** @public */
  scopePush(docOrShadowRoot) {
    this.scopes.push({
      root: docOrShadowRoot,
      fontMap: new MapWithDefault(() => ({
        used: false,
        urls: new Set(),
      })),
      keyFrameMap: new MapWithDefault(() => ({
        used: false,
        fonts: new Set(),
        urls: new Set(),
      })),
      fontUsed: new Set(),
      keyFrameUsed: new Set(),
    });
  }

  /** @public */
  scopePop() {
    // mark used keyFrames
    for (let name of this.scopes[this.scopes.length - 1].keyFrameUsed) {
      for (let i = this.scopes.length; i--;) {
        this.scopes[i].keyFrameMap.get(name).used = true;
      }
    }

    // mark used fonts
    for (let ff of this.scopes[this.scopes.length - 1].fontUsed) {
      for (let i = this.scopes.length; i--;) {
        this.scopes[i].fontMap.get(ff).used = true;
      }
    }

    const scope = this.scopes.pop();

    // collect used keyFrames and their used fonts and images
    for (const {used, fonts, urls} of scope.keyFrameMap.values()) {
      if (!used) { continue; }
      for (const font of fonts) {
        scope.fontMap.get(font).used = true;
      }
      for (const url of urls) {
        this.usedImageUrls[url] = true;
      }
    }

    // collect used fonts
    for (const {used, urls} of scope.fontMap.values()) {
      if (!used) { continue; }
      for (const url of urls) {
        this.usedFontUrls[url] = true;
      }
    }
  }

  /** @public */
  async inspectCss({css, baseUrl, refUrl, refPolicy, envCharset, root}) {
    const rules = await this.cssHandler.getRulesFromCss({css, refUrl, refPolicy, envCharset});
    for (const rule of rules) {
      await this.parseCssRule({
        rule,
        baseUrl: css.href || baseUrl,
        refUrl: css.href || refUrl,
        refPolicy,
        envCharset,
        root,
      });
    }
  }

  /** @public */
  inspectStyle({style, baseUrl, isInline = false}) {
    for (let prop of style) {
      if (prop === 'font-family') {
        this.useFont(style.getPropertyValue('font-family'));
      } else if (prop === 'animation-name') {
        this.useKeyFrame(style.getPropertyValue('animation-name'));
      } else if (!isInline) {
        this.forEachUrl(style.getPropertyValue(prop), baseUrl, (url) => {
          this.useImage(url);
        });
      }
    }
  }

  async parseCssRule({rule: cssRule, baseUrl, refUrl, refPolicy, envCharset, root}) {
    switch (cssRule.type) {
      case CSSRule.STYLE_RULE: {
        // this CSS rule applies to no node in the captured area
        if (!this.cssHandler.verifySelector(root, cssRule)) { break; }

        this.inspectStyle({style: cssRule.style, baseUrl});

        // recurse into sub-rules for nesting CSS
        if (cssRule.cssRules?.length) {
          for (const rule of cssRule.cssRules) {
            await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
          }
        }

        break;
      }
      case CSSRule.IMPORT_RULE: {
        if (!cssRule.styleSheet) { break; }

        const css = cssRule.styleSheet;
        const url = new URL(cssRule.href, baseUrl).href;
        const rules = await this.cssHandler.getRulesFromCss({css, url, refUrl, refPolicy, envCharset});
        for (const rule of rules) {
          await this.parseCssRule({rule, baseUrl: url, refUrl: url, refPolicy, envCharset, root});
        }
        break;
      }
      case CSSRule.MEDIA_RULE: {
        if (!cssRule.cssRules) { break; }

        for (const rule of cssRule.cssRules) {
          await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
        }
        break;
      }
      case CSSRule.FONT_FACE_RULE: {
        if (!cssRule.cssText) { break; }

        const fontFamily = cssRule.style.getPropertyValue('font-family');
        const src = cssRule.style.getPropertyValue('src');

        if (!fontFamily || !src) { break; }

        // record this font family and its font URLs
        this.forEachUrl(src, baseUrl, (url) => {
          this.addFontUrl(fontFamily, url);
        });

        break;
      }
      case CSSRule.PAGE_RULE: {
        if (!cssRule.cssText) { break; }

        this.inspectStyle({style: cssRule.style, baseUrl});
        break;
      }
      case CSSRule.KEYFRAMES_RULE: {
        if (!cssRule.cssRules) { break; }

        for (const rule of cssRule.cssRules) {
          await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
        }
        break;
      }
      case CSSRule.KEYFRAME_RULE: {
        if (!cssRule.cssText) { break; }

        this.addKeyFrameFont(cssRule.parentRule.name, cssRule.style.getPropertyValue('font-family'));

        this.forEachUrl(cssRule.cssText, baseUrl, (url) => {
          this.addKeyFrameUrl(cssRule.parentRule.name, url);
        });
        break;
      }
      // Chromium < 91: COUNTER_STYLE_RULE not supported
      case 11/* CSSRule.COUNTER_STYLE_RULE */: {
        if (!cssRule.symbols) { break; }

        this.forEachUrl(cssRule.symbols, baseUrl, (url) => {
          this.useImage(url);
        });
        break;
      }
      default: {
        if (!cssRule.cssRules) { break; }

        for (const rule of cssRule.cssRules) {
          await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
        }
        break;
      }
    }
  }

  /**
   * - propText is CSS property value of font-family or animation-name,
   *   which is normalized.
   * - Names are separated with ", ".
   * - An identifier is not quoted, with special chars escaped with '\'.
   * - A string is quoted with "", and '"'s inside are escaped with '\"'.
   * - Unicode escape sequences are unescaped.
   * - CSS comments are removed.
   */
  parseNames(...args) {
    const regex = /"[^\\"]*(?:\\.[^\\"]*)*"|((?:[^,\s\\"]|\\(?:[0-9A-Fa-f]{1,6} ?|.))+)(?:,|$)/g;
    const fn = (propText) => {
      const names = [];
      let m;
      while (m = regex.exec(propText)) {
        let value = m[1] || m[0].slice(1, -1);
        value = scrapbook.unescapeCss(value);
        names.push(value);
      }
      return names;
    };
    Object.defineProperty(this, 'parseNames', {value: fn});
    return fn(...args);
  }

  forEachUrl(cssText, baseUrl, callback = x => x) {
    // We pass only inline css text, which should not contain any at-rule
    scrapbook.rewriteCssText(cssText, {
      rewriteImportUrl(url) { return {url}; },
      rewriteFontFaceUrl(url) { return {url}; },
      rewriteBackgroundUrl(url) {
        const targetUrl = capturer.resolveRelativeUrl(url, baseUrl);
        callback(targetUrl);
        return {url};
      },
      resourceMap: this.cssHandler.resourceMap,
    });
  }

  addFontUrl(fontFamilyText, url) {
    if (!url) { return; }
    for (const ff of this.parseNames(fontFamilyText)) {
      this.scopes[this.scopes.length - 1].fontMap.get(ff).urls.add(url);
    }
  }

  useFont(fontFamilyText) {
    if (!fontFamilyText) { return; }
    for (const ff of this.parseNames(fontFamilyText)) {
      this.scopes[this.scopes.length - 1].fontUsed.add(ff);
    }
  }

  addKeyFrameFont(name, fontFamilyText) {
    if (!fontFamilyText) { return; }
    for (const ff of this.parseNames(fontFamilyText)) {
      this.scopes[this.scopes.length - 1].keyFrameMap.get(name).fonts.add(ff);
    }
  }

  addKeyFrameUrl(name, url) {
    if (!url) { return; }
    this.scopes[this.scopes.length - 1].keyFrameMap.get(name).urls.add(url);
  }

  useKeyFrame(animationNameText) {
    if (!animationNameText) { return; }

    for (const name of this.parseNames(animationNameText)) {
      this.scopes[this.scopes.length - 1].keyFrameUsed.add(name);
    }
  }

  useImage(url) {
    this.usedImageUrls[url] = true;
  }
}

capturer.DocumentCssResourcesHandler = DocumentCssResourcesHandler;


/**
 * A class that handles capture helpers.
 */
class CaptureHelperHandler {
  constructor({helpers, rootNode, docUrl, origNodeMap} = {}) {
    this.helpers = helpers;
    this.rootNode = rootNode;
    this.docUrl = docUrl;
    this.origNodeMap = origNodeMap;
    this.commandId = 0;
    this.debugging = false;
  }

  run() {
    const {helpers, rootNode, docUrl} = this;
    const errors = [];

    try {
      for (let i = 0, I = helpers.length; i < I; ++i) {
        const helper = helpers[i];

        if (helper.disabled) {
          continue;
        }

        if (helper.debug) {
          this.debugging = true;
        }

        if (helper.pattern) {
          helper.pattern.lastIndex = 0;
          if (!helper.pattern.test(docUrl)) {
            continue;
          }
        }

        if (Array.isArray(helper.commands)) {
          if (this.debugging) {
            const nameStr = helper.name ? ` (${helper.name})` : '';
            console.debug(`WebScrapBook: Running capture helper[${i}]${nameStr} for ${this.docUrl}`);
          }

          for (const command of helper.commands) {
            if (!this.isCommand(command)) {
              const msg = `Skipped running invalid capture helper command: ${JSON.stringify(command)}`;
              console.error(`WebScrapBook: ${msg}`);
              errors.push(msg);
              continue;
            }
            try {
              this.runCommand(command, rootNode);
            } catch (ex) {
              const msg = `Error running capture helper command: ${JSON.stringify(command)}`;
              console.error(`WebScrapBook: ${msg}`);
              console.error(ex);
              errors.push(`${msg}: ${ex.message}`);
            }
          }
        }
      }

      this.debugging = false;
    } catch (ex) {
      const msg = `Error running capture helper`;
      console.error(`WebScrapBook: ${msg}`);
      console.error(ex);
      errors.push(`${msg}: ${ex.message}`);
    }

    return {
      errors,
    };
  }

  static getOverwritingOptions(helpers, docUrl) {
    const rv = {};
    if (docUrl) {
      for (let i = 0, I = helpers.length; i < I; ++i) {
        const helper = helpers[i];

        if (helper.disabled) {
          continue;
        }

        if (helper.pattern) {
          helper.pattern.lastIndex = 0;
          if (!helper.pattern.test(docUrl)) {
            continue;
          }
        }

        if (typeof helper.options === 'object') {
          Object.assign(rv, helper.options);
        }
      }

      // forbid overwriting capture helper related options
      delete rv["capture.helpersEnabled"];
      delete rv["capture.helpers"];
    }
    return rv;
  }

  static parseRegexStr(str) {
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/i;
    const fn = (str) => {
      const m = REGEX_PATTERN.exec(str);
      if (m) {
        return new RegExp(m[1], m[2]);
      }
      return null;
    };
    Object.defineProperty(CaptureHelperHandler, 'parseRegexStr', {value: fn});
    return fn(str);
  }

  parseRegexStr(...args) {
    return this.constructor.parseRegexStr.apply(this, args);
  }

  static getOwnerDocument(node) {
    return node.nodeType === 9 ? node : node.ownerDocument;
  }

  getOwnerDocument(...args) {
    return this.constructor.getOwnerDocument.apply(this, args);
  }

  static selectNodes(rootNode, selector) {
    if (!selector) {
      return [rootNode];
    }

    const isStringSelector = (typeof selector === 'string');
    if (isStringSelector) {
      selector = {base: selector};
    }

    // modify rootNode according to selector.base
    if (typeof selector.base === 'string') {
      modifyRootNode: {
        let newRootNode = rootNode;
        for (const part of selector.base.split('.')) {
          switch (scrapbook.trim(part)) {
            case 'root':
              newRootNode = newRootNode.getRootNode();
              break;
            case 'parent':
              newRootNode = newRootNode.parentNode;
              break;
            case 'firstChild':
              newRootNode = newRootNode.firstChild;
              break;
            case 'lastChild':
              newRootNode = newRootNode.lastChild;
              break;
            case 'firstElementChild':
              newRootNode = newRootNode.firstElementChild;
              break;
            case 'lastElementChild':
              newRootNode = newRootNode.lastElementChild;
              break;
            case 'previousSibling':
              newRootNode = newRootNode.previousSibling;
              break;
            case 'nextSibling':
              newRootNode = newRootNode.nextSibling;
              break;
            case 'previousElementSibling':
              newRootNode = newRootNode.previousElementSibling;
              break;
            case 'nextElementSibling':
              newRootNode = newRootNode.nextElementSibling;
              break;
            case 'self':
              // do nothing
              break;
            default:
              // invalid base
              // treat string selector with invalid base as a css selector
              if (isStringSelector) {
                selector = {css: selector.base};
              }
              break modifyRootNode;
          }
        }
        rootNode = newRootNode;
      }
    }

    // apply the selector
    if (typeof selector.css === 'string') {
      return rootNode.querySelectorAll(selector.css);
    }
    if (typeof selector.xpath === 'string') {
      const doc = this.getOwnerDocument(rootNode);
      const iter = doc.evaluate(selector.xpath, rootNode, null, 0, null);
      let elems = [], elem;
      while (elem = iter.iterateNext()) {
        elems.push(elem);
      }
      return elems;
    }
    return [rootNode];
  }

  selectNodes(...args) {
    return this.constructor.selectNodes.apply(this, args);
  }

  static isCommand(obj) {
    if (Array.isArray(obj) && typeof obj[0] === 'string') {
      return true;
    }
    return false;
  }

  isCommand(...args) {
    return this.constructor.isCommand.apply(this, args);
  }

  runCommand(command, rootNode) {
    let debug = false;
    let cmd = this.resolve(command[0], rootNode);
    if (cmd.startsWith('*')) {
      if (this.debugging) { debug = true; }
      cmd = cmd.slice(1);
    }
    if (!this['cmd_' + cmd]) {
      throw new Error(`Unknown helper command: ${cmd}`);
    }
    const id = this.commandId++;
    if (debug) {
      console.debug(`WebScrapBook: Running helper (${id}) ${JSON.stringify(command)} at`, this.origNodeMap.get(rootNode) || rootNode);
    }
    const rv = this['cmd_' + cmd].apply(this, [rootNode, ...command.slice(1)]);
    if (debug) {
      console.debug(`WebScrapBook: Running helper (${id}) returns`, rv);
    }
    return rv;
  }

  resolve(obj, rootNode) {
    if (this.isCommand(obj)) {
      return this.runCommand(obj, rootNode);
    }
    return obj;
  }

  resolveNodeData(nodeData, rootNode) {
    const doc = this.getOwnerDocument(rootNode);

    if (typeof nodeData === 'string') {
      nodeData = {
        name: "#text",
        value: nodeData,
      };
    }

    let {name, value = null, attrs, children} = nodeData;
    name = this.resolve(name, rootNode);
    value = this.resolve(value, rootNode);

    const tag = name || "#text";
    switch (tag) {
      case "#text": {
        return doc.createTextNode(value || "");
      }
      case "#comment": {
        return doc.createComment(scrapbook.escapeHtmlComment(value || ""));
      }
      default: {
        const newElem = doc.createElement(tag);

        if (!attrs) {
          // do nothing
        } else if (Array.isArray(attrs)) {
          for (const [key, value] of attrs) {
            newElem.setAttribute(this.resolve(key, rootNode), this.resolve(value, rootNode));
          }
        } else if (typeof attrs === 'object') {
          for (const key in attrs) {
            newElem.setAttribute(key, this.resolve(attrs[key], rootNode));
          }
        }

        if (value !== null) {
          newElem.textContent = value;
        } else if (children) {
          for (let childNodeData of children) {
            childNodeData = this.resolve(childNodeData, rootNode);
            newElem.appendChild(this.resolveNodeData(childNodeData, rootNode));
          }
        }

        return newElem;
      }
    }
  }

  cmd_if(rootNode, condition, thenValue, elseValue) {
    if (this.resolve(condition, rootNode)) {
      return this.resolve(thenValue, rootNode);
    }
    return this.resolve(elseValue, rootNode);
  }

  cmd_equal(rootNode, value1, value2, strict) {
    value1 = this.resolve(value1, rootNode);
    value2 = this.resolve(value2, rootNode);
    strict = this.resolve(strict, rootNode);
    if (strict) {
      return value1 === value2;
    }
    return value1 == value2;
  }

  cmd_and(rootNode, ...args) {
    let value;
    for (const arg of args) {
      value = this.resolve(arg, rootNode);
      if (!value) {
        return value;
      }
    }
    return value;
  }

  cmd_or(rootNode, ...args) {
    let value;
    for (const arg of args) {
      value = this.resolve(arg, rootNode);
      if (value) {
        return value;
      }
    }
    return value;
  }

  cmd_concat(rootNode, baseArg, ...args) {
    let rv = String(this.resolve(baseArg, rootNode) || "");
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv += String(value || "");
    }
    return rv;
  }

  cmd_slice(rootNode, text, beginIndex, endIndex) {
    text = String(this.resolve(text, rootNode) || "");
    beginIndex = this.resolve(beginIndex, rootNode);
    endIndex = this.resolve(endIndex, rootNode);
    return text.slice(beginIndex, endIndex);
  }

  cmd_upper(rootNode, text) {
    text = String(this.resolve(text, rootNode) || "");
    return text.toUpperCase();
  }

  cmd_lower(rootNode, text) {
    text = String(this.resolve(text, rootNode) || "");
    return text.toLowerCase();
  }

  cmd_encode_uri(rootNode, text, safe) {
    text = String(this.resolve(text, rootNode) || "");
    safe = String(this.resolve(safe, rootNode) || "");
    if (safe) {
      return text.replace(new RegExp(`[^${scrapbook.escapeRegExp(safe)}]+`, 'ug'), x => encodeURIComponent(x));
    }
    return encodeURIComponent(text);
  }

  cmd_decode_uri(rootNode, text) {
    text = String(this.resolve(text, rootNode) || "");
    try {
      return decodeURIComponent(text);
    } catch (ex) {
      return text;
    }
  }

  cmd_add(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv += Number(value);
    }
    return rv;
  }

  cmd_subtract(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv -= Number(value);
    }
    return rv;
  }

  cmd_multiply(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv *= Number(value);
    }
    return rv;
  }

  cmd_divide(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv /= Number(value);
    }
    return rv;
  }

  cmd_mod(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv %= Number(value);
    }
    return rv;
  }

  cmd_power(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv **= Number(value);
    }
    return rv;
  }

  cmd_for(rootNode, selector, ...commands) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      for (const command of commands) {
        this.resolve(command, elem);
      }
    }
  }

  cmd_match(rootNode, str, pattern, group) {
    str = String(this.resolve(str, rootNode) || "");
    pattern = this.parseRegexStr(this.resolve(pattern, rootNode));
    group = this.resolve(group, rootNode);
    if (Number.isInteger(group)) {
      // subgroup index
      if (!pattern) { return null; }
      const m = str.match(pattern);
      if (!m) { return null; }
      return m[group];
    } else if (typeof group === 'string') {
      // subgroup name
      if (!pattern) { return null; }
      const m = str.match(pattern);
      if (!m) { return null; }
      return m.groups[group];
    } else {
      // boolean mode
      if (!pattern) { return false; }
      return pattern.test(str);
    }
  }

  cmd_replace(rootNode, str, pattern, replacement) {
    str = String(this.resolve(str, rootNode) || "");
    pattern = this.parseRegexStr(this.resolve(pattern, rootNode));
    replacement = this.resolve(replacement, rootNode) || "";
    return pattern ? str.replace(pattern, replacement) : str;
  }

  cmd_has_node(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    return elems.length > 0;
  }

  cmd_has_attr(rootNode, selector, attr) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      return elems[0].hasAttribute(this.resolve(attr, rootNode));
    } catch (ex) {
      return false;
    }
  }

  cmd_get_html(rootNode, selector, isOuter) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      const elem = elems[0];
      if (this.resolve(isOuter, elem)) {
        return elem.outerHTML;
      } else {
        return elem.innerHTML;
      }
    } catch (ex) {
      return null;
    }
  }

  cmd_get_text(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      return elems[0].textContent;
    } catch (ex) {
      return null;
    }
  }

  cmd_get_attr(rootNode, selector, attr) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      return elems[0].getAttribute(this.resolve(attr, rootNode));
    } catch (ex) {
      return null;
    }
  }

  cmd_get_css(rootNode, selector, style, getPriority) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      if (this.resolve(getPriority, rootNode)) {
        return elems[0].style.getPropertyPriority(this.resolve(style, rootNode));
      } else {
        return elems[0].style.getPropertyValue(this.resolve(style, rootNode));
      }
    } catch (ex) {
      return null;
    }
  }

  cmd_remove(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      elem.remove();
    }
  }

  cmd_unwrap(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      scrapbook.unwrapNode(elem);
    }
  }

  cmd_isolate(rootNode, selector) {
    const doc = this.getOwnerDocument(rootNode);

    // get a set of nodes to preserve
    const toPreserve = new Set();
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      const xResult = doc.evaluate('ancestor-or-self::node() | descendant::node()', elem, null, XPathResult.ANY_TYPE);
      let node;
      while (node = xResult.iterateNext()) {
        toPreserve.add(node);
      }
    }

    // filter nodes to remove
    // isolate nodes under body (preserve head) for HTML document
    const root = doc.body || doc.documentElement;
    const toRemove = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ALL, {
      acceptNode: (node) => {
        return toPreserve.has(node) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while (node = walker.nextNode()) {
      toRemove.push(node);
    }

    // remove the nodes
    for (const node of toRemove.reverse()) {
      node.parentNode.removeChild(node);
    }
  }

  cmd_html(rootNode, selector, value, isOuter) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      if (this.resolve(isOuter, elem)) {
        elem.outerHTML = this.resolve(value, elem);
      } else {
        elem.innerHTML = this.resolve(value, elem);
      }
    }
  }

  cmd_text(rootNode, selector, value) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      elem.textContent = this.resolve(value, elem);
    }
  }

  cmd_attr(rootNode, selector, attrs, attrValue) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      if (!elem.setAttribute) { continue; }

      const _attrs = this.resolve(attrs, elem);
      if (!_attrs) { continue; }

      // key, value
      if (typeof _attrs === 'string') {
        const key = _attrs;
        const value = this.resolve(attrValue, elem);
        if (value !== null) {
          elem.setAttribute(key, value);
        } else {
          elem.removeAttribute(key);
        }
        continue;
      }

      // [[key1, value1], ...]
      if (Array.isArray(_attrs)) {
        for (let [key, value] of _attrs) {
          key = this.resolve(key, elem);
          value = this.resolve(value, elem);
          if (value !== null) {
            elem.setAttribute(key, value);
          } else {
            elem.removeAttribute(key);
          }
        }
        continue;
      }

      // {key1: value1, ...}
      if (typeof _attrs === 'object') {
        for (const key in _attrs) {
          const value = this.resolve(_attrs[key], elem);
          if (value !== null) {
            elem.setAttribute(key, value);
          } else {
            elem.removeAttribute(key);
          }
        }
        continue;
      }
    }
  }

  cmd_css(rootNode, selector, styles, styleValue, stylePriority) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      if (!elem.style) { continue; }

      const _styles = this.resolve(styles, elem);
      if (!_styles) { continue; }

      // key, value, priority
      if (typeof _styles === 'string') {
        const key = _styles;
        const value = this.resolve(styleValue, elem);
        const priority = this.resolve(stylePriority, elem);
        if (value !== null) {
          elem.style.setProperty(key, value, priority);
        } else {
          elem.style.removeProperty(key);
        }
      }

      // [[key1, value1, priority1], ...]
      if (Array.isArray(_styles)) {
        for (let [key, value, priority] of _styles) {
          key = this.resolve(key, elem);
          value = this.resolve(value, elem);
          priority = this.resolve(priority, elem);
          if (value !== null) {
            elem.style.setProperty(key, value, priority);
          } else {
            elem.style.removeProperty(key);
          }
        }
        continue;
      }

      // {key1: value1, ...}
      if (typeof _styles === 'object') {
        for (const key in _styles) {
          const value = this.resolve(_styles[key], elem);
          if (value !== null) {
            elem.style.setProperty(key, value);
          } else {
            elem.style.removeProperty(key);
          }
        }
        continue;
      }
    }
  }

  cmd_insert(rootNode, selector, nodeData, mode, index) {
    const doc = this.getOwnerDocument(rootNode);
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      const _nodeData = this.resolve(nodeData, rootNode);
      let newNode;
      if (!_nodeData) {
        continue;
      } else if (typeof _nodeData === 'string' || _nodeData.name) {
        newNode = this.resolveNodeData(_nodeData, elem);
      } else {
        newNode = doc.createDocumentFragment();
        for (const child of this.selectNodes(elem, _nodeData)) {
          newNode.appendChild(child);
        }
      }

      switch (this.resolve(mode, elem)) {
        case 'before': {
          elem.parentNode.insertBefore(newNode, elem);
          break;
        }
        case 'after': {
          elem.parentNode.insertBefore(newNode, elem.nextSibling);
          break;
        }
        case 'replace': {
          elem.parentNode.replaceChild(newNode, elem);
          break;
        }
        case 'insert': {
          elem.insertBefore(newNode, elem.childNodes[this.resolve(index, elem)]);
          break;
        }
        case 'append':
        default: {
          elem.appendChild(newNode);
          break;
        }
      }
    }
  }
}

capturer.CaptureHelperHandler = CaptureHelperHandler;


return capturer;

}));
