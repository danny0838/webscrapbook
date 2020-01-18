/******************************************************************************
 *
 * Common capture utilities shared among background and content scripts.
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @public {Object} capturer
 *****************************************************************************/

((window, document, browser) => {

const capturer = {
  isContentScript: true,
  get isNoscriptEscaped() {
    // Chromium has a feature (bug?) that the innerHTML of <noscript>
    // becomes escaped after set if javascript is enabled.
    let elem = document.createElement("noscript"); elem.innerHTML = "<br>";
    delete capturer.isNoscriptEscaped;
    return capturer.isNoscriptEscaped = (elem.innerHTML !== "<br>");
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
 * @param {string} params.refUrl
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
 * @param {string} params.docUrl
 * @param {string} params.refUrl
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
      const newNode = node.cloneNode(false);
      origNodeMap.set(newNode, node);
      clonedNodeMap.set(node, newNode);

      // recursively clone descendant nodes
      if (deep) {
        for (const childNode of node.childNodes) {
          const newChildNode = cloneNodeMapping(childNode, true);
          newNode.appendChild(newChildNode);
        }
      }

      return newNode;
    };

    // remove the specified node, record it if option set
    const captureRemoveNode = (elem, record = options["capture.recordRemovedNode"]) => {
      if (!elem.parentNode) { return; }

      if (record) {
        const comment = doc.createComment(`scrapbook-orig-node-${timeId}=${scrapbook.escapeHtmlComment(elem.outerHTML)}`);
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
          if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
        }
      } else {
        if (value === null || value === undefined) { return; }

        elem.setAttribute(attr, value);

        if (record) {
          const recordAttr = `${ns ? ns + ":" : ""}data-scrapbook-orig-null-attr-${att}-${timeId}`;
          if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, ""); }
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

        // For full capture (no selection), relink to the captured page.
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

      // webscrapbook toolbar should not be included
      if (elem.nodeName.toLowerCase() === "web-scrapbook") {
        elem.remove();
        return;
      }

      const elemOrig = origNodeMap.get(elem);

      // remove hidden elements
      if (!isHeadless) {
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
            elem.setAttribute("href", elem.href);

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
            } else if (elem.hasAttribute("property") && elem.hasAttribute("content")) {
              switch (elem.getAttribute("property").toLowerCase()) {
                case "og:image":
                case "og:image:url":
                case "og:image:secure_url":
                case "og:audio":
                case "og:audio:url":
                case "og:audio:secure_url":
                case "og:video":
                case "og:video:url":
                case "og:video:secure_url":
                case "og:url":
                  // @TODO: relative to document URL or base URL?
                  // @TODO: save the og resource?
                  let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("content"), refUrl);
                  elem.setAttribute("content", rewriteUrl);
                  break;
              }
            }
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
                  specialContentMap.set(key, scrapbook.unescapeHtml(elem.innerHTML));
                  elem.textContent = "urn:scrapbook:text:" + key;
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
                  const [targetUrl] = scrapbook.splitUrlByAnchor(frameSrc.src);
                  frameSettings.isHeadless = true;
                  frameSettings.recurseChain.push(sourceUrl);
                  if (!frameSettings.recurseChain.includes(targetUrl)) {
                    let frameOptions = options;

                    // special handling of data URL
                    if (frameSrc.src.startsWith("data:") && 
                        options["capture.saveAs"] !== "singleHtml" && 
                        !options["capture.saveDataUriAsFile"]) {
                      // Save frame document and inner URLs as data URL since data URL
                      // is null origin and no relative URL is allowed in it.
                      frameOptions = JSON.parse(JSON.stringify(options));
                      frameOptions["capture.saveAs"] = "singleHtml";
                    }

                    return capturer.invoke("captureUrl", {
                      url: frameSrc.src,
                      refUrl,
                      settings: frameSettings,
                      options: frameOptions,
                    }).then(captureFrameCallback);
                  } else {
                    console.warn(scrapbook.lang("WarnCaptureCircular", [sourceUrl, targetUrl]));
                    captureRewriteUri(frame, "src", `urn:scrapbook:download:circular:url:${frameSrc.src}`);
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
                  if (elemOrig.currentSrc) {
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

                    if (elemOrig.currentSrc) {
                      elem.setAttribute("src", elem.src);
                      captureRewriteUri(elem, "src", elemOrig.currentSrc);
                      captureRewriteUri(elem, "srcset", null);
                    }
                  }, this);

                  Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                    captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRemovedNode"]);
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
                  if (elemOrig.currentSrc) {
                    const url = elemOrig.currentSrc;
                    Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRemovedNode"]);
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

                  if (elemOrig.currentSrc) {
                    const url = elemOrig.currentSrc;
                    Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRemovedNode"]);
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
                if (isHeadless) { break; }

                try {
                  captureRewriteAttr(elem, "data-scrapbook-canvas", elemOrig.toDataURL());
                  requireCanvasLoader = true;
                } catch (ex) {
                  console.error(ex);
                }

                break;
            }
            break;
          }

          case "form": {
            if ( elem.hasAttribute("action") ) {
                elem.setAttribute("action", elem.action);
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
                    captureRewriteAttr(elem, "checked", elemOrig.checked ? "checked" : null);
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
                    captureRewriteAttr(elem, "value", elemOrig.value);
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
                captureRewriteAttr(elem, "selected", elemOrig.selected ? "selected" : null);
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
                captureRewriteTextContent(elem, elemOrig.value);
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
            const shadowRootOrig = elemOrig.shadowRoot;
            if (shadowRootOrig) {
              let shadowRoot;

              try {
                shadowRoot = elem.attachShadow({mode: 'open'});
              } catch (ex) {
                // The elem already owns a shadowRoot
                // (auto-generated by a defined custom element).
                // Use it when accessible (open).
                shadowRoot = elem.shadowRoot;
                if (shadowRoot) {
                  shadowRoot.innerHTML = '';
                }
              }

              if (shadowRoot) {
                origNodeMap.set(shadowRoot, shadowRootOrig);
                clonedNodeMap.set(shadowRootOrig, shadowRoot);
                Array.prototype.forEach.call(shadowRootOrig.childNodes, (elem) => {
                  shadowRoot.appendChild(cloneNodeMapping(elem, true));
                });

                addAdoptedStyleSheets(shadowRootOrig, shadowRoot);
                rewriteRecursively(shadowRoot, shadowRoot.nodeName.toLowerCase(), rewriteNode);
                shadowRootList.push({
                  host: elem,
                  shadowRoot,
                });
                requireShadowRootLoader = true;
              }
            }
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
              case "url":
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
              case "none":
              default:
                // do nothing
                break;
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
          const css = root.appendChild(cloneNodeMapping(doc.createElement("style")));
          css.textContent = Array.prototype.map.call(
            refCss.cssRules,
            cssRule => cssRule.cssText,
          ).join("\n");
          css.setAttribute("data-scrapbook-elem", "adoptedStyleSheets");
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
    let selection = doc.getSelection();
    {
      if (selection && selection.isCollapsed) { selection = null; }
      if (selection && options["capture.saveBeyondSelection"]) { selection = null; }

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

          // For the first range, clone html and head.
          if (iRange === 0) {
            rootNode = cloneNodeMapping(htmlNode, false);

            if (rootNode.nodeName.toLowerCase() === "html") {
              headNode = doc.querySelector("head");
              headNode = headNode ? cloneNodeMapping(headNode, true) : doc.createElement("head");
              rootNode.appendChild(headNode);
              rootNode.appendChild(doc.createTextNode("\n"));
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
            clonedRefNode.appendChild(doc.createComment("scrapbook-capture-selected-splitter"));
            clonedRefNode.appendChild(doc.createTextNode(" … "));
            clonedRefNode.appendChild(doc.createComment("/scrapbook-capture-selected-splitter"));
          }
          lastNodePrev = lastNode;

          // Clone sparingly selected nodes in the common ancestor.
          // (with special handling of text nodes)
          clonedRefNode.appendChild(doc.createComment("scrapbook-capture-selected"));
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
          clonedRefNode.appendChild(doc.createComment("/scrapbook-capture-selected"));
        }
      }

      // not capture selection: clone all nodes
      if (!selection) {
        rootNode = cloneNodeMapping(htmlNode, true);

        if (rootNode.nodeName.toLowerCase() === "html") {
          headNode = rootNode.querySelector("head");
          if (!headNode) {
            headNode = rootNode.insertBefore(doc.createElement("head"), rootNode.firstChild);
          }
        }
      }

      // add linefeeds to head and body to improve layout
      if (rootNode.nodeName.toLowerCase() === "html") {
        const headNodeBefore = headNode.previousSibling;
        if (!headNodeBefore || headNodeBefore.nodeType != 3) {
          rootNode.insertBefore(doc.createTextNode("\n"), headNode);
        }
        const headNodeStart = headNode.firstChild;
        if (!headNodeStart || headNodeStart.nodeType != 3) {
          headNode.insertBefore(doc.createTextNode("\n"), headNodeStart);
        }
        const headNodeEnd = headNode.lastChild;
        if (!headNodeEnd || headNodeEnd.nodeType != 3) {
          headNode.appendChild(doc.createTextNode("\n"));
        }
        const headNodeAfter = headNode.nextSibling;
        if (!headNodeAfter || headNodeAfter.nodeType != 3) {
          rootNode.insertBefore(doc.createTextNode("\n"), headNodeAfter);
        }
        const bodyNode = rootNode.querySelector("body");
        if (bodyNode) {
          const bodyNodeAfter = bodyNode.nextSibling;
          if (!bodyNodeAfter) {
            rootNode.insertBefore(doc.createTextNode("\n"), bodyNodeAfter);
          }
        }
      }

      // preclude some elements
      if (options["capture.precludeSelector"]) {
        try {
          Array.prototype.forEach.call(rootNode.querySelectorAll(options["capture.precludeSelector"]), (elem) => {
            captureRemoveNode(elem);
          });
        } catch (ex) {
          console.error(ex);
        }
      }

      addAdoptedStyleSheets(doc, rootNode);
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
    const halter = new scrapbook.Deferred();
    const tasks = [];

    // inspect nodes
    let metaCharsetNode;
    let favIconUrl;
    let requireCanvasLoader = false;
    let requireShadowRootLoader = false;
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
          titleElem = headNode.insertBefore(doc.createElement('title'), headNode.firstChild);
        }
        titleElem.textContent = title;
      } else if (doc.contentType === "image/svg+xml") {
        let titleElem = rootNode.querySelector('title');
        if (!titleElem) {
          const xmlns = "http://www.w3.org/2000/svg";
          titleElem = rootNode.insertBefore(doc.createElementNS(xmlns, 'title'), rootNode.firstChild);
        }
        titleElem.textContent = title;
      }
    }

    // force UTF-8
    if (rootNode.nodeName.toLowerCase() === "html") {
      if (!metaCharsetNode) {
        metaCharsetNode = headNode.insertBefore(doc.createElement("meta"), headNode.firstChild);
        metaCharsetNode.setAttribute("charset", "UTF-8");
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
              const favIconNode = headNode.appendChild(doc.createElement("link"));
              favIconNode.rel = "shortcut icon";
              favIconNode.href = icon;
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
      const elem = doc.createElement('style');
      elem.setAttribute("data-scrapbook-elem", "css-resource-map");
      elem.textContent = ':root {'
          + Object.entries(cssHandler.resourceMap).map(([k, v]) => `${v}:url("${k}");`).join('')
          + '}';
      headNode.appendChild(elem);
    }

    // special loaders
    // remove previous loader
    Array.prototype.forEach.call(rootNode.querySelectorAll('[data-scrapbook-elem="shadowroot-loader"]'), (elem) => {
      elem.remove();
    });

    if (requireShadowRootLoader) {
      const loader = rootNode.appendChild(doc.createElement("script"));
      loader.setAttribute("data-scrapbook-elem", "shadowroot-loader");
      // browsers supporting shadowRoot all support ES6
      loader.textContent = "(" + scrapbook.compressJsFunc(function () {
        var k = "data-scrapbook-shadowroot", d = document, p, s, data, mode, fn = n => {
          n.querySelectorAll(`[${k}]`).forEach(h => {
            if (!h.shadowRoot && h.attachShadow) {
              ({data, mode} = JSON.parse(h.getAttribute(k)));
              s = h.attachShadow({mode});
              s.innerHTML = data;
              fn(s);
              h.removeAttribute(k);
            }
          });
        };
        d.currentScript.remove();
        fn(d);
      }) + ")()";
    }

    // remove previous loader
    Array.prototype.forEach.call(rootNode.querySelectorAll('[data-scrapbook-elem="canvas-loader"]'), (elem) => {
      elem.remove();
    });

    if (requireCanvasLoader) {
      const loader = rootNode.appendChild(doc.createElement("script"));
      loader.setAttribute("data-scrapbook-elem", "canvas-loader");
      loader.textContent = "(" + scrapbook.compressJsFunc(function () {
        var k = "data-scrapbook-canvas",
            f = function (r) {
              var e = r.querySelectorAll("*"), i = e.length;
              while (i--) {
                if (e[i].shadowRoot) {
                  f(e[i].shadowRoot);
                }
                if (e[i].hasAttribute(k)) {
                  (function () {
                    var c = e[i], g = new Image();
                    g.onload = function () { c.getContext('2d').drawImage(g, 0, 0); };
                    g.src = c.getAttribute(k);
                    c.removeAttribute(k);
                  })();
                }
              }
            },
            s = document.getElementsByTagName("script");
        s = s[s.length - 1];
        s.parentNode.removeChild(s);
        f(document);
      }) + ")()";
    }

    // save document
    let content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;
    content = content.replace(/urn:scrapbook:text:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
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
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.retrieveDocumentContent = async function (params) {
  isDebug && console.debug("call: retrieveDocumentContent");

  const {doc = document, settings, options} = params;

  const data = {};
  Array.prototype.forEach.call(scrapbook.flattenFrames(doc), (doc) => {
    const url = scrapbook.splitUrl(doc.URL)[0];
    if (url in data) { return; }

    // skip non-HTML documents
    if (!["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
      return;
    }

    // tweak the content before saving
    const rootNode = doc.documentElement.cloneNode(true);

    // remove webscrapbook toolbar
    Array.prototype.forEach.call(rootNode.querySelectorAll("web-scrapbook"), elem => { elem.remove(); });

    let content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;

    // Firefox >= 56 can pass a Blob via browser.runtime.sendMessage. Use it to
    // improve performance and avoid the messaging size limit.
    if (scrapbook.userAgent.major > 56 && scrapbook.userAgent.is('gecko')) {
      content = new Blob([content], {type: "text/html"});
    }

    data[url] = {
      content,
      charset: doc.characterSet,
      mime: doc.contentType,
    };
  });
  return data;
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

  if (isFolder) {
    const newFilename = await capturer.invoke("getAvailableFilename", {
      filename,
      settings,
      options,
    });
    const dir = scrapbook.filepathParts(filename)[0];
    filename = (dir ? dir + '/' : '') + newFilename;
  }

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


/******************************************************************************
 * A class that handles document CSS analysis.
 *
 * @class DocumentCssHandler
 *****************************************************************************/

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

  verifySelector(root, selectorText) {
    try {
      if (root.querySelector(selectorText)) { return true; }

      // querySelector of selectors like a:hover or so always return null
      //
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
    } catch (ex) {}

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
   * - Don't consider unicode-range, as checking all related text nodes is
   *   not performant.
   * - Don't consider cross-domain (invalid) fonts. Even if we check status of 
   *   Document.fonts, we can hardly be sure that "loading" will become
   *  "loaded" or "error".
   *
   * @return {{usedCssFontUrl: Object, usedCssImageUrl: Object}}
   */
  async getCssResources() {
    const {doc, rootNode, refUrl, settings, options} = this;

    const usedCssFontUrl = {};
    const usedCssImageUrl = {};

    const FontFamilyMapper = class FontFamilyMapper extends scrapbook.ProxyMap {
      addUrl(fontFamily, url) {
        if (!url) { return; }
        this.get(fontFamily).urls.add(url);
      }

      /**
       * @param {string} fontFamily - Raw font-family text value
       */
      use(fontFamily) {
        if (!fontFamily) { return; }

        // The fontFamily property value is normalized:
        // - Names are separated with ", ".
        // - Unsafe names are quoted with "", not '' ('"'s inside are escaped with '\"').
        // - Unicode escape sequences are unescaped.
        // - No CSS comment.
        const regex = /("(?:\\"|[^"])*")|([^,\s]+)(?:,\s*|$)/g;
        const names = [];
        while (regex.test(fontFamily)) {
          if (RegExp.$1) {
            names.push(RegExp.$1.slice(1, -1).replace(/\\(.)/g, "$1"));
          } else {
            names.push(RegExp.$2);
          }
        }

        for (const fontFamily of names) {
          this.get(fontFamily).used = true;
        }
      }
    };

    const fontFamilyMapper = new FontFamilyMapper(() => ({
      used: false,
      urls: new Set(),
    }));

    const AnimationMapper = class AnimationMapper extends scrapbook.ProxyMap {
      addUrl(name, url) {
        if (!url) { return; }
        this.get(name).urls.add(url);
      }

      addFontFamily(name, fontFamily) {
        if (!fontFamily) { return; }
        this.get(name).fontFamilies.add(fontFamily);
      }

      use(name) {
        if (!name) { return; }
        this.get(name).used = true;
      }
    };

    const animationMapper = new AnimationMapper(() => ({
      used: false,
      urls: new Set(),
      fontFamilies: new Set(),
    }));

    const parseCssRule = async (cssRule, refUrl, root = rootNode) => {
      switch (cssRule.type) {
        case CSSRule.STYLE_RULE: {
          // this CSS rule applies to no node in the captured area
          if (!this.verifySelector(root, cssRule.selectorText)) { break; }

          fontFamilyMapper.use(cssRule.style.getPropertyValue('font-family'));

          animationMapper.use(cssRule.style.getPropertyValue('animation-name'));

          forEachUrl(cssRule.cssText, refUrl, (url) => {
            usedCssImageUrl[url] = true;
          });
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

          // record this font family and its font URL
          forEachUrl(src, refUrl, (url) => {
            fontFamilyMapper.addUrl(fontFamily, url);
          });

          break;
        }
        case CSSRule.PAGE_RULE: {
          if (!cssRule.cssText) { break; }

          fontFamilyMapper.use(cssRule.style.getPropertyValue('font-family'));

          animationMapper.use(cssRule.style.getPropertyValue('animation-name'));

          forEachUrl(cssRule.cssText, refUrl, (url) => {
            usedCssImageUrl[url] = true;
          });
          break;
        }
        case CSSRule.KEYFRAMES_RULE: {
          if (!cssRule.cssRules) { break; }

          animationMapper.get(cssRule.name);

          for (const rule of cssRule.cssRules) {
            await parseCssRule(rule, refUrl);
          }
          break;
        }
        case CSSRule.KEYFRAME_RULE: {
          if (!cssRule.cssText) { break; }

          animationMapper.addFontFamily(cssRule.parentRule.name, cssRule.style.getPropertyValue('font-family'));

          forEachUrl(cssRule.cssText, refUrl, (url) => {
            animationMapper.addUrl(cssRule.parentRule.name, url);
          });
          break;
        }
        // @TODO: COUNTER_STYLE_RULE is only supported by Firefox
        // and the API is unstable. Check if counter-style is really used
        case 11/* CSSRule.COUNTER_STYLE_RULE */: {
          if (!cssRule.symbols) { break; }

          forEachUrl(cssRule.symbols, refUrl, (url) => {
            usedCssImageUrl[url] = true;
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

      for (const elem of root.querySelectorAll("*")) {
        const {style} = elem;

        fontFamilyMapper.use(style.getPropertyValue('font-family'));
        animationMapper.use(style.getPropertyValue('animation-name'));

        for (const i of style) {
          forEachUrl(style.getPropertyValue(i), refUrl, (url) => {
            usedCssImageUrl[url] = true;
          });
        }

        const shadowRoot = elem.shadowRoot;
        if (shadowRoot) {
          const shadowRootOrig = this.origNodeMap.get(shadowRoot);
          if (shadowRootOrig) {
            await inspectDocOrShadowRoot(shadowRootOrig, shadowRoot);
          }
        }
      }
    };

    await inspectDocOrShadowRoot(doc, rootNode);

    // collect used animation and their used font family and background images
    for (const {used, urls, fontFamilies} of animationMapper.values()) {
      if (!used) { continue; }
      for (const url of urls) {
        usedCssImageUrl[url] = true;
      }
      for (const fontFamily of fontFamilies) {
        fontFamilyMapper.use(fontFamily);
      }
    }

    // collect used font families
    for (const {used, urls} of fontFamilyMapper.values()) {
      if (!used) { continue; }
      for (const url of urls) {
        usedCssFontUrl[url] = true;
      }
    }

    return {usedCssFontUrl, usedCssImageUrl};
  }


  /**
   * Rewrite a given CSS Text.
   *
   * @param {string} cssText - the CSS text to rewrite.
   * @param {string} refUrl - the reference URL for URL resolving.
   * @param {CSSStyleSheet} refCss - the reference CSS (for imported CSS).
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

    switch (options["capture.rewriteCss"]) {
      case "url": {
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
      case "none":
      default: {
        return cssText;
      }
    }
  }

  /**
   * Rewrite an internal, external, or imported CSS.
   *
   * - Pass {elem, callback} for internal or external CSS.
   * - Pass {url, refCss, callback} for imported CSS.
   *
   * @param {HTMLElement} elem - the elem to have CSS rewritten.
   * @param {string} url - the source URL of the imported CSS.
   * @param {string} refCss - the reference CSS of the imported CSS.
   * @param {string} refUrl - the reference URL for URL resolving.
   * @param {Function} callback
   * @param {Object} settings
   * @param {Object} options
   */
  async rewriteCss({elem, url, refCss, refUrl, callback, settings = this.settings, options = this.options}) {
    let sourceUrl;
    let fetchResult;
    let cssText = "";
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
      let cssRulesCssom = await this.getRulesFromCss({
        css: refCss,
        refUrl,
        crossOrigin: false,
        errorWithNull: true,
      });
      if (cssRulesCssom) {
        // scrapbook.utf8ToUnicode throws an error if cssText contains a UTF-8 invalid char
        const cssTextUnicode = charset ? cssText : await scrapbook.readFileAsText(new Blob([scrapbook.byteStringToArrayBuffer(cssText)]));

        const cssRulesSource = await this.getRulesFromCssText(cssTextUnicode);

        if (cssRulesSource.length !== cssRulesCssom.length ||
            !Array.prototype.every.call(
              cssRulesSource,
              (cssRule, i) => (cssRule.cssText === cssRulesCssom[i].cssText),
            )) {
          isDynamicCss = true;
          charset = "UTF-8";
          cssText = Array.prototype.map.call(
            cssRulesCssom,
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
    const cssTextRewritten = await this.rewriteCssText({
      cssText,
      refUrl: sourceUrl || refUrl,
      refCss,
      settings,
      options,
    });

    // save result back
    if (!elem || elem.nodeName.toLowerCase() == 'link') {
      // imported or external CSS
      // force UTF-8 for rewritten CSS

      // special management for data URI
      if (fetchResult.url.startsWith("data:")) {
        const [, hash] = scrapbook.splitUrlByAnchor(fetchResult.url);
        const dataUri = charset ? 
            scrapbook.unicodeToDataUri(cssTextRewritten, "text/css") : 
            scrapbook.byteStringToDataUri(cssTextRewritten, "text/css;charset=UTF-8");
        const response = {url: dataUri + hash};
        await callback(elem, response);
        return;
      }

      const response = await capturer.invoke("downloadBytes", {
        bytes: charset ? scrapbook.unicodeToUtf8(cssTextRewritten) : cssTextRewritten,
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
        cssText: cssTextRewritten,
      };
      await callback(elem, response);
    }
  }
};


window.capturer = capturer;

})(this, this.document, this.browser);
