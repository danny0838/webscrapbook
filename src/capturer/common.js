/********************************************************************
 *
 * The common script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @public {Object} capturer
 *******************************************************************/

var capturer = {};

capturer.isContentScript = true;

/**
 * Invoke an invokable capturer method from another script
 *
 * @return {Promise}
 */
capturer.invoke = function (method, args, tabId, frameWindow) {
  return Promise.resolve().then(() => {
    // to background script
    if (typeof tabId !== "number" && !frameWindow) {
      if (capturer.isContentScript) {
        var cmd = "capturer." + method;
        var message = {
          cmd: cmd,
          args: args
        };

        isDebug && console.debug(cmd, "send to background script", args);
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, resolve);
        }).then((response) => {
          isDebug && console.debug(cmd, "response from background script", response);
          return response;
        });
      } else {
        return capturer[method](args);
      }
    // to content script
    } else if (typeof tabId === "number") {
      if (!capturer.isContentScript) {
        var cmd = "capturer." + method;
        var message = {
          cmd: cmd,
          args: args
        };

        isDebug && console.debug(cmd, "send to content script", "[" + tabId + "]", args);
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, {frameId: 0}, resolve);
        }).then((response) => {
          isDebug && console.debug(cmd, "response from content script", "[" + tabId + "]", response);
          return response;
        });
      } else {
        return capturer[method](args);
      }
    // to frame
    } else if (frameWindow) {
      return new Promise((resolve, reject) => {
        var cmd = "capturer." + method;
        var uid = scrapbook.dateToId();
        var channel = new MessageChannel();
        var timeout = setTimeout(() => {
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
          var message = event.data;
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
    }
  });
};

capturer.fixOptions = function (options) {
  options["capture.dataFolder"] = scrapbook.validateFilename(options["capture.dataFolder"] || "WebScrapBook");
  return options;
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Document} params.doc
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureDocumentOrFile = function (params) {
  return new Promise((resolve, reject) => {
    isDebug && console.debug("call: captureDocumentOrFile");

    var doc = params.doc || document;
    var settings = params.settings;
    var options = params.options;

    // if not HTML document, capture as file
    if (["text/html", "application/xhtml+xml"].indexOf(doc.contentType) === -1) {
      if (!options["capture.saveFileAsHtml"]) {
        capturer.invoke("captureFile", {
          url: doc.URL,
          settings: settings,
          options: options,
          data: {
            title: doc.title
          }
        }).then(resolve);
        return;
      }
    }

    // otherwise, capture as document
    capturer.captureDocument(params).then(resolve);
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Document} params.doc
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureDocument = function (params) {
  return new Promise((resolve, reject) => {
    isDebug && console.debug("call: captureDocument");

    var doc = params.doc || document;
    var settings = params.settings;
    var options = params.options;

    if (doc.readyState === "loading") {
      console.error(scrapbook.lang("ErrorDocumentNotReady", [doc.URL]));
      resolve({error: "document not load"});
      return;
    }

    var captureMain = function () {
      var rewriteLocalLink = function (url) {
        let [urlMain, urlHash] = scrapbook.splitUrlByAnchor(url);

        // This link targets the current page
        if (urlMain === scrapbook.splitUrlByAnchor(doc.URL)[0]) {
          if (urlHash === "" || urlHash === "#") {
            return urlHash;
          }

          // For full capture (no selection), relink to the captured page.
          // For partial capture, the captured page could be incomplete,
          // relink to the captured page only when the target node is included in the selected fragment.
          let hasLocalTarget = !selection;
          if (!hasLocalTarget) {
            let targetId = scrapbook.decodeURIComponent(urlHash.slice(1)).replace(/\W/g, '\\$&');
            if (rootNode.querySelector('[id="' + targetId + '"], a[name="' + targetId + '"]')) {
              hasLocalTarget = true;
            }
          }
          if (hasLocalTarget) {
            return urlHash;
          }
        }

        return url;
      };

      // give certain nodes an unique id for later refrence,
      // since cloned nodes may not have some information
      // e.g. cloned iframes has no content, cloned canvas has no image
      var origRefKey = "data-sb-" + timeId + "-id";
      var origRefNodes = Array.prototype.slice.call(doc.querySelectorAll("frame, iframe, canvas"));
      origRefNodes.forEach((elem, index) => {
        elem.setAttribute(origRefKey, index);
      }, this);

      // construct the node list
      var selection = doc.getSelection();
      {
        if (selection && selection.isCollapsed) { selection = null; }
        if (selection && !options["capture.saveSelectionOnly"]) { selection = null; }
        if (selection) {
          let selNodeTree = []; // @TODO: it's not enough to preserve order of sparsely selected table cells
          for (let iRange = 0, iRangeMax = selection.rangeCount; iRange < iRangeMax; ++iRange) {
            let myRange = selection.getRangeAt(iRange);
            let curNode = myRange.commonAncestorContainer;
            if (curNode.nodeName.toUpperCase() == "HTML") {
              // in some case (e.g. view image) the selection is the html node
              // and will cause subsequent errors.
              // in this case we just process as if there's no selection
              selection = null;
              break;
            }

            if (iRange === 0) {
              rootNode = htmlNode.cloneNode(false);
              headNode = doc.querySelector("head");
              headNode = headNode ? headNode.cloneNode(true) : doc.createElement("head");
              rootNode.appendChild(headNode);
              rootNode.appendChild(doc.createTextNode("\n"));
            }

            if (curNode.nodeName == "#text") { curNode = curNode.parentNode; }

            let tmpNodeList = [];
            do {
              tmpNodeList.unshift(curNode);
              curNode = curNode.parentNode;
            } while (curNode.nodeName.toUpperCase() != "HTML");

            let parentNode = rootNode;
            let branchList = selNodeTree;
            let matchedDepth = -2;
            let iDepth, iDepthLen, iBranch, iBranchLen;
            for(iDepth = 0, iDepthLen = tmpNodeList.length; iDepth < iDepthLen; ++iDepth) {
              for (iBranch = 0, iBranchLen = branchList.length; iBranch < iBranchLen; ++iBranch) {
                if (tmpNodeList[iDepth] === branchList[iBranch].origNode) {
                  matchedDepth = iDepth;
                  break;
                }
              }

              if (iBranch === branchList.length) {
                let clonedNode = tmpNodeList[iDepth].cloneNode(false);
                parentNode.appendChild(clonedNode);
                branchList.push({
                  origNode: tmpNodeList[iDepth],
                  clonedNode: clonedNode,
                  children: []
                });
              }
              parentNode = branchList[iBranch].clonedNode;
              branchList = branchList[iBranch].children;
            }
            if (matchedDepth === tmpNodeList.length - 1) {
              // @TODO:
              // Perhaps a similar splitter should be added for any node type
              // but some tags e.g. <td> require special care
              if (myRange.commonAncestorContainer.nodeName === "#text") {
                parentNode.appendChild(doc.createComment("DOCUMENT_FRAGMENT_SPLITTER"));
                parentNode.appendChild(doc.createTextNode(" … "));
                parentNode.appendChild(doc.createComment("/DOCUMENT_FRAGMENT_SPLITTER"));
              }
            }
            parentNode.appendChild(doc.createComment("DOCUMENT_FRAGMENT"));
            parentNode.appendChild(myRange.cloneContents());
            parentNode.appendChild(doc.createComment("/DOCUMENT_FRAGMENT"));
          }
        }
        if (!selection) {
          rootNode = htmlNode.cloneNode(true);
          headNode = rootNode.querySelector("head");
          if (!headNode) {
            headNode = doc.createElement("head");
            rootNode.insertBefore(headNode, rootNode.firstChild);
          }
        }

        // add linefeeds to head and body to improve layout
        let headNodeBefore = headNode.previousSibling;
        if (!headNodeBefore || headNodeBefore.nodeType != 3) {
          rootNode.insertBefore(doc.createTextNode("\n"), headNode);
        }
        let headNodeStart = headNode.firstChild;
        if (!headNodeStart || headNodeStart.nodeType != 3) {
          headNode.insertBefore(doc.createTextNode("\n"), headNodeStart);
        }
        let headNodeEnd = headNode.lastChild;
        if (!headNodeEnd || headNodeEnd.nodeType != 3) {
          headNode.appendChild(doc.createTextNode("\n"));
        }
        let headNodeAfter = headNode.nextSibling;
        if (!headNodeAfter || headNodeAfter.nodeType != 3) {
          rootNode.insertBefore(doc.createTextNode("\n"), headNodeAfter);
        }
        let bodyNode = rootNode.querySelector("body");
        if (bodyNode) {
          let bodyNodeAfter = bodyNode.nextSibling;
          if (!bodyNodeAfter) {
            rootNode.insertBefore(doc.createTextNode("\n"), bodyNodeAfter);
          }
        }
      }

      // record source URL
      if (options["capture.recordDocumentMeta"]) {
        let url = doc.URL.startsWith("data:") ? "data:" : doc.URL;
        rootNode.setAttribute("data-sb-" + timeId + "-source", url);
      }

      // remove the temporary map key
      origRefNodes.forEach((elem) => { elem.removeAttribute(origRefKey); }, this);

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
            remainingTasks++;
            capturer.invoke("downloadFile", {
              url: settings.favIconUrl,
              settings: settings,
              options: options
            }).then((response) => {
              favIconUrl = response.url;
              remainingTasks--;
              captureCheckDone();
            });
            break;
        }
      }

      // inspect nodes
      var metaCharsetNode;
      Array.prototype.forEach.call(rootNode.querySelectorAll("*"), (elem) => {
        // skip elements that are already removed from the DOM tree
        if (!elem.parentNode) { return; }

        switch (elem.nodeName.toLowerCase()) {
          case "base": {
            if (!elem.hasAttribute("href")) { break; }
            elem.setAttribute("href", elem.href);

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
            // force UTF-8
            if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content")) {
              if (elem.getAttribute("http-equiv").toLowerCase() == "content-type") {
                metaCharsetNode = elem;
                captureRewriteAttr(elem, "content", "text/html; charset=UTF-8");
              } else if (elem.getAttribute("http-equiv").toLowerCase() == "refresh") {
                let metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
                if (metaRefresh.url) {
                  let url = capturer.resolveRelativeUrl(metaRefresh.url, doc.URL);
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
                  let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("content"), doc.URL);
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
                  captureRewriteAttr(elem, "href", "about:blank");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  switch (options["capture.rewriteCss"]) {
                    case "url":
                      remainingTasks++;
                      capturer.invoke("downloadFile", {
                        url: elem.href,
                        rewriteMethod: "processCssFile",
                        settings: settings,
                        options: options
                      }).then((response) => {
                        captureRewriteUri(elem, "href", response.url);
                        remainingTasks--;
                        captureCheckDone();
                      });
                      break;
                    case "none":
                    default:
                      remainingTasks++;
                      capturer.invoke("downloadFile", {
                        url: elem.href,
                        settings: settings,
                        options: options
                      }).then((response) => {
                        captureRewriteUri(elem, "href", response.url);
                        remainingTasks--;
                        captureCheckDone();
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
                  captureRewriteUri(elem, "href", "about:blank");
                  break;
                case "remove":
                  captureRemoveNode(elem);
                  return;
                case "save":
                default:
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.href,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "href", response.url);
                    remainingTasks--;
                    captureCheckDone();
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
                captureRewriteTextContent(elem, null);
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              case "link":
              default:
                switch (options["capture.rewriteCss"]) {
                  case "url":
                    remainingTasks++;
                    let downloader = new capturer.ComplexUrlDownloader(settings, options, doc.URL);
                    let rewriteCss = capturer.ProcessCssFileText(elem.textContent, doc.URL, downloader, options);
                    downloader.startDownloads().then(() => {
                      elem.textContent = downloader.finalRewrite(rewriteCss);
                      remainingTasks--;
                      captureCheckDone();
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
                if (elem.hasAttribute("src")) {
                  captureRewriteUri(elem, "src", "about:blank");
                }
                captureRewriteTextContent(elem, null);
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("src")) {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    remainingTasks--;
                    captureCheckDone();
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
                captureRewriteTextContent(elem, null);
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

          case "body":
          case "table":
          case "tr":
          case "th":
          case "td": {
            // deprecated: background attribute (deprecated since HTML5)
            if (elem.hasAttribute("background")) {
              let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("background"), doc.URL);
              elem.setAttribute("background", rewriteUrl);

              switch (options["capture.imageBackground"]) {
                case "link":
                  // do nothing
                  break;
                case "remove":
                  captureRewriteAttr(elem, "background", null);
                  break;
                case "save":
                default:
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: rewriteUrl,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "background", response.url);
                    remainingTasks--;
                    captureCheckDone();
                  });
                  break;
              }
            }
            break;
          }

          case "frame":
          case "iframe": {
            let frame = elem;
            let frameSrc = origRefNodes[frame.getAttribute(origRefKey)];
            frame.removeAttribute(origRefKey);
            frame.setAttribute("src", frame.src);
            if (frameSrc.contentWindow) {
              captureRewriteAttr(frame, "srcdoc", null); // prevent src being overwritten
            }

            switch (options["capture.frame"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                captureRewriteUri(frame, "src", "about:blank");
                break;
              case "remove":
                captureRemoveNode(frame);
                return;
              case "save":
              default:
                let captureFrameCallback = function (result) {
                  isDebug && console.debug("captureFrameCallback", result);
                  if (result) {
                    captureRewriteUri(frame, "src", result.url);
                  } else {
                    captureRewriteAttr(frame, "src", null);
                  }
                  remainingTasks--;
                  captureCheckDone();
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
                  remainingTasks++;
                  capturer.captureDocumentOrFile({
                    doc: frameDoc, 
                    settings: frameSettings,
                    options: options
                  }).then(captureFrameCallback);
                } else if (frameSrc.contentWindow) {
                  // frame document inaccessible: get the content document through a messaging technique, and then capture it
                  remainingTasks++;
                  capturer.invoke("captureDocumentOrFile", {
                    settings: frameSettings,
                    options: options
                  }, null, frameSrc.contentWindow).then(captureFrameCallback);
                } else {
                  // frame window inaccessible: this happens when the document is retrieved via AJAX
                  if (!frame.hasAttribute("srcdoc")) {
                    let sourceUrl = scrapbook.splitUrlByAnchor(doc.URL)[0];
                    let targetUrl = scrapbook.splitUrlByAnchor(frameSrc.src)[0];
                    frameSettings.recurseChain.push(sourceUrl);
                    if (frameSettings.recurseChain.indexOf(targetUrl) === -1) {
                      remainingTasks++;
                      capturer.invoke("captureUrl", {
                        settings: frameSettings,
                        options: options,
                        url: frameSrc.src
                      }).then(captureFrameCallback);
                    } else {
                      console.warn(scrapbook.lang("WarnCaptureCyclicRefercing", [sourceUrl, targetUrl]));
                      captureRewriteAttr(frame, "src", capturer.getCircularUrl(frameSrc.src, options));
                    }
                  } else {
                    captureRewriteAttr(frame, "src", null);
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
              switch (options["capture.scriptAnchor"]) {
                case "save":
                  // do nothing
                  break;
                case "blank":
                  captureRewriteAttr(elem, "href", "javascript:");
                  break;
                case "remove":
                default:
                  captureRewriteAttr(elem, "href", null);
                  break;
              }
              break;
            }

            // normal anchor
            url = capturer.resolveRelativeUrl(url, doc.URL);
            elem.setAttribute("href", rewriteLocalLink(url));
            break;
          }

          // images: img
          case "img": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", elem.src);
            }
            if (elem.hasAttribute("srcset")) {
              elem.setAttribute("srcset",
                scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                  return capturer.resolveRelativeUrl(url, doc.URL);
                })
              );
            }

            switch (options["capture.image"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                if (elem.hasAttribute("src")) {
                  captureRewriteUri(elem, "src", "about:blank");
                }
                if (elem.hasAttribute("srcset")) {
                  captureRewriteAttr(elem, "srcset", null);
                }
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("src")) {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    remainingTasks--;
                    captureCheckDone();
                  });
                }
                if (elem.hasAttribute("srcset")) {
                  remainingTasks++;
                  let downloader = new capturer.ComplexUrlDownloader(settings, options);
                  let rewriteUrl = scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                    return downloader.getUrlHash(url);
                  });
                  downloader.startDownloads().then(() => {
                    elem.setAttribute("srcset", downloader.finalRewrite(rewriteUrl));
                    remainingTasks--;
                    captureCheckDone();
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
                  return capturer.resolveRelativeUrl(url, doc.URL);
                })
              );
            }, this);

            switch (options["capture.image"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                  captureRewriteAttr(elem, "srcset", null);
                }, this);
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                Array.prototype.forEach.call(elem.querySelectorAll('source[srcset]'), (elem) => {
                  remainingTasks++;
                  let downloader = new capturer.ComplexUrlDownloader(settings, options);
                  let rewriteUrl = scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                    return downloader.getUrlHash(url);
                  }, this);
                  downloader.startDownloads().then(() => {
                    elem.setAttribute("srcset", downloader.finalRewrite(rewriteUrl));
                    remainingTasks--;
                    captureCheckDone();
                  });
                }, this);
                break;
            }
            break;
          }

          // media: audio
          case "audio": {
            Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
              elem.setAttribute("src", elem.src);
            }, this);

            switch (options["capture.audio"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  captureRewriteUri(elem, "src", "about:blank");
                }, this);
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    remainingTasks--;
                    captureCheckDone();
                  });
                }, this);
                break;
            }
            break;
          }

          // media: video
          case "video": {
            Array.prototype.forEach.call(elem.querySelectorAll('source[src], track[src]'), (elem) => {
              elem.setAttribute("src", elem.src);
            }, this);

            switch (options["capture.video"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  captureRewriteUri(elem, "src", "about:blank");
                }, this);
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                Array.prototype.forEach.call(elem.querySelectorAll('source[src]'), (elem) => {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    remainingTasks--;
                    captureCheckDone();
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
                if (elem.hasAttribute("src")) {
                  captureRewriteUri(elem, "src", "about:blank");
                }
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("src")) {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.src,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "src", response.url);
                    remainingTasks--;
                    captureCheckDone();
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
                if (elem.hasAttribute("data")) {
                  captureRewriteUri(elem, "data", "about:blank");
                }
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("data")) {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.data,
                    settings: settings,
                    options: options
                  }).then((response) => {
                    captureRewriteUri(elem, "data", response.url);
                    remainingTasks--;
                    captureCheckDone();
                  });
                }
                break;
            }
            break;
          }

          // media: applet
          case "applet": {
            if (elem.hasAttribute("archive")) {
              let rewriteUrl = capturer.resolveRelativeUrl(elem.getAttribute("archive"), doc.URL);
              elem.setAttribute("archive", rewriteUrl);
            }

            switch (options["capture.applet"]) {
              case "link":
                // do nothing
                break;
              case "blank":
                if (elem.hasAttribute("archive")) {
                  captureRewriteUri(elem, "archive", "about:blank");
                }
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
                if (elem.hasAttribute("archive")) {
                  remainingTasks++;
                  capturer.invoke("downloadFile", {
                    url: elem.getAttribute("archive"),
                    settings: settings,
                    options: options,
                  }).then((response) => {
                    captureRewriteUri(elem, "archive", response.url);
                    remainingTasks--;
                    captureCheckDone();
                  });
                }
                break;
            }
            break;
          }

          // media: canvas
          case "canvas": {
            let canvasOrig = origRefNodes[elem.getAttribute(origRefKey)];
            elem.removeAttribute(origRefKey);

            switch (options["capture.canvas"]) {
              case "blank":
                // do nothing
                break;
              case "remove":
                captureRemoveNode(elem);
                return;
              case "save":
              default:
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
            switch (elem.type.toLowerCase()) {
              // images: input
              case "image":
                if (elem.hasAttribute("src")) {
                  elem.setAttribute("src", elem.src);
                }
                switch (options["capture.image"]) {
                  case "link":
                    // do nothing
                    break;
                  case "blank":
                    captureRewriteUri(elem, "src", "about:blank");
                    break;
                  case "remove":
                    captureRemoveNode(elem);
                    return;
                  case "save":
                  default:
                    remainingTasks++;
                    capturer.invoke("downloadFile", {
                      url: elem.src,
                      settings: settings,
                      options: options
                    }).then((response) => {
                      captureRewriteUri(elem, "src", response.url);
                      remainingTasks--;
                      captureCheckDone();
                    });
                    break;
                }
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
                  remainingTasks++;
                  let downloader = new capturer.ComplexUrlDownloader(settings, options, doc.URL);
                  let rewriteCss = capturer.ProcessCssFileText(elem.getAttribute("style"), doc.URL, downloader, options);
                  downloader.startDownloads().then(() => {
                    elem.setAttribute("style", downloader.finalRewrite(rewriteCss));
                    remainingTasks--;
                    captureCheckDone();
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
        switch (options["capture.scriptAttr"]) {
          case "save":
            // do nothing
            break;
          case "remove":
          default:
            Array.prototype.forEach.call(elem.attributes, (attr) => {
              if (attr.name.toLowerCase().startsWith("on")) {
                captureRewriteAttr(elem, attr.name, null);
              }
            }, this);
        }

        // handle integrity
        // We have to remove integrity check because we could modify the content
        // and they might not work correctly in the offline environment.
        if ( options["capture.removeIntegrity"] ) {
          captureRewriteAttr(elem, "integrity", null);
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

      // create favicon node if none
      if (favIconUrl && !favIconNode) {
        let frag = doc.createDocumentFragment();
        favIconNode = doc.createElement("link");
        favIconNode.rel = "shortcut icon";
        frag.appendChild(favIconNode);
        frag.appendChild(doc.createTextNode("\n"));
        headNode.appendChild(frag);
      }

      // captureCheckDone calls before here should be nullified
      // since the document parsing is not finished yet at that moment
      captureCheckDone = function () {
        if (remainingTasks <= 0) {
          captureDone();
        }
      };

      // the document parsing is finished, finalize the document 
      // if there is no pending downloads now
      captureCheckDone();
    };

    var captureCheckDone = function () {};

    var captureDone = function () {
      // manage favicon
      if (favIconUrl && favIconNode) {
        favIconNode.href = favIconUrl;
      }

      // save document
      var content = scrapbook.doctypeToString(doc.doctype) + rootNode.outerHTML;
      capturer.invoke("saveDocument", {
        sourceUrl: doc.URL,
        documentName: documentName,
        settings: settings,
        options: options,
        data: {
          mime: mime,
          charset: "UTF-8",
          content: content,
          title: doc.title
        }
      }).then(resolve);
    };

    // remove the specified node, record it if option set
    var captureRemoveNode = function (elem) {
      if (options["capture.recordRemovedNode"]) {
        elem.parentNode.replaceChild(doc.createComment("sb-" + timeId + "-orig-node--" + scrapbook.escapeHtmlComment(elem.outerHTML)), elem);
      }
      else {
        elem.parentNode.removeChild(elem);
      }
    };

    // rewrite (or remove if value is null/undefined) the specified attr, record it if option set
    var captureRewriteAttr = function (elem, attr, value) {
      if (!elem.hasAttribute(attr)) return;
      if (options["capture.recordRewrittenAttr"]) {
        elem.setAttribute("data-sb-" + timeId + "-orig-" + attr, elem.getAttribute(attr));
      }
      if (value === null || value === undefined) {
        elem.removeAttribute(attr);
      } else {
        elem.setAttribute(attr, value);
      }
    };

    // rewrite (or remove if value is null/undefined) the textContent, record it if option set
    var captureRewriteTextContent = function (elem, value) {
      if (!elem.textContent) return;
      if (options["capture.recordRewrittenAttr"]) {
        elem.setAttribute("data-sb-" + timeId + "-orig-textContent", elem.textContent);
      }
      if (value === null || value === undefined) {
        elem.textContent = "";
      } else {
        elem.textContent = value;
      }
    };

    // similar to captureRewriteAttr, but use option capture.recordSourceUri
    var captureRewriteUri = function (elem, attr, value) {
      if (!elem.hasAttribute(attr)) return;
      if (options["capture.recordSourceUri"]) {
        elem.setAttribute("data-sb-" + timeId + "-orig-" + attr, elem.getAttribute(attr));
      }
      if (value === null || value === undefined) {
        elem.removeAttribute(attr);
      } else {
        elem.setAttribute(attr, value);
      }
    };

    var getCanvasDataScript = function (canvas) {
      let data = canvas.toDataURL();
      let dataScript = function (data) {
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

    var remainingTasks = 0;
    var timeId = settings.timeId;
    var mime = doc.contentType;
    var documentName = settings.documentName;
    var htmlNode = doc.documentElement;
    var rootNode;
    var headNode;
    var favIconNode;
    var favIconUrl;

    capturer.invoke("registerDocument", {
      settings: settings,
      options: options
    }).then((response) => {
      documentName = response.documentName;
      captureMain();
    });
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
    var prefix = "urn:scrapbook:download:error:";
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
 * Rewrite a downloaded CSS file
 *
 * @return {Promise}
 */
capturer.processCssFile = function (params) {
  return Promise.resolve().then(() => {
    var {data, charset, url: refUrl} = params;

    return scrapbook.parseCssFile(data, charset, (text) => {
      var downloader = new capturer.ComplexUrlDownloader(params.settings, params.options, refUrl);
      var rewriteCss = capturer.ProcessCssFileText(text, refUrl, downloader, params.options);
      return downloader.startDownloads().then(() => {
        return downloader.finalRewrite(rewriteCss);
      });
    });
  });
};

/**
 * process the CSS text of whole <style> or a CSS file
 */
capturer.ProcessCssFileText = function (cssText, refUrl, downloader, options) {
  return scrapbook.parseCssText(cssText, {
    rewriteImportUrl: function (url) {
      var dataUrl = capturer.resolveRelativeUrl(url, refUrl);
      switch (options["capture.style"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
          dataUrl = "about:blank";
          return;
        case "save":
        default:
          dataUrl = downloader.getUrlHash(dataUrl, "processCssFile");
          break;
      }
      return dataUrl;
    },
    rewriteFontFaceUrl: function (url) {
      var dataUrl = capturer.resolveRelativeUrl(url, refUrl);
      switch (options["capture.font"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
          dataUrl = "about:blank";
          break;
        case "save":
        default:
          dataUrl = downloader.getUrlHash(dataUrl);
          break;
      }
      return dataUrl;
    },
    rewriteBackgroundUrl: function (url) {
      var dataUrl = capturer.resolveRelativeUrl(url, refUrl);
      switch (options["capture.imageBackground"]) {
        case "link":
          // do nothing
          break;
        case "remove":
          dataUrl = "about:blank";
          break;
        case "save":
        default:
          dataUrl = downloader.getUrlHash(dataUrl);
          break;
      }
      return dataUrl;
    }
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
      this.settings.recurseChain.push(scrapbook.splitUrlByAnchor(refUrl)[0]);
    }
  }

  getUrlHash(url, rewriteMethod) {
    var key = scrapbook.getUuid();
    this.urlHash[key] = {
      url: url,
      newUrl: null,
      rewriteMethod: rewriteMethod
    };
    return "urn:scrapbook:url:" + key;
  }

  startDownloads() {
    return Promise.resolve().then(() => {
      var tasks = Object.keys(this.urlHash).map((key) => {
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
