/******************************************************************************
 * Common capture utilities shared among background and content scripts.
 *****************************************************************************/

import {isDebug} from "../utils/debug.mjs";
import {ANNOTATION_CSS} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";
import {StorageCache, serializeObject, deserializeObject} from "../utils/cache.mjs";
import {dataUriToFile} from "../utils/datauri.mjs";
import {ItemInfoFormatter as _ItemInfoFormatter} from "../scrapbook/item-info-formatter.mjs";
import {DocumentCssHandler, DocumentCssResourcesHandler} from "./css-handler.mjs";
import {CaptureHelperHandler} from "./helper-handler.mjs";

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
 *
 * @typedef {Object} captureSettings
 * @property {string} missionId - mission ID for the current capture tasks
 * @property {string} timeId - scrapbook ID for the current capture task
 * @property {?string} documentName - document name for registering
 * @property {?string} indexFilename - index filename of the current capture task
 * @property {string[]} recurseChain
 * @property {number} depth
 * @property {boolean} isMainPage
 * @property {boolean} isMainFrame
 * @property {boolean} fullPage - force to capture the full page
 * @property {string} type - item type
 * @property {string} title - item title
 * @property {string} favIconUrl - item favicon
 */

/**
 * Options of the current capture which is the "capture.*" subgroup of
 * scrapbookOptions.
 *
 * @typedef {scrapbookOptions} captureOptions
 */

/**
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

    return await capturer.invoke("captureFile", [{
      url: doc.URL,
      refUrl,
      refPolicy,
      charset: doc.characterSet,
      settings: Object.assign({}, settings, {
        title: settings.title || doc.title,
      }),
      options,
    }]);
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
    return capturer.invoke("remoteMsg", [{
      msg,
      type: 'warn',
      settings, // for missionId
    }]);
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
          url: capturer.getRedirectedUrl(response.url, utils.splitUrlByAnchor(url)[1]),
        });
      })
      .catch((ex) => {
        console.error(ex);
        warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
        return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
      });
  };

  // Map cloned nodes and the original for later reference
  // since cloned nodes may lose some information,
  // e.g. cloned iframes has no content, cloned canvas has no image,
  // and cloned form elements has no current status.
  const cloneNodeMapping = (node, deep = false) => {
    return utils.cloneNode(node, deep, {
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
      const comment = newDoc.createComment(`scrapbook-orig-node-${timeId}=${utils.escapeHtmlComment(elem.outerHTML)}`);
      elem.parentNode.replaceChild(comment, elem);
    } else {
      elem.parentNode.removeChild(elem);
    }
  };

  // rewrite the specified attr, record it if option set
  // if value is false/null/undefined, remove the attr
  // if value is true, set attr to "" iff attr not exist
  const captureRewriteAttr = (elem, attr, value, record = options["capture.recordRewrites"]) => {
    const [ns, att] = utils.splitXmlAttribute(attr);

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
    const [urlMain, urlHash] = utils.splitUrlByAnchor(url);
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
        const targetId = CSS.escape(utils.decodeURIComponent(urlHash.slice(1)));
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
            warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
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
        if (!utils.isUrlAbsolute(url)) {
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
    if (!REWRITABLE_SPECIAL_OBJECTS.has(utils.getScrapbookObjectType(node))) {
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
            baseUrl = utils.splitUrlByAnchor(newUrl)[0];
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
                const contentType = utils.parseHeaderContentType(elem.getAttribute("content"));
                if (contentType.parameters.charset && !metaCharsetNode) {
                  // force UTF-8
                  metaCharsetNode = elem;
                  const regexToken = /^[!#$%&'*+.0-9A-Z^_`a-z|~-]+$/;
                  let value = contentType.type;
                  for (const field in contentType.parameters) {
                    let v = contentType.parameters[field];
                    if (field === 'charset') { v = 'UTF-8'; }
                    value += '; ' + field + '=' + (regexToken.test(v) ? v : '"' + utils.escapeQuotes(v) + '"');
                  }
                  captureRewriteAttr(elem, "content", value);
                }
                break;
              }
              case "refresh": {
                // rewrite meta refresh
                const metaRefresh = utils.parseHeaderRefresh(elem.getAttribute("content"));
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
                          warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
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
            const rewriteSrcset = utils.rewriteSrcset(elem.getAttribute("imagesrcset"), (url) => {
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
                  if (!utils.userAgent.is("chromium")) {
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
                  const file = dataUriToFile(response.url);
                  const content = await utils.readFileAsText(file);
                  captureRewriteAttr(frame, "srcdoc", content);
                  return response;
                };

                const captureFrameErrorHandler = async (ex) => {
                  console.error(ex);
                  warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
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
                  const file = dataUriToFile(response.url);
                  const {type: mime, parameters: {charset}} = utils.parseHeaderContentType(file.type);
                  if (mime === "text/html") {
                    // assume the charset is UTF-8 if not defined
                    const content = await utils.readFileAsText(file, charset || "UTF-8");
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
                warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
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
                  const response = await capturer.invoke("captureDocumentOrFile", [{
                    refUrl,
                    refPolicy,
                    settings: frameSettings,
                    options,
                  }], {frameWindow}).catch(captureFrameErrorHandler);
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
                if (!utils.isUrlAbsolute(sourceUrl)) {
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

                const [sourceUrlMain, sourceUrlHash] = utils.splitUrlByAnchor(sourceUrl);
                frameSettings.recurseChain.push(docUrl);

                // check circular reference if saving as data URL
                if (frameOptions["capture.saveAs"] === "singleHtml") {
                  if (frameSettings.recurseChain.includes(sourceUrlMain)) {
                    warn(utils.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
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
                const newUrls = utils.rewriteUrls(elem.getAttribute("ping"), (url) => {
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
            const rewriteSrcset = utils.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
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
                  const response = await utils.rewriteSrcset(elem.getAttribute("srcset"), async (url) => {
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
            const rewriteSrcset = utils.rewriteSrcset(subElem.getAttribute("srcset"), (url) => {
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
                  const response = await utils.rewriteSrcset(subElem.getAttribute("srcset"), async (url) => {
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
                  if (!utils.isUrlAbsolute(sourceUrl)) {
                    return;
                  }

                  // keep original about:blank etc. as the real content is
                  // not accessible
                  if (sourceUrl.startsWith('about:')) {
                    return;
                  }

                  const [sourceUrlMain, sourceUrlHash] = utils.splitUrlByAnchor(sourceUrl);

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
                      warn(utils.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
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
                    warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
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
            const newUrls = utils.rewriteUrls(elem.getAttribute("archive"), (url) => {
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
                  if (!utils.isUrlAbsolute(sourceUrl)) {
                    return;
                  }

                  // keep original about:blank etc. as the real content is
                  // not accessible
                  if (sourceUrl.startsWith('about:')) {
                    return;
                  }

                  const [sourceUrlMain, sourceUrlHash] = utils.splitUrlByAnchor(sourceUrl);

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
                      warn(utils.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
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
                    warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
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
                  const response = await utils.rewriteUrls(elem.getAttribute("archive"), async (url) => {
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
                if (data !== utils.getBlankCanvasData(elemOrig)) {
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
        const shadowRoot = utils.getShadowRoot(elem);
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
    for (const css of utils.getAdoptedStyleSheets(docOrShadowRoot)) {
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
  const [metaDocUrl, metaDocUrlHash] = utils.splitUrlByAnchor(params.metaDocUrl || doc.URL);
  const [docUrl, docUrlHash] = utils.splitUrlByAnchor(params.docUrl || doc.URL);

  // baseUrl: updates dynamically when the first base[href] is parsed.
  // baseUrlFallback: the initial baseUrl, used for resolving base elements.
  // baseUrlFinal: the final baseUrl, used for resolving links etc.
  // refUrl: used as the referrer when retrieving resources. Actually same
  //     as docUrl.
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
  const baseUrlFallback = utils.splitUrlByAnchor(params.baseUrl || docUrl)[0];
  let baseUrl = baseUrlFallback;
  const baseUrlFinal = (() => {
    let base = baseUrlFallback;
    for (const elem of doc.querySelectorAll('base[href]')) {
      if (elem.closest('svg, math')) { continue; }
      base = new URL(elem.getAttribute('href'), baseUrlFallback).href;
      base = utils.splitUrlByAnchor(base)[0];
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
      title: settings.title || doc.title || utils.filenameParts(utils.urlToFilename(docUrl))[0] || "untitled",
      sourceUrl: docUrl,
      isFolder: options["capture.saveAs"] === "folder",
      settings,
      options,
    });
  }

  // register the main document before parsing so that it goes before
  // sub-frame documents.
  const registry = await capturer.invoke("registerDocument", [{
    docUrl,
    mime,
    role: (options["capture.saveAs"] === "singleHtml" || (docUrl.startsWith("data:") && !options["capture.saveDataUriAsFile"])) ? undefined :
        (isMainFrame || (isHeadless && !capturer.isAboutUrl(metaDocUrl))) ? "document" :
        `document-${utils.getUuid()}`,
    settings,
    options,
  }]);

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
    settings.documentName = utils.filenameParts(documentFileName)[0];
  }

  // construct the cloned node tree
  const origNodeMap = new WeakMap();
  const clonedNodeMap = new WeakMap();
  const shadowRootList = [];
  const slotMap = new Map();
  const adoptedStyleSheetMap = new Map();
  const customElementNames = new Set();

  // create a new document to replicate nodes via import
  const newDoc = utils.cloneDocument(doc, {origNodeMap, clonedNodeMap});

  let rootNode, headNode;
  let selection = settings.fullPage ? null : utils.getSelection(doc);
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
      for (curRange of utils.getSelectionRanges(selection)) {
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
  // options["capture.helpersEnabled"] is truthy, as validated in
  // `capturer.captureGeneral`.
  if (options["capture.helpersEnabled"]) {
    const helpers = utils.parseOption("capture.helpers", options["capture.helpers"]);
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
  }, capturer);
  const cssResourcesHandler = new DocumentCssResourcesHandler(cssHandler);

  // prepare favicon selector
  const favIconSelector = utils.split(options["capture.faviconAttrs"])
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
      const urls = utils.parseOption("capture.downLink.urlExtra", options["capture.downLink.urlExtra"]);
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
            warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
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
            const fetchResponse = await capturer.invoke("fetch", [{
              url: url,
              refUrl,
              refPolicy,
              settings,
              options,
            }]);
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
    elem.textContent = "(" + utils.compressJsFunc(function (names) {
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
  const content = utils.documentToString(newDoc, options["capture.prettyPrint"]);
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
  const docs = utils.flattenFrames(doc);
  for (let i = 0, I = docs.length; i < I; i++) {
    const doc = docs[i];
    const docUrl = utils.normalizeUrl(utils.splitUrl(doc.URL)[0]);
    if (docUrl in data) { continue; }

    // skip non-HTML documents
    if (!["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
      continue;
    }

    const cloneNodeMapping = (node, deep = false) => {
      return utils.cloneNode(node, deep, {
        newDoc,
        origNodeMap,
        clonedNodeMap,
        includeShadowDom: true,
      });
    };

    const addResource = (url) => {
      const uuid = utils.getUuid();
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
        for (const css of utils.getAdoptedStyleSheets(docOrShadowRoot)) {
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
            elem.setAttribute("srcset", utils.rewriteSrcset(elem.getAttribute("srcset"), url => addResource(url)));
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
            elem.setAttribute("srcset", utils.rewriteSrcset(elem.getAttribute("srcset"), url => addResource(url)));
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
          switch (utils.getScrapbookObjectType(elem)) {
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
          if (data !== utils.getBlankCanvasData(elemOrig)) {
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
        const shadowRoot = utils.getShadowRoot(elem);
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
    const newDoc = utils.cloneDocument(doc, {origNodeMap, clonedNodeMap});

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

    const content = utils.documentToString(newDoc, options["capture.prettyPrint"]);
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
      node => utils.getScrapBookObjectRemoveType(node) === 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
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
    loader.textContent = "(" + utils.compressJsFunc(function () {
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

        const url = utils.normalizeUrl(itemSource);
        const domain = new URL(url).origin;
        const date = utils.idToDate(itemCreate).toString();
        data = {url, domain, date};
      } catch (ex) {
        console.error(ex);
        break insertInfoBar;
      }

      const loader = bodyNode.appendChild(doc.createElement("script"));
      loader.setAttribute("data-scrapbook-elem", "infobar-loader");

      // This is compatible with IE5 (though position: fixed doesn't work in IE < 7).
      // setAttribute('style', ...) doesn't work for IE < 8
      loader.textContent = ("(" + utils.compressJsFunc(function () {
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
      }) + ")()").replace(/%([\w@]*)%/g, (_, key) => data[key] || utils.lang(key) || '');
    }
  }
  if (rootNode.querySelector('[data-scrapbook-elem="linemarker"][title], [data-scrapbook-elem="sticky"]')) {
    const css = bodyNode.appendChild(doc.createElement("style"));
    css.setAttribute("data-scrapbook-elem", "annotation-css");
    css.textContent = utils.compressCode(ANNOTATION_CSS);
    const loader = bodyNode.appendChild(doc.createElement("script"));
    loader.setAttribute("data-scrapbook-elem", "annotation-loader");
    // Mobile support with showing title on long touch.
    // Firefox >= 52, Chrome >= 22, Edge >= 12
    loader.textContent = ("(" + utils.compressJsFunc(function () {
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
    }) + ")()").replace(/%(\w*)%/g, (_, key) => utils.lang(key) || '');
  }
};

/**
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
      select = utils.getSelection().type !== 'Range' ? 'all' : 'selected';
      break;
  }

  let nodes;
  switch (select) {
    case 'selected': {
      nodes = utils.getSelectedNodes({
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

class ItemInfoFormatter extends _ItemInfoFormatter {
  format_uuid() {
    return utils.getUuid();
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
    .map(x => utils.validateFilename(formatter.format(x), saveAsciiFilename))
    .join('/');

  // see capturer.getUniqueFilename for limitation details
  filename = utils.crop(filename, saveFilenameMaxLenUtf16, saveFilenameMaxLenUtf8, "");

  // in case the cropped filename has invalid ending chars
  filename = filename
    .split('/')
    .map(x => utils.validateFilename(x))
    .join('/');

  return filename;
};

capturer.getRedirectedUrl = function (redirectedUrl, sourceUrlHash) {
  const [redirectedUrlMain, redirectedUrlHash] = utils.splitUrlByAnchor(redirectedUrl);

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
 *
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
  if (utils.userAgent.is('gecko')) {
    return blob;
  }

  // for a small Blob, simply serialize to an object
  if (blob.size < threshold) {
    return await serializeObject(blob);
  }

  const uuid = utils.getUuid();
  const key = {table: "blobCache", key: uuid};
  await StorageCache.set(key, blob);
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
    return await deserializeObject(blob);
  }

  const key = {table: "blobCache", key: blob.__key__};
  const rv = await StorageCache.get(key);
  await StorageCache.remove(key);
  return rv;
};

export {
  capturer,
  ItemInfoFormatter,
};
