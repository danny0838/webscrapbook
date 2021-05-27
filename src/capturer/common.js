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
    root.MapWithDefault,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, MapWithDefault, window, document, console) {

  'use strict';

  const REWRITABLE_SPECIAL_OBJECTS = new Set([false, 'adoptedStyleSheet']);

  const REMOVE_HIDDEN_EXCLUDE_HTML = new Set(["html", "head", "title", "meta", "link", "style", "script", "body", "noscript", "template", "source", "track"]);
  const REMOVE_HIDDEN_EXCLUDE_SVG = new Set(["svg"]);
  const REMOVE_HIDDEN_EXCLUDE_MATH = new Set(["math"]);

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
   * @param {string} [details] - Data to determine invocation behavior.
   * @param {string} [details.tabId]
   * @param {string} [details.frameId]
   * @param {Window} [details.frameWindow]
   * @return {Promise<Object>}
   */
  capturer.invoke = async function (method, args, details = {}) {
    const {tabId, frameId = 0, frameWindow, missionId} = details;
    if (Number.isInteger(tabId)) {
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
   * @param {string} [params.docUrl] - an overriding document URL
   * @param {string} [params.baseUrl] - an overriding document base URL
   * @param {string} [params.refUrl] - the referrer URL
   * @param {Object} params.settings
   * @param {string} [params.settings.title] - item title
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureDocumentOrFile = async function (params) {
    isDebug && console.debug("call: captureDocumentOrFile", params);

    const {doc = document, docUrl, baseUrl, refUrl, settings, options} = params;

    // if not HTML|SVG document, capture as file
    if (!["text/html", "application/xhtml+xml", "image/svg+xml"].includes(doc.contentType)) {
      // if it can be displayed as HTML, check saveFileAsHtml
      if (!(doc.documentElement.nodeName.toLowerCase() === "html" && options["capture.saveFileAsHtml"])) {
        return await capturer.invoke("captureFile", {
          url: doc.URL,
          refUrl,
          charset: doc.characterSet,
          settings: Object.assign({}, settings, {
            title: settings.title || doc.title,
          }),
          options,
        });
      }
    }

    // otherwise, capture as document
    return await capturer.captureDocument({
      doc,
      docUrl,
      baseUrl,
      settings,
      options,
    });
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Document} params.doc
   * @param {string} [params.docUrl] - an overriding document URL
   * @param {string} [params.baseUrl] - an overriding document base URL
   * @param {Object} params.settings
   * @param {string} [params.settings.title] - item title
   * @param {string} [params.settings.favIconUrl] - item favicon
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureDocument = async function (params) {
    isDebug && console.debug("call: captureDocument", params);

    const warn = async (msg) => {
      return capturer.invoke("remoteMsg", {
        msg,
        type: 'warn',
        settings, // for missionId
      });
    };

    // add hash and error handling
    const downloadFile = async (params) => {
      const {url, options} = params;
      return capturer.invoke("downloadFile", params)
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

    // rewrite (or remove if value is null/undefined) the specified attr, record it if option set
    const captureRewriteAttr = (elem, attr, value, record = options["capture.recordRewrites"]) => {
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
    const captureRewriteTextContent = (elem, value, record = options["capture.recordRewrites"]) => {
      const oldValue = elem.textContent;
      if (oldValue === value) { return; }

      elem.textContent = value;

      if (record) {
        const recordAttr = `data-scrapbook-orig-textContent-${timeId}`;
        if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
      }
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
      captureRewriteAttr(elem, attr, url);

      // skip further processing for non-absolute links
      if (!scrapbook.isUrlAbsolute(url)) {
        return;
      }

      // check downLink
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:')) {
        if (["header", "url"].includes(options["capture.downLink.file.mode"]) || 
            options["capture.downLink.doc.depth"] > 0) {
          downLinkTasks.push(async () => {
            const response = await capturer.invoke("captureUrl", {
              url,
              refUrl,
              downLink: true,
              settings,
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
      url = rewriteLocalLink(url, refUrl);
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
        default:
          // skip further processing for non-absolute links
          if (!scrapbook.isUrlAbsolute(url)) {
            break;
          }

          tasks.push(async () => {
            const response = await downloadFile({
              url,
              refUrl,
              settings,
              options,
            });
            captureRewriteAttr(elem, attr, response.url);
            return response;
          });
          break;
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
            rewriteAnchor(elem, "href");
            rewriteAnchor(elem, "xlink:href");
            break;
          }

          case "script": {
            if (elem.hasAttribute("href")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("href"), refUrl);
              captureRewriteAttr(elem, "href", rewriteUrl);
            }
            if (elem.hasAttribute("xlink:href")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("xlink:href"), refUrl);
              captureRewriteAttr(elem, "xlink:href", rewriteUrl);
            }

            switch (options["capture.script"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                if (elem.hasAttribute("href")) {
                  captureRewriteAttr(elem, "href", null);
                }
                if (elem.hasAttribute("xlink:href")) {
                  captureRewriteAttr(elem, "xlink:href", null);
                }
                captureRewriteTextContent(elem, "");
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("href")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("href"),
                      refUrl,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "href", response.url);
                    return response;
                  });
                }
                if (elem.hasAttribute("xlink:href")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("xlink:href"),
                      refUrl,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "xlink:href", response.url);
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
                tasks.push(async () => {
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
            captureRewriteAttr(elem, "href", rewriteUrl);

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
                  captureRewriteAttr(elem, "content", metaRefresh.time + (url ? "; url=" + url : ""));
                }
              } else if (elem.getAttribute("http-equiv").toLowerCase() == "content-security-policy") {
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
            if (elem.hasAttribute("href")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("href"), refUrl);
              captureRewriteAttr(elem, "href", rewriteUrl);
            }

            if (elem.hasAttribute("imagesrcset")) {
              const rewriteSrcset = scrapbook.rewriteSrcset(elem.getAttribute("imagesrcset"), (url) => {
                return capturer.resolveRelativeUrl(url, refUrl);
              });
              captureRewriteAttr(elem, "imagesrcset", rewriteSrcset);
            }

            // integrity won't work due to rewriting or crossorigin issue
            captureRewriteAttr(elem, "integrity", null);

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
                    captureRewriteAttr(elem, "data-scrapbook-css-disabled", "");
                    break;
                  }
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
                default:
                  if (disableCss) {
                    captureRewriteAttr(elem, "href", null);
                    captureRewriteAttr(elem, "data-scrapbook-css-disabled", "");
                    break;
                  }

                  tasks.push(async () => {
                    await cssHandler.rewriteCss({
                      elem,
                      refUrl,
                      settings,
                      callback: (elem, response) => {
                        captureRewriteAttr(elem, "href", response.url);
                      },
                    });
                  });

                  // remove crossorigin as the origin has changed
                  captureRewriteAttr(elem, "crossorigin", null);
                  break;
              }
              break;
            } else if (elem.matches('[rel~="icon"]')) {
              // favicon: the link element
              switch (options["capture.favicon"]) {
                case "link":
                  if (typeof favIconUrl === 'undefined') {
                    favIconUrl = elem.getAttribute("href");
                  }
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // If the href attribute is absent, then the element does not define a link.
                  captureRewriteAttr(elem, "href", null);
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
                    favIconUrl = elem.getAttribute("href");
                    useFavIcon = true;
                  }
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("href"),
                      refUrl,
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
            } else if (elem.matches('[rel~="preload"], [rel~="modulepreload"], [rel~="dns-prefetch"], [rel~="preconnect"]')) {
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
            } else if (elem.matches('[rel~="prefetch"], [rel~="prerender"]')) {
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
                  captureRewriteAttr(elem, "data-scrapbook-css-disabled", "");
                  break;
                }
                tasks.push(async () => {
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
              captureRewriteAttr(elem, "src", rewriteUrl);
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
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("src"),
                      refUrl,
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
                  const newElem = newDoc.createElement('scrapbook-noscript');
                  escapedNoscriptList.push(newElem);
                  newElem.innerHTML = elem.textContent;
                  elem.replaceWith(newElem);
                  rewriteRecursively(newElem, rootName, rewriteNode);
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
              captureRewriteAttr(elem, "background", rewriteUrl);

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
                default:
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: rewriteUrl,
                      refUrl,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "background", response.url);
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
            let sourceUrl;
            if (frame.hasAttribute("src")) {
              sourceUrl = capturer.resolveRelativeUrl(frame.getAttribute("src"), refUrl);
              captureRewriteAttr(frame, "src", sourceUrl);
            }

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

                  tasks.push(async () => {
                    let frameDoc;
                    try {
                      frameDoc = frameSrc.contentDocument;
                    } catch (ex) {
                      // console.debug(ex);
                    }

                    // frame document accessible:
                    // capture the content document directly
                    if (frameDoc) {
                      return capturer.captureDocumentOrFile({
                        doc: frameDoc,
                        refUrl,
                        settings: frameSettings,
                        options: frameOptions,
                      }).then(captureFrameCallback).catch(captureFrameErrorHandler);
                    }

                    // frame document inaccessible (headless capture):
                    // contentType of srcdoc is always text/html
                    const url = `data:text/html;charset=UTF-8,${encodeURIComponent(frame.getAttribute("srcdoc"))}`;
                    const doc = await scrapbook.readFileAsDocument(scrapbook.dataUriToFile(url));
                    const docUrl = 'about:srcdoc';

                    return capturer.captureDocument({
                      doc,
                      docUrl,
                      baseUrl,
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
                  let frameDoc;
                  try {
                    frameDoc = frameSrc.contentDocument;
                  } catch (ex) {
                    // console.debug(ex);
                  }

                  // frame document accessible:
                  // capture the content document directly
                  if (frameDoc) {
                    sourceUrl = sourceUrl || frameDoc.URL;
                    return capturer.captureDocumentOrFile({
                      doc: frameDoc,
                      refUrl,
                      settings: frameSettings,
                      options,
                    }).catch(captureFrameErrorHandler).then(captureFrameCallback);
                  }

                  let frameWindow;
                  try {
                    frameWindow = frameSrc.contentWindow;
                  } catch (ex) {
                    // console.debug(ex);
                  }

                  // frame window accessible:
                  // capture the content document through messaging if viable
                  if (frameWindow) {
                    sourceUrl = frame.src;
                    const response = await capturer.invoke("captureDocumentOrFile", {
                      refUrl,
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
                    // contentType of srcdoc is always text/html
                    const content = frame.getAttribute("srcdoc");
                    const url = `data:text/html;charset=UTF-8,${encodeURIComponent(content)}`;
                    const doc = await scrapbook.readFileAsDocument(scrapbook.dataUriToFile(url));

                    // assign a unique checksum for deduplication
                    const docUrl = `about:srcdoc?sha1=${scrapbook.sha1(content, "TEXT")}`;

                    return capturer.captureDocument({
                      doc,
                      docUrl,
                      baseUrl,
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

                  // otherwise, headlessly capture src
                  let frameOptions = options;

                  // special handling for data URL
                  if (sourceUrl.startsWith("data:") &&
                      !options["capture.saveDataUriAsFile"] &&
                      options["capture.saveAs"] !== "singleHtml") {
                    // Save frame document and inner URLs as data URL since data URL
                    // is null origin and no relative URL is allowed in it.
                    frameOptions = Object.assign({}, options, {
                      "capture.saveAs": "singleHtml",
                    });
                  }

                  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
                  frameSettings.isHeadless = true;
                  frameSettings.recurseChain.push(refUrl);

                  // check circular reference if saving as data URL
                  if (frameOptions["capture.saveAs"] === "singleHtml") {
                    if (frameSettings.recurseChain.includes(sourceUrlMain)) {
                      console.warn(scrapbook.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                      captureRewriteAttr(frame, "src", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                      return;
                    }
                  }

                  return capturer.invoke("captureUrl", {
                    url: sourceUrl,
                    refUrl,
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
            rewriteAnchor(elem, "href");
            break;
          }

          // images: img
          case "img": {
            if (elem.hasAttribute("src")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
              captureRewriteAttr(elem, "src", rewriteUrl);
            }

            if (elem.hasAttribute("srcset")) {
              const rewriteSrcset = scrapbook.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
                return capturer.resolveRelativeUrl(url, refUrl);
              });
              captureRewriteAttr(elem, "srcset", rewriteSrcset);
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

                if (elem.hasAttribute("srcset")) {
                  captureRewriteAttr(elem, "srcset", null);
                }

                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save-current":
                if (!isHeadless) {
                  if (elemOrig && elemOrig.currentSrc) {
                    const url = elemOrig.currentSrc;
                    captureRewriteAttr(elem, "srcset", null);
                    tasks.push(async () => {
                      const response = await downloadFile({
                        url,
                        refUrl,
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
              case "save":
              default:
                if (elem.hasAttribute("src")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("src"),
                      refUrl,
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
                return capturer.resolveRelativeUrl(url, refUrl);
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

                    if (subElemOrig && subElemOrig.currentSrc) {
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
              case "save":
              default:
                for (const subElem of elem.querySelectorAll('source[srcset]')) {
                  tasks.push(async () => {
                    const response = await scrapbook.rewriteSrcset(subElem.getAttribute("srcset"), async (url) => {
                      const rewriteUrl = capturer.resolveRelativeUrl(url, refUrl);
                      return (await downloadFile({
                        url: rewriteUrl,
                        refUrl,
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
            break;
          }

          // media: audio
          case "audio": {
            if (elem.hasAttribute("src")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
              captureRewriteAttr(elem, "src", rewriteUrl);
            }

            for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
              const rewriteUrl = capturer.resolveRelativeUrl(subElem.getAttribute("src"), refUrl);
              captureRewriteAttr(subElem, "src", rewriteUrl);
            }

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
                  if (elemOrig && elemOrig.currentSrc) {
                    const url = elemOrig.currentSrc;
                    for (const subElem of elem.querySelectorAll('source[src]')) {
                      captureRemoveNode(subElem);
                    }
                    tasks.push(async () => {
                      const response = await downloadFile({
                        url,
                        refUrl,
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
              case "save":
              default:
                if (elem.hasAttribute("src")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("src"),
                      refUrl,
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
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("poster"), refUrl);
              captureRewriteAttr(elem, "poster", rewriteUrl);
            }

            if (elem.hasAttribute("src")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
              captureRewriteAttr(elem, "src", rewriteUrl);
            }

            for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
              const rewriteUrl = capturer.resolveRelativeUrl(subElem.getAttribute("src"), refUrl);
              captureRewriteAttr(subElem, "src", rewriteUrl);
            }

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
                        settings,
                        options,
                      });
                      captureRewriteAttr(elem, "poster", response.url);
                      return response;
                    });
                  }

                  if (elemOrig && elemOrig.currentSrc) {
                    const url = elemOrig.currentSrc;
                    for (const subElem of elem.querySelectorAll('source[src]')) {
                      captureRemoveNode(subElem);
                    }
                    tasks.push(async () => {
                      const response = await downloadFile({
                        url,
                        refUrl,
                        settings,
                        options,
                      })
                      captureRewriteAttr(elem, "src", response.url);
                      return response;
                    });
                  }

                  for (const subElem of elem.querySelectorAll('track[src]')) {
                    tasks.push(async () => {
                      const response = await downloadFile({
                        url: subElem.getAttribute("src"),
                        refUrl,
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
              case "save":
              default:
                if (elem.hasAttribute("poster")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("poster"),
                      refUrl,
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
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
              captureRewriteAttr(elem, "src", rewriteUrl);
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
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("src"),
                      refUrl,
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "src", response.url);
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
              captureRewriteAttr(elem, "data", rewriteUrl);
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
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("data")) {
                  tasks.push(async () => {
                    const sourceUrl = elem.getAttribute("data");

                    // skip further processing and keep current src
                    // (point to self, or not resolvable)
                    if (!scrapbook.isUrlAbsolute(sourceUrl)) {
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
                      isHeadless: true,
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
                        console.warn(scrapbook.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                        captureRewriteAttr(elem, "data", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                        return;
                      }
                    }

                    return capturer.invoke("captureUrl", {
                      url: sourceUrl,
                      refUrl,
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
                break;
            }
            break;
          }

          // media: applet
          case "applet": {
            if (elem.hasAttribute("code")) {
              let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("code"), refUrl);
              captureRewriteAttr(elem, "code", rewriteUrl);
            }

            if (elem.hasAttribute("archive")) {
              let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("archive"), refUrl);
              captureRewriteAttr(elem, "archive", rewriteUrl);
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
              default:
                if (elem.hasAttribute("code")) {
                  tasks.push(async () => {
                    const response = await downloadFile({
                      url: elem.getAttribute("code"),
                      refUrl,
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
                      settings,
                      options,
                    });
                    captureRewriteAttr(elem, "archive", response.url);
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
              captureRewriteAttr(elem, "action", rewriteUrl);
            }
            break;
          }

          // form: input
          case "input": {
            switch (elem.type.toLowerCase()) {
              // images: input
              case "image": {
                if (elem.hasAttribute("src")) {
                  const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
                  captureRewriteAttr(elem, "src", rewriteUrl);
                }
                switch (options["capture.image"]) {
                  case "link":
                    // do nothing
                    break;
                  case "blank":
                    // HTML 5.1 2nd Edition / W3C Recommendation:
                    // The src attribute must be present, and must contain a valid non-empty URL.
                    captureRewriteAttr(elem, "src", "about:blank");
                    break;
                  case "remove":
                    captureRemoveNode(elem);
                    return;
                  case "save-current":
                    // srcset and currentSrc are not supported, do the same as save
                  case "save":
                  default:
                    tasks.push(async () => {
                      const response = await downloadFile({
                        url: elem.getAttribute("src"),
                        refUrl,
                        settings,
                        options,
                      });
                      captureRewriteAttr(elem, "src", response.url);
                      return response;
                    });
                    break;
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
                        captureRewriteAttr(elem, "data-scrapbook-input-value", value);
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
                        captureRewriteAttr(elem, "data-scrapbook-input-checked", checked);
                        requireBasicLoader = true;
                      }
                      const indeterminate = elemOrig.indeterminate;
                      if (indeterminate && elem.type.toLowerCase() === 'checkbox') {
                        captureRewriteAttr(elem, "data-scrapbook-input-indeterminate", "");
                        requireBasicLoader = true;
                      }
                    }
                    break;
                  case "keep-all":
                  case "keep":
                    if (elemOrig) {
                      const indeterminate = elemOrig.indeterminate;
                      if (indeterminate && elem.type.toLowerCase() === 'checkbox') {
                        captureRewriteAttr(elem, "data-scrapbook-input-indeterminate", "");
                        requireBasicLoader = true;
                      }
                    }
                  case "html-all":
                  case "html":
                    if (elemOrig) {
                      captureRewriteAttr(elem, "checked", elemOrig.checked ? "checked" : null);
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
                  case "save-all":
                  case "save":
                    if (elemOrig) {
                      const value = elemOrig.value;
                      if (value !== elem.getAttribute('value')) {
                        captureRewriteAttr(elem, "data-scrapbook-input-value", value);
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

          // form: option
          case "option": {
            switch (options["capture.formStatus"]) {
              case "save-all":
              case "save":
                if (elemOrig) {
                  const selected = elemOrig.selected;
                  if (selected !== elem.hasAttribute('selected')) {
                    captureRewriteAttr(elem, "data-scrapbook-option-selected", selected);
                    requireBasicLoader = true;
                  }
                }
                break;
              case "keep-all":
              case "keep":
              case "html-all":
              case "html":
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
              case "save-all":
              case "save":
                if (elemOrig) {
                  const value = elemOrig.value;
                  if (value !== elem.textContent) {
                    captureRewriteAttr(elem, "data-scrapbook-textarea-value", value);
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

          // xmp
          case "xmp": {
            // escape </xmp> as textContent can contain HTML
            elem.textContent = elem.textContent.replace(/<\/(xmp>)/gi, "<\\/$1");
            break;
          }
        }

        // handle shadow DOM
        {
          const shadowRoot = elem.shadowRoot;
          if (shadowRoot) {
            const shadowRootOrig = origNodeMap.get(shadowRoot);
            addAdoptedStyleSheets(shadowRootOrig, shadowRoot);
            rewriteRecursively(shadowRoot, rootName, rewriteNode);
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
                tasks.push(async () => {
                  const response = await cssHandler.rewriteCssText({
                    cssText: elem.getAttribute("style"),
                    refUrl,
                    isInline: true,
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
                    refUrl,
                    isInline: true,
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
          captureRecordAddedNode(css);
          css.textContent = Array.prototype.map.call(
            refCss.cssRules,
            cssRule => cssRule.cssText,
          ).join("\n");
          css.setAttribute("data-scrapbook-elem", "adoptedStyleSheet");
        }
      }
    };

    const {doc = document, settings} = params;
    const {timeId, isHeadless, isMainPage, isMainFrame} = settings;
    const {contentType: mime, documentElement: docElemNode} = doc;

    // allow overwriting by capture helpers
    let {options} = params;

    // determine docUrl and baseUrl
    let {docUrl, baseUrl} = params;
    let docUrlHash;
    if (docUrl) {
      [docUrl, docUrlHash] = scrapbook.splitUrlByAnchor(docUrl);
    }
    if (!baseUrl) {
      if (docUrl) {
        baseUrl = docUrl;
        for (const baseElem of doc.querySelectorAll('base[href]')) {
          if (!baseElem.closest('svg, math')) {
            baseUrl = new URL(baseElem.getAttribute('href'), docUrl).href;
            break;
          }
        }
      } else {
        baseUrl = doc.baseURI;
      }
      baseUrl = scrapbook.splitUrlByAnchor(baseUrl)[0];
    }
    if (!docUrl) {
      [docUrl, docUrlHash] = scrapbook.splitUrlByAnchor(doc.URL);
    }

    // alias of baseUrl for resolving links and resources
    const refUrl = baseUrl;

    if (isMainPage && isMainFrame) {
      settings.indexFilename = await capturer.formatIndexFilename({
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
      role: options["capture.saveAs"] === "singleHtml" ? undefined :
          (isMainFrame || isHeadless) ? "document" : `document-${scrapbook.getUuid()}`,
      settings,
      options,
    });

    // if a previous registry exists, return it
    if (registry.isDuplicate) {
      return Object.assign({}, registry, {
        url: capturer.getRedirectedUrl(registry.url, docUrlHash),
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
    const escapedNoscriptList = [];
    const shadowRootList = [];

    // create a new document to replicate nodes via import
    const newDoc = scrapbook.cloneDocument(doc, {origNodeMap, clonedNodeMap});

    let rootNode, headNode;
    let selection = settings.fullPage ? null : doc.getSelection();
    {
      if (selection && selection.isCollapsed) {
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
        let iRange = 0, iRangeMax = selection.rangeCount, curRange;
        let caNode, scNode, ecNode, lastTextNode;
        for (; iRange < iRangeMax; ++iRange) {
          curRange = selection.getRangeAt(iRange);

          // skip a collapsed range
          if (curRange.collapsed) {
            continue;
          }

          caNode = curRange.commonAncestorContainer;

          // @TODO:
          // A selection in a shadow root requires special care.
          // Currently treat as selecting the topmost host for simplicity and
          // prevent an issue if capturing shadow DOM is disabled.
          if (caNode.getRootNode().nodeType === 11) {
            let selNode = caNode;
            let selNodeRoot = selNode.getRootNode();
            while (selNodeRoot.nodeType === 11) {
              selNode = selNodeRoot.host;
              selNodeRoot = selNode.getRootNode();
            }
            curRange = new Range();
            curRange.selectNode(selNode);
            caNode = curRange.commonAncestorContainer;
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
        warn(`Skipped running capture handler due to invalid definition: ${ex.message}`);
      }

      if (helpers) {
        const parser = new capturer.CaptureHelperHandler({
          helpers,
          rootNode,
          docUrl,
          origNodeMap,
          options,
        });
        const result = parser.run();

        // replace options with merged ones
        if (Object.keys(result.options).length) {
          options = Object.assign({}, options, result.options);
        }

        if (result.errors.length) {
          (async () => {
            for (const error of result.errors) {
              await warn(error);
            }
          })();
        }
      }
    }

    // init cssHandler
    const cssHandler = new capturer.DocumentCssHandler({
      doc, rootNode, origNodeMap, clonedNodeMap, refUrl, settings, options,
    });

    // inspect all nodes (and register async tasks) -->
    // some additional tasks that requires some data after nodes are inspected -->
    // start async tasks and wait form them to complete -->
    // finalize
    const tasks = [];
    const downLinkTasks = [];

    // inspect nodes
    let metaCharsetNode;
    let favIconUrl;
    let requireBasicLoader = false;
    rewriteRecursively(rootNode, null, rewriteNode);

    // record metadata
    if (options["capture.recordDocumentMeta"]) {
      let url = docUrl.startsWith("data:") ? "data:" : docUrl;

      // add hash only for the main document as subframes with different hash
      // must share the same file and record (e.g. foo.html and foo.html#bar)
      if (isMainPage && isMainFrame) { url += docUrlHash; }

      rootNode.setAttribute("data-scrapbook-source", url);
      rootNode.setAttribute("data-scrapbook-create", timeId);

      // record item metadata for the main document
      if (isMainPage && isMainFrame) {
        if (settings.title) {
          rootNode.setAttribute("data-scrapbook-title", settings.title);
        }

        if (settings.favIconUrl) {
          rootNode.setAttribute("data-scrapbook-icon", settings.favIconUrl);
        }

        // mark type as "site" if depth is set
        if (parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options['capture.saveAs'] !== 'singleHtml') {
          rootNode.setAttribute("data-scrapbook-type", "site");
        }
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

    // recover escaped noscripts
    for (const node of escapedNoscriptList) {
      if (!node.isConnected) { continue; }
      const newElem = newDoc.createElement('noscript');
      newElem.innerHTML = node.innerHTML;
      node.replaceWith(newElem);
    }

    // record after the content of all nested shadow roots have been processed
    for (const shadowRoot of shadowRootList) {
      captureRewriteAttr(shadowRoot.host, "data-scrapbook-shadowdom", shadowRoot.innerHTML);
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
      isMainDocument: isMainPage && isMainFrame,
      deleteErased: options["capture.deleteErasedOnCapture"],
      requireBasicLoader,
      insertInfoBar: options["capture.insertInfoBar"],
    });

    // save document
    let content = scrapbook.documentToString(newDoc, options["capture.prettyPrint"]);

    // pass content as Blob to prevent size limitation of a message
    // (for a supported browser)
    if (scrapbook.userAgent.is('gecko')) {
      content = new Blob([content], {type: 'text/plain'});
    }

    const response = await capturer.invoke("saveDocument", {
      sourceUrl: capturer.getRedirectedUrl(docUrl, docUrlHash),
      documentFileName,
      settings,
      options,
      data: {
        mime,
        content,
        title: settings.title || doc.title,
        favIconUrl: settings.favIconUrl || favIconUrl,
      },
    });

    // special handling for blob response
    if (response.__type__ === 'Blob') {
      return response;
    }

    return Object.assign({}, response, {
      url: capturer.getRedirectedUrl(response.url, docUrlHash),
    });
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Document} [params.doc]
   * @param {boolean} [params.internalize]
   * @param {boolean} params.isMainPage
   * @param {Object} params.item
   * @param {Object} params.options
   * @return {Promise<Object>}
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
            elem.removeAttribute("data-scrapbook-shadowdom");
            elem.removeAttribute("data-scrapbook-shadowroot"); // WebScrapBook < 0.115
            const shadowRoot = elem.shadowRoot;
            if (!shadowRoot) { continue; }
            processRootNode(shadowRoot);
            elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
            requireBasicLoader = true;
          }
        } else {
          // shadowRoot not supported by the browser.
          // Just record whether there's a recorded shadow root.
          if (rootNode.querySelector('[data-scrapbook-shadowdom]')) {
            requireBasicLoader = true;
          }
          // convert old data-scrapbook-shadowroot recursively (WebScrapBook < 0.115)
          {
            const convert = (rootNode) => {
              for (const elem of rootNode.querySelectorAll('[data-scrapbook-shadowroot]')) {
                try {
                  const {data} = JSON.parse(elem.getAttribute('data-scrapbook-shadowroot'));
                  const t = rootNode.ownerDocument.createElement('template');
                  t.innerHTML = data;
                  convert(t.content);
                  elem.setAttribute("data-scrapbook-shadowdom", t.innerHTML);
                  requireBasicLoader = true;
                } catch (ex) {
                  console.error(ex);
                }
                elem.removeAttribute('data-scrapbook-shadowroot');
              }
            };
            convert(rootNode);
          }
        }
      };

      const {contentType: mime, characterSet: charset, documentElement: docElemNode} = doc;

      const origNodeMap = new WeakMap();
      const clonedNodeMap = new WeakMap();

      // create a new document to replicate nodes via import
      const newDoc = scrapbook.cloneDocument(doc, {origNodeMap, clonedNodeMap});

      for (const node of doc.childNodes) {
        newDoc.appendChild(cloneNodeMapping(node, true));
      }

      const rootNode = newDoc.documentElement;
      const isMainFrame = i === 0;
      const info = {
        isMainFrame,
        title: (isMainPage && isMainFrame ? item && item.title : doc.title) || "",
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
        isMainDocument: isMainPage && isMainFrame,
        deleteErased: options["capture.deleteErasedOnSave"],
        requireBasicLoader,
        insertInfoBar: options["capture.insertInfoBar"],
      });

      let content = scrapbook.documentToString(newDoc, options["capture.prettyPrint"]);

      // pass content as Blob to prevent size limitation of a message
      // (for a supported browser)
      if (scrapbook.userAgent.is('gecko')) {
        content = new Blob([content], {type: 'text/plain'});
      }

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
            fn = function (r) {
              var E = r.querySelectorAll ? r.querySelectorAll("*") : r.getElementsByTagName("*"), i = E.length, e, d, s;
              while (i--) {
                e = E[i];
                if ((d = e.getAttribute(k1)) !== null && !e.shadowRoot && e.attachShadow) {
                  s = e.attachShadow({mode: 'open'});
                  s.innerHTML = d;
                  e.removeAttribute(k1);
                }
                if ((d = e.getAttribute(k2)) !== null) {
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
                if (e.shadowRoot) {
                  fn(e.shadowRoot);
                }
              }
            };
        fn(document);
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
   * @kind invokable
   * @param {Object} params
   * @param {Object} params.doc
   * @return {Promise<Array>}
   */
  capturer.retrieveSelectedLinks = async function ({doc = document} = {}) {
    let nodes;
    if (!document.getSelection().isCollapsed) {
      nodes = scrapbook.getSelectedNodes({
        whatToShow: NodeFilter.SHOW_ELEMENT,
        nodeFilter: (node) => {
          return node.matches('a[href], area[href]');
        },
        fuzzy: true,
      });
    } else {
      nodes = doc.querySelectorAll('a[href], area[href]');
    }

    return Array.prototype.map.call(nodes, a => ({
     url: a.href,
     title: a.textContent,
    }));
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
   * @param {Object} params.settings
   * @param {Object} params.options
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
      if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:") || sourceUrl.startsWith("file:") || sourceUrl.startsWith("about:")) {
        return `urn:scrapbook:download:error:${sourceUrl}`;
      } else if (sourceUrl.startsWith("data:")) {
        return `urn:scrapbook:download:error:data:`;
      } else if (sourceUrl.startsWith("blob:")) {
        return `urn:scrapbook:download:error:blob:`;
      }
    }
    return sourceUrl;
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

          const title = css.title && css.title.trim();

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
     * Verify whether selectorText matches something in root.
     *
     * @param {Element|DocumentFragment} root
     * @param {string} selectorText - selectorText of a CSSStyleRule
     */
    verifySelector(root, selectorText) {
      // Do not include :not as the semantic is reversed and the rule could be
      // narrower after rewriting (e.g. :not(:hover) => :not(*)).
      const ALLOWED_PSEUDO = new Set([
        'is', 'matches', 'any', 'where', 'has',
        'first-child', 'first-of-type', 'last-child', 'last-of-type',
        'nth-child', 'nth-of-type', 'nth-last-child', 'nth-last-of-type',
        'only-child', 'only-of-type',
        ]);

      /**
       * A class that rewrites the given CSS selector to make the rule cover
       * a reasonably broader range.
       *
       * 1. Remove namespace in selector (e.g. svg|a => a).
       * 2. Recursively remove pseudoes (including pseudo-classes(:*) and
       *    pseudo-elements(::*))) unless it's listed in ALLOWED_PSEUDO. (e.g.
       *    div:hover => div).
       * 3. Add * in place if it will be empty after removal (e.g. :hover => *).
       */
      class Rewriter {
        constructor() {
          this.regexLiteral = /(?:[0-9A-Za-z_\-\u00A0-\uFFFF]|\\(?:[0-9A-Fa-f]{1,6} ?|.))+|(.)/g;
          this.regexQuote = /[^"]*(?:\\.[^"]*)*"/g;
        }

        run(selectorText) {
          this.tokens = [];
          this.parse(selectorText, 0);
          return this.tokens.reduce((result, current) => {
            return result + current.value;
          }, '');
        }

        parse(selectorText, start, endSymbol = null) {
          this.regexLiteral.lastIndex = start;
          let match;
          while (match = this.regexLiteral.exec(selectorText)) {
            switch (match[1]) {
              case endSymbol: {
                this.tokens.push({
                  type: 'operator',
                  value: match[0],
                });
                return this.regexLiteral.lastIndex;
                break;
              }
              case '(': {
                this.tokens.push({
                  type: 'operator',
                  value: match[0],
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
                });
                break;
              }
              case ':': {
                this.regexLiteral.lastIndex = this.parsePseudo(
                  selectorText,
                  this.regexLiteral.lastIndex,
                  selectorText[this.regexLiteral.lastIndex] === ':',
                );
                break;
              }
              case '|': {
                // Special handling for || (column combinator in CSS4 draft)
                // to prevent misinterpreted as double | operator.
                {
                  const pos = this.regexLiteral.lastIndex;
                  const next = selectorText.slice(pos, pos + 1);
                  if (next === '|') {
                    this.regexLiteral.lastIndex++;
                    this.tokens.push({
                      type: 'operator',
                      value: match[0] + next,
                    });
                    break;
                  }
                }

                const prevToken = this.tokens[this.tokens.length - 1];
                if (prevToken) {
                  if (prevToken.type === 'name' || (prevToken.type === 'operator' && prevToken.value === '*')) {
                    this.tokens.pop();
                  }
                }
                break;
              }
              default: {
                if (match[1]) {
                  this.tokens.push({
                    type: 'operator',
                    value: match[0],
                  });
                } else {
                  this.tokens.push({
                    type: 'name',
                    value: match[0],
                  });
                }
                break;
              }
            }
          }
          return selectorText.length;
        }

        parsePseudo(selectorText, start, isPseudoElement) {
          let _tokens = this.tokens;
          this.tokens = [];
          let lastIndex = selectorText.length;
          this.regexLiteral.lastIndex = start + (isPseudoElement ? 1 : 0);
          let match;
          while (match = this.regexLiteral.exec(selectorText)) {
            switch (match[1]) {
              case '(': {
                this.tokens.push({
                  type: 'operator',
                  value: match[0],
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
                  });
                }
                break;
              }
            }
          }

          if (this.tokens[0] && this.tokens[0].type === 'name' && ALLOWED_PSEUDO.has(this.tokens[0].value)) {
            _tokens.push({
              type: 'operator',
              value: isPseudoElement ? '::' : ':',
            });
            _tokens = _tokens.concat(this.tokens);
          } else {
            addUniversalSelector: {
              const prevToken = _tokens[_tokens.length - 1];
              if (prevToken) {
                if (prevToken.type === 'name' || prevToken.type === 'selector') {
                  break addUniversalSelector;
                }
                if (prevToken.type === 'operator' && prevToken.value === ')') {
                  break addUniversalSelector;
                }
              }

              _tokens.push({
                type: 'name',
                value: '*',
              });
            }
          }

          this.tokens = _tokens;
          return lastIndex;
        }

        matchBracket(selectorText, start) {
          this.regexLiteral.lastIndex = start;
          let match;
          while (match = this.regexLiteral.exec(selectorText)) {
            switch (match[1]) {
              case ']': {
                return this.regexLiteral.lastIndex;
                break;
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

      const verifySelector = (root, selectorText) => {
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

        let selectorTextRewritten = new Rewriter().run(selectorText);
        if (selectorTextInvalid || selectorTextRewritten !== selectorText) {
          try {
            if (root.querySelector(selectorTextRewritten)) {
              return true;
            }
          } catch (ex) {
            // Rewritten rule still not supported by querySelector due to an
            // unexpected reason.
            // Return true as false positive is safer than false negative.
            return true;
          }
        }

        return false;
      };

      Object.defineProperty(this, 'verifySelector', {
        value: verifySelector,
        writable: false,
        configurable: true,
      });
      return verifySelector(root, selectorText);
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
     * @param {string} [params.refUrl] - The referrer URL for retrieving a
     *     cross-orign CSS.
     * @param {boolean} [params.crossOrigin] - Whether to retrieve CSS via web
     *     request if it's cross origin.
     * @param {boolean} [params.errorWithNull] - Whether to throw an error if
     *     not retrievable.
     * @return {?CSSStyleRule[]}
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

            try {
              const response = await capturer.invoke("fetchCss", {
                url: url || css.href,
                refUrl,
                settings,
                options,
              });
              rules = await this.getRulesFromCssText(response.text);
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
     * @param {CSSStyleSheet} [refCss] - the reference CSS (which holds the
     *     @import rule(s), for imported CSS).
     * @param {Node} [rootNode] - the reference root node for an imported CSS
     * @param {boolean} [isInline] - whether cssText is inline.
     * @param {Object} [settings]
     * @param {Object} [options]
     */
    async rewriteCssText({cssText, refUrl, refCss = null, rootNode, isInline = false, settings = this.settings, options = this.options}) {
      settings = Object.assign({}, settings, {
        recurseChain: [...settings.recurseChain, scrapbook.splitUrlByAnchor(refUrl)[0]],
      });
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
          recordUrl: options["capture.recordRewrites"] ? sourceUrl : "",
          valid,
        };
      };

      const downloadFileInCss = async (url) => {
        const response = await capturer.invoke("downloadFile", {
          url,
          refUrl,
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
        rootNode = this.clonedNodeMap.get(refCss.ownerNode).getRootNode();

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
     * @param {HTMLElement} [elem] - the elem to have CSS rewritten.
     * @param {string} [url] - the source URL of the imported CSS.
     * @param {string} [refCss] - the reference CSS (the imported styleSheet
     *     object) of the imported CSS.
     * @param {string} [refUrl] - the reference URL for URL resolving.
     * @param {Node} [rootNode] - the reference root node for an imported CSS
     * @param {Function} callback
     * @param {Object} [settings]
     * @param {Object} [options]
     */
    async rewriteCss({elem, url, refCss, refUrl, rootNode, callback, settings = this.settings, options = this.options}) {
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
          refCss = this.getElemCss(elem);
          cssText = elem.textContent;
          charset = "UTF-8";
          break init;
        }

        if (cssType === 'external') {
          refCss = this.getElemCss(elem);
          sourceUrl = elem.getAttribute("href");
        } else if (cssType === 'imported') {
          sourceUrl = url;
        }

        let response;
        try {
          response = await capturer.invoke("fetchCss", {
            url: sourceUrl,
            refUrl,
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
          refUrl,
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
        const cssRulesSource = await this.getRulesFromCssText(cssTextUnicode);

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
              isDynamic ? `css-${scrapbook.getUuid()}` : 'css',
          settings,
          options,
        });

        // handle circular CSS if it's a file to be saved as data URI
        if (isCircular && options["capture.saveAs"] === "singleHtml") {
          const target = sourceUrl;
          const source = settings.recurseChain[settings.recurseChain.length - 1];
          console.warn(scrapbook.lang("WarnCaptureCircular", [source, target]));
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
            refUrl: sourceUrl || refUrl,
            refCss,
            settings,
            options,
          });
          break;
        }
        case "tidy": {
          if (!isDynamic) {
            charset = "UTF-8";
            if (refCss && !isCircular) {
              const cssRulesCssom = await this.getRulesFromCss({
                css: refCss,
                url: sourceUrl,
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
                url: sourceUrl,
                refUrl,
              });
            }
          }
          if (cssRules) {
            cssText = await this.rewriteCssRules({
              cssRules,
              refUrl: sourceUrl || refUrl,
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

        // imported or external CSS
        // Save as byte string when charset is unknown so that the user can
        // convert the saved CSS file if the assumed charset is incorrect.
        const response = await capturer.invoke("downloadBlob", {
          blob: {
            __type__: "Blob",
            type: charset ? "text/css;charset=UTF-8" : "text/css",
            data: charset ? scrapbook.unicodeToUtf8(cssText) : cssText,
          },
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
  };


  /****************************************************************************
   * A class that handles capture helpers.
   ***************************************************************************/

  capturer.CaptureHelperHandler = class CaptureHelperHandler {
    constructor({helpers, rootNode, docUrl, origNodeMap}) {
      this.helpers = helpers;
      this.rootNode = rootNode;
      this.docUrl = docUrl;
      this.origNodeMap = origNodeMap;
      this.options = {};
      this.commandId = 0;
      this.debugging = false;
    }

    run() {
      const {helpers, rootNode, docUrl} = this;
      const errors = [];

      for (let i = 0, I = helpers.length; i < I; ++i) {
        const helper = helpers[i];

        if (helper.disabled) {
          continue;
        }

        if (helper.debug) {
          this.debugging = true;
        }

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
              const msg = `Error running capture helper command: ${JSON.stringify(command)}`
              console.error(`WebScrapBook: ${msg}`);
              console.error(ex);
              errors.push(`${msg}: ${ex.message}`);
            }
          }
        }

        this.debugging = false;
      }

      return {
        options: this.options,
        errors,
      };
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
        const iter = rootNode.ownerDocument.evaluate(selector.xpath, rootNode, null, 0, null);
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

    cmd_get_html(rootNode, selector) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      try {
        return elems[0].innerHTML;
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

    cmd_insert(rootNode, selector, name, attrs, text, mode, index) {
      const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
      for (const elem of elems) {
        const newElem = rootNode.ownerDocument.createElement(this.resolve(name, elem));

        const attrs_ = this.resolve(attrs, elem);
        for (const key in attrs_) {
          const value = this.resolve(attrs_[key], elem);
          newElem.setAttribute(key, value);
        }

        newElem.textContent = this.resolve(text, elem);

        switch (this.resolve(mode, elem)) {
          case 'before': {
            elem.parentNode.insertBefore(newElem, elem);
            break;
          }
          case 'after': {
            elem.parentNode.insertBefore(newElem, elem.nextSibling);
            break;
          }
          case 'insert': {
            elem.insertBefore(newElem, elem.childNodes[this.resolve(index, elem)]);
            break;
          }
          case 'append': {
            elem.appendChild(newElem);
            break;
          }
        }
      }
    }

    cmd_options(rootNode, nameOrDict, valueOrNull) {
      const nameOrDict_ = this.resolve(nameOrDict, rootNode);
      if (typeof nameOrDict_ === "string") {
        const value = this.resolve(valueOrNull, rootNode);
        this.options[nameOrDict_] = value;
      } else {
        for (const key in nameOrDict_) {
          const value = this.resolve(nameOrDict_[key], rootNode);
          this.options[key] = value;
        }
      }
    }
  };


  return capturer;

}));
