/******************************************************************************
 *
 * Common capture utilities shared among background and content scripts.
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @public {Object} capturer
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('capturer')) { return; }
  root.capturer = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.Deferred,
    root.MapWithDefault,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, Deferred, MapWithDefault, window, document, console) {

  'use strict';

  const DOMPARSER_SUPPORT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'image/svg+xml']);

  const REWRITABLE_SPECIAL_OBJECTS = new Set([false, 'adoptedStyleSheet']);

  const capturer = {
    isContentScript: true,
    get isNoscriptEscaped() {
      // For some browsers (e.g. Firefox 73 and Chromium 79), <noscript> has
      // only text content when JavaScript is enabled.
      let elem = document.createElement("noscript"); elem.innerHTML = "<br>";
      delete capturer.isNoscriptEscaped;
      return capturer.isNoscriptEscaped = (elem.firstChild.nodeType !== 1);
    }
  };

  /**
   * Invoke an invokable capturer method from another script.
   *
   * - To invoke a background script method from the background script, provide
   *   nothing.
   * - To invoke a background script method from a content script, provide
   *   details.missionId or args.settings.missionId.
   * - To invoke a content script method from the background script, provide
   *   details.tabId and optionally details.frameId.
   * - To invoke a content script method in a frame from a content script,
   *   provide details.frameWindow.
   *
   * @param {string} method - The capturer method to invoke.
   * @param {string} args - The arguments to pass to the capturer method.
   * @param {string} details - Data to determine invocation behavior.
   * @param {string} details.tabId
   * @param {string} details.frameId
   * @param {Window} details.frameWindow
   * @return {Promise<Object>}
   */
  capturer.invoke = async function (method, args, details = {}) {
    const {tabId = -1, frameId = 0, frameWindow, missionId} = details;
    if (tabId !== -1) {
      // to content script (or content script call self)
      if (!capturer.isContentScript) {
        const cmd = "capturer." + method;
        return await scrapbook.invokeContentScript({tabId, frameId, cmd, args});
      } else {
        return await capturer[method](args);
      }
    } else if (frameWindow) {
      // to frame
      const cmd = "capturer." + method;
      return await scrapbook.invokeFrameScript({frameWindow, cmd, args});
    } else {
      // to capturer.html page (or capturer.html call self)
      if (capturer.isContentScript) {
        let id;
        try {
          id = details.missionId || args.settings.missionId;
          if (!id) { throw new Error(`unknown missionId`); }
        } catch (ex) {
          throw new Error(`missionId is required to invoke from a content script.`);
        }
        const cmd = "capturer." + method;
        return await scrapbook.invokeExtensionScript({id, cmd, args});
      } else {
        return await capturer[method](args);
      }
    }
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Document} params.doc
   * @param {string} params.refUrl - the referrer URL
   * @param {string} params.title
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureDocumentOrFile = async function (params) {
    isDebug && console.debug("call: captureDocumentOrFile");

    const {doc = document, refUrl, title, settings, options} = params;

    // if not HTML|SVG document, capture as file
    if (!["text/html", "application/xhtml+xml", "image/svg+xml"].includes(doc.contentType)) {
      // if it can be displayed as HTML, check saveFileAsHtml
      if (!(doc.documentElement.nodeName.toLowerCase() === "html" && options["capture.saveFileAsHtml"])) {
        return await capturer.invoke("captureFile", {
          url: doc.URL,
          refUrl,
          title: title || doc.title,
          charset: doc.characterSet,
          settings,
          options,
        });
      }
    }

    // otherwise, capture as document
    // don't pass docUrl and refUrl
    const p = Object.assign({}, params);
    delete p.docUrl;
    delete p.refUrl;
    return await capturer.captureDocument(p);
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Document} params.doc
   * @param {string} params.title
   * @param {string} params.docUrl - an overriding document URL
   * @param {string} params.refUrl - an overriding URL for resolving links
   *     (i.e. base URL)
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureDocument = async function (params) {
    try {
      isDebug && console.debug("call: captureDocument");

      // Map cloned nodes and the original for later reference
      // since cloned nodes may lose some information,
      // e.g. cloned iframes has no content, cloned canvas has no image,
      // and cloned form elements has no current status.
      const cloneNodeMapping = (node, deep = false) => {
        const newNode = newDoc.importNode(node, deep);
        origNodeMap.set(newNode, node);
        clonedNodeMap.set(node, newNode);

        // map descendants
        if (deep) {
          const doc = node.ownerDocument;
          const walker1 = doc.createNodeIterator(node);
          const walker2 = newDoc.createNodeIterator(newNode);
          let node1 = walker1.nextNode();
          let node2 = walker2.nextNode();
          while (node1) {
            origNodeMap.set(node2, node1);
            clonedNodeMap.set(node1, node2);
            node1 = walker1.nextNode();
            node2 = walker2.nextNode();
          }
        }

        return newNode;
      };

      const captureRecordAddedNode = (elem, record = options["capture.recordRewrittenNode"]) => {
        if (record) {
          const recordAttr = `data-scrapbook-orig-null-node-${timeId}`;
          if (!elem.hasAttribute(recordAttr)) {
            elem.setAttribute(recordAttr, '');
          }
        }
      };

      // remove the specified node, record it if option set
      const captureRemoveNode = (elem, record = options["capture.recordRewrittenNode"]) => {
        if (!elem.parentNode) { return; }

        if (record) {
          const comment = newDoc.createComment(`scrapbook-orig-node-${timeId}=${scrapbook.escapeHtmlComment(elem.outerHTML)}`);
          elem.parentNode.replaceChild(comment, elem);
        } else {
          elem.parentNode.removeChild(elem);
        }
      };

      // rewrite (or remove if value is null/undefined) the specified attr, record it if option set
      const captureRewriteAttr = (elem, attr, value, record = options["capture.recordRewrittenAttr"]) => {
        let [ns, att] = scrapbook.splitXmlAttribute(attr);

        if (elem.hasAttribute(attr)) {
          const oldValue = elem.getAttribute(attr);
          if (oldValue === value) { return; }

          if (value === null || value === undefined) {
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
          if (value === null || value === undefined) { return; }

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
      const captureRewriteTextContent = (elem, value, record = options["capture.recordRewrittenAttr"]) => {
        const oldValue = elem.textContent;
        if (oldValue === value) { return; }

        elem.textContent = value;

        if (record) {
          const recordAttr = `data-scrapbook-orig-textContent-${timeId}`;
          if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
        }
      };

      // similar to captureRewriteAttr, but use option capture.recordSourceUri
      const captureRewriteUri = (elem, attr, value, record = options["capture.recordSourceUri"]) => {
        return captureRewriteAttr(elem, attr, value, record);
      };

      const rewriteLocalLink = (relativeUrl, baseUrl) => {
        let url = relativeUrl;
        try {
          url = new URL(relativeUrl, baseUrl).href;
        } catch (ex) {}

        const [urlMain, urlHash] = scrapbook.splitUrlByAnchor(url);

        // This link targets the current page
        if (urlMain === docUrl) {
          // @TODO: for iframe whose URL is about:blank or about:srcdoc,
          // this link should point to the main frame page rather than self
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

      const rewriteAnchor = (elem, attr) => {
        if (!elem.hasAttribute(attr)) { return; }

        let url = elem.getAttribute(attr);

        // scripts: script-like anchors
        if (url.toLowerCase().startsWith("javascript:")) {
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
        url = rewriteLocalLink(url, refUrl);
        elem.setAttribute(attr, url);

        // skip further processing for non-absolute links
        if (!scrapbook.isUrlAbsolute(url)) {
          return;
        }

        // check downLink
        if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:')) {
          switch (options["capture.downLink.mode"]) {
            case "header": {
              if (capturer.downLinkUrlFilter(url, options)) {
                break;
              }

              tasks[tasks.length] = halter.then(async () => {
                const ext = await capturer.invoke("downLinkFetchHeader", {
                  url,
                  refUrl,
                  options,
                  settings,
                });
                if (ext === null) { return null; }
                if (!capturer.downLinkExtFilter(ext, options)) { return null; }

                const response = await capturer.invoke("downloadFile", {
                  url,
                  refUrl,
                  settings,
                  options,
                });
                captureRewriteUri(elem, attr, response.url);
                return response;
              });
              break;
            }
            case "url": {
              if (capturer.downLinkUrlFilter(url, options)) {
                break;
              }

              const filename = scrapbook.urlToFilename(url);
              const [, ext] = scrapbook.filenameParts(filename);
              if (!capturer.downLinkExtFilter(ext, options)) { break; }

              tasks[tasks.length] = halter.then(async () => {
                const response = await capturer.invoke("downloadFile", {
                  url,
                  refUrl,
                  settings,
                  options,
                });
                captureRewriteUri(elem, attr, response.url);
                return response;
              });
              break;
            }
            case "none":
            default: {
              break;
            }
          }
        }
      };

      const rewriteSvgHref = (elem, attr) => {
        if (!elem.hasAttribute(attr)) { return; }

        let url = elem.getAttribute(attr);

        // check local link and rewrite url
        url = rewriteLocalLink(url, refUrl);
        elem.setAttribute(attr, url);

        switch (options["capture.image"]) {
          case "link":
            // do nothing
            break;
          case "blank":
            if (elem.hasAttribute(attr)) {
              captureRewriteUri(elem, attr, null);
            }
            break;
          case "remove":
            captureRemoveNode(elem);
            return;
          case "save-current":
          case "save":
          default:
            // skip further processing for non-absolute links
            if (!scrapbook.isUrlAbsolute(url)) {
              break;
            }

            tasks[tasks.length] = halter.then(async () => {
              const response = await capturer.invoke("downloadFile", {
                url,
                refUrl,
                settings,
                options,
              });
              captureRewriteUri(elem, attr, response.url);
              return response;
            });
            break;
        }
      };

      // the callback should return a falsy value if the elem is removed from DOM
      const rewriteRecursively = (elem, rootName, callback) => {
        const nodeName = elem.nodeName.toLowerCase();

        // switch rootName for certain embedded "document"
        if (["svg", "math"].includes(nodeName)) {
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

      const rewriteNode = (elem, rootName) => {
        // skip non-element nodes
        if (elem.nodeType !== 1) {
          return elem;
        }

        // skip a special elements and its descendants
        if (!REWRITABLE_SPECIAL_OBJECTS.has(scrapbook.getScrapbookObjectType(elem))) {
          return elem;
        }

        const elemOrig = origNodeMap.get(elem);

        // remove hidden elements
        if (!isHeadless && elemOrig) {
          switch (options["capture.removeHidden"]) {
            case "undisplayed": {
              const excludeNodes =
                  rootName === "svg" ? ["svg"] : 
                  rootName === "math" ? ["math"] : 
                  ["html", "head", "title", "meta", "link", "style", "script", "body", "noscript", "template", "source", "track"];
              if (!excludeNodes.includes(elem.nodeName.toLowerCase())) {
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
              rewriteAnchor(elem, "href");
              rewriteAnchor(elem, "xlink:href");
              break;
            }

            case "script": {
              if (elem.hasAttribute("href")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("href"), refUrl);
                elem.setAttribute("href", rewriteUrl);
              }
              if (elem.hasAttribute("xlink:href")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("xlink:href"), refUrl);
                elem.setAttribute("xlink:href", rewriteUrl);
              }

              switch (options["capture.script"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  if (elem.hasAttribute("href")) {
                    captureRewriteUri(elem, "href", null);
                  }
                  if (elem.hasAttribute("xlink:href")) {
                    captureRewriteUri(elem, "xlink:href", null);
                  }
                  captureRewriteTextContent(elem, "");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  if (elem.hasAttribute("href")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("href"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "href", response.url);
                      return response;
                    });
                  }
                  if (elem.hasAttribute("xlink:href")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("xlink:href"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "xlink:href", response.url);
                      return response;
                    });
                  }
                  break;
              }
              break;
            }

            case "style": {
              const css = cssHandler.getElemCss(elem);

              switch (options["capture.style"]) {
                case "blank":
                  captureRewriteTextContent(elem, "");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                case "link":
                default:
                  tasks[tasks.length] = halter.then(async () => {
                    await cssHandler.rewriteCss({
                      elem,
                      refUrl,
                      settings,
                      callback: (elem, response) => {
                        // escape </style> as textContent can contain HTML
                        captureRewriteTextContent(elem, response.cssText.replace(/<\/(style>)/gi, "<\\/$1"));
                      },
                    });
                  });
                  break;
              }
              break;
            }

            default: {
              // SVG spec is quite complicated, but generally we can treat every
              // href and xlink:href as an image link, except for "a" and "script"
              rewriteSvgHref(elem, "href");
              rewriteSvgHref(elem, "xlink:href");
              break;
            }
          }
        } else if (rootName === "math") {
          rewriteAnchor(elem, "href");
        } else {
          switch (elem.nodeName.toLowerCase()) {
            case "base": {
              if (!elem.hasAttribute("href")) { break; }

              // resolve base URL using document URL rather than base URL
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("href"), docUrl);
              elem.setAttribute("href", rewriteUrl);

              switch (options["capture.base"]) {
                case "blank":
                  captureRewriteUri(elem, "href", null);
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
              // spaced attribute e.g. http-equiv=" refresh " doesn't take effect
              if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content")) {
                if (elem.getAttribute("http-equiv").toLowerCase() == "content-type") {
                  // force UTF-8
                  metaCharsetNode = elem;
                  captureRewriteAttr(elem, "content", "text/html; charset=UTF-8");
                } else if (elem.getAttribute("http-equiv").toLowerCase() == "refresh") {
                  // rewrite meta refresh
                  const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
                  if (metaRefresh.url) {
                    // meta refresh is relative to document URL rather than base URL
                    const url = rewriteLocalLink(metaRefresh.url, docUrl);
                    elem.setAttribute("content", metaRefresh.time + (url ? ";url=" + url : ""));
                  }
                } else if (elem.getAttribute("http-equiv").toLowerCase() == "content-security-policy") {
                  // content security policy could make resources not loaded when viewed offline
                  if (options["capture.removeIntegrity"]) {
                    captureRewriteAttr(elem, "http-equiv", null);
                  }
                }
              } else if (elem.hasAttribute("charset")) {
                // force UTF-8
                metaCharsetNode = elem;
                captureRewriteAttr(elem, "charset", "UTF-8");
              }
              // An open graph URL does not acknowledge <base> and should always use an absolute URL,
              // and thus we simply skip meta[property="og:*"].
              break;
            }

            case "link": {
              if (!elem.hasAttribute("href")) { break; }
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("href"), refUrl);
              elem.setAttribute("href", rewriteUrl);

              if (elem.matches('[rel~="stylesheet"]')) {
                // styles: link element
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
                }

                switch (options["capture.style"]) {
                  case "link":
                    if (disableCss) {
                      captureRewriteAttr(elem, "href", null);
                      elem.setAttribute("data-scrapbook-css-disabled", "");
                      break;
                    }
                    break;
                  case "blank":
                    // HTML 5.1 2nd Edition / W3C Recommendation:
                    // If the href attribute is absent, then the element does not define a link.
                    captureRewriteUri(elem, "href", null);
                    break;
                  case "remove":
                    captureRemoveNode(elem);
                    return;
                  case "save":
                  default:
                    if (disableCss) {
                      captureRewriteAttr(elem, "href", null);
                      elem.setAttribute("data-scrapbook-css-disabled", "");
                      break;
                    }

                    tasks[tasks.length] = halter.then(async () => {
                      await cssHandler.rewriteCss({
                        elem,
                        refUrl,
                        settings,
                        callback: (elem, response) => {
                          captureRewriteUri(elem, "href", response.url);
                        },
                      });
                    });
                    break;
                }
                break;
              } else if (elem.matches('[rel~="icon"]')) {
                // favicon: the link element
                switch (options["capture.favicon"]) {
                  case "link":
                    if (typeof favIconUrl === 'undefined') {
                      favIconUrl = rewriteUrl;
                    }
                    break;
                  case "blank":
                    // HTML 5.1 2nd Edition / W3C Recommendation:
                    // If the href attribute is absent, then the element does not define a link.
                    captureRewriteUri(elem, "href", null);
                    if (typeof favIconUrl === 'undefined') {
                      favIconUrl = "";
                    }
                    break;
                  case "remove":
                    captureRemoveNode(elem);
                    if (typeof favIconUrl === 'undefined') {
                      favIconUrl = "";
                    }
                    return;
                  case "save":
                  default:
                    let useFavIcon = false;
                    if (typeof favIconUrl === 'undefined') {
                      favIconUrl = rewriteUrl;
                      useFavIcon = true;
                    }
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("href"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "href", response.url);
                      if (useFavIcon) {
                        if (options["capture.saveAs"] === 'folder') {
                          favIconUrl = response.url;
                        }
                      }
                      return response;
                    });
                    break;
                }
              } else if (elem.matches('[rel~="preload"]')) {
                // @TODO: handle preloads according to its "as" attribute
                captureRewriteUri(elem, "href", null);
              }
              break;
            }

            // styles: style element
            case "style": {
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
              }

              switch (options["capture.style"]) {
                case "blank":
                  captureRewriteTextContent(elem, "");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                case "link":
                default:
                  if (disableCss) {
                    captureRewriteTextContent(elem, "");
                    elem.setAttribute("data-scrapbook-css-disabled", "");
                    break;
                  }
                  tasks[tasks.length] = halter.then(async () => {
                    await cssHandler.rewriteCss({
                      elem,
                      refUrl,
                      settings,
                      callback: (elem, response) => {
                        // escape </style> as textContent can contain HTML
                        captureRewriteTextContent(elem, response.cssText.replace(/<\/(style>)/gi, "<\\/$1"));
                      },
                    });
                  });
                  break;
              }
              break;
            }

            // scripts: script
            case "script": {
              if (elem.hasAttribute("src")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }

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
                    captureRewriteUri(elem, "src", null);
                  }
                  captureRewriteTextContent(elem, "");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  if (elem.hasAttribute("src")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }
                  break;
              }

              // escape </script> as textContent can contain HTML
              elem.textContent = elem.textContent.replace(/<\/(script>)/gi, "<\\/$1");
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
                default:
                  if (capturer.isNoscriptEscaped) {
                    let key = scrapbook.getUuid();
                    specialContentMap.set(key, "noscript");
                    const replaceElem = document.createElement(`jc-${key}`);
                    replaceElem.innerHTML = elem.textContent;
                    elem.parentNode.replaceChild(replaceElem, elem);
                    rewriteRecursively(replaceElem, rootName, rewriteNode);
                    return;
                  }
                  break;
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
                let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("background"), refUrl);
                elem.setAttribute("background", rewriteUrl);

                switch (options["capture.imageBackground"]) {
                  case "link":
                    // do nothing
                    break;
                  case "blank":
                  case "remove": // deprecated
                    captureRewriteUri(elem, "background", null);
                    break;
                  case "save-used":
                  case "save":
                  default:
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: rewriteUrl,
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "background", response.url);
                      return response;
                    });
                    break;
                }
              }
              break;
            }

            case "frame":
            case "iframe": {
              const frame = elem;
              const frameSrc = origNodeMap.get(frame);
              if (frame.hasAttribute("src")) {
                const rewriteUrl = capturer.resolveRelativeUrl(frame.getAttribute("src"), refUrl);
                frame.setAttribute("src", rewriteUrl);
              }

              switch (options["capture.frame"]) {
                case "link": {
                  const captureFrameCallback = async (response) => {
                    isDebug && console.debug("captureFrameCallback", response);
                    const file = scrapbook.dataUriToFile(response.url);
                    const content = await scrapbook.readFileAsText(file);
                    captureRewriteAttr(frame, "srcdoc", content);
                    return response;
                  };

                  // if the frame has srcdoc, use it
                  if (frame.nodeName.toLowerCase() === 'iframe' &&
                      frame.hasAttribute("srcdoc")) {
                    const frameSettings = JSON.parse(JSON.stringify(settings));
                    frameSettings.frameIsMain = false;
                    frameSettings.fullPage = true;
                    delete frameSettings.usedCssFontUrl;
                    delete frameSettings.usedCssImageUrl;

                    if (!options["capture.frameRename"]) {
                      delete frameSettings.documentName;
                    }

                    // save resources in srcdoc as data URL
                    const frameOptions = JSON.parse(JSON.stringify(options));
                    frameOptions["capture.saveAs"] = "singleHtml";

                    let frameDoc;
                    try {
                      frameDoc = frameSrc.contentDocument;
                    } catch (ex) {
                      // console.debug(ex);
                    }

                    if (frameDoc) {
                      // frame document accessible:
                      // capture the content document directly
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.captureDocumentOrFile({
                          doc: frameDoc,
                          refUrl,
                          settings: frameSettings,
                          options: frameOptions,
                        });
                        return captureFrameCallback(response);
                      });
                      break;
                    }

                    // frame document inaccessible (headless capture):
                    tasks[tasks.length] = halter.then(async () => {
                      // contentType of srcdoc is always text/html
                      const url = `data:text/html;charset=UTF-8,${encodeURIComponent(frame.getAttribute("srcdoc"))}`;
                      const doc = await scrapbook.readFileAsDocument(scrapbook.dataUriToFile(url));
                      const response = await capturer.captureDocument({
                        doc,
                        docUrl: 'about:srcdoc',
                        refUrl,
                        settings: frameSettings,
                        options: frameOptions,
                      });
                      return captureFrameCallback(response);
                    });
                  }
                  break;
                }
                case "blank": {
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The src attribute, if present, must be a valid non-empty URL.
                  captureRewriteUri(frame, "src", null);
                  captureRewriteAttr(frame, "srcdoc", null);
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
                    handler: {
                      // use srcdoc for data URL document for iframe
                      if (options["capture.saveDataUriAsSrcdoc"] &&
                          response.url.startsWith('data:') &&
                          frame.nodeName.toLowerCase() === 'iframe') {
                        const file = scrapbook.dataUriToFile(response.url);
                        const {type: mime, parameters: {charset}} = scrapbook.parseHeaderContentType(file.type);
                        if (["text/html", "application/xhtml+xml", "image/svg+xml"].includes(mime)) {
                          // assume the charset is UTF-8 if not defined
                          const content = await scrapbook.readFileAsText(file, charset || "UTF-8");
                          captureRewriteAttr(frame, "srcdoc", content);
                          captureRewriteAttr(frame, "src", null);
                          break handler;
                        }
                      }

                      captureRewriteUri(frame, "src", response.url);
                      if (frame.nodeName.toLowerCase() === 'iframe') {
                        captureRewriteAttr(frame, "srcdoc", null);
                      }
                    }
                    return response;
                  };

                  const frameSettings = JSON.parse(JSON.stringify(settings));
                  frameSettings.frameIsMain = false;
                  frameSettings.fullPage = true;
                  delete frameSettings.usedCssFontUrl;
                  delete frameSettings.usedCssImageUrl;

                  if (!options["capture.frameRename"]) {
                    delete frameSettings.documentName;
                  }

                  let frameDoc;
                  try {
                    frameDoc = frameSrc.contentDocument;
                  } catch (ex) {
                    // console.debug(ex);
                  }

                  if (frameDoc) {
                    // frame document accessible:
                    // capture the content document directly
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.captureDocumentOrFile({
                        doc: frameDoc,
                        refUrl,
                        settings: frameSettings,
                        options,
                      });
                      return captureFrameCallback(response);
                    });
                    break;
                  }

                  // frame document inaccessible:
                  tasks[tasks.length] = halter.then(() => {
                    let frameWindow;
                    try {
                      frameWindow = frameSrc.contentWindow;
                    } catch (ex) {
                      // console.debug(ex);
                    }
                    if (!frameWindow) { return; }

                    // frame window accessible:
                    // capture the content document through messaging if viable
                    // (could fail if it's data URL, sandboxed blob URL, etc.)
                    return capturer.invoke("captureDocumentOrFile", {
                      refUrl,
                      settings: frameSettings,
                      options,
                    }, {frameWindow});
                  }).then(async (response) => {
                    if (response) { return captureFrameCallback(response); }

                    // frame window accessible with special cases:
                    // frame window inaccessible: (headless capture)

                    // if the frame has srcdoc, use it
                    if (frame.nodeName.toLowerCase() === 'iframe' &&
                        frame.hasAttribute("srcdoc")) {
                      // contentType of srcdoc is always text/html
                      const url = `data:text/html;charset=UTF-8,${encodeURIComponent(frame.getAttribute("srcdoc"))}`;
                      const doc = await scrapbook.readFileAsDocument(scrapbook.dataUriToFile(url));

                      return capturer.captureDocument({
                        doc,
                        docUrl: 'about:srcdoc',
                        refUrl,
                        settings: frameSettings,
                        options,
                      }).then(captureFrameCallback);
                    }

                    // if the frame src is not absolute,
                    // skip further processing and keep current src
                    // (point to self, or not resolvable)
                    if (!scrapbook.isUrlAbsolute(frame.getAttribute("src"))) {
                      return;
                    }

                    // otherwise, headlessly capture src
                    // (take care of circular reference)
                    const [sourceUrl] = scrapbook.splitUrlByAnchor(refUrl);
                    const [targetUrl] = scrapbook.splitUrlByAnchor(frame.src);
                    frameSettings.isHeadless = true;
                    frameSettings.recurseChain.push(sourceUrl);
                    if (!frameSettings.recurseChain.includes(targetUrl)) {
                      let frameOptions = options;

                      // special handling of data URL
                      if (frame.src.startsWith("data:") && 
                          options["capture.saveAs"] !== "singleHtml" && 
                          !options["capture.saveDataUriAsFile"]) {
                        // Save frame document and inner URLs as data URL since data URL
                        // is null origin and no relative URL is allowed in it.
                        frameOptions = JSON.parse(JSON.stringify(options));
                        frameOptions["capture.saveAs"] = "singleHtml";
                      }

                      return capturer.invoke("captureUrl", {
                        url: frame.src,
                        refUrl,
                        settings: frameSettings,
                        options: frameOptions,
                      }).then(captureFrameCallback);
                    } else {
                      console.warn(scrapbook.lang("WarnCaptureCircular", [sourceUrl, targetUrl]));
                      captureRewriteUri(frame, "src", `urn:scrapbook:download:circular:url:${frame.src}`);
                    }
                  });
                  break;
                }
              }
              break;
            }

            case "a":
            case "area": {
              rewriteAnchor(elem, "href");
              break;
            }

            // images: img
            case "img": {
              if (elem.hasAttribute("src")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }

              if (elem.hasAttribute("srcset")) {
                elem.setAttribute("srcset",
                  scrapbook.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
                    return capturer.resolveRelativeUrl(url, refUrl);
                  })
                );
              }

              switch (options["capture.image"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The src attribute must be present, and must contain a valid non-empty URL.
                  if (elem.hasAttribute("src")) {
                    captureRewriteUri(elem, "src", "about:blank");
                  }

                  if (elem.hasAttribute("srcset")) {
                    captureRewriteUri(elem, "srcset", null);
                  }

                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save-current":
                  if (!isHeadless) {
                    if (elemOrig && elemOrig.currentSrc) {
                      const url = elemOrig.currentSrc;
                      captureRewriteUri(elem, "srcset", null);
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url,
                          refUrl,
                          settings,
                          options,
                        });
                        captureRewriteUri(elem, "src", response.url);
                        return response;
                      });
                    }
                    break;
                  }
                  // Headless capture doesn't support currentSrc, fallback to "save".
                case "save":
                default:
                  if (elem.hasAttribute("src")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }

                  if (elem.hasAttribute("srcset")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await scrapbook.rewriteSrcset(elem.getAttribute("srcset"), async (url) => {
                        return (await capturer.invoke("downloadFile", {
                          url,
                          refUrl,
                          settings,
                          options,
                        })).url;
                      });
                      captureRewriteUri(elem, "srcset", response);
                      return response;
                    });
                  }
                  break;
              }
              break;
            }

            // images: picture
            case "picture": {
              Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                elem.setAttribute("srcset",
                  scrapbook.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
                    return capturer.resolveRelativeUrl(url, refUrl);
                  })
                );
              }, this);

              switch (options["capture.image"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                    captureRewriteUri(elem, "srcset", null);
                  }, this);
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save-current":
                  if (!isHeadless) {
                    Array.prototype.forEach.call(elem.querySelectorAll('img'), (elem) => {
                      const elemOrig = origNodeMap.get(elem);

                      if (elemOrig && elemOrig.currentSrc) {
                        // elem will be further processed in the following loop that handles "img"
                        const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                        elem.setAttribute("src", rewriteUrl);
                        captureRewriteUri(elem, "src", elemOrig.currentSrc);
                        captureRewriteUri(elem, "srcset", null);
                      }
                    }, this);

                    Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRewrittenNode"]);
                    }, this);

                    break;
                  }
                  // Headless capture doesn't support currentSrc, fallback to "save".
                case "save":
                default:
                  Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await scrapbook.rewriteSrcset(elem.getAttribute("srcset"), async (url) => {
                        return (await capturer.invoke("downloadFile", {
                          url,
                          refUrl,
                          settings,
                          options,
                        })).url;
                      });
                      captureRewriteUri(elem, "srcset", response);
                      return response;
                    });
                  }, this);
                  break;
              }
              break;
            }

            // media: audio
            case "audio": {
              if (elem.hasAttribute("src")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }

              Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }, this);

              switch (options["capture.audio"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  if (elem.hasAttribute("src")) {
                    captureRewriteUri(elem, "src", "about:blank");
                  }

                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The src attribute must be present and be a valid non-empty URL.
                  Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
                    captureRewriteUri(elem, "src", "about:blank");
                  }, this);

                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save-current":
                  if (!isHeadless) {
                    if (elemOrig && elemOrig.currentSrc) {
                      const url = elemOrig.currentSrc;
                      Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                        captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRewrittenNode"]);
                      }, this);
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url,
                          refUrl,
                          settings,
                          options,
                        });
                        captureRewriteUri(elem, "src", response.url);
                        return response;
                      });
                    }

                    Array.prototype.forEach.call(elem.querySelectorAll('track[src]'), (elem) => {
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url: elem.getAttribute("src"),
                          refUrl,
                          settings,
                          options,
                        });
                        captureRewriteUri(elem, "src", response.url);
                        return response;
                      });
                    }, this);

                    break;
                  }
                  // Headless capture doesn't support currentSrc, fallback to "save".
                case "save":
                default:
                  if (elem.hasAttribute("src")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }

                  Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }, this);

                  break;
              }
              break;
            }

            // media: video
            case "video": {
              if (elem.hasAttribute("poster")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("poster"), refUrl);
                elem.setAttribute("poster", rewriteUrl);
              }

              if (elem.hasAttribute("src")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }

              Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }, this);

              switch (options["capture.video"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The attribute, if present, must contain a valid non-empty URL.
                  if (elem.hasAttribute("poster")) {
                    captureRewriteUri(elem, "poster", null);
                  }

                  if (elem.hasAttribute("src")) {
                    captureRewriteUri(elem, "src", "about:blank");
                  }

                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The src attribute must be present and be a valid non-empty URL.
                  Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
                    captureRewriteUri(elem, "src", "about:blank");
                  }, this);

                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save-current":
                  if (!isHeadless) {
                    if (elem.hasAttribute("poster")) {
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url: elem.getAttribute("poster"),
                          refUrl,
                          settings,
                          options,
                        });
                        captureRewriteUri(elem, "poster", response.url);
                        return response;
                      });
                    }

                    if (elemOrig && elemOrig.currentSrc) {
                      const url = elemOrig.currentSrc;
                      Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                        captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRewrittenNode"]);
                      }, this);
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url,
                          refUrl,
                          settings,
                          options,
                        })
                        captureRewriteUri(elem, "src", response.url);
                        return response;
                      });
                    }

                    Array.prototype.forEach.call(elem.querySelectorAll('track[src]'), (elem) => {
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url: elem.getAttribute("src"),
                          refUrl,
                          settings,
                          options,
                        });
                        captureRewriteUri(elem, "src", response.url);
                        return response;
                      });
                    }, this);

                    break;
                  }
                  // Headless capture doesn't support currentSrc, fallback to "save".
                case "save":
                default:
                  if (elem.hasAttribute("poster")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("poster"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "poster", response.url);
                      return response;
                    });
                  }

                  if (elem.hasAttribute("src")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }

                  Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }, this);

                  break;
              }
              break;
            }

            // media: embed
            case "embed": {
              if (elem.hasAttribute("src")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                elem.setAttribute("src", rewriteUrl);
              }

              switch (options["capture.embed"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The src attribute, if present, must contain a valid non-empty URL.
                  if (elem.hasAttribute("src")) {
                    captureRewriteUri(elem, "src", null);
                  }
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  if (elem.hasAttribute("src")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }
                  break;
              }
              break;
            }

            // media: object
            case "object": {
              if (elem.hasAttribute("data")) {
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("data"), refUrl);
                elem.setAttribute("data", rewriteUrl);
              }

              switch (options["capture.object"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // The data attribute, if present, must be a valid non-empty URL.
                  if (elem.hasAttribute("data")) {
                    captureRewriteUri(elem, "data", null);
                  }
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  if (elem.hasAttribute("data")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("data"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "data", response.url);
                      return response;
                    });
                  }
                  break;
              }
              break;
            }

            // media: applet
            case "applet": {
              if (elem.hasAttribute("code")) {
                let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("code"), refUrl);
                elem.setAttribute("code", rewriteUrl);
              }

              if (elem.hasAttribute("archive")) {
                let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("archive"), refUrl);
                elem.setAttribute("archive", rewriteUrl);
              }

              switch (options["capture.applet"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  if (elem.hasAttribute("code")) {
                    captureRewriteUri(elem, "code", null);
                  }

                  if (elem.hasAttribute("archive")) {
                    captureRewriteUri(elem, "archive", null);
                  }
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  if (elem.hasAttribute("code")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("code"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "code", response.url);
                      return response;
                    });
                  }

                  if (elem.hasAttribute("archive")) {
                    tasks[tasks.length] = halter.then(async () => {
                      const response = await capturer.invoke("downloadFile", {
                        url: elem.getAttribute("archive"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteUri(elem, "archive", response.url);
                      return response;
                    });
                  }
                  break;
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
                    if (!scrapbook.isCanvasBlank(elemOrig)) {
                      captureRewriteAttr(elem, "data-scrapbook-canvas", elemOrig.toDataURL());
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
                const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("action"), refUrl);
                elem.setAttribute("action", rewriteUrl);
              }
              break;
            }

            case "input": {
              switch (elem.type.toLowerCase()) {
                // images: input
                case "image": {
                  if (elem.hasAttribute("src")) {
                    const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                    elem.setAttribute("src", rewriteUrl);
                  }
                  switch (options["capture.image"]) {
                    case "link":
                      // do nothing
                      break;
                    case "blank":
                      // HTML 5.1 2nd Edition / W3C Recommendation:
                      // The src attribute must be present, and must contain a valid non-empty URL.
                      captureRewriteUri(elem, "src", "about:blank");
                      break;
                    case "remove":
                      captureRemoveNode(elem);
                      return;
                    case "save-current":
                      // srcset and currentSrc are not supported, do the same as save
                    case "save":
                    default:
                      tasks[tasks.length] = halter.then(async () => {
                        const response = await capturer.invoke("downloadFile", {
                          url: elem.getAttribute("src"),
                          refUrl,
                          settings,
                          options,
                        });
                        captureRewriteUri(elem, "src", response.url);
                        return response;
                      });
                      break;
                  }
                  break;
                }
                // form: input (file, password)
                case "password":
                case "file": {
                  // always forget
                  break;
                }
                // form: input (radio, checkbox)
                case "radio":
                case "checkbox": {
                  switch (options["capture.formStatus"]) {
                    case "keep":
                      if (elemOrig) {
                        captureRewriteAttr(elem, "checked", elemOrig.checked ? "checked" : null);
                        if (elemOrig.indeterminate && elem.type.toLowerCase() === 'checkbox') {
                          captureRewriteAttr(elem, "data-scrapbook-input-indeterminate", "");
                          requireBasicLoader = true;
                        }
                      }
                      break;
                    case "reset":
                    default:
                      // do nothing
                      break;
                  }
                  break;
                }
                // form: input (other)
                default: {
                  switch (options["capture.formStatus"]) {
                    case "keep":
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

            // form: option
            case "option": {
              switch (options["capture.formStatus"]) {
                case "keep":
                  if (elemOrig) {
                    captureRewriteAttr(elem, "selected", elemOrig.selected ? "selected" : null);
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
                case "keep":
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

            // xmp
            case "xmp": {
              // escape </xmp> as textContent can contain HTML
              elem.textContent = elem.textContent.replace(/<\/(xmp>)/gi, "<\\/$1");
              break;
            }
          }

          // handle shadow DOM
          switch (options["capture.shadowDom"]) {
            case "save": {
              const shadowRootOrig = elemOrig && elemOrig.shadowRoot;
              if (!shadowRootOrig) { break; }

              const shadowRoot = elem.attachShadow({mode: 'open'});
              origNodeMap.set(shadowRoot, shadowRootOrig);
              clonedNodeMap.set(shadowRootOrig, shadowRoot);
              for (const elem of shadowRootOrig.childNodes) {
                shadowRoot.appendChild(cloneNodeMapping(elem, true));
              }

              addAdoptedStyleSheets(shadowRootOrig, shadowRoot);
              rewriteRecursively(shadowRoot, shadowRoot.nodeName.toLowerCase(), rewriteNode);
              shadowRootList.push({
                host: elem,
                shadowRoot,
              });
              requireBasicLoader = true;
              break;
            }
            default: {
              break;
            }
          }

          // handle integrity and crossorigin
          // We have to remove integrity check because we could modify the content
          // and they might not work correctly in the offline environment.
          if (options["capture.removeIntegrity"]) {
            captureRewriteAttr(elem, "integrity", null);
            captureRewriteAttr(elem, "crossorigin", null);
            captureRewriteAttr(elem, "nonce", null); // this is meaningless as CSP is removed
          }
        }

        // styles: style attribute
        if (elem.hasAttribute("style")) {
          switch (options["capture.styleInline"]) {
            case "blank":
              captureRewriteAttr(elem, "style", "");
              break;
            case "remove":
              captureRewriteAttr(elem, "style", null);
              return;
            case "save":
            default:
              switch (options["capture.rewriteCss"]) {
                case "url": {
                  tasks[tasks.length] = halter.then(async () => {
                    const response = await cssHandler.rewriteCssText({
                      cssText: elem.getAttribute("style"),
                      refUrl,
                      isInline: true,
                    });
                    elem.setAttribute("style", response);
                    return response;
                  });
                  break;
                }
                case "tidy":
                case "match": {
                  tasks[tasks.length] = halter.then(async () => {
                    const response = await cssHandler.rewriteCssText({
                      cssText: elem.style.cssText,
                      refUrl,
                      isInline: true,
                    });
                    elem.setAttribute("style", response);
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
              attr => attr.name.toLowerCase().startsWith("on")
            ).forEach((attr) => {
              captureRewriteAttr(elem, attr.name, null);
            });
            break;
        }

        return elem;
      };

      const addAdoptedStyleSheets = (docOrShadowRoot, root) => {
        if (docOrShadowRoot.adoptedStyleSheets) {
          for (const refCss of docOrShadowRoot.adoptedStyleSheets) {
            const css = root.appendChild(newDoc.createElement("style"));
            css.textContent = Array.prototype.map.call(
              refCss.cssRules,
              cssRule => cssRule.cssText,
            ).join("\n");
            css.setAttribute("data-scrapbook-elem", "adoptedStyleSheet");
          }
        }
      };

      const {doc = document, title, settings, options} = params;
      const {timeId, isHeadless} = settings;
      const {
        docUrl = scrapbook.splitUrlByAnchor(doc.URL)[0],
        refUrl = scrapbook.splitUrlByAnchor(doc.baseURI)[0],
      } = params;
      let {documentName} = settings;
      const {contentType: mime, documentElement: htmlNode} = doc;

      // create a new document to replicate nodes via import
      const newDoc = (new DOMParser()).parseFromString(
        '<' + htmlNode.nodeName.toLowerCase() + '/>',
        DOMPARSER_SUPPORT_TYPES.has(mime) ? mime : 'text/html'
      );

      if (settings.frameIsMain) {
        settings.filename = await capturer.getSaveFilename({
          title: title || doc.title || scrapbook.filenameParts(scrapbook.urlToFilename(docUrl))[0] || "untitled",
          sourceUrl: docUrl,
          isFolder: options["capture.saveAs"] === "folder",
          settings,
          options,
        });
      }

      const documentFileName = (await capturer.invoke("registerDocument", {
        docUrl,
        mime,
        settings,
        options,
      })).documentFileName;

      // construct the cloned node tree
      const origNodeMap = new WeakMap();
      const clonedNodeMap = new WeakMap();
      const specialContentMap = new Map();
      const shadowRootList = [];
      let rootNode, headNode;
      let selection = settings.fullPage ? null : doc.getSelection();
      {
        if (selection && selection.isCollapsed) { selection = null; }
        // capture selection: clone selected ranges
        if (selection) {
          const cloneNodeAndAncestors = (node) => {
            const nodeChain = [];
            let tmpNode = node;

            while (tmpNode && !clonedNodeMap.has(tmpNode)) {
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
          let iRange = 0, iRangeMax = selection.rangeCount, curRange;
          let caNode, scNode, ecNode, firstNode, lastNode, lastNodePrev;
          for (; iRange < iRangeMax; ++iRange) {
            curRange = selection.getRangeAt(iRange);
            caNode = curRange.commonAncestorContainer;

            // In some cases (e.g. view image) the selection is the html node and
            // causes subsequent errors. We treat it as if there's no selection.
            if (caNode.nodeName.toLowerCase() === "html") {
              selection = null;
              break;
            }

            // @TODO:
            // A selection in a shadow root will cause an error and requires special care.
            // Currently treat as no selection.
            if (caNode.getRootNode().nodeType === 11) {
              selection = null;
              break;
            }

            // For the first range, clone html and head.
            if (iRange === 0) {
              rootNode = cloneNodeMapping(htmlNode, false);

              if (rootNode.nodeName.toLowerCase() === "html") {
                headNode = doc.querySelector("head");
                if (headNode) {
                  headNode = cloneNodeMapping(headNode, true);
                } else {
                  headNode = newDoc.createElement("head");
                  captureRecordAddedNode(headNode);
                }
                rootNode.appendChild(headNode);
                rootNode.appendChild(newDoc.createTextNode("\n"));
              }
            }

            // Calculate the first and last node of selection
            firstNode = scNode = curRange.startContainer;
            if (!isTextNode(scNode) && curRange.startOffset !== 0) {
              firstNode = firstNode.childNodes[curRange.startOffset];
            }
            lastNode = ecNode = curRange.endContainer;
            if (!isTextNode(ecNode) && curRange.endOffset !== 0) {
              lastNode = lastNode.childNodes[curRange.endOffset - 1];
            }

            // Clone nodes from root to common ancestor.
            // (with special handling of text nodes)
            const refNode = (isTextNode(caNode)) ? caNode.parentNode : caNode;
            let clonedRefNode = clonedNodeMap.get(refNode);
            if (!clonedRefNode) {
              cloneNodeAndAncestors(refNode);
              clonedRefNode = clonedNodeMap.get(refNode);
            }

            // Add splitter.
            //
            // @TODO: splitter for other node type?
            // Some tags like <td> require special care.
            if (lastNodePrev && firstNode.parentNode === lastNodePrev.parentNode &&
                isTextNode(lastNodePrev) && isTextNode(firstNode)) {
              clonedRefNode.appendChild(newDoc.createComment("scrapbook-capture-selected-splitter"));
              clonedRefNode.appendChild(newDoc.createTextNode(" … "));
              clonedRefNode.appendChild(newDoc.createComment("/scrapbook-capture-selected-splitter"));
            }
            lastNodePrev = lastNode;

            // Clone sparingly selected nodes in the common ancestor.
            // (with special handling of text nodes)
            clonedRefNode.appendChild(newDoc.createComment("scrapbook-capture-selected"));
            {
              const iterator = doc.createNodeIterator(refNode, -1);
              let node, started = false;
              while ((node = iterator.nextNode())) {
                if (!started) {
                  // skip nodes before the start container
                  if (node !== firstNode) { continue; }

                  // mark started
                  started = true;

                  // handle start container
                  if (isTextNode(scNode)) {
                    // firstNode is a partial selected text-like node,
                    // clone it with cropped text. Do not map it since
                    // there could be another selection.
                    const start = curRange.startOffset;
                    const end = (node === lastNode) ? curRange.endOffset : undefined;
                    cloneNodeAndAncestors(node.parentNode);
                    const newParentNode = clonedNodeMap.get(node.parentNode);
                    const newNode = node.cloneNode(false);
                    newNode.nodeValue = node.nodeValue.slice(start, end);
                    newParentNode.appendChild(newNode);
                  } else {
                    cloneNodeAndAncestors(node);
                  }

                  if (node === lastNode) { break; }

                  continue;
                }
                
                if (node === lastNode) {
                  if (node !== firstNode) {
                    // handle end container
                    if (isTextNode(ecNode)) {
                      // lastNode is a partial selected text-like node,
                      // clone it with cropped text. Do not map it since
                      // there could be another selection.
                      const start = 0;
                      const end = curRange.endOffset;
                      cloneNodeAndAncestors(node.parentNode);
                      const newParentNode = clonedNodeMap.get(node.parentNode);
                      const newNode = node.cloneNode(false);
                      newNode.nodeValue = node.nodeValue.slice(start, end);
                      newParentNode.appendChild(newNode);
                    } else {
                      cloneNodeAndAncestors(node);
                    }
                  }

                  break;
                }

                // clone the node
                cloneNodeAndAncestors(node);
              }
            }
            clonedRefNode.appendChild(newDoc.createComment("/scrapbook-capture-selected"));
          }
        }

        // not capture selection: clone all nodes
        if (!selection) {
          rootNode = cloneNodeMapping(htmlNode, true);

          if (rootNode.nodeName.toLowerCase() === "html") {
            headNode = rootNode.querySelector("head");
            if (!headNode) {
              headNode = rootNode.insertBefore(newDoc.createElement("head"), rootNode.firstChild);
              captureRecordAddedNode(headNode);
            }
          }
        }

        // add linefeeds to head and body to improve layout
        if (rootNode.nodeName.toLowerCase() === "html") {
          const headNodeBefore = headNode.previousSibling;
          if (!headNodeBefore || headNodeBefore.nodeType != 3) {
            rootNode.insertBefore(newDoc.createTextNode("\n"), headNode);
          }
          const headNodeStart = headNode.firstChild;
          if (!headNodeStart || headNodeStart.nodeType != 3) {
            headNode.insertBefore(newDoc.createTextNode("\n"), headNodeStart);
          }
          const headNodeEnd = headNode.lastChild;
          if (!headNodeEnd || headNodeEnd.nodeType != 3) {
            headNode.appendChild(newDoc.createTextNode("\n"));
          }
          const headNodeAfter = headNode.nextSibling;
          if (!headNodeAfter || headNodeAfter.nodeType != 3) {
            rootNode.insertBefore(newDoc.createTextNode("\n"), headNodeAfter);
          }
          const bodyNode = rootNode.querySelector("body");
          if (bodyNode) {
            const bodyNodeAfter = bodyNode.nextSibling;
            if (!bodyNodeAfter) {
              rootNode.insertBefore(newDoc.createTextNode("\n"), bodyNodeAfter);
            }
          }
        }

        addAdoptedStyleSheets(doc, rootNode);
      }

      // remove webscrapbook toolbar related
      rootNode.removeAttribute('data-scrapbook-toolbar-active');
      for (const elem of rootNode.querySelectorAll(`[data-scrapbook-elem|="toolbar"]`)) {
        elem.remove();
      }

      // preprocess with helpers
      if (options["capture.helpersEnabled"] && options["capture.helpers"]) {
        let helpers;
        try {
          helpers = JSON.parse(options["capture.helpers"]);
        } catch (ex) {
          // skip invalid helpers
        }

        if (helpers) {
          const parser = new capturer.CaptureHelperHandler(helpers, rootNode, docUrl);
          parser.run();
        }
      }

      // init cssHandler
      const cssHandler = new capturer.DocumentCssHandler({
        doc, rootNode, origNodeMap, clonedNodeMap, refUrl, settings, options,
      });

      // inspect all nodes (and register async tasks) -->
      // some additional tasks that requires some data after nodes are inspected -->
      // resolve the halter -->
      // await for all async tasks to complete -->
      // finalize
      const halter = new Deferred();
      const tasks = [];

      // inspect nodes
      let metaCharsetNode;
      let favIconUrl;
      let requireBasicLoader = false;
      rewriteRecursively(rootNode, rootNode.nodeName.toLowerCase(), rewriteNode);

      // record source URL
      if (options["capture.recordDocumentMeta"]) {
        const url = docUrl.startsWith("data:") ? "data:" : docUrl;
        rootNode.setAttribute("data-scrapbook-source", url);
        rootNode.setAttribute("data-scrapbook-create", timeId);
      }

      // force title if a preset title is given
      if (title) {
        if (["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
          let titleElem = Array.prototype.find.call(
            rootNode.querySelectorAll('title'),
            x => !x.closest('html svg'),
          );
          if (!titleElem) {
            titleElem = headNode.insertBefore(newDoc.createElement('title'), headNode.firstChild);
            captureRecordAddedNode(titleElem);
          }
          titleElem.textContent = title;
        } else if (doc.contentType === "image/svg+xml") {
          let titleElem = rootNode.querySelector('title');
          if (!titleElem) {
            const xmlns = "http://www.w3.org/2000/svg";
            titleElem = rootNode.insertBefore(newDoc.createElementNS(xmlns, 'title'), rootNode.firstChild);
            captureRecordAddedNode(titleElem);
          }
          titleElem.textContent = title;
        }
      }

      // force UTF-8
      if (rootNode.nodeName.toLowerCase() === "html") {
        if (!metaCharsetNode) {
          metaCharsetNode = headNode.insertBefore(newDoc.createElement("meta"), headNode.firstChild);
          metaCharsetNode.setAttribute("charset", "UTF-8");
          captureRecordAddedNode(metaCharsetNode);
        }
      }

      if (["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
        // handle tab favicon
        // 1. Use DOM favicon if presented.
        // 2. Use tab favicon (from favicon.ico or browser extension).
        // Prefer DOM favicon since tab favicon is data URL in Firefox, and results
        // in an extra downloading of possibly duplicated image, which is not
        // desired.
        if (typeof favIconUrl === 'undefined') {
          if (settings.frameIsMain && settings.favIconUrl) {
            let icon;
            tasks[tasks.length] = (async () => {
              switch (options["capture.favicon"]) {
                case "link": {
                  icon = favIconUrl = settings.favIconUrl;
                  break;
                }
                case "blank":
                case "remove": {
                  // do nothing
                  break;
                }
                case "save":
                default: {
                  icon = favIconUrl = settings.favIconUrl;
                  const response = await capturer.invoke("downloadFile", {
                    url: settings.favIconUrl,
                    refUrl,
                    settings,
                    options,
                  });
                  icon = response.url;
                  if (options["capture.saveAs"] === 'folder') {
                    favIconUrl = icon;
                  }
                  break;
                }
              }

              if (icon) {
                const favIconNode = headNode.appendChild(newDoc.createElement("link"));
                favIconNode.rel = "shortcut icon";
                favIconNode.href = icon;
                captureRecordAddedNode(favIconNode);
              }
            })();
          }
        }
      }

      // map used background images and fonts
      if ((options["capture.imageBackground"] === "save-used" || options["capture.font"] === "save-used") && !isHeadless) {
        const {usedCssFontUrl, usedCssImageUrl} = await cssHandler.getCssResources();
        
        // expose filter to settings
        if (options["capture.imageBackground"] === "save-used") {
          settings.usedCssImageUrl = usedCssImageUrl;
        }
        if (options["capture.font"] === "save-used") {
          settings.usedCssFontUrl = usedCssFontUrl;
        }
      }

      // resolve the halter and wait for all async downloading tasks to complete
      halter.resolve();
      await Promise.all(tasks);

      // record after the content of all nested shadow roots have been processed
      for (const {host, shadowRoot} of shadowRootList) {
        captureRewriteAttr(host, "data-scrapbook-shadowroot", JSON.stringify({
          data: shadowRoot.innerHTML,
          mode: "open",
        }));
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

      // common pre-save process
      await capturer.preSaveProcess({
        rootNode,
        deleteErased: options["capture.deleteErasedOnCapture"],
        requireBasicLoader,
      });

      // save document
      let content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;
      content = content.replace(/jc-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
        if (specialContentMap.has(key)) { return specialContentMap.get(key); }
        return match;
      });

      return await capturer.invoke("saveDocument", {
        sourceUrl: docUrl,
        documentFileName,
        settings,
        options,
        data: {
          mime,
          charset: "UTF-8",
          content,
          title: title || doc.title,
          favIconUrl,
        }
      });
    } catch(ex) {
      console.error(ex);
      return {error: {message: ex.message}};
    }
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Document} params.doc
   * @param {boolean} params.internalize
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.retrieveDocumentContent = async function (params) {
    isDebug && console.debug("call: retrieveDocumentContent");

    const {doc = document, internalize, settings, options} = params;
    const {item, frameIsMain} = settings;

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
        const newNode = newDoc.importNode(node, deep);
        origNodeMap.set(newNode, node);
        clonedNodeMap.set(node, newNode);

        // map descendants
        if (deep) {
          const doc = node.ownerDocument;
          const walker1 = doc.createNodeIterator(node);
          const walker2 = newDoc.createNodeIterator(newNode);
          let node1 = walker1.nextNode();
          let node2 = walker2.nextNode();
          while (node1) {
            origNodeMap.set(node2, node1);
            clonedNodeMap.set(node1, node2);
            node1 = walker1.nextNode();
            node2 = walker2.nextNode();
          }
        }

        return newNode;
      };

      const addResource = (url) => {
        const uuid = scrapbook.getUuid();
        const key = "urn:scrapbook:url:" + uuid;
        resources[uuid] = url;
        return key;
      };

      const processRootNode = (rootNode) => {
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
          switch (elem.type.toLowerCase()) {
            case "checkbox": {
              // indeterminate
              elem.removeAttribute("data-scrapbook-input-indeterminate");
              const elemOrig = origNodeMap.get(elem);
              if (!elemOrig) { continue; }
              if (elemOrig.indeterminate) {
                elem.setAttribute("data-scrapbook-input-indeterminate", "");
                requireBasicLoader = true;
              }
            }
            case "radio":
              if (elem.checked) {
                elem.setAttribute("checked", "checked");
              } else {
                elem.removeAttribute("checked");
              }
              break;
            case "password":
            case "file":
              // skip for security
            case "image":
              // skip image
              break;
            case "text":
            default:
              elem.setAttribute("value", elem.value);
              break;
          }
        }

        for (const elem of rootNode.querySelectorAll("textarea")) {
          elem.textContent = elem.value;
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
          if (scrapbook.isCanvasBlank(elemOrig)) { continue; }
          elem.setAttribute("data-scrapbook-canvas", elemOrig.toDataURL());
          requireBasicLoader = true;
        }

        // update shadow root data
        if (shadowRootSupported) {
          for (const elem of rootNode.querySelectorAll("*")) {
            elem.removeAttribute("data-scrapbook-shadowroot");

            const elemOrig = origNodeMap.get(elem);
            if (!elemOrig) { continue; }

            const shadowRootOrig = elemOrig.shadowRoot;
            if (!shadowRootOrig) { continue; }

            const shadowRoot = elem.attachShadow({mode: 'open'});
            origNodeMap.set(shadowRoot, shadowRootOrig);
            clonedNodeMap.set(shadowRootOrig, shadowRoot);
            for (const elem of shadowRootOrig.childNodes) {
              shadowRoot.appendChild(cloneNodeMapping(elem, true));
            }
            processRootNode(shadowRoot);
            elem.setAttribute("data-scrapbook-shadowroot", JSON.stringify({
              data: shadowRoot.innerHTML,
              mode: "open",
            }));
            requireBasicLoader = true;
          }
        } else {
          // shadowRoot not supported by the browser.
          // Just record whether there's a recorded shadow root.
          if (rootNode.querySelector('[data-scrapbook-shadowroot]')) {
            requireBasicLoader = true;
          }
        }
      };

      const {contentType: mime, characterSet: charset, documentElement: htmlNode} = doc;

      // create a new document to replicate nodes via import
      const newDoc = (new DOMParser()).parseFromString(
        '<' + htmlNode.nodeName.toLowerCase() + '/>',
        DOMPARSER_SUPPORT_TYPES.has(mime) ? mime : 'text/html'
      );

      const origNodeMap = new WeakMap();
      const clonedNodeMap = new WeakMap();
      const rootNode = cloneNodeMapping(htmlNode, true);
      const info = {
        title: (frameIsMain && i === 0 ? item && item.title : doc.title) || "",
      };
      const resources = {};
      const shadowRootSupported = !!rootNode.attachShadow;
      let requireBasicLoader = false;

      // remove webscrapbook toolbar related
      rootNode.removeAttribute('data-scrapbook-toolbar-active');
      for (const elem of rootNode.querySelectorAll(`[data-scrapbook-elem|="toolbar"]`)) {
        elem.remove();
      }

      processRootNode(rootNode);

      // common pre-save process
      await capturer.preSaveProcess({
        rootNode,
        deleteErased: options["capture.deleteErasedOnSave"],
        requireBasicLoader,
      });

      const content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;

      data[docUrl] = {
        content,
        charset,
        mime,
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
   * @param {boolean} params.deleteErased
   * @param {boolean} params.requireBasicLoader
   * @return {Promise<Object>}
   */
  capturer.preSaveProcess = async function (params) {
    isDebug && console.debug("call: preSaveProcess");

    const {rootNode, deleteErased, requireBasicLoader} = params;
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

      // handle descendant node first as it may be altered when handling ancestor
      for (const elem of selectedNodes.reverse()) {
        elem.remove();
      }
    }

    // update loader
    for (const elem of rootNode.querySelectorAll([
          'style[data-scrapbook-elem="annotation-css"]',
          'script[data-scrapbook-elem="basic-loader"]',
          'script[data-scrapbook-elem="annotation-loader"]',
          'script[data-scrapbook-elem="canvas-loader"]', // WebScrapBook < 0.69
          'script[data-scrapbook-elem="shadowroot-loader"]', // WebScrapBook < 0.69
        ].join(','))) {
      elem.remove();
    }
    if (requireBasicLoader) {
      const loader = rootNode.appendChild(doc.createElement("script"));
      loader.setAttribute("data-scrapbook-elem", "basic-loader");
      // Keep downward compatibility with IE8.
      // indeterminate checkbox: IE >= 6, getAttribute: IE >= 8
      // HTMLCanvasElement: Firefox >= 1.5, querySelectorAll: Firefox >= 3.5
      // getElementsByTagName is not implemented for DocumentFragment (shadow root)
      loader.textContent = "(" + scrapbook.compressJsFunc(function () {
        var k1 = "data-scrapbook-shadowroot", k2 = "data-scrapbook-input-indeterminate", k3 = "data-scrapbook-canvas",
            fn = function (r) {
              var E = r.querySelectorAll ? r.querySelectorAll("*") : r.getElementsByTagName("*"), i = E.length, e, d, s;
              while (i--) {
                e = E[i];
                if (e.hasAttribute(k1) && !e.shadowRoot && e.attachShadow) {
                  d = JSON.parse(e.getAttribute(k1));
                  s = e.attachShadow({mode: d.mode});
                  s.innerHTML = d.data;
                  e.removeAttribute(k1);
                }
                if (e.shadowRoot) {
                  fn(e.shadowRoot);
                }
                if (e.hasAttribute(k2)) {
                  e.indeterminate = true;
                  e.removeAttribute(k2);
                }
                if (e.hasAttribute(k3)) {
                  (function () {
                    var c = e, g = new Image();
                    g.onload = function () { c.getContext('2d').drawImage(g, 0, 0); };
                    g.src = c.getAttribute(k3);
                    c.removeAttribute(k3);
                  })();
                }
              }
            };
        fn(document);
      }) + ")()";
    }
    if (rootNode.querySelector('[data-scrapbook-elem="linemarker"], [data-scrapbook-elem="sticky"]')) {
      const css = rootNode.appendChild(doc.createElement("style"));
      css.setAttribute("data-scrapbook-elem", "annotation-css");
      css.textContent = scrapbook.compressCode(scrapbook.ANNOTATION_CSS);
      const loader = rootNode.appendChild(doc.createElement("script"));
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
      }) + ")()").replace(/%(\w+)%/g, (_, key) => scrapbook.lang(key));
    }
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Object} params.doc
   * @return {Promise<Array>}
   */
  capturer.retrieveSelectedLinks = async function (params = {}) {
    const {doc = document} = params;

    const nodes = scrapbook.getSelectedNodes({
      whatToShow: NodeFilter.SHOW_ELEMENT,
      nodeFilter: (node) => {
        return node.matches('a[href], area[href]');
      },
      fuzzy: true,
    });
    return Array.prototype.map.call(nodes, a => ({
     url: a.href,
     title: a.textContent,
    }));
  };

  /**
   * Format the filename to save.
   *
   * @param {Object} params
   * @param {string} params.title
   * @param {string} params.sourceUrl
   * @param {boolean} params.isFolder
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {string} The formatted filename.
   */
  capturer.getSaveFilename = async function (params) {
    const {title, sourceUrl, isFolder, settings, options} = params;

    const time = scrapbook.idToDate(settings.timeId);
    const u = new URL(sourceUrl);

    const tidy = (filename) => {
      let fn = filename;
      fn = scrapbook.validateFilename(fn, options["capture.saveAsciiFilename"]);
      fn = scrapbook.crop(fn, 120, 200); // see capturer.getUniqueFilename for limitation details
      return fn;
    };

    let filename = options["capture.saveFilename"].replace(/%([^%]*)%/g, (_, key) => {
      switch (key.toUpperCase()) {
        case "": {
          // escape "%" with "%%"
          return "%";
        }
        case "ID": {
          return settings.timeId;
        }
        case "ID_0": {
          return scrapbook.dateToIdOld(scrapbook.idToDate(settings.timeId));
        }
        case "UUID": {
          return scrapbook.getUuid();
        }
        case "TITLE": {
          return tidy(title);
        }
        case "HOST": {
          return tidy(u.host);
        }
        case "PAGE": {
          return tidy(scrapbook.filenameParts(scrapbook.urlToFilename(sourceUrl))[0]);
        }
        case "FILE": {
          return tidy(scrapbook.urlToFilename(sourceUrl));
        }
        case "DATE": {
          return [
            time.getFullYear(),
            scrapbook.intToFixedStr(time.getMonth() + 1, 2),
            scrapbook.intToFixedStr(time.getDate(), 2),
          ].join('-');
        }
        case "DATE_UTC": {
          return [
            time.getUTCFullYear(),
            scrapbook.intToFixedStr(time.getUTCMonth() + 1, 2),
            scrapbook.intToFixedStr(time.getUTCDate(), 2),
          ].join('-');
        }
        case "TIME": {
          return [
            scrapbook.intToFixedStr(time.getHours(), 2),
            scrapbook.intToFixedStr(time.getMinutes(), 2),
            scrapbook.intToFixedStr(time.getSeconds(), 2),
          ].join('-');
        }
        case "TIME_UTC": {
          return [
            scrapbook.intToFixedStr(time.getUTCHours(), 2),
            scrapbook.intToFixedStr(time.getUTCMinutes(), 2),
            scrapbook.intToFixedStr(time.getUTCSeconds(), 2),
          ].join('-');
        }
        case "YEAR": {
          return time.getFullYear();
        }
        case "YEAR_UTC": {
          return time.getUTCFullYear();
        }
        case "MONTH": {
          return scrapbook.intToFixedStr(time.getMonth() + 1, 2);
        }
        case "MONTH_UTC": {
          return scrapbook.intToFixedStr(time.getUTCMonth() + 1, 2);
        }
        case "DAY": {
          return scrapbook.intToFixedStr(time.getDate(), 2);
        }
        case "DAY_UTC": {
          return scrapbook.intToFixedStr(time.getUTCDate(), 2);
        }
        case "HOURS": {
          return scrapbook.intToFixedStr(time.getHours(), 2);
        }
        case "HOURS_UTC": {
          return scrapbook.intToFixedStr(time.getUTCHours(), 2);
        }
        case "MINUTES": {
          return scrapbook.intToFixedStr(time.getMinutes(), 2);
        }
        case "MINUTES_UTC": {
          return scrapbook.intToFixedStr(time.getUTCMinutes(), 2);
        }
        case "SECONDS": {
          return scrapbook.intToFixedStr(time.getSeconds(), 2);
        }
        case "SECONDS_UTC": {
          return scrapbook.intToFixedStr(time.getUTCSeconds(), 2);
        }
        default: {
          return _;
        }
      }
    });

    filename = filename
      .split('/')
      .map(x => scrapbook.validateFilename(x, options["capture.saveAsciiFilename"]))
      .join('/');

    return filename;
  };

  capturer.resolveRelativeUrl = function (relativeUrl, baseUrl) {
    let url = relativeUrl;

    // do not resolve empty or pure hash URL
    if (url && !url.startsWith("#")) {
      try {
        url = new URL(relativeUrl, baseUrl).href;
      } catch (ex) {}
    }

    return url;
  };

  capturer.getErrorUrl = function (sourceUrl, options) {
    if (!options || !options["capture.linkUnsavedUri"]) {
      if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:") || sourceUrl.startsWith("file:")) {
        return `urn:scrapbook:download:error:${sourceUrl}`;
      } else if (sourceUrl.startsWith("data:")) {
        return `urn:scrapbook:download:error:data:`;
      } else if (sourceUrl.startsWith("blob:")) {
        return `urn:scrapbook:download:error:blob:`;
      }
    }
    return sourceUrl;
  };

  capturer.getSkipUrl = function (sourceUrl, options) {
    if (!options || !options["capture.linkUnsavedUri"]) {
      if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:") || sourceUrl.startsWith("file:")) {
        return `urn:scrapbook:download:skip:${sourceUrl}`;
      } else if (sourceUrl.startsWith("data:")) {
        return `urn:scrapbook:download:skip:data:`;
      } else if (sourceUrl.startsWith("blob:")) {
        return `urn:scrapbook:download:skip:blob:`;
      }
    }
    return sourceUrl;
  };

  capturer.downLinkExtFilter = function (ext, options) {
    const compileFilters = (source) => {
      const ret = [];
      source.split(/[\r\n]/).forEach((line) => {
        line = line.trim();
        if (!line || line.startsWith("#")) { return; }

        if (/^\/(.*)\/([a-z]*)$/.test(line)) {
          try {
            ret.push(new RegExp(`^(?:${RegExp.$1})$`, RegExp.$2));
          } catch (ex) {
            console.error(ex);
          }
        } else {
          const regex = line.split(/[,;\s]+/)
            .filter(x => !!x)
            .map(x => scrapbook.escapeRegExp(x))
            .join('|');
          ret.push(new RegExp(`^(?:${regex})$`, 'i'));
        }
      });
      return ret;
    };
    let filterText;
    let filters;

    const fn = capturer.downLinkExtFilter = (ext, options) => {
      // use the cache if the filter is not changed
      if (filterText !== options["capture.downLink.extFilter"]) {
        filterText = options["capture.downLink.extFilter"];
        filters = compileFilters(filterText);
      }

      return filters.some((filter) => {
        return filter.test(ext);
      });
    };
    return fn(ext, options);
  };

  capturer.downLinkUrlFilter = function (url, options) {
    const compileFilters = (source) => {
      const ret = [];
      source.split(/[\r\n]/).forEach((line) => {
        line = line.trim();
        if (!line || line.startsWith("#")) { return; }

        if (/^\/(.*)\/([a-z]*)$/.test(line)) {
          try {
            ret.push(new RegExp(RegExp.$1, RegExp.$2));
          } catch (ex) {
            console.error(ex);
          }
        } else {
          ret.push(scrapbook.splitUrlByAnchor(line)[0]);
        }
      });
      return ret;
    };
    let filterText;
    let filters;

    const fn = capturer.downLinkUrlFilter = (url, options) => {
      // use the cache if the filter is not changed
      if (filterText !== options["capture.downLink.urlFilter"]) {
        filterText = options["capture.downLink.urlFilter"];
        filters = compileFilters(filterText);
      }

      // match the URL without hash
      const matchUrl = scrapbook.splitUrlByAnchor(url)[0];

      return filters.some((filter) => {
        // plain text rule must match full URL
        if (typeof filter === 'string') {
          return filter === matchUrl;
        }

        return filter.test(matchUrl);
      });
    };
    return fn(url, options);
  };


  /****************************************************************************
   * A class that handles document CSS analysis.
   *
   * @class DocumentCssHandler
   ***************************************************************************/

  capturer.DocumentCssHandler = class DocumentCssHandler {
    constructor({doc, rootNode, origNodeMap, clonedNodeMap, refUrl, settings, options}) {
      this.doc = doc;
      this.rootNode = rootNode || doc.documentElement;
      this.origNodeMap = origNodeMap;
      this.clonedNodeMap = clonedNodeMap;
      this.refUrl = refUrl || doc.URL;
      this.settings = settings;
      this.options = options;
      this.resourceMap = ((options['capture.saveAs'] === 'singleHtml') && options['capture.mergeCssResources']) ? {} : null;
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

        Array.prototype.forEach.call(this.doc.styleSheets, (css) => {
          // ignore imported CSS
          if (!css.ownerNode) {
            return;
          }

          const title = css.title && css.title.trim();

          // ignore persistent CSS
          if (!title) {
            return;
          }

          // preferred or alternate
          if (!groups.has(title)) {
            groups.set(title, []);
          }
          groups.get(title).push(css);
        });

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
     * Verify whether selectorText matches something in root.
     *
     * @param {Element|DocumentFragment} root
     * @param {string} selectorText - selectorText of a CSSStyleRule
     */
    verifySelector(root, selectorText) {
      try {
        // querySelector of a pseudo selector like a:hover always return null
        if (root.querySelector(selectorText)) { return true; }

        // Preserve a pseudo-class(:*) or pseudo-element(::*) only if:
        // 1. it's a pure pseudo (e.g. :hover), or
        // 2. its non-pseudo version (e.g. a for a:hover) exist
        var hasPseudo = false;
        var inPseudo = false;
        var depseudoSelectors = [""];
        selectorText.replace(
          /(,\s+)|(\s+)|((?:[\-0-9A-Za-z_\u00A0-\uFFFF]|\\[0-9A-Fa-f]{1,6} ?|\\.)+)|(\[(?:"(?:\\.|[^"])*"|\\.|[^\]])*\])|(.)/g,
          (m, m1, m2, m3, m4, m5) => {
            if (m1) {
              depseudoSelectors.push("");
              inPseudo = false;
            } else if (m5 == ":") {
              hasPseudo = true;
              inPseudo = true;
            } else if (inPseudo) {
              if (!(m3 || m5)) {
                inPseudo = false;
                depseudoSelectors[depseudoSelectors.length - 1] += m;
              }
            } else {
              depseudoSelectors[depseudoSelectors.length - 1] += m;
            }
            return m;
          }
        );
        if (hasPseudo) {
          for (let i=0, I=depseudoSelectors.length; i<I; ++i) {
            if (depseudoSelectors[i] === "" || root.querySelector(depseudoSelectors[i])) return true;
          };
        }
      } catch (ex) {
        // As CSSStyleRule.selectorText is already a valid selector,
        // an error means it's valid but not supported by querySelector.
        // One example is a namespaced selector like: svg|a,
        // as querySelector cannot consume a @namespace rule in prior.
        // Return true in such case as false positive is safer than false
        // negative.
        //
        // @TODO:
        // Full implementation of a correct selector match.
        return true;
      }

      return false;
    }

    getElemCss(elem) {
      const {origNodeMap} = this;
      const origElem = origNodeMap.get(elem);
      return origElem && origElem.sheet;
    }

    async getRulesFromCssText(cssText) {
      // In Chromium, BOM causes returned cssRules be empty.
      // Remove it to prevent the issue.
      if (cssText[0] === '\uFEFF') {
        cssText = cssText.slice(1);
      }

      const d = document.implementation.createHTMLDocument('');
      const styleElem = d.createElement('style');
      styleElem.textContent = cssText;
      d.head.appendChild(styleElem);

      // In Firefox, an error is thrown when accessing cssRules right after
      // insertion of a stylesheet containing an @import rule. A delay is
      // required to prevent the error.
      await scrapbook.delay(0);

      return styleElem.sheet.cssRules;
    }

    /**
     * @param {Object} params
     * @param {CSSStyleSheet} params.css - The CSS to get rules from.
     * @param {string} params.url - The overriding source URL for retrieving a
     *     cross-orign CSS.
     * @param {string} params.refUrl - The referrer URL for retrieving a
     *     cross-orign CSS.
     * @param {boolean} params.crossOrigin - Whether to retrieve CSS via web
     *     request if it's cross origin.
     * @return {Array<CSSStyleRule>|null}
     */
    async getRulesFromCss({css, url, refUrl, crossOrigin = true, errorWithNull = false}) {
      let rules = null;
      try {
        // Firefox may get this for a stylesheet with relative URL imported from
        // a stylesheet with null href (mostly created via
        // document.implementation.createHTMLDocument). In such case css.cssRules
        // is an empty CSSRuleList.
        if (css.href === 'about:invalid') {
          throw new Error('cssRules not accessible.');
        }

        rules = css.cssRules;

        if (!rules) {
          throw new Error('cssRules not accessible.');
        }
      } catch (ex) {
        // cssRules not accessible, probably a cross-domain CSS.
        if (crossOrigin) {
          if (css.ownerNode && css.ownerNode.nodeName.toLowerCase() === 'style') {
            rules = await this.getRulesFromCssText(css.ownerNode.textContent);
          } else {
            const {settings, options} = this;
            const response = await capturer.invoke("fetchCss", {
              url: url || css.href,
              refUrl,
              settings,
              options,
            });
            if (!response.error) {
              rules = await this.getRulesFromCssText(response.text);
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
     * Collect used resource URLs by decendants of rootNode.
     *
     * - Currently we only check whether a font is USED (font-family referred
     *   by CSS) rather than LOADED due to performance consideration and
     *   technical restriction—even if Document.fonts can be checked, it's
     *   hard to trace whether a "loading" status will become "loaded" or
     *   "error".
     * - Scoped @font-face is hard to implement and is unlikely used. But for
     *   completeness we currently implement as if it's scoped, just like
     *   @keyframes.
     *   ref: https://bugs.chromium.org/p/chromium/issues/detail?id=336876
     *
     * @return {{usedCssFontUrl: Object, usedCssImageUrl: Object}}
     */
    async getCssResources() {
      const {doc, rootNode, refUrl, settings, options} = this;

      const collector = {
        scopes: [],
        usedFontUrls: {},
        usedImageUrls: {},

        getUsedResources() {
          while (this.scopes.length) {
            this.scopePop();
          }
          const data = {
            usedCssFontUrl: this.usedFontUrls,
            usedCssImageUrl: this.usedImageUrls,
          };
          return data;
        },

        /**
         * - propText is CSS property value of font-family or animation-name,
         *   which is normalized.
         * - Names are separated with ", ".
         * - An identifier is not quoted, with special chars escaped with '\'.
         * - A string is quoted with "", and '"'s inside are escaped with '\"'.
         * - Unicode escape sequences are unescaped.
         * - CSS comments are removed.
         */
        parseNames(propText) {
          const regex = /"[^\\"]*(?:\\.[^\\"]*)*"|((?:[^,\s\\"]|\\(?:[0-9A-Fa-f]{1,6} ?|.))+)(?:,|$)/g;
          const names = [];
          while (regex.test(propText)) {
            let value = RegExp.$1 || RegExp.lastMatch.slice(1, -1);
            value = scrapbook.unescapeCss(value);
            names.push(value);
          }
          return names;
        },

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
        },

        scopePop() {
          // mark used keyFrames
          for (let name of this.scopes[this.scopes.length - 1].keyFrameUsed) {
            for (let i = this.scopes.length; i--;) {
              if (i === 0 || this.scopes[i].keyFrameMap.has(name)) {
                this.scopes[i].keyFrameMap.get(name).used = true;
                break;
              }
            }
          }

          // mark used fonts
          for (let ff of this.scopes[this.scopes.length - 1].fontUsed) {
            for (let i = this.scopes.length; i--;) {
              if (i === 0 || this.scopes[i].fontMap.has(ff)) {
                this.scopes[i].fontMap.get(ff).used = true;
                break;
              }
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
        },

        inspectStyle(style, refUrl) {
          for (let prop of style) {
            if (prop === 'font-family') {
              this.useFont(style.getPropertyValue('font-family'));
            } else if (prop === 'animation-name') {
              this.useKeyFrame(style.getPropertyValue('animation-name'));
            } else {
              forEachUrl(style.getPropertyValue(prop), refUrl, (url) => {
                this.useImage(url);
              });
            }
          }
        },
        
        addFontUrl(fontFamilyText, url) {
          if (!url) { return; }
          for (const ff of this.parseNames(fontFamilyText)) {
            this.scopes[this.scopes.length - 1].fontMap.get(ff).urls.add(url);
          }
        },

        useFont(fontFamilyText) {
          if (!fontFamilyText) { return; }
          for (const ff of this.parseNames(fontFamilyText)) {
            this.scopes[this.scopes.length - 1].fontUsed.add(ff);
          }
        },

        addKeyFrameFont(name, fontFamilyText) {
          if (!fontFamilyText) { return; }
          for (const ff of this.parseNames(fontFamilyText)) {
            this.scopes[this.scopes.length - 1].keyFrameMap.get(name).fonts.add(ff);
          }
        },

        addKeyFrameUrl(name, url) {
          if (!url) { return; }
          this.scopes[this.scopes.length - 1].keyFrameMap.get(name).urls.add(url);
        },

        useKeyFrame(animationNameText) {
          if (!animationNameText) { return; }

          for (const name of this.parseNames(animationNameText)) {
            this.scopes[this.scopes.length - 1].keyFrameUsed.add(name);
          }
        },

        useImage(url) {
          this.usedImageUrls[url] = true;
        },
      };

      const parseCssRule = async (cssRule, refUrl, root = rootNode) => {
        switch (cssRule.type) {
          case CSSRule.STYLE_RULE: {
            // this CSS rule applies to no node in the captured area
            if (!this.verifySelector(root, cssRule.selectorText)) { break; }

            collector.inspectStyle(cssRule.style, refUrl);
            break;
          }
          case CSSRule.IMPORT_RULE: {
            if (!cssRule.styleSheet) { break; }

            const css = cssRule.styleSheet;
            const url = new URL(cssRule.href, refUrl).href;
            const rules = await this.getRulesFromCss({css, url, refUrl});
            for (const rule of rules) {
              await parseCssRule(rule, url);
            }
            break;
          }
          case CSSRule.MEDIA_RULE: {
            if (!cssRule.cssRules) { break; }

            for (const rule of cssRule.cssRules) {
              await parseCssRule(rule, refUrl);
            }
            break;
          }
          case CSSRule.FONT_FACE_RULE: {
            if (!cssRule.cssText) { break; }

            const fontFamily = cssRule.style.getPropertyValue('font-family');
            const src = cssRule.style.getPropertyValue('src');

            if (!fontFamily || !src) { break; }

            // record this font family and its font URLs
            forEachUrl(src, refUrl, (url) => {
              collector.addFontUrl(fontFamily, url);
            });

            break;
          }
          case CSSRule.PAGE_RULE: {
            if (!cssRule.cssText) { break; }

            collector.inspectStyle(cssRule.style, refUrl);
            break;
          }
          case CSSRule.KEYFRAMES_RULE: {
            if (!cssRule.cssRules) { break; }

            for (const rule of cssRule.cssRules) {
              await parseCssRule(rule, refUrl);
            }
            break;
          }
          case CSSRule.KEYFRAME_RULE: {
            if (!cssRule.cssText) { break; }

            collector.addKeyFrameFont(cssRule.parentRule.name, cssRule.style.getPropertyValue('font-family'));

            forEachUrl(cssRule.cssText, refUrl, (url) => {
              collector.addKeyFrameUrl(cssRule.parentRule.name, url);
            });
            break;
          }
          // @TODO: COUNTER_STYLE_RULE is only supported by Firefox
          // and the API is unstable. Check if counter-style is really used
          case 11/* CSSRule.COUNTER_STYLE_RULE */: {
            if (!cssRule.symbols) { break; }

            forEachUrl(cssRule.symbols, refUrl, (url) => {
              collector.useImage(url);
            });
            break;
          }
          // @TODO: check SUPPORTS_RULE is supported or not
          case CSSRule.SUPPORTS_RULE: {
            if (!cssRule.cssRules) { break; }

            for (const rule of cssRule.cssRules) {
              await parseCssRule(rule, refUrl);
            }
            break;
          }
          // @TODO: DOCUMENT_RULE is only supported by Firefox
          // (with -moz-) and the API is unstable.
          case 13/* CSSRule.DOCUMENT_RULE */: {
            if (!cssRule.cssRules) { break; }

            for (const rule of cssRule.cssRules) {
              await parseCssRule(rule, refUrl);
            }
            break;
          }
        }
      };

      // We pass only elemental css text, which should not contain any at-rule
      const forEachUrl = (cssText, refUrl, callback = x => x) => {
        scrapbook.rewriteCssText(cssText, {
          rewriteImportUrl(url) { return {url}; },
          rewriteFontFaceUrl(url) { return {url}; },
          rewriteBackgroundUrl(url) {
            const targetUrl = capturer.resolveRelativeUrl(url, refUrl);
            callback(targetUrl);
            return {url};
          },
          resourceMap: this.resourceMap,
        });
      };

      const inspectDocOrShadowRoot = async (doc, root) => {
        for (const css of doc.styleSheets) {
          const rules = await this.getRulesFromCss({css, refUrl});
          for (const rule of rules) {
            await parseCssRule(rule, css.href || refUrl, root);
          }
        }

        if (doc.adoptedStyleSheets) {
          for (const css of doc.adoptedStyleSheets) {
            const rules = await this.getRulesFromCss({css, refUrl});
            for (const rule of rules) {
              await parseCssRule(rule, css.href || refUrl, root);
            }
          }
        }

        await inspectElement(root);
        for (const elem of root.querySelectorAll("*")) {
          await inspectElement(elem);
        }
      };

      const inspectElement = async (elem) => {
        const {style} = elem;
        if (style) {
          collector.inspectStyle(style, refUrl);
        }

        const shadowRoot = elem.shadowRoot;
        if (shadowRoot) {
          const shadowRootOrig = this.origNodeMap.get(shadowRoot);
          if (shadowRootOrig) {
            collector.scopePush(shadowRootOrig);
            await inspectDocOrShadowRoot(shadowRootOrig, shadowRoot);
            collector.scopePop();
          }
        }
      };

      collector.scopePush(doc);
      await inspectDocOrShadowRoot(doc, rootNode);

      return collector.getUsedResources();
    }

    /**
     * Rewrite a given CSS Text.
     *
     * @param {string} cssText - the CSS text to rewrite.
     * @param {string} refUrl - the reference URL for URL resolving.
     * @param {CSSStyleSheet} refCss - the reference CSS (which holds the
     *     @import rule(s), for imported CSS).
     * @param {boolean} isInline - whether cssText is inline.
     * @param {Object} settings
     * @param {Object} options
     */
    async rewriteCssText({cssText, refUrl, refCss = null, isInline = false, settings = this.settings, options = this.options}) {
      settings = JSON.parse(JSON.stringify(settings));
      settings.recurseChain.push(scrapbook.splitUrlByAnchor(refUrl)[0]);
      const {usedCssFontUrl, usedCssImageUrl} = settings;

      const resolveCssUrl = (sourceUrl, refUrl) => {
        const url = capturer.resolveRelativeUrl(sourceUrl, refUrl);
        let valid = true;

        // do not fetch if the URL is not resolved
        if (!scrapbook.isUrlAbsolute(url)) {
          valid = false;
        }

        return {
          url,
          recordUrl: options["capture.recordSourceUri"] ? url : "",
          valid,
        };
      };

      const downloadFileInCss = async (url) => {
        const response = await capturer.invoke("downloadFile", {
          url,
          refUrl,
          settings,
          options,
        });
        return response.url;
      };

      const importRules = [];
      let importRuleIdx = 0;
      if (refCss) {
        const rules = await this.getRulesFromCss({css: refCss, url: refUrl, refUrl});
        for (const rule of rules) {
          if (rule.type === 3) {
            importRules.push(rule);
          }
        }
      }

      const rewriteImportUrl = async (sourceUrl) => {
        let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, refUrl);
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
                refCss: rule && rule.styleSheet,
                refUrl,
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
        let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, refUrl);
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
        let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, refUrl);
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
     */
    async rewriteCssRules({cssRules, refUrl, refCss, rootNode, indent = '', settings, options}) {
      // get rootNode, the cloned <html> or documentElement (shadowRoot)
      if (!rootNode) {
        let css = refCss;
        let parent = css.parentStyleSheet;
        while (parent) {
          css = parent;
          parent = css.parentStyleSheet;
        }

        rootNode = this.clonedNodeMap.get(css.ownerNode).getRootNode();

        // if it's <html>, wrap it with a documentFragment, so that CSS selector "html" can match
        if (rootNode.nodeType === 1) {
          const frag = rootNode.ownerDocument.createDocumentFragment();
          frag.appendChild(rootNode);
          rootNode = frag;
        }
      }

      const rules = [];
      for (const cssRule of cssRules) {
        switch (cssRule.type) {
          case CSSRule.STYLE_RULE: {
            // this CSS rule applies to no node in the captured area
            if (rootNode && !this.verifySelector(rootNode, cssRule.selectorText)) { break; }

            const cssText = await this.rewriteCssText({
              cssText: cssRule.cssText,
              refUrl,
              refCss,
              settings,
              options,
            });
            if (cssText) {
              rules[rules.length] = indent + cssText;
            }
            break;
          }
          case CSSRule.IMPORT_RULE: {
            const cssText = await this.rewriteCssText({
              cssText: cssRule.cssText,
              refUrl,
              refCss,
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
              refUrl,
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
              refUrl,
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
              refUrl,
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
          case CSSRule.FONT_FACE_RULE:
          case CSSRule.PAGE_RULE:
          case CSSRule.KEYFRAME_RULE:
          case 11/* CSSRule.COUNTER_STYLE_RULE */:
          case 13/* CSSRule.DOCUMENT_RULE */:
          default: {
            const cssText = await this.rewriteCssText({
              cssText: cssRule.cssText,
              refUrl,
              refCss,
              settings,
              options,
            });
            if (cssText) {
              rules[rules.length] = indent + cssText;
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
        }
      }
      return rules.join('\n');
    }

    /**
     * Rewrite an internal, external, or imported CSS.
     *
     * - Pass {elem, callback} for internal or external CSS.
     * - Pass {url, refCss, callback} for imported CSS.
     *
     * @param {HTMLElement} elem - the elem to have CSS rewritten.
     * @param {string} url - the source URL of the imported CSS.
     * @param {string} refCss - the reference CSS (the imported styleSheet
     *     object) of the imported CSS.
     * @param {string} refUrl - the reference URL for URL resolving.
     * @param {Function} callback
     * @param {Object} settings
     * @param {Object} options
     */
    async rewriteCss({elem, url, refCss, refUrl, callback, settings = this.settings, options = this.options}) {
      let sourceUrl;
      let fetchResult;
      let cssText = "";
      let cssRules;
      let charset;
      let newFilename;
      let isCircular = false;

      if (!elem || elem.nodeName.toLowerCase() == 'link') {
        // imported or external CSS
        if (!elem) {
          // imported CSS
          sourceUrl = url;
        } else {
          // external CSS
          refCss = this.getElemCss(elem);
          sourceUrl = elem.getAttribute("href");
        }

        const response = await capturer.invoke("fetchCss", {
          url: sourceUrl,
          refUrl,
          settings,
          options,
        });

        if (response.error) {
          await callback(elem, response);
          return;
        }

        isCircular = settings.recurseChain.includes(scrapbook.splitUrlByAnchor(sourceUrl)[0]);
        fetchResult = response;
        cssText = response.text;
        charset = response.charset;
      } else {
        // internal CSS
        refCss = this.getElemCss(elem);
        cssText = elem.textContent;
        charset = "UTF-8";
      }

      // Capture dynamic stylesheet content instead if the stylesheet has been
      // dynamically modified.
      let isDynamicCss = false;

      // Ignore refCss if sourceUrl is circularly referenced, as we cannot get
      // original cssRules from CSSOM and cannot determine whether it's dynamic
      // reliably.
      //
      // If style1.css => style2.css => style3.css => style1.css
      // - Chromium: styleSheet of StyleSheet "style3.css" is null
      // - Firefox: cssRules of the circularly referenced StyleSheet "style1.css"
      //            is empty, but can be modified by scripts.
      if (refCss && !isCircular) {
        cssRules = await this.getRulesFromCss({
          css: refCss,
          refUrl,
          crossOrigin: false,
          errorWithNull: true,
        });
        if (cssRules) {
          // scrapbook.utf8ToUnicode throws an error if cssText contains a UTF-8 invalid char
          const cssTextUnicode = charset ? cssText : await scrapbook.readFileAsText(new Blob([scrapbook.byteStringToArrayBuffer(cssText)]));

          const cssRulesSource = await this.getRulesFromCssText(cssTextUnicode);

          if (cssRulesSource.length !== cssRules.length ||
              !Array.prototype.every.call(
                cssRulesSource,
                (cssRule, i) => (cssRule.cssText === cssRules[i].cssText),
              )) {
            isDynamicCss = true;
            charset = "UTF-8";
            cssText = Array.prototype.map.call(
              cssRules,
              cssRule => cssRule.cssText,
            ).join("\n");
          }
        }
      }

      // register the filename to save (for imported or external CSS)
      if (!elem || elem.nodeName.toLowerCase() == 'link') {
        if (!fetchResult.url.startsWith("data:")) {
          let response = await capturer.invoke("registerFile", {
            filename: fetchResult.filename,
            sourceUrl,
            accessId: isDynamicCss ? null : fetchResult.accessId,
            settings,
            options,
          });

          // handle duplicated accesses
          if (response.isDuplicate) {
            if (isCircular) {
              if (["singleHtml"].includes(options["capture.saveAs"])) {
                const target = sourceUrl;
                const source = settings.recurseChain[settings.recurseChain.length - 1];
                console.warn(scrapbook.lang("WarnCaptureCircular", [source, target]));
                response.url = `urn:scrapbook:download:circular:filename:${response.url}`;
              }

              await callback(elem, response);
              return;
            }

            response = await capturer.invoke("getAccessResult", {
              sourceUrl,
              accessId: fetchResult.accessId,
              settings,
              options,
            });
            await callback(elem, response);
            return;
          }

          newFilename = response.filename;
        } else {
          // Save inner URLs as data URL since data URL is null origin
          // and no relative URLs are allowed in it.
          options = JSON.parse(JSON.stringify(options));
          options["capture.saveAs"] = "singleHtml";
        }
      }

      // do the rewriting according to options
      switch (options["capture.rewriteCss"]) {
        case "url": {
          cssText = await this.rewriteCssText({
            cssText,
            refUrl: sourceUrl || refUrl,
            refCss,
            settings,
            options,
          });
          break;
        }
        case "tidy": {
          if (!isDynamicCss) {
            charset = "UTF-8";
            if (refCss && !isCircular) {
              const cssRulesCssom = await this.getRulesFromCss({
                css: refCss,
                refUrl,
              });
              cssText = Array.prototype.map.call(
                cssRulesCssom,
                cssRule => cssRule.cssText,
              ).join("\n");
            } else {
              cssText = '';
            }
          }
          cssText = await this.rewriteCssText({
            cssText,
            refUrl: sourceUrl || refUrl,
            refCss,
            settings,
            options,
          });
          break;
        }
        case "match": {
          if (!cssRules) {
            charset = "UTF-8";
            if (refCss && !isCircular) {
              cssRules = await this.getRulesFromCss({
                css: refCss,
                refUrl,
              });
            }
          }
          if (cssRules) {
            cssText = await this.rewriteCssRules({
              cssRules,
              refUrl: sourceUrl || refUrl,
              refCss,
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
      if (!elem || elem.nodeName.toLowerCase() == 'link') {
        // imported or external CSS
        // force UTF-8 for rewritten CSS

        // special management for data URI
        if (fetchResult.url.startsWith("data:")) {
          const [, hash] = scrapbook.splitUrlByAnchor(fetchResult.url);
          const dataUri = charset ? 
              scrapbook.unicodeToDataUri(cssText, "text/css") : 
              scrapbook.byteStringToDataUri(cssText, "text/css;charset=UTF-8");
          const response = {url: dataUri + hash};
          await callback(elem, response);
          return;
        }

        const response = await capturer.invoke("downloadBytes", {
          bytes: charset ? scrapbook.unicodeToUtf8(cssText) : cssText,
          mime: "text/css;charset=UTF-8",
          filename: newFilename,
          sourceUrl,
          accessId: isDynamicCss ? null : fetchResult.accessId,
          settings,
          options,
        });
        await callback(elem, response);
      } else {
        // internal CSS
        const response = {
          cssText,
        };
        await callback(elem, response);
      }
    }
  };


  /****************************************************************************
   * A class that handles capture helpers.
   ***************************************************************************/

  capturer.CaptureHelperHandler = class CaptureHelperHandler {
    constructor(helpers, rootNode, docUrl) {
      this.helpers = helpers;
      this.rootNode = rootNode;
      this.docUrl = docUrl;
    }

    run() {
      const {helpers, rootNode, docUrl} = this;

      for (const helper of helpers) {
        if (typeof helper.pattern === 'string') {
          const regex = this.parseRegexStr(helper.pattern);
          if (regex) {
            // regex pattern
            if (!regex.test(docUrl)) {
              continue;
            }
          } else {
            // @TODO: support alternative filtering
            continue;
          }
        }

        if (Array.isArray(helper.commands)) {
          for (const command of helper.commands) {
            if (!this.isCommand(command)) {
              console.error(`WebScrapBook: Invalid capture helper command: ${JSON.stringify(command)}`);
              continue;
            }
            try {
              this.runCommand(command, rootNode);
            } catch (ex) {
              console.error(`WebScrapBook: Error running capture helper command: ${JSON.stringify(command)}`);
              console.error(ex);
            }
          }
        }
      }
    }

    parseRegexStr(str) {
      const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/i;
      const parseRegexStr = this.parseRegexStr = (str) => {
        const m = str.match(REGEX_PATTERN);
        if (m) {
          return new RegExp(m[1], m[2]);
        }
        return null;
      };
      return parseRegexStr(str);
    }

    selectNodes(rootNode, selector) {
      if (!selector) {
        return [rootNode];
      }
      if (typeof selector === 'string') {
        switch (selector) {
          case 'root':
            return [rootNode.getRootNode()];
          case 'parent':
            return [rootNode.parentNode];
          case 'firstChild':
            return [rootNode.firstChild];
          case 'lastChild':
            return [rootNode.lastChild];
          case 'previousSibling':
            return [rootNode.previousSibling];
          case 'nextSibling':
            return [rootNode.nextSibling];
          case 'self':
            return [rootNode];
          default:
            return rootNode.querySelectorAll(selector);
        }
      }
      if (typeof selector.css === 'string') {
        return rootNode.querySelectorAll(selector.css);
      }
      if (typeof selector.xpath === 'string') {
        const iter = rootNode.ownerDocument.evaluate(selector.xpath, rootNode);
        let elems = [], elem;
        while (elem = iter.iterateNext()) {
          elems.push(elem);
        }
        return elems;
      }
      return [];
    }

    isCommand(obj) {
      if (Array.isArray(obj) && typeof obj[0] === 'string') {
        return true;
      }
      return false;
    }

    runCommand(command, rootNode) {
      const cmd = this.resolve(command[0], rootNode);
      if (!this['cmd_' + cmd]) {
        throw new Error(`Unknown helper command: ${cmd}`);
      }
      return this['cmd_' + cmd].apply(this, [rootNode, ...command.slice(1)]);
    }

    resolve(obj, rootNode) {
      if (this.isCommand(obj)) {
        return this.runCommand(obj, rootNode);
      }
      return obj;
    }

    cmd_if(rootNode, condition, thenValue, elseValue) {
      if (this.resolve(condition, rootNode)) {
        return this.resolve(thenValue, rootNode);
      }
      return this.resolve(elseValue, rootNode);
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

    cmd_for(rootNode, selector, ...commands) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      for (const elem of elems) {
        for (const command of commands) {
          this.resolve(command, elem);
        }
      }
    }

    cmd_match(rootNode, str, pattern, index) {
      str = this.resolve(str, rootNode) || "";
      pattern = this.parseRegexStr(this.resolve(pattern, rootNode));
      index = this.resolve(index, rootNode);
      if (typeof index !== 'number' && typeof index !== 'string') {
        // boolean mode
        if (!pattern) { return false; }
        return pattern.test(str);
      } else {
        // substring mode
        if (!pattern) { return null; }
        const m = str.match(pattern);
        if (!m) { return null; }
        return m[index];
      }
    }

    cmd_replace(rootNode, str, pattern, replacement) {
      str = this.resolve(str, rootNode) || "";
      pattern = this.parseRegexStr(this.resolve(pattern, rootNode));
      replacement = this.resolve(replacement, rootNode) || "";
      return pattern ? str.replace(pattern, replacement) : str;
    }

    cmd_has_elem(rootNode, selector) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      if (elems.length) {
        return true;
      }
      return false;
    }

    cmd_has_attr(rootNode, selector, attr) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      return (elems[0] && elems[0].hasAttribute || false) && elems[0].hasAttribute(this.resolve(attr, rootNode));
    }

    cmd_get_html(rootNode, selector) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      return (elems[0] || null) && elems[0].innerHTML;
    }

    cmd_get_text(rootNode, selector) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      return (elems[0] || null) && elems[0].textContent;
    }

    cmd_get_attr(rootNode, selector, attr) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      return (elems[0] && elems[0].getAttribute || null) && elems[0].getAttribute(this.resolve(attr, rootNode));
    }

    cmd_get_css(rootNode, selector, style, getPriority) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      return (elems[0] && elems[0].style || null) && this.resolve(getPriority, rootNode) ?
          elems[0].style.getPropertyPriority(this.resolve(style, rootNode)) :
          elems[0].style.getPropertyValue(this.resolve(style, rootNode));
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
        scrapbook.unwrapElement(elem);
      }
    }

    cmd_html(rootNode, selector, value) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      for (const elem of elems) {
        elem.innerHTML = this.resolve(value, elem);
      }
    }

    cmd_text(rootNode, selector, value) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      for (const elem of elems) {
        elem.textContent = this.resolve(value, elem);
      }
    }

    cmd_attr(rootNode, selector, attrOrDict, valueOrNull) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      for (const elem of elems) {
        if (!elem.setAttribute) { continue; }
        const attrOrDict_ = this.resolve(attrOrDict, elem);
        if (typeof attrOrDict_ === "string") {
          const key = attrOrDict_;
          const value = this.resolve(valueOrNull, elem);
          if (value !== null) {
            elem.setAttribute(key, value);
          } else {
            elem.removeAttribute(key);
          }
        } else {
          for (const key in attrOrDict_) {
            const value = this.resolve(attrOrDict_[key], elem);
            if (value !== null) {
              elem.setAttribute(key, value);
            } else {
              elem.removeAttribute(key);
            }
          }
        }
      }
    }

    cmd_css(rootNode, selector, styleOrDict, valueOrNull, priorityOrNull) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      for (const elem of elems) {
        if (!elem.style) { continue; }
        const styleOrDict_ = this.resolve(styleOrDict, elem);
        if (typeof styleOrDict_ === "string") {
          const key = styleOrDict_;
          const value = this.resolve(valueOrNull, elem);
          const priority = this.resolve(priorityOrNull, elem);
          if (value !== null) {
            elem.style.setProperty(key, value, priority);
          } else {
            elem.style.removeProperty(key);
          }
        } else {
          for (const key in styleOrDict_) {
            const value = this.resolve(styleOrDict_[key], elem);
            if (value !== null) {
              elem.style.setProperty(key, value);
            } else {
              elem.style.removeProperty(key);
            }
          }
        }
      }
    }
  };


  return capturer;

}));
