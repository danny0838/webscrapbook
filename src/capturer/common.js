/********************************************************************
 *
 * The common script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @public {Object} capturer
 *******************************************************************/

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
 * Invoke an invokable capturer method from another script
 *
 * @return {Promise}
 */
capturer.invoke = function (method, args, details = {}) {
  return Promise.resolve().then(() => {
    const {tabId = -1, frameId = 0, frameWindow = null} = details;
    if (tabId !== -1) {
      // to content script (or content script call self)
      if (!capturer.isContentScript) {
        const cmd = "capturer." + method;
        const message = {cmd, args};

        isDebug && console.debug(cmd, "send to content script", `[${tabId}:${frameId}]`, args);
        return browser.tabs.sendMessage(tabId, message, {frameId}).then((response) => {
          isDebug && console.debug(cmd, "response from content script", `[${tabId}:${frameId}]`, response);
          return response;
        });
      } else {
        return capturer[method](args);
      }
    } else if (frameWindow) {
      // to frame
      return new Promise((resolve, reject) => {
        const cmd = "capturer." + method;
        const uid = scrapbook.dateToId();
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          resolve(undefined);
          delete channel;
        }, 1000);

        isDebug && console.debug(cmd, "send to frame", args);
        frameWindow.postMessage({extension: chrome.runtime.id, uid, cmd, args}, "*", [channel.port2]);
        channel.port1.onmessage = (event) => {
          const message = event.data;
          if (message.extension !== chrome.runtime.id) { return; }
          if (message.uid !== uid) { return; }
          if (message.cmd === cmd + ".start") {
            clearTimeout(timeout);
          } else if (message.cmd === cmd + ".complete") {
            isDebug && console.debug(cmd, "response from frame", message.response);
            resolve(message.response);
            delete channel;
          }
        };
      });
    } else {
      // to capturer.html page (or capturer.html call self)
      if (capturer.isContentScript) {
        const cmd = "capturer." + method;
        const message = {cmd, args};

        isDebug && console.debug(cmd, "send to capturer page", args);
        return browser.runtime.sendMessage(message).then((response) => {
          isDebug && console.debug(cmd, "response from capturer page", response);
          return response;
        });
      } else {
        return capturer[method](args);
      }
    }
  });
};

/**
 * @kind invokable
 * @param {Object} params
 * @return {Promise}
 */
capturer.isScriptLoaded = function (params) {
  return Promise.resolve(true);
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Document} params.doc
 *     - {string} params.refUrl
 *     - {string} params.title
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureDocumentOrFile = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureDocumentOrFile");

    const {doc = document, refUrl, title, settings, options} = params;

    // if not HTML document, capture as file
    if (["text/html", "application/xhtml+xml"].indexOf(doc.contentType) === -1) {
      // if it can be displayed as HTML, check saveFileAsHtml
      if (!(doc.documentElement.nodeName.toLowerCase() === "html" && options["capture.saveFileAsHtml"])) {
        return capturer.invoke("captureFile", {
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
    return capturer.captureDocument(params);
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Document} params.doc
 *     - {string} params.title
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureDocument = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureDocument");

    const {doc = document, title, settings, options} = params;
    const {timeId, isHeadless} = settings;
    let {documentName} = settings;
    let {contentType: mime, documentElement: htmlNode} = doc;

    if (!isHeadless && doc.readyState !== "complete") {
      throw new Error(scrapbook.lang("ErrorDocumentNotReady"));
    }

    const [docUrl] = scrapbook.splitUrlByAnchor(doc.URL);
    const [refUrl] = scrapbook.splitUrlByAnchor(doc.baseURI);
    const tasks = [];
    let selection;
    let rootNode, headNode;
    let favIconNode, favIconUrl;

    const origNodeMap = new Map();
    const clonedNodeMap = new Map();
    const specialContentMap = new Map();

    // Map cloned nodes and the original for later reference
    // since cloned nodes may lose some information,
    // e.g. cloned iframes has no content, cloned canvas has no image,
    // and cloned form elements has no current status.
    const cloneNodeMapping = function (node, deep = false) {
      const newNode = node.cloneNode(false);
      origNodeMap.set(newNode, node);
      clonedNodeMap.set(node, newNode);

      // recursively clone descendant nodes
      if (deep) {
        const childs = node.childNodes;
        const len = childs.length;
        for (let i = 0; i < len; i++) {
          const newChildNode = cloneNodeMapping(node.childNodes[i], true);
          newNode.appendChild(newChildNode);
        }
      }

      return newNode;
    };

    // remove the specified node, record it if option set
    const captureRemoveNode = function (elem, record = options["capture.recordRemovedNode"]) {
      if (!elem.parentNode) { return; }

      if (record) {
        const comment = doc.createComment(`scrapbook-orig-node-${timeId}--${scrapbook.escapeHtmlComment(elem.outerHTML)}`);
        elem.parentNode.replaceChild(comment, elem);
      } else {
        elem.parentNode.removeChild(elem);
      }
    };

    // rewrite (or remove if value is null/undefined) the specified attr, record it if option set
    const captureRewriteAttr = function (elem, attr, value, record = options["capture.recordRewrittenAttr"]) {
      if (elem.hasAttribute(attr)) {
        const oldValue = elem.getAttribute(attr);
        if (oldValue === value) { return; }

        if (value === null || value === undefined) {
          elem.removeAttribute(attr);
        } else {
          elem.setAttribute(attr, value);
        }

        if (record) {
          const recordAttr = `data-scrapbook-orig-attr-${attr}-${timeId}`;
          if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
        }
      } else {
        if (value === null || value === undefined) { return; }

        elem.setAttribute(attr, value);

        if (record) {
          const recordAttr = `data-scrapbook-orig-null-attr-${attr}-${timeId}`;
          if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, ""); }
        }
      }
    };

    // rewrite (or remove if value is null/undefined) the textContent, record it if option set
    const captureRewriteTextContent = function (elem, value, record = options["capture.recordRewrittenAttr"]) {
      const oldValue = elem.textContent;
      if (oldValue === value) { return; }

      elem.textContent = value;

      if (record) {
        const recordAttr = `data-scrapbook-orig-textContent-${timeId}`;
        if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
      }
    };

    // similar to captureRewriteAttr, but use option capture.recordSourceUri
    const captureRewriteUri = function (elem, attr, value, record = options["capture.recordSourceUri"]) {
      return captureRewriteAttr(elem, attr, value, record);
    };

    const rewriteLocalLink = function (relativeUrl, baseUrl, docUrl) {
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
          const targetId = scrapbook.decodeURIComponent(urlHash.slice(1)).replace(/\W/g, '\\$&');
          if (rootNode.querySelector(`[id="${targetId}"], a[name="${targetId}"]`)) {
            hasLocalTarget = true;
          }
        }
        if (hasLocalTarget) {
          return urlHash;
        }
      }

      return url;
    };

    const getCanvasDataScript = function (canvas) {
      const data = canvas.toDataURL();
      const dataScript = function (data) {
        var s = document.getElementsByTagName("script"),
            c = s[s.length - 1],
            t = c.previousSibling,
            i = new Image();
        i.onload = function(){ t.getContext('2d').drawImage(i, 0, 0); };
        i.src = data;
        s.parentNode.removeChild(s);
      };
      return "(" + scrapbook.compressJsFunc(dataScript) + ")('" + data + "')";
    };

    return capturer.invoke("registerDocument", {
      settings,
      options,
    }).then((response) => {
      documentName = response.documentName;
    }).then(() => {
      // construct the node list
      selection = doc.getSelection();
      {
        if (selection && selection.isCollapsed) { selection = null; }
        if (selection && options["capture.saveBeyondSelection"]) { selection = null; }

        // clone selected nodes
        if (selection) {
          const cloneNodeAndAncestors = function (node) {
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
          const isTextNode = function (node) {
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
              headNode = doc.querySelector("head");
              headNode = headNode ? cloneNodeMapping(headNode, true) : doc.createElement("head");
              rootNode.appendChild(headNode);
              rootNode.appendChild(doc.createTextNode("\n"));
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

        // clone all nodes
        if (!selection) {
          rootNode = cloneNodeMapping(htmlNode, true);
          headNode = rootNode.querySelector("head");
          if (!headNode) {
            headNode = doc.createElement("head");
            rootNode.insertBefore(headNode, rootNode.firstChild);
          }
        }

        // add linefeeds to head and body to improve layout
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

      // map used background images and fonts
      // @FIXME: a node removed during capture process still have resource downloaded
      if ((options["capture.imageBackground"] === "save-used" || options["capture.font"] === "save-used") && !isHeadless) {
        const usedCssFontUrl = {};
        const usedCssImageUrl = {};

        const fontFamilyMapper = {
          list: {},

          get(fontFamily) {
            if (!this.list[fontFamily]) {
              this.list[fontFamily] = {used: false, urls: []};
            }

            return this.list[fontFamily];
          },

          addUrl(fontFamily, url) {
            this.get(fontFamily).urls.push(url);
          },

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

            names.forEach((fontFamily) => {
              this.get(fontFamily).used = true;
            });
          },
        };

        const animationMapper = {
          list: {},

          get(name) {
            if (!this.list[name]) {
              this.list[name] = {used: false, urls: [], fontFamilies: []};
            }

            return this.list[name];
          },

          addUrl(name, url) {
            this.get(name).urls.push(url);
          },

          addfontFamily(name, fontFamily) {
            this.get(name).fontFamilies.push(fontFamily);
          },

          use(name) {
            if (!name) { return; }

            this.get(name).used = true;
          },
        };

        const verifySelector = function (root, selectorText) {
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
        };

        const parseCss = function (css, refUrl) {
          // @FIXME: cssRules not accessible for cross-origin CSS
          // In Firefox, CSS from a different domain throws a SecurityError when accessing .cssRules
          // In Chrome, CSS from a different domain gets .cssRules = null
          try {
            if (!css.cssRules) { throw new Error('CSS rules not accessible'); }
          } catch (ex) {
            return;
          }

          if (css.disabled) { return; }

          Array.prototype.forEach.call(css.cssRules, (cssRule) => parseCssRule(cssRule, css.href || refUrl));
        };

        const parseCssRule = function (cssRule, refUrl) {
          switch (cssRule.type) {
            case CSSRule.STYLE_RULE: {
              // this CSS rule applies to no node in the captured area
              if (!verifySelector(rootNode, cssRule.selectorText)) { break; }

              fontFamilyMapper.use(cssRule.style.fontFamily);
              animationMapper.use(cssRule.style.animationName);

              parseCssText(cssRule.cssText, refUrl, (url) => {
                usedCssImageUrl[url] = true;
              });
              break;
            }
            case CSSRule.IMPORT_RULE: {
              if (!cssRule.styleSheet) { break; }

              parseCss(cssRule.styleSheet, refUrl);
              break;
            }
            case CSSRule.MEDIA_RULE: {
              if (!cssRule.cssRules) { break; }

              Array.prototype.forEach.call(cssRule.cssRules, (cssRule) => parseCssRule(cssRule, refUrl));
              break;
            }
            case CSSRule.FONT_FACE_RULE: {
              if (!cssRule.cssText) { break; }

              const {fontFamily, src} = cssRule.style;

              if (!fontFamily || !src) { break; }

              // record this font family and its font URL
              parseCssText(src, refUrl, (url) => {
                fontFamilyMapper.addUrl(fontFamily, url);
              });

              break;
            }
            case CSSRule.PAGE_RULE: {
              if (!cssRule.cssText) { break; }

              fontFamilyMapper.use(cssRule.style.fontFamily);
              animationMapper.use(cssRule.style.animationName);

              parseCssText(cssRule.cssText, refUrl, (url) => {
                usedCssImageUrl[url] = true;
              });
              break;
            }
            case CSSRule.KEYFRAMES_RULE: {
              if (!cssRule.cssRules) { break; }

              animationMapper.get(cssRule.name);

              Array.prototype.forEach.call(cssRule.cssRules, (cssRule) => parseCssRule(cssRule, refUrl));
              break;
            }
            case CSSRule.KEYFRAME_RULE: {
              if (!cssRule.cssText) { break; }

              animationMapper.addfontFamily(cssRule.parentRule.name, cssRule.style.fontFamily);

              parseCssText(cssRule.cssText, refUrl, (url) => {
                animationMapper.addUrl(cssRule.parentRule.name, url);
              });
              break;
            }
            // @TODO: COUNTER_STYLE_RULE is only supported by Firefox
            // and the API is unstable. Check if counter-style is really used
            case 11/* CSSRule.COUNTER_STYLE_RULE */: {
              if (!cssRule.symbols) { break; }

              parseCssText(cssRule.symbols, refUrl, (url) => {
                usedCssImageUrl[url] = true;
              });
              break;
            }
            // @TODO: check SUPPORTS_RULE is supported or not
            case CSSRule.SUPPORTS_RULE: {
              if (!cssRule.cssRules) { break; }

              Array.prototype.forEach.call(cssRule.cssRules, (cssRule) => parseCssRule(cssRule, refUrl));
              break;
            }
            // @TODO: DOCUMENT_RULE is only supported by Firefox
            // (with -moz-) and the API is unstable.
            case 13/* CSSRule.DOCUMENT_RULE */: {
              if (!cssRule.cssRules) { break; }

              Array.prototype.forEach.call(cssRule.cssRules, (cssRule) => parseCssRule(cssRule, refUrl));
              break;
            }
          }
        };

        // We pass only elemental css text, which should not contain any at-rule
        const parseCssText = function (cssText, refUrl, callback = x => x) {
          scrapbook.parseCssText(cssText, {
            rewriteImportUrl(url) { return {url}; },
            rewriteFontFaceUrl(url) { return {url}; },
            rewriteBackgroundUrl(url) {
              const targetUrl = capturer.resolveRelativeUrl(url, refUrl);
              callback(targetUrl);
              return {url};
            },
          });
        };

        Array.prototype.forEach.call(doc.styleSheets, (css) => parseCss(css, refUrl));

        Array.prototype.forEach.call(rootNode.querySelectorAll("*"), (elem) => {
          const {style} = elem;

          fontFamilyMapper.use(style.fontFamily);
          animationMapper.use(style.animationName);

          for (let i of style) {
            parseCssText(style.getPropertyValue(i), refUrl, (url) => {
              usedCssImageUrl[url] = true;
            });
          }
        });

        // collect used animation and their used font family and background images
        for (let name in animationMapper.list) {
          const f = animationMapper.list[name];
          if (f.used) {
            for (let url of f.urls) {
              usedCssImageUrl[url] = true;
            }
            for (let fontFamily of f.fontFamilies) {
              fontFamilyMapper.use(fontFamily);
            }
          }
        }

        // collect used font families
        for (let fontFamily in fontFamilyMapper.list) {
          const f = fontFamilyMapper.list[fontFamily];
          if (f.used) {
            for (let url of f.urls) {
              usedCssFontUrl[url] = true;
            }
          }
        }

        // expose filter to settings
        if (options["capture.imageBackground"] === "save-used") {
          settings.usedCssImageUrl = usedCssImageUrl;
        }
        if (options["capture.font"] === "save-used") {
          settings.usedCssFontUrl = usedCssFontUrl;
        }
      }

      // record source URL
      if (options["capture.recordDocumentMeta"]) {
        const url = docUrl.startsWith("data:") ? "data:" : docUrl;
        rootNode.setAttribute("data-scrapbook-source", url);
        rootNode.setAttribute("data-scrapbook-create", timeId);
      }

      // favicon: the tab favicon
      if (settings.frameIsMain && settings.favIconUrl) {
        switch (options["capture.favicon"]) {
          case "link":
            favIconUrl = settings.favIconUrl;
            break;
          case "blank":
          case "remove":
            // do nothing
            break;
          case "save":
          default:
            favIconUrl = "about:blank";  // temporary placeholder
            tasks[tasks.length] = 
            capturer.invoke("downloadFile", {
              url: settings.favIconUrl,
              refUrl,
              settings,
              options,
            }).then((response) => {
              favIconUrl = response.url;
              return response;
            });
            break;
        }
      }

      // inspect nodes
      let metaCharsetNode;
      Array.prototype.forEach.call(rootNode.querySelectorAll("*"), (elem) => {
        // skip elements that are already removed from the DOM tree
        if (!elem.parentNode) { return; }

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
            // force UTF-8
            if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content")) {
              if (elem.getAttribute("http-equiv").toLowerCase() == "content-type") {
                metaCharsetNode = elem;
                captureRewriteAttr(elem, "content", "text/html; charset=UTF-8");
              } else if (elem.getAttribute("http-equiv").toLowerCase() == "refresh") {
                const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
                if (metaRefresh.url) {
                  // meta refresh is relative to document URL rather than base URL
                  const url = rewriteLocalLink(metaRefresh.url, docUrl, docUrl);
                  elem.setAttribute("content", metaRefresh.time + (url ? ";url=" + url : ""));
                }
              }
            } else if (elem.hasAttribute("charset")) {
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

            // elem.rel == "" if "rel" attribute not defined
            const rels = elem.rel.toLowerCase().split(/[ \t\r\n\v\f]+/);
            if (rels.indexOf("stylesheet") >= 0) {
              // styles: link element
              switch (options["capture.style"]) {
                case "link":
                  // do nothing
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
                  switch (options["capture.rewriteCss"]) {
                    case "url":
                      tasks[tasks.length] = 
                      capturer.invoke("downloadFile", {
                        url: elem.getAttribute("href"),
                        refUrl,
                        rewriteMethod: "processCssFile",
                        settings,
                        options,
                      }).then((response) => {
                        captureRewriteUri(elem, "href", response.url);
                        return response;
                      });
                      break;
                    case "none":
                    default:
                      tasks[tasks.length] = 
                      capturer.invoke("downloadFile", {
                        url: elem.getAttribute("href"),
                        refUrl,
                        settings,
                        options,
                      }).then((response) => {
                        captureRewriteUri(elem, "href", response.url);
                        return response;
                      });
                      break;
                  }
                  break;
              }
              break;
            } else if (rels.indexOf("icon") >= 0) {
              // favicon: the link element
              if (!favIconNode) { favIconNode = elem; }
              switch (options["capture.favicon"]) {
                case "link":
                  // do nothing
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("href"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "href", response.url);
                    return response;
                  });
                  break;
              }
            } else if (rels.indexOf("preload") >= 0) {
              // @TODO: handle preloads according to its "as" attribute
              captureRewriteUri(elem, "href", null);
            }
            break;
          }

          // styles: style element
          case "style": {
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
                switch (options["capture.rewriteCss"]) {
                  case "url":
                    tasks[tasks.length] = 
                    capturer.processCssText(elem.textContent, refUrl, settings, options).then((response) => {
                      elem.textContent = response;
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }
                break;
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: rewriteUrl,
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
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
              case "link":
                // do nothing
                // keep current (resolved) src and srcdoc
                break;
              case "blank":
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // The src attribute, if present, must be a valid non-empty URL.
                captureRewriteUri(frame, "src", null);
                captureRewriteAttr(frame, "srcdoc", null);
                break;
              case "remove":
                captureRemoveNode(frame);
                return;
              case "save":
              default:
                const captureFrameCallback = (response) => {
                  isDebug && console.debug("captureFrameCallback", response);
                  if (response) {
                    captureRewriteUri(frame, "src", response.url);

                    // remove srcdoc to avoid overwriting src
                    captureRewriteAttr(frame, "srcdoc", null);
                  } else {
                    // Unable to capture the content document
                    captureRewriteUri(frame, "src", null);
                  }
                  return response;
                };

                const frameSettings = JSON.parse(JSON.stringify(settings));
                frameSettings.frameIsMain = false;

                let frameDoc;
                try {
                  frameDoc = frameSrc.contentDocument;
                } catch (ex) {
                  // console.debug(ex);
                }

                if (frameDoc) {
                  // frame document accessible:
                  // capture the content document directly
                  tasks[tasks.length] = 
                  capturer.captureDocumentOrFile({
                    doc: frameDoc,
                    refUrl,
                    settings: frameSettings,
                    options,
                  }).then(captureFrameCallback);
                  break;
                }

                // frame document inaccessible:
                tasks[tasks.length] = Promise.resolve().then(() => {
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
                }).then((response) => {
                  if (response) { return captureFrameCallback(response); }

                  // frame window accessible with special cases:
                  // frame window inaccessible: (headless capture)

                  // if the frame has srcdoc, use it
                  // @FIXME: rewrite srcdoc content
                  if (frame.hasAttribute("srcdoc")) {
                    captureRewriteAttr(frame, "src", null);
                    return;
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
                  if (frameSettings.recurseChain.indexOf(targetUrl) === -1) {
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
            break;
          }

          case "a":
          case "area": {
            if (!elem.hasAttribute("href")) { break; }
            let url = elem.getAttribute("href");

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
                  captureRewriteAttr(elem, "href", "javascript:");
                  break;
              }
              break;
            }

            // check local link and rewrite url
            url = rewriteLocalLink(url, refUrl, docUrl);
            elem.setAttribute("href", url);

            // skip further processing for non-absolute links
            if (!scrapbook.isUrlAbsolute(url)) {
              break;
            }

            // check downLink
            if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:')) {
              switch (options["capture.downLink.mode"]) {
                case "header": {
                  if (capturer.downLinkUrlFilter(url, options)) {
                    break;
                  }

                  tasks[tasks.length] = 
                  capturer.invoke("downLinkFetchHeader", {
                    url,
                    refUrl,
                    settings,
                  }).then((ext) => {
                    if (ext === null) { return null; }
                    if (!capturer.downLinkExtFilter(ext, options)) { return null; }

                    return capturer.invoke("downloadFile", {
                      url,
                      refUrl,
                      settings,
                      options,
                    }).then((response) => {
                      captureRewriteUri(elem, "href", response.url);
                      return response;
                    });
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

                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url,
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "href", response.url);
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

            break;
          }

          // images: img
          case "img": {
            const elemOrig = origNodeMap.get(elem);

            if (elem.hasAttribute("src")) {
              const rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("src"), refUrl);
              elem.setAttribute("src", rewriteUrl);
            }

            if (elem.hasAttribute("srcset")) {
              elem.setAttribute("srcset",
                scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
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
                    captureRewriteUri(elem, "srcset", null);
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elemOrig.currentSrc,
                      refUrl,
                      settings,
                      options,
                    }).then((response) => {
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }

                if (elem.hasAttribute("srcset")) {
                  tasks[tasks.length] = 
                  capturer.processSrcsetText(elem.getAttribute("srcset"), refUrl, settings, options).then((response) => {
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
                scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
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
                  tasks[tasks.length] = 
                  capturer.processSrcsetText(elem.getAttribute("srcset"), refUrl, settings, options).then((response) => {
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
            const elemOrig = origNodeMap.get(elem);

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
                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  captureRewriteUri(elem, "src", "about:blank");
                }, this);

                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save-current":
                if (!isHeadless) {
                  if (elemOrig.currentSrc) {
                    Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRemovedNode"]);
                    }, this);
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elemOrig.currentSrc,
                      refUrl,
                      settings,
                      options,
                    }).then((response) => {
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }

                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
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
            const elemOrig = origNodeMap.get(elem);

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
                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  captureRewriteUri(elem, "src", "about:blank");
                }, this);

                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save-current":
                if (!isHeadless) {
                  if (elem.hasAttribute("poster")) {
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elem.getAttribute("poster"),
                      refUrl,
                      settings,
                      options,
                    }).then((response) => {
                      captureRewriteUri(elem, "poster", response.url);
                      return response;
                    });
                  }

                  if (elemOrig.currentSrc) {
                    Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"] || options["capture.recordRemovedNode"]);
                    }, this);
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elemOrig.currentSrc,
                      refUrl,
                      settings,
                      options,
                    }).then((response) => {
                      captureRewriteUri(elem, "src", response.url);
                      return response;
                    });
                  }

                  break;
                }
                // Headless capture doesn't support currentSrc, fallback to "save".
              case "save":
              default:
                if (elem.hasAttribute("poster")) {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("poster"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "poster", response.url);
                    return response;
                  });
                }

                if (elem.hasAttribute("src")) {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }

                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("src"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("data"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
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
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("code"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
                    captureRewriteUri(elem, "code", response.url);
                    return response;
                  });
                }

                if (elem.hasAttribute("archive")) {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("archive"),
                    refUrl,
                    settings,
                    options,
                  }).then((response) => {
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
            const canvasOrig = origNodeMap.get(elem);

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
                  let scriptText = getCanvasDataScript(canvasOrig);
                  if (scriptText) {
                    let canvasScript = doc.createElement("script");
                    canvasScript.textContent = scriptText;
                    elem.parentNode.insertBefore(canvasScript, elem.nextSibling);
                  }
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
            const elemOrig = origNodeMap.get(elem);

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
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elem.getAttribute("src"),
                      refUrl,
                      settings,
                      options,
                    }).then((response) => {
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
            const elemOrig = origNodeMap.get(elem);

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
            const elemOrig = origNodeMap.get(elem);

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
                  tasks[tasks.length] = 
                  capturer.processCssText(elem.getAttribute("style"), refUrl, settings, options).then((response) => {
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
            Array.prototype.forEach.call(elem.attributes, (attr) => {
              if (attr.name.toLowerCase().startsWith("on")) {
                captureRewriteAttr(elem, attr.name, null);
              }
            }, this);
        }

        // handle integrity and crossorigin
        // We have to remove integrity check because we could modify the content
        // and they might not work correctly in the offline environment.
        if ( options["capture.removeIntegrity"] ) {
          captureRewriteAttr(elem, "integrity", null);
          captureRewriteAttr(elem, "crossorigin", null);
        }
      }, this);

      // force UTF-8
      if (!metaCharsetNode) {
        let frag = doc.createDocumentFragment();
        metaCharsetNode = doc.createElement("meta");
        metaCharsetNode.setAttribute("charset", "UTF-8");
        frag.appendChild(doc.createTextNode("\n"));
        frag.appendChild(metaCharsetNode);
        headNode.insertBefore(frag, headNode.firstChild);
      }

      // force title if a preset title is given
      if (title) {
        let titleElem = rootNode.querySelector('title');
        if (titleElem) {
          titleElem.textContent = title;
        } else {
          let frag = doc.createDocumentFragment();
          titleElem = doc.createElement('title');
          titleElem.textContent = title;
          frag.appendChild(titleElem);
          frag.appendChild(doc.createTextNode("\n"));
          headNode.appendChild(frag);
        }
      }

      // create favicon node if none
      if (favIconUrl && !favIconNode) {
        let frag = doc.createDocumentFragment();
        favIconNode = doc.createElement("link");
        favIconNode.rel = "shortcut icon";
        frag.appendChild(favIconNode);
        frag.appendChild(doc.createTextNode("\n"));
        headNode.appendChild(frag);
      }

      return Promise.all(tasks);
    }).then((results) => {
      // manage favicon
      if (favIconUrl && favIconNode) {
        favIconNode.href = favIconUrl;
      }

      // save document
      let content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;
      content = content.replace(/urn:scrapbook:text:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
        if (specialContentMap.has(key)) { return specialContentMap.get(key); }
        return match;
      });
      return capturer.invoke("saveDocument", {
        sourceUrl: docUrl,
        documentName,
        settings,
        options,
        data: {
          mime,
          charset: "UTF-8",
          content,
          title: title || doc.title,
        }
      });
    });
  }).catch((ex) => {
    console.error(ex);
    return {error: {message: ex.message}};
  });
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
  if (!options || options["capture.recordErrorUri"]) {
    if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:") || sourceUrl.startsWith("file:")) {
      return `urn:scrapbook:download:error:${sourceUrl}`;
    }
  }
  return sourceUrl;
};

capturer.downLinkExtFilter = function (ext, options) {
  // use cached filter regex if not changed
  if (arguments.callee._filter !== options["capture.downLink.extFilter"]) {
    arguments.callee._filter = options["capture.downLink.extFilter"];
    arguments.callee.filters = (function () {
      const ret = [];
      options["capture.downLink.extFilter"].split(/[\r\n]/).forEach((line) => {
        if (line.charAt(0) === "#") { return; }
        line = line.trim();
        if (line === "") { return; }

        if (/^\/(.*)\/([a-z]*)$/.test(line)) {
          try {
            ret.push(new RegExp(`^(?:${RegExp.$1})$`, RegExp.$2));
          } catch (ex) {
            console.error(ex);
          }
        } else {
          const regex = line.split(/[,; ]+/)
            .map(x => scrapbook.escapeRegExp(x))
            .filter(x => !!x)
            .join('|');
          ret.push(new RegExp(`^(?:${regex})$`, 'i'));
        }
      });
      return ret;
    })();
  }

  return arguments.callee.filters.some((filter) => {
    return filter.test(ext);
  });
};

capturer.downLinkUrlFilter = function (url, options) {
  // use the cache if the filter is not changed
  if (arguments.callee._filter !== options["capture.downLink.urlFilter"]) {
    arguments.callee._filter = options["capture.downLink.urlFilter"];
    arguments.callee.filters = (function () {
      const ret = [];
      options["capture.downLink.urlFilter"].split(/[\r\n]/).forEach((line) => {
        if (line.charAt(0) === "#") { return; }
        line = line.trim();
        if (line === "") { return; }

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
    })();
  }

  // match the URL without hash
  const matchUrl = scrapbook.splitUrlByAnchor(url)[0];
  return arguments.callee.filters.some((filter) => {
    // plain text rule must match full URL
    if (typeof filter === 'string') {
      return filter === matchUrl;
    }
    return filter.test(matchUrl);
  });
};

/**
 * @return {Promise}
 */
capturer.processSrcsetText = function (text, refUrl, settings, options) {
  const downloader = new capturer.ComplexUrlDownloader(settings, options, refUrl);

  const rewritten = scrapbook.parseSrcset(text, (url) => {
    return downloader.getUrlHash(url);
  });

  return downloader.startDownloads().then((response) => {
    return downloader.finalRewrite(rewritten);
  });
};

/**
 * Rewrite a downloaded CSS file
 *
 * @return {Promise}
 */
capturer.processCssFile = function (params) {
  return Promise.resolve().then(() => {
    const {data, charset, url: refUrl, settings, options} = params;

    return scrapbook.parseCssFile(data, charset, (cssText) => {
      return capturer.processCssText(cssText, refUrl, settings, options);
    });
  });
};

/**
 * process the CSS text of whole <style> or a CSS file
 *
 * @return {Promise}
 */
capturer.processCssText = function (cssText, refUrl, settings, options) {
  const downloader = new capturer.ComplexUrlDownloader(settings, options, refUrl);
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

  const rewritten = scrapbook.parseCssText(cssText, {
    rewriteImportUrl(sourceUrl) {
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
            url = downloader.getUrlHash(url, "processCssFile");
          }
          break;
      }
      return {url, recordUrl};
    },
    rewriteFontFaceUrl(sourceUrl) {
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
            url = downloader.getUrlHash(url);
          }
          break;
      }
      return {url, recordUrl};
    },
    rewriteBackgroundUrl(sourceUrl) {
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
            url = downloader.getUrlHash(url);
          }
          break;
      }
      return {url, recordUrl};
    }
  });

  return downloader.startDownloads().then((response) => {
    return downloader.finalRewrite(rewritten);
  });
};


/********************************************************************
 * A class that manages a text containing multiple URLs to be
 * downloaded and rewritten
 *
 * @class ComplexUrlDownloader
 *******************************************************************/
capturer.ComplexUrlDownloader = class ComplexUrlDownloader {
  constructor(settings, options, refUrl) {
    this.urlHash = {};
    this.urlRewrittenCount = 0;
    this.settings = settings;
    this.options = options;
    if (refUrl) {
      // if a refUrl is specified, record the recurse chain
      // for future check of circular referencing
      this.settings = JSON.parse(JSON.stringify(this.settings));
      this.settings.recurseChain.push(refUrl);
    }
  }

  getUrlHash(url, rewriteMethod) {
    const key = scrapbook.getUuid();
    this.urlHash[key] = {
      url,
      newUrl: null,
      rewriteMethod,
    };
    return "urn:scrapbook:url:" + key;
  }

  startDownloads() {
    return Promise.resolve().then(() => {
      const tasks = Object.keys(this.urlHash).map((key) => {
        return Promise.resolve().then(() => {
          const targetUrl = this.urlHash[key].url;
          return capturer.invoke("downloadFile", {
            url: targetUrl,
            refUrl: this.settings.recurseChain[this.settings.recurseChain.length - 1],
            rewriteMethod: this.urlHash[key].rewriteMethod,
            settings: this.settings,
            options: this.options,
          }).then((response) => {
            if (response.isCircular) {
              if (this.options["capture.saveAs"] === "singleHtml" || 
                  this.options["capture.saveAs"] === "singleHtmlJs") {
                const sourceUrl = this.settings.recurseChain[this.settings.recurseChain.length - 1];
                console.warn(scrapbook.lang("WarnCaptureCircular", [sourceUrl, targetUrl]));
                response.url = `urn:scrapbook:download:circular:filename:${response.url}`;
              }
            }

            this.urlHash[key].newUrl = response.url;
            return response;
          });
        });
      });
      return Promise.all(tasks);
    });
  }

  finalRewrite(text) {
    return text.replace(/urn:scrapbook:url:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
      if (this.urlHash[key]) { return this.urlHash[key].newUrl; }
      // This could happen when a web page really contains a content text in our format.
      // We return the original text for keys not defineded in the map to prevent a bad replace
      // since it's nearly impossible for them to hit on the hash keys we are using.
      return match;
    });
  }
};


true; // return value of executeScript
