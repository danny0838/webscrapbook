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
        const message = {
          cmd: cmd,
          args: args
        };

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
        frameWindow.postMessage({
          extension: chrome.runtime.id,
          uid: uid,
          cmd: cmd,
          args: args
        }, "*", [channel.port2]);
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
      // to background script (or background script call self)
      if (capturer.isContentScript) {
        const cmd = "capturer." + method;
        const message = {
          cmd: cmd,
          args: args
        };

        isDebug && console.debug(cmd, "send to background script", args);
        return browser.runtime.sendMessage(message).then((response) => {
          isDebug && console.debug(cmd, "response from background script", response);
          return response;
        });
      } else {
        return capturer[method](args);
      }
    }
  });
};

/**
 * @return {Promise}
 */
capturer.getContentTabs = function () {
  return scrapbook.getContentPagePattern().then((urlMatch) => {
    return browser.tabs.query({currentWindow: true, url: urlMatch});
  }).then((tabs) => {
    return tabs.filter((tab) => (scrapbook.isContentPage(tab.url)));
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
      if (!options["capture.saveFileAsHtml"]) {
        return capturer.invoke("captureFile", {
          url: doc.URL,
          refUrl: refUrl,
          title: title || doc.title,
          settings: settings,
          options: options,
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

    const [refUrl] = scrapbook.splitUrlByAnchor(doc.URL);
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
        const comment = doc.createComment(`sb-orig-node-${timeId}--${scrapbook.escapeHtmlComment(elem.outerHTML)}`);
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
          const recordAttr = `data-sb-orig-attr-${attr}-${timeId}`;
          if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
        }
      } else {
        if (value === null || value === undefined) { return; }

        elem.setAttribute(attr, value);

        if (record) {
          const recordAttr = `data-sb-orig-null-attr-${attr}-${timeId}`;
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
        const recordAttr = `data-sb-orig-textContent-${timeId}`;
        if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
      }
    };

    // similar to captureRewriteAttr, but use option capture.recordSourceUri
    const captureRewriteUri = function (elem, attr, value, record = options["capture.recordSourceUri"]) {
      return captureRewriteAttr(elem, attr, value, record);
    };

    const rewriteLocalLink = function (url) {
      const [urlMain, urlHash] = scrapbook.splitUrlByAnchor(url);

      // This link targets the current page
      if (urlMain === refUrl) {
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
      return "(" + dataScript.toString().replace(/(?!\w\s+\w)(.)\s+/g, "$1") + ")('" + data + "')";
    };

    return capturer.invoke("registerDocument", {
      settings: settings,
      options: options
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

          // @TODO: it's not enough to preserve order of sparsely selected table cells
          let iRange = 0, iRangeMax = selection.rangeCount, curRange;
          let caNode, scNode, ecNode;
          for (; iRange < iRangeMax; ++iRange) {
            curRange = selection.getRangeAt(iRange);
            caNode = curRange.commonAncestorContainer;
            scNode = curRange.startContainer;
            ecNode = curRange.endContainer;

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

            // Clone nodes from root to common ancestor.
            // (with special handling of text nodes)
            const refNode = (caNode.nodeName === "#text") ? caNode.parentNode : caNode;
            let clonedRefNode = clonedNodeMap.get(refNode);
            if (!clonedRefNode) {
              cloneNodeAndAncestors(refNode);
              clonedRefNode = clonedNodeMap.get(refNode);
            } else {
              // @TODO:
              // Perhaps a similar splitter should be added for any node type,
              // but some tags like <td> require special care.
              if (caNode.nodeName === "#text") {
                clonedRefNode.appendChild(doc.createComment("sb-capture-selected-splitter"));
                clonedRefNode.appendChild(doc.createTextNode(" … "));
                clonedRefNode.appendChild(doc.createComment("/sb-capture-selected-splitter"));
              }
            }

            // Clone sparingly selected nodes in the common ancestor.
            // (with special handling of text nodes)
            clonedRefNode.appendChild(doc.createComment("sb-capture-selected"));
            {
              const iterator = doc.createNodeIterator(refNode, -1);
              let node, started = false;
              while ((node = iterator.nextNode())) {
                if (!started) {
                  // skip nodes before the start container
                  if (node !== scNode) { continue; }

                  // mark started
                  started = true;

                  // handle start container
                  if (node.nodeName === "#text") {
                    const start = curRange.startOffset;
                    const end = (node === ecNode) ? curRange.endOffset : undefined;
                    const text = node.nodeValue.slice(start, end);

                    cloneNodeAndAncestors(node.parentNode);
                    const newParentNode = clonedNodeMap.get(node.parentNode);
                    const textNode = doc.createTextNode(text);
                    newParentNode.appendChild(textNode);
                  } else {
                    cloneNodeAndAncestors(node);
                  }

                  if (node === ecNode) { break; }

                  continue;
                }
                
                if (node === ecNode) {
                  if (node !== scNode) {
                    // handle end container
                    if (node.nodeName === "#text") {
                      const start = 0;
                      const end = curRange.endOffset;
                      const text = node.nodeValue.slice(start, end);

                      cloneNodeAndAncestors(node.parentNode);
                      const newParentNode = clonedNodeMap.get(node.parentNode);
                      const textNode = doc.createTextNode(text);
                      newParentNode.appendChild(textNode);
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
            clonedRefNode.appendChild(doc.createComment("/sb-capture-selected"));
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
      // @TODO: nodes removed during capture process still have resources downloaded
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
              this.list[name] = {used: false, urls: []};
            }

            return this.list[name];
          },

          addUrl(name, url) {
            this.get(name).urls.push(url);
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
          if (css.disabled) { return; }
          if (!css.cssRules) { return; }

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
            // @FIXME:
            // In some browsers (e.g. Chrome), cssRules.styleSheet is null
            // if the document is in file: (maybe others?) scheme.
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

              fontFamilyMapper.use(cssRule.style.fontFamily);

              parseCssText(cssRule.cssText, refUrl, (url) => {
                animationMapper.addUrl(cssRule.parentRule.name, url);
              });
              break;
            }
            // @TODO: this is only supported by Firefox and the API is unstable
            // @TODO: check if this counter-style is really used
            case 11/* CSSRule.COUNTER_STYLE_RULE */: {
              if (!cssRule.symbols) { break; }

              parseCssText(cssRule.symbols, refUrl, (url) => {
                usedCssImageUrl[url] = true;
              });
              break;
            }
            // @TODO: check supported or not
            case CSSRule.SUPPORTS_RULE: {
              if (!cssRule.cssRules) { break; }

              Array.prototype.forEach.call(cssRule.cssRules, (cssRule) => parseCssRule(cssRule, refUrl));
              break;
            }
            // @TODO: this is only supported by Firefox (with -moz-) and the API is unstable
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

        Array.prototype.forEach.call(doc.styleSheets, (css) => parseCss(css, doc.URL));

        Array.prototype.forEach.call(rootNode.querySelectorAll("*"), (elem) => {
          const {style} = elem;

          fontFamilyMapper.use(style.fontFamily);
          animationMapper.use(style.animationName);

          for (let i of style) {
            parseCssText(style.getPropertyValue(i), doc.URL, (url) => {
              usedCssImageUrl[url] = true;
            });
          }
        });

        // collect used font families
        for (let fontFamily in fontFamilyMapper.list) {
          const f = fontFamilyMapper.list[fontFamily];
          if (f.used) {
            for (let url of f.urls) {
              usedCssFontUrl[url] = true;
            }
          }
        }

        // collect used animation background images
        for (let name in animationMapper.list) {
          const f = animationMapper.list[name];
          if (f.used) {
            for (let url of f.urls) {
              usedCssImageUrl[url] = true;
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
        let url = doc.URL.startsWith("data:") ? "data:" : doc.URL;
        rootNode.setAttribute("data-sb-source-" + timeId, url);
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
              refUrl: refUrl,
              settings: settings,
              options: options
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
                let metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
                if (metaRefresh.url) {
                  let url = capturer.resolveRelativeUrl(metaRefresh.url, refUrl);
                  url = rewriteLocalLink(url);
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
                  let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("content"), refUrl);
                  elem.setAttribute("content", rewriteUrl);
                  break;
              }
            }
            break;
          }

          case "link": {
            if (!elem.hasAttribute("href")) { break; }
            elem.setAttribute("href", elem.href);

            // elem.rel == "" if "rel" attribute not defined
            let rels = elem.rel.toLowerCase().split(/[ \t\r\n\v\f]+/);
            if (rels.indexOf("stylesheet") >= 0) {
              // styles: link element
              switch (options["capture.style"]) {
                case "link":
                  // do nothing
                  break;
                case "blank":
                  // HTML 5.1 2nd Edition / W3C Recommendation:
                  // If the href attribute is absent, then the element does not define a link.
                  captureRewriteUri(elem, "href", "about:blank");
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
                        url: elem.href,
                        refUrl: refUrl,
                        rewriteMethod: "processCssFile",
                        settings: settings,
                        options: options
                      }).then((response) => {
                        captureRewriteUri(elem, "href", response.url);
                        return response;
                      });
                      break;
                    case "none":
                    default:
                      tasks[tasks.length] = 
                      capturer.invoke("downloadFile", {
                        url: elem.href,
                        refUrl: refUrl,
                        settings: settings,
                        options: options
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
                  captureRewriteUri(elem, "href", "about:blank");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.href,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "href", response.url);
                    return response;
                  });
                  break;
              }
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
              elem.setAttribute("src", elem.src);
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
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
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
                case "remove":
                  captureRewriteUri(elem, "background", null);
                  break;
                case "save-used":
                case "save":
                default:
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: rewriteUrl,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
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
            frame.setAttribute("src", frame.src);

            // prevent overwriting src
            if (frameSrc.contentWindow) {
              captureRewriteAttr(frame, "srcdoc", null);
            }

            switch (options["capture.frame"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                // HTML 5.1 2nd Edition / W3C Recommendation:
                // The src attribute, if present, must be a valid non-empty URL.
                captureRewriteUri(frame, "src", null);
                break;
              case "remove":
                captureRemoveNode(frame);
                return;
              case "save":
              default:
                let captureFrameCallback = function (response) {
                  isDebug && console.debug("captureFrameCallback", response);
                  if (response) {
                    captureRewriteUri(frame, "src", response.url);
                  } else {
                    captureRewriteUri(frame, "src", null);
                  }
                  return response;
                };

                let frameSettings = JSON.parse(JSON.stringify(settings));
                frameSettings.frameIsMain = false;

                let frameDoc;
                try {
                  frameDoc = frameSrc.contentDocument;
                } catch (ex) {
                  // console.debug(ex);
                }
                if (frameDoc) {
                  // frame document accessible: capture the content document directly
                  tasks[tasks.length] = 
                  capturer.captureDocumentOrFile({
                    doc: frameDoc,
                    refUrl: refUrl,
                    settings: frameSettings,
                    options: options
                  }).then(captureFrameCallback);
                } else if (frameSrc.contentWindow) {
                  // frame document inaccessible: get the content document through a
                  // messaging technique, and then capture it
                  tasks[tasks.length] = 
                  capturer.invoke("captureDocumentOrFile", {
                    refUrl: refUrl,
                    settings: frameSettings,
                    options: options
                  }, {frameWindow: frameSrc.contentWindow}).then(captureFrameCallback);
                } else {
                  // frame window inaccessible: this happens when the document is headlessly captured,
                  // use srcdoc or (headlessly) capture src
                  if (frame.hasAttribute("srcdoc")) {
                    captureRewriteUri(frame, "src", null);
                    break;
                  }

                  let sourceUrl = scrapbook.splitUrlByAnchor(refUrl)[0];
                  let targetUrl = scrapbook.splitUrlByAnchor(frameSrc.src)[0];
                  frameSettings.recurseChain.push(sourceUrl);
                  if (frameSettings.recurseChain.indexOf(targetUrl) === -1) {
                    tasks[tasks.length] = 
                    capturer.invoke("captureUrl", {
                      url: frameSrc.src,
                      refUrl: refUrl,
                      settings: frameSettings,
                      options: options
                    }).then(captureFrameCallback);
                  } else {
                    console.warn(scrapbook.lang("WarnCaptureCyclicRefercing", [sourceUrl, targetUrl]));
                    captureRewriteUri(frame, "src", capturer.getCircularUrl(frameSrc.src, options));
                  }
                }
                break;
            }
            break;
          }

          case "a":
          case "area": {
            if (!elem.hasAttribute("href")) { break; }
            let url = elem.href;

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
                  captureRewriteUri(elem, "href", "javascript:");
                  break;
              }
              break;
            }

            // normal anchor
            url = capturer.resolveRelativeUrl(url, refUrl);
            elem.setAttribute("href", rewriteLocalLink(url));
            break;
          }

          // images: img
          case "img": {
            const elemOrig = origNodeMap.get(elem);

            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", elem.src);
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
                    captureRewriteUri(elem, "src", elemOrig.currentSrc);
                    captureRewriteUri(elem, "srcset", null);
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elem.src,
                      refUrl: refUrl,
                      settings: settings,
                      options: options
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
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
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
                      captureRewriteUri(elem, "src", elemOrig.currentSrc);
                      captureRewriteUri(elem, "srcset", null);
                    }
                  }, this);

                  Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                    captureRemoveNode(elem, options["capture.recordSourceUri"]);
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
              elem.setAttribute("src", elem.src);
            }

            Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
              elem.setAttribute("src", elem.src);
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
                    captureRewriteUri(elem, "src", elemOrig.currentSrc);
                    Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"]);
                    }, this);
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elem.src,
                      refUrl: refUrl,
                      settings: settings,
                      options: options
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
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }

                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
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
              elem.setAttribute("poster", elem.poster);
            }

            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", elem.src);
            }

            Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
              elem.setAttribute("src", elem.src);
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
                      url: elem.poster,
                      refUrl: refUrl,
                      settings: settings,
                      options: options
                    }).then((response) => {
                      captureRewriteUri(elem, "poster", response.url);
                      return response;
                    });
                  }

                  if (elemOrig.currentSrc) {
                    captureRewriteUri(elem, "src", elemOrig.currentSrc);
                    Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                      captureRemoveNode(elem, options["capture.recordSourceUri"]);
                    }, this);
                    tasks[tasks.length] = 
                    capturer.invoke("downloadFile", {
                      url: elem.src,
                      refUrl: refUrl,
                      settings: settings,
                      options: options
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
                    url: elem.poster,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "poster", response.url);
                    return response;
                  });
                }

                if (elem.hasAttribute("src")) {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }

                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
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
              elem.setAttribute("src", elem.src);
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
                    url: elem.src,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    return response;
                  });
                }
                break;
            }
            break;
          }

          // media: embed
          case "object": {
            if (elem.hasAttribute("data")) {
              elem.setAttribute("data", elem.data);
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
                    url: elem.data,
                    refUrl: refUrl,
                    settings: settings,
                    options: options
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
                  captureRewriteUri(elem, "archive", "about:blank");
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
                    refUrl: refUrl,
                    settings: settings,
                    options: options,
                  }).then((response) => {
                    captureRewriteUri(elem, "code", response.url);
                    return response;
                  });
                }

                if (elem.hasAttribute("archive")) {
                  tasks[tasks.length] = 
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("archive"),
                    refUrl: refUrl,
                    settings: settings,
                    options: options,
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
                  elem.setAttribute("src", elem.src);
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
                      url: elem.src,
                      refUrl: refUrl,
                      settings: settings,
                      options: options
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
        sourceUrl: doc.URL,
        documentName: documentName,
        settings: settings,
        options: options,
        data: {
          mime: mime,
          charset: "UTF-8",
          content: content,
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
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (ex) {}
  return relativeUrl;
};

capturer.getErrorUrl = function (sourceUrl, options) {
  if (!options || options["capture.recordErrorUri"]) {
    const prefix = "urn:scrapbook:download:error:";
    if (!sourceUrl.startsWith(prefix)) {
      return prefix + sourceUrl;
    }
  }
  return sourceUrl;
};

capturer.getCircularUrl = function (sourceUrl, options) {
  if (!options || options["capture.recordErrorUri"]) {
    return "urn:scrapbook:download:circular:" + sourceUrl;
  }
  return "about:blank";
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

  const rewritten = scrapbook.parseCssText(cssText, {
    rewriteImportUrl(url) {
      const sourceUrl = capturer.resolveRelativeUrl(url, refUrl);
      let dataUrl = sourceUrl;
      let recordUrl = options["capture.recordSourceUri"] ? sourceUrl : "";
      switch (options["capture.style"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
          dataUrl = "";
          break;
        case "save":
        default:
          dataUrl = downloader.getUrlHash(dataUrl, "processCssFile");
          break;
      }
      return {url: dataUrl, recordUrl};
    },
    rewriteFontFaceUrl(url) {
      const sourceUrl = capturer.resolveRelativeUrl(url, refUrl);
      let dataUrl = sourceUrl;
      let recordUrl = options["capture.recordSourceUri"] ? sourceUrl : "";
      switch (options["capture.font"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
          dataUrl = "";
          break;
        case "save":
        default:
          if (usedCssFontUrl && !usedCssFontUrl[sourceUrl]) {
            dataUrl = "";
            break;
          }

          dataUrl = downloader.getUrlHash(dataUrl);
          break;
      }
      return {url: dataUrl, recordUrl};
    },
    rewriteBackgroundUrl(url) {
      const sourceUrl = capturer.resolveRelativeUrl(url, refUrl);
      let dataUrl = sourceUrl;
      let recordUrl = options["capture.recordSourceUri"] ? sourceUrl : "";
      switch (options["capture.imageBackground"]) {
        case "link":
          // do nothing
          break;
        case "remove":
          dataUrl = "";
          break;
        case "save-used":
        case "save":
        default:
          if (usedCssImageUrl && !usedCssImageUrl[sourceUrl]) {
            dataUrl = "";
            break;
          }

          dataUrl = downloader.getUrlHash(dataUrl);
          break;
      }
      return {url: dataUrl, recordUrl};
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
      url: url,
      newUrl: null,
      rewriteMethod: rewriteMethod
    };
    return "urn:scrapbook:url:" + key;
  }

  startDownloads() {
    return Promise.resolve().then(() => {
      const tasks = Object.keys(this.urlHash).map((key) => {
        return Promise.resolve().then(() => {
          let targetUrl = this.urlHash[key].url;
          if (this.options["capture.saveAs"] === "singleHtml") {
            if (this.settings.recurseChain.indexOf(scrapbook.splitUrlByAnchor(targetUrl)[0]) !== -1) {
              let sourceUrl = this.settings.recurseChain[this.settings.recurseChain.length - 1];
              console.warn(scrapbook.lang("WarnCaptureCyclicRefercing", [sourceUrl, targetUrl]));
              return {url: capturer.getCircularUrl(targetUrl, this.options)};
            }
          }
          return capturer.invoke("downloadFile", {
            url: targetUrl,
            refUrl: this.settings.recurseChain[this.settings.recurseChain.length - 1],
            rewriteMethod: this.urlHash[key].rewriteMethod,
            settings: this.settings,
            options: this.options
          });
        }).then((response) => {
          this.urlHash[key].newUrl = response.url;
          return response;
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
