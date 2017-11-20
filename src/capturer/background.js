/********************************************************************
 *
 * The background script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 *******************************************************************/

capturer.isContentScript = false;

capturer.defaultFilesSet = new Set(["index.rdf", "index.dat"]);

/**
 * @type {Map<string~timeId, {files: Set<string>, accessMap: Map<string, Promise>, zip: JSZip}>}
 */
capturer.captureInfo = new Map();

/**
 * @type {Map<string~downloadId, {timeId: string, src: string, autoErase: boolean, onComplete: function, onError: function}>}
 */
capturer.downloadInfo = new Map();

/**
 * @kind invokable
 * @param {Object} params
 *     - {tabId} params.tabId
 *     - {string} params.action
 * @return {Promise}
 */
capturer.browserActionSetError = function (params) {
  return Promise.resolve().then(() => {
    const {tabId = -1, action} = params;

    if (!arguments.callee.errors) { arguments.callee.errors = []; }
    let errors;
    switch (action) {
      case "add":
        errors = arguments.callee.errors[tabId] += 1;
        break;
      case "reset":
      default:
        errors = arguments.callee.errors[tabId] = 0;
        break;
    }

    if (chrome.browserAction) {
      // supported since Firefox Android >= 55
      if (chrome.browserAction.setTitle) {
        chrome.browserAction.setTitle({
          tabId: tabId !== -1 ? tabId : undefined,
          title: scrapbook.lang("ExtensionName") + (errors ? " (" + errors + ")" : ""),
        });
      }

      // Firefox Android not supported
      if (chrome.browserAction.setBadgeText) {
        chrome.browserAction.setBadgeText({
          tabId: tabId !== -1 ? tabId : undefined,
          text: errors ? errors.toString() : "",
        });
      }
    }
  });
};

/**
 * Gets a unique token for an access,
 * to be used in capturer.captureInfo.get(timeId).accessMap
 *
 * @param {string} method - The rewrite method name of how the URL is used
 *     (i.e. as embedded file, as stylesheet, or as (headless) document).
 */
capturer.getAccessToken = function (url, method) {
  let token = scrapbook.splitUrlByAnchor(url)[0] + "\t" + (method || "");
  token = scrapbook.sha1(token, "TEXT");
  return token;
};

/**
 * Prevent filename conflict. Appends a number if the given filename is used.
 *
 * Filename and path limitation:
 * - Windows API: filepath limited to 260 UTF-16 chars
 * - ext4: filename limited to 255 UTF-8 bytes
 *
 * @param {string} timeId
 * @param {string} filename - A validated filename (via scrapbook.validateFilename).
 * @return {string} The uniquified filename.
 */
capturer.getUniqueFilename = function (timeId, filename) {
  if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
  const files = capturer.captureInfo.get(timeId).files = capturer.captureInfo.get(timeId).files || new Set(capturer.defaultFilesSet);

  let newFilename = filename || "untitled";
  let [newFilenameBase, newFilenameExt] = scrapbook.filenameParts(newFilename);
  newFilenameBase = scrapbook.crop(newFilenameBase, 128, 240);
  newFilenameExt = newFilenameExt ? "." + newFilenameExt : "";
  newFilename = newFilenameBase + newFilenameExt;
  let newFilenameCI = newFilename.toLowerCase();
  let count = 0;
  while (files.has(newFilenameCI)) {
    newFilename = newFilenameBase + "-" + (++count) + newFilenameExt;
    newFilenameCI = newFilename.toLowerCase(); 
  }
  files.add(newFilenameCI);
  return newFilename;
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.mode
 * @return {Promise}
 */
capturer.captureActiveTab = function (params) {
  return Promise.resolve().then(() => {
    const {mode} = params;

    return browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
      return capturer.captureTab({tab: tabs[0], mode});
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.mode
 * @return {Promise}
 */
capturer.captureAllTabs = function (params) {
  return Promise.resolve().then(() => {
    const {mode} = params;

    return capturer.getContentTabs().then((tabs) => {
      let p = Promise.resolve();
      tabs.forEach((tab) => {
        const {id: tabId, url} = tab;
        const source = `[${tabId}] ${url}`;
        p = p.then(() => {
          return scrapbook.delay(5);
        }).then(() => {
          // throws if the tab has been closed
          return browser.tabs.get(tabId);
        }).then(() => {
          return capturer.captureTab({tab, mode});
        }).catch((ex) => {
          const err = scrapbook.lang("ErrorCapture", [source, ex.message]);
          console.error(err);
          capturer.browserActionSetError({action: "add"});
          return {message: err};
        });
      });
      return p;
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Tab} params.tab
 *     - {integer} params.frameId
 *     - {boolean} params.saveBeyondSelection
 *     - {string} params.mode
 * @return {Promise}
 */
capturer.captureTab = function (params) {
  return Promise.resolve().then(() => {
    const {tab, frameId, saveBeyondSelection, mode} = params;
    const {id: tabId, url, title, favIconUrl} = tab;

    // redirect headless capture
    // if frameId not provided, use current tab title and favIcon
    if (mode === "bookmark" || mode === "source") {
      return Promise.resolve().then(() => {
        if (typeof frameId === "undefined") { return {url, title, favIconUrl}; }
        return browser.webNavigation.getFrame({tabId, frameId});
      }).then((details) => {
        const {url, title, favIconUrl} = details;
        return capturer.captureHeadless({url, title, favIconUrl, mode});
      });
    }

    const source = `[${tabId}] ${url}`;
    const timeId = scrapbook.dateToId();
    const message = {
      settings: {
        timeId,
        frameIsMain: true,
        documentName: "index",
        recurseChain: [],
        favIconUrl,
      },
      options: scrapbook.getOptions("capture"),
    };

    // save whole page beyond selection?
    message.options["capture.saveBeyondSelection"] = !!saveBeyondSelection;

    return Promise.resolve().then(() => {
      // Simply detect the main frame and executeScript for allFrames doesn't
      // work since it's possible that only partial frames have the content
      // script loaded. E.g. the user ran this when the main frame hadn't been
      // completed and some subframes hadn't been loaded.
      isDebug && console.debug("(main) send", source, message);
      return browser.webNavigation.getAllFrames({tabId}).then((details) => {
        const tasks = [];
        details.forEach((detail) => {
          const {frameId, url} = detail;
          if (!scrapbook.isContentPage(url)) { return; }

          // Send a test message to check whether content script is loaded.
          // If no content script, we get an error saying connection cannot be established.
          tasks[tasks.length] = capturer.invoke("isScriptLoaded", null, {tabId, frameId}).catch((ex) => {
            isDebug && console.debug("inject content scripts", tabId, frameId, url);
            return browser.tabs.executeScript(tabId, {frameId, file: "core/polyfill.js"}).then((result) => {
              return browser.tabs.executeScript(tabId, {frameId, file: "core/common.js"});
            }).then((result) => {
              return browser.tabs.executeScript(tabId, {frameId, file: "capturer/common.js"});
            }).then((result) => {
              return browser.tabs.executeScript(tabId, {frameId, file: "capturer/content.js"});
            }).catch((ex) => {
              // Chrome may be failed to inject content script to some pages due to unclear reason.
              // Record the error and pass.
              const source = `[${tabId}:${frameId}] ${url}`;
              const err = scrapbook.lang("ErrorContentScriptExecute", [source, ex.message]);
              console.error(err);
            });
          });
        });
        return Promise.all(tasks);
      }).then(() => {
        return capturer.invoke("captureDocumentOrFile", message, {tabId, frameId});
      });
    }).then((response) => {
      isDebug && console.debug("(main) response", source, response);
      capturer.captureInfo.delete(timeId);
      if (response.error) { throw new Error(response.error.message); }
      return response;
    });
  }).catch((ex) => {
    const err = scrapbook.lang("ErrorCapture", [source, ex.message]);
    console.error(err);
    capturer.browserActionSetError({action: "add"});
    return {message: err};
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.title
 *     - {string} params.favIconUrl
 *     - {string} params.mode
 * @return {Promise}
 */
capturer.captureHeadless = function (params) {
  return Promise.resolve().then(() => {
    const {url, refUrl, title, favIconUrl, mode} = params;

    const source = `${url}`;
    const timeId = scrapbook.dateToId();
    const message = {
      url,
      refUrl,
      title,
      settings: {
        timeId,
        isHeadless: true,
        frameIsMain: true,
        documentName: "index",
        recurseChain: [],
        favIconUrl,
      },
      options: scrapbook.getOptions("capture"),
    };

    return Promise.resolve().then(() => {
      isDebug && console.debug("(main) capture", source, message);
      switch (mode) {
        case "bookmark":
          return capturer.captureBookmark(message);
        case "source":
        default:
          return capturer.captureUrl(message);
      }
    }).then((response) => {
      isDebug && console.debug("(main) response", source, response);
      capturer.captureInfo.delete(timeId);
      if (response.error) { throw new Error(response.error.message); }
      return response;
    });
  }).catch((ex) => {
    const err = scrapbook.lang("ErrorCapture", [source, ex.message]);
    console.error(err);
    capturer.browserActionSetError({action: "add"});
    return {message: err};
  });
};

// @FIXME
// When run in a Firefox private window, the background script does not have same
// crenditials as the private window document, and the capture may fail or go wrong.
/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.title
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureUrl = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureUrl", params);

    const {url: sourceUrl, refUrl, title, settings, options} = params;
    const [sourceUrlMain] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    const headers = {};

    // init access check
    if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
    const accessMap = capturer.captureInfo.get(timeId).accessMap = capturer.captureInfo.get(timeId).accessMap || new Map();

    // check for previous access
    const rewriteMethod = "captureUrl";
    const accessToken = capturer.getAccessToken(sourceUrlMain, rewriteMethod);
    const accessPrevious = accessMap.get(accessToken);
    if (accessPrevious) { return accessPrevious; }

    // cannot assign "referer" header directly
    // the prefix will be removed by the onBeforeSendHeaders listener
    const requestHeaders = {};
    if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

    let accessPreviousRedirected;
    const accessCurrent = scrapbook.xhr({
      url: sourceUrl.startsWith("data:") ? scrapbook.splitUrlByAnchor(sourceUrl)[0] : sourceUrl,
      responseType: "document",
      requestHeaders,
      onreadystatechange(xhr) {
        if (xhr.readyState !== 2) { return; }

        // check for previous access if redirected
        const [responseUrlMain] = scrapbook.splitUrlByAnchor(xhr.responseURL);
        if (responseUrlMain !== sourceUrlMain) {
          const accessTokenRedirected = capturer.getAccessToken(responseUrlMain, rewriteMethod);
          accessPreviousRedirected = accessMap.get(accessTokenRedirected);

          // use the previous access if found
          if (accessPreviousRedirected) {
            xhr.abort();
            return;
          }

          accessMap.set(accessTokenRedirected, accessPreviousRedirected);
        }

        // get headers
        if (xhr.status !== 0) {
          const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
          if (headerContentDisposition) {
            const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
            headers.isAttachment = (contentDisposition.type === "attachment");
            headers.filename = contentDisposition.parameters.filename;
          }
          const headerContentType = xhr.getResponseHeader("Content-Type");
          if (headerContentType) {
            const contentType = scrapbook.parseHeaderContentType(headerContentType);
            headers.contentType = contentType.type;
            headers.charset = contentType.parameters.charset;
          }
        }

        // generate a documentName if not specified
        if (!params.settings.documentName) {
          // use the filename if it has been defined by header Content-Disposition
          let filename = headers.filename ||
              sourceUrl.startsWith("data:") ?
                  scrapbook.dataUriToFile(scrapbook.splitUrlByAnchor(sourceUrl)[0]).name :
                  scrapbook.urlToFilename(sourceUrl);

          let mime = headers.contentType || Mime.prototype.lookup(filename) || "text/html";
          let fn = filename.toLowerCase();
          if (["text/html", "application/xhtml+xml"].indexOf(mime) !== -1) {
            let exts = Mime.prototype.allExtensions(mime);
            for (let i = 0, I = exts.length; i < I; i++) {
              let ext = ("." + exts[i]).toLowerCase();
              if (fn.endsWith(ext)) {
                filename = filename.slice(0, -ext.length);
                break;
              }
            }
          }

          params.settings.documentName = filename;
        }
      },
    }).then((xhr) => {
      // Request aborted, only when a previous access is found.
      // Return that Promise.
      if (!xhr) { return accessPreviousRedirected; }

      const doc = xhr.response;
      if (doc) {
        return capturer.captureDocumentOrFile({
          doc,
          refUrl,
          title,
          settings,
          options,
        });
      } else {
        return capturer.captureFile({
          url: sourceUrl,
          refUrl,
          title,
          settings: params.settings,
          options: params.options,
        });
      }
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });

    accessMap.set(accessToken, accessCurrent);
    return accessCurrent;
  });
};

// @FIXME
// When run in a Firefox private window, the background script does not have same
// crenditials as the private window document, and the capture may fail or go wrong.
/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.title
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureBookmark = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureBookmark", params);

    const {url: sourceUrl, refUrl, settings, options} = params;
    const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    let {title} = params;
    let {favIconUrl} = settings;

    // cannot assign "referer" header directly
    // the prefix will be removed by the onBeforeSendHeaders listener
    const requestHeaders = {};
    if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

    return Promise.resolve().then(() => {
      // get title and favIcon
      if (title && favIconUrl) { return; }

      return scrapbook.xhr({
        url: sourceUrl.startsWith("data:") ? scrapbook.splitUrlByAnchor(sourceUrl)[0] : sourceUrl,
        responseType: "document",
        requestHeaders,
      }).then((xhr) => {
        return xhr.response;
      }).then((doc) => {
        // specified sourceUrl is not a document, maybe a malformed xhtml?
        if (!doc) { return; }

        // use the document title if not provided
        if (!title) {
          title = doc.title;
        }

        // use the document favIcon if not provided
        if (!favIconUrl) {
          // "rel" is matched case-insensitively
          // The "~=" selector checks for "icon" separated by space,
          // not including "-icon" or "_icon".
          let elem = doc.querySelector('link[rel~="icon"][href]');
          if (elem) {
            favIconUrl = elem.href;
          }
        }
      }).catch((ex) => {
        console.error(ex);
      });
    }).then(() => {
      const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(sourceUrl) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="bookmark"' : 
          "";
      const titleElem = title ? `<title>${scrapbook.escapeHtml(title, false)}</title>\n` : "";
      const favIconElem = favIconUrl ? `<link rel="shortcut icon" href="${favIconUrl}">` : "";
      const html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(sourceUrl)}">
${titleElem}${favIconElem}</head>
<body>
Bookmark for <a href="${scrapbook.escapeHtml(sourceUrl)}">${scrapbook.escapeHtml(sourceUrl, false)}</a>
</body>
</html>`;
      return html;
    }).then((html) => {
      const ext = ".htm";
      let targetDir;
      let filename;
      let savePrompt;
      if (options["capture.saveInScrapbook"]) {
        targetDir = options["capture.scrapbookFolder"] + "/data";
        filename = timeId + ext;
        savePrompt = false;
      } else {
        targetDir = "";
        filename = (title ? title : scrapbook.urlToFilename(sourceUrl));
        filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
        if (!filename.endsWith(ext)) { filename += ext; }
        savePrompt = true;
      }

      return capturer.saveBlob({
        timeId,
        blob: new Blob([html], {type: "text/html"}),
        directory: targetDir,
        filename,
        sourceUrl,
        autoErase: false,
        savePrompt,
      }).then((filename) => {
        return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
      });
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.title
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureFile = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureFile", params);

    const {url: sourceUrl, refUrl, title, settings, options} = params;
    const {timeId} = settings;

    return capturer.downloadFile({
      url: sourceUrl,
      refUrl,
      settings,
      options,
    }).then((response) => {
      if (settings.frameIsMain) {
        const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(sourceUrl) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="file"' : 
          "";
        // for the main frame, create a index.html that redirects to the file
        const html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(response.url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(response.url)}">${scrapbook.escapeHtml(sourceUrl, false)}</a>
</body>
</html>`;
        return capturer.saveDocument({
          sourceUrl,
          documentName: settings.documentName,
          settings,
          options,
          data: {
            title,
            mime: "text/html",
            content: html,
          }
        });
      } else {
        return {
          timeId,
          sourceUrl,
          targetDir: response.targetDir,
          filename: response.filename,
          url: response.url,
        };
      }
    });
  }).catch((ex) => {
    console.error(ex);
    return {error: {message: ex.message}};
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.registerDocument = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: registerDocument", params);

    const {settings, options} = params;
    const {timeId, documentName} = settings;

    if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
    const files = capturer.captureInfo.get(timeId).files = capturer.captureInfo.get(timeId).files || new Set(capturer.defaultFilesSet);

    let newDocumentName = documentName;
    let newDocumentNameCI = newDocumentName.toLowerCase();
    let count = 0;
    while (files.has(newDocumentNameCI + ".html") || files.has(newDocumentNameCI + ".xhtml")) {
      newDocumentName = documentName + "_" + (++count);
      newDocumentNameCI = newDocumentName.toLowerCase();
    }
    files.add(newDocumentNameCI + ".html");
    files.add(newDocumentNameCI + ".xhtml");
    return {documentName: newDocumentName};
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {{mime: string, charset: string, content: string, title: string}} params.data
 *     - {string} params.documentName
 *     - {string} params.sourceUrl
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.saveDocument = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: saveDocument", params);

    const {data, documentName, sourceUrl, settings, options} = params;
    const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    return Promise.resolve().then(() => {
      switch (options["capture.saveAs"]) {
        case "singleHtml": {
          if (!settings.frameIsMain) {
            const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
            let filename = documentName + ext;
            filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

            let dataUri = scrapbook.stringToDataUri(data.content, data.mime, data.charset);
            dataUri = dataUri.replace(";base64", ";filename=" + encodeURIComponent(filename) + ";base64");
            return {timeId, sourceUrl, url: dataUri};
          } else {
            const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
            let targetDir;
            let filename;
            let savePrompt;

            if (options["capture.saveInScrapbook"]) {
              targetDir = options["capture.scrapbookFolder"] + "/data";
              filename = timeId + ext;
              savePrompt = false;
            } else {
              targetDir = "";
              filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
              filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
              if (!filename.endsWith(ext)) filename += ext;
              savePrompt = true;
            }

            return capturer.saveBlob({
              timeId,
              blob: new Blob([data.content], {type: data.mime}),
              directory: targetDir,
              filename,
              sourceUrl,
              autoErase: false,
              savePrompt,
            }).then((filename) => {
              return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
            });
          }
          break;
        }

        case "singleHtmlJs": {
          const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
          let filename = documentName + ext;
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

          if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
          const zip = capturer.captureInfo.get(timeId).zip = capturer.captureInfo.get(timeId).zip || new JSZip();
          const zipResMap = capturer.captureInfo.get(timeId).zipResMap = capturer.captureInfo.get(timeId).zipResMap || new Map();
          const blob = new Blob([data.content], {type: data.mime});
          scrapbook.zipAddFile(zip, filename, blob, true);
          const zipResId = zipResMap.size;
          zipResMap.set(filename, zipResId);

          if (!settings.frameIsMain) {
            const url = `data:${blob.type};scrapbook-resource=${zipResId},${sourceUrlHash}`;
            return {timeId, sourceUrl, filename, url};
          } else {
            let targetDir;
            let filename;
            let savePrompt;

            if (options["capture.saveInScrapbook"]) {
              targetDir = options["capture.scrapbookFolder"] + "/data";
              filename = timeId + ext;
              savePrompt = false;
            } else {
              targetDir = "";
              filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
              filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
              if (!filename.endsWith(ext)) filename += ext;
              savePrompt = true;
            }

            const zipData = [];
            let p = Promise.resolve();
            zip.forEach((path, entry) => {
              p = p.then(() => {
                return entry.async('base64');
              }).then((data) => {
                zipData[zipResMap.get(path)] = {p: path, d: data};
              });
            });

            return p.then(() => {
              const pageloader = function (data) {
                var bs2ab = function (bstr) {
                  var n = bstr.length, u8ar = new Uint8Array(n);
                  while (n--) { u8ar[n] = bstr.charCodeAt(n); }
                  return u8ar.buffer;
                };

                var getRes = function (i, t) {
                  if (getRes[i]) { return getRes[i]; }
                  var s = readRes(atob(data[i].d));
                  return getRes[i] = URL.createObjectURL(new Blob([bs2ab(s)], {type: t}));
                };

                var readRes = function (s) {
                  return s.replace(/\bdata:([^,]+);scrapbook-resource=(\d+),(#[^'")\s]+)?/g, function (m, t, i, h) {
                    return getRes(i, t) + (h || '');
                  });
                };

                var loadRes = function (node) {
                  var o = node.nodeValue, n = readRes(o);
                  if (n !== o) { node.nodeValue = n; }
                };

                var loadDocRes = function (doc) {
                  var e = doc.getElementsByTagName('*');
                  for (var i = 0, I = e.length; i < I; i++) {
                    if (['style'].indexOf(e[i].nodeName.toLowerCase()) !== -1) {
                      var c = e[i].childNodes;
                      for (var j = 0, J = c.length; j < J; j++) {
                        if (c[j].nodeType === 3) { loadRes(c[j]); }
                      }
                    }
                    var a = e[i].attributes;
                    for (var j = 0, J = a.length; j < J; j++) {
                      if (['href', 'src', 'srcset', 'style', 'background', 'content', 'poster', 'data', 'code', 'archive']
                          .indexOf(a[j].nodeName) !== -1) {
                        loadRes(a[j]);
                      }
                    }
                  }
                };

                var s = document.getElementsByTagName('script'); s = s[s.length - 1];
                s.parentNode.removeChild(s);

                loadDocRes(document);
              };
              
              const content = data.content.replace(/<\/body>\s*<\/html>\s*$/, (m) => {
                return '\n' + '<script data-scrapbook-elem="pageloader">' + 
                    `(${scrapbook.compressJsFunc(pageloader)})(\n${JSON.stringify(zipData)}\n);` + 
                    '</script>' + '\n' + m;
                });

              return capturer.saveBlob({
                timeId,
                blob: new Blob([content], {type: data.mime}),
                directory: targetDir,
                filename,
                sourceUrl,
                autoErase: false,
                savePrompt,
              }).then((filename) => {
                return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
              });
            });
          }
          break;
        }

        case "zip": {
          const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
          let filename = documentName + ext;
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

          if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
          const zip = capturer.captureInfo.get(timeId).zip = capturer.captureInfo.get(timeId).zip || new JSZip();
          scrapbook.zipAddFile(zip, filename, new Blob([data.content], {type: data.mime}), true);

          if (!settings.frameIsMain) {
            return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
          } else {
            // create index.html that redirects to index.xhtml
            if (ext === ".xhtml") {
              const html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
              scrapbook.zipAddFile(zip, "index.html", new Blob([html], {type: "text/html"}), true);
            }

            // generate and download the zip file
            return zip.generateAsync({type: "blob"}).then((zipBlob) => {
              let targetDir;
              let filename;
              let savePrompt;

              if (options["capture.saveInScrapbook"]) {
                targetDir = options["capture.scrapbookFolder"] + "/data";
                filename = timeId + ".htz";
                savePrompt = false;
              } else {
                targetDir = "";
                filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
                filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
                filename += ".htz";
                savePrompt = true;
              }

              return capturer.saveBlob({
                timeId,
                blob: zipBlob,
                directory: targetDir,
                filename,
                sourceUrl,
                autoErase: false,
                savePrompt,
              }).then((filename) => {
                return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
              });
            });
          }
          break;
        }

        case "maff": {
          const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
          let filename = documentName + ext;
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

          if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
          const zip = capturer.captureInfo.get(timeId).zip = capturer.captureInfo.get(timeId).zip || new JSZip();
          scrapbook.zipAddFile(zip, timeId + "/" + filename, new Blob([data.content], {type: data.mime}), true);

          if (!settings.frameIsMain) {
            return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
          } else {
            // create index.html that redirects to index.xhtml
            if (ext === ".xhtml") {
              const html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
              scrapbook.zipAddFile(zip, timeId + "/" + "index.html", new Blob([html], {type: "text/html"}), true);
            }

            // generate index.rdf
            const rdfContent = `<?xml version="1.0"?>
<RDF:RDF xmlns:MAF="http://maf.mozdev.org/metadata/rdf#"
         xmlns:NC="http://home.netscape.com/NC-rdf#"
         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <RDF:Description RDF:about="urn:root">
    <MAF:originalurl RDF:resource="${scrapbook.escapeHtml(sourceUrl)}"/>
    <MAF:title RDF:resource="${scrapbook.escapeHtml(data.title)}"/>
    <MAF:archivetime RDF:resource="${scrapbook.escapeHtml(scrapbook.idToDate(timeId).toUTCString())}"/>
    <MAF:indexfilename RDF:resource="${filename}"/>
    <MAF:charset RDF:resource="UTF-8"/>
  </RDF:Description>
</RDF:RDF>
`;
            scrapbook.zipAddFile(zip, timeId + "/" + "index.rdf", new Blob([rdfContent], {type: "application/rdf+xml"}), true);

            // generate and download the zip file
            return zip.generateAsync({type: "blob"}).then((zipBlob) => {
              let targetDir;
              let filename;
              let savePrompt;

              if (options["capture.saveInScrapbook"]) {
                targetDir = options["capture.scrapbookFolder"] + "/data";
                filename = timeId + ".maff";
                savePrompt = false;
              } else {
                targetDir = "";
                filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
                filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
                filename += ".maff";
                savePrompt = true;
              }

              return capturer.saveBlob({
                timeId,
                blob: zipBlob,
                directory: targetDir,
                filename,
                sourceUrl,
                autoErase: false,
                savePrompt,
              }).then((filename) => {
                return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
              });
            });
          }
          break;
        }

        case "folder":
        default: {
          const targetDir = options["capture.scrapbookFolder"] + "/data/" + timeId;
          const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
          let filename = documentName + ext;
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

          return capturer.saveBlob({
            timeId,
            blob: new Blob([data.content], {type: data.mime}),
            directory: targetDir,
            filename,
            sourceUrl,
            autoErase: !settings.frameIsMain || (ext === ".xhtml"),
            savePrompt: false,
          }).then((filename) => {
            if (settings.frameIsMain && (ext === ".xhtml")) {
              // create index.html that redirects to index.xhtml
              const filename = "index.html";
              const html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
              return capturer.saveBlob({
                timeId,
                blob: new Blob([html], {type: "text/html"}),
                directory: targetDir,
                filename,
                sourceUrl,
                autoErase: false,
                savePrompt: false,
              });
            }
            return filename;
          }).then((filename) => {
            return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
          });
          break;
        }
      }
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });
  });
};

// @FIXME
// When run in a Firefox private window, the background script does not have same
// crenditials as the private window document, and the capture may fail or go wrong.
/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.rewriteMethod
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.downloadFile = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: downloadFile", params);

    const {url: sourceUrl, refUrl, rewriteMethod, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId, recurseChain} = settings;

    const headers = {};
    let filename;

    // init access check
    if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
    const accessMap = capturer.captureInfo.get(timeId).accessMap = capturer.captureInfo.get(timeId).accessMap || new Map();

    // check for previous access
    const accessToken = capturer.getAccessToken(sourceUrlMain, rewriteMethod);
    const accessPrevious = accessMap.get(accessToken);
    if (accessPrevious) {
      // Normally we wait until the file be downloaded, and possibly
      // renamed, cancelled, or thrown error. However, if there is
      // a circular reference, we have to return early to pervent a
      // dead lock. This returned data could be incorrect if something
      // unexpected happen to the accessPrevious.
      if (recurseChain.indexOf(sourceUrlMain) !== -1) {
        return {
          filename: accessPrevious.filename,
          url: scrapbook.escapeFilename(accessPrevious.filename) + sourceUrlHash,
          isCircular: true,
        };
      }
      return accessPrevious;
    }

    const accessCurrent = Promise.resolve().then(() => {
      // special management for data URI
      if (sourceUrlMain.startsWith("data:")) {
        if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
          let file = scrapbook.dataUriToFile(sourceUrlMain);
          if (!file) { throw new Error("Malformed data URL."); }

          filename = file.name;
          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
          filename = capturer.getUniqueFilename(timeId, filename);

          return Promise.resolve(capturer[rewriteMethod]).then((fn) => {
            if (!fn) { return file; }
            return fn({
              settings,
              options,
              data: file,
              charset: null,
              url: null,
            });
          }).then((blob) => {
            return capturer.downloadBlob({
              settings,
              options,
              blob,
              filename,
              sourceUrl,
            });
          });
        }
        return {url: sourceUrl};
      }

      // cannot assign "referer" header directly
      // the prefix will be removed by the onBeforeSendHeaders listener
      const requestHeaders = {};
      if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

      let accessPreviousReturn;
      return scrapbook.xhr({
        url: sourceUrl,
        responseType: "blob",
        requestHeaders,
        onreadystatechange(xhr) {
          if (xhr.readyState !== 2) { return; }

          // check for previous access if redirected
          const [responseUrlMain, responseUrlHash] = scrapbook.splitUrlByAnchor(xhr.responseURL);

          if (responseUrlMain !== sourceUrlMain) {
            const accessToken = capturer.getAccessToken(responseUrlMain, rewriteMethod);
            const accessPrevious = accessMap.get(accessToken);
            if (accessPrevious) {
              xhr.abort();

              // See accessPrevious check above in this method
              if (recurseChain.indexOf(responseUrlMain) !== -1) {
                return accessPreviousReturn = {
                  filename: accessPrevious.filename,
                  url: scrapbook.escapeFilename(accessPrevious.filename) + responseUrlHash,
                  isCircular: true,
                };
              }
              return accessPreviousReturn = accessPrevious;
            }

            accessMap.set(accessToken, accessPrevious);
          }

          // get headers
          if (xhr.status !== 0) {
            const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
            if (headerContentDisposition) {
              const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
              headers.isAttachment = (contentDisposition.type === "attachment");
              headers.filename = contentDisposition.parameters.filename;
            }
            const headerContentType = xhr.getResponseHeader("Content-Type");
            if (headerContentType) {
              const contentType = scrapbook.parseHeaderContentType(headerContentType);
              headers.contentType = contentType.type;
              headers.charset = contentType.parameters.charset;
            }
          }

          // determine the filename
          // use the filename if it has been defined by header Content-Disposition
          filename = headers.filename || scrapbook.urlToFilename(sourceUrl);

          // if no file extension, give one according to header Content-Type
          if (headers.contentType) {
            let [base, extension] = scrapbook.filenameParts(filename);
            if (!extension) {
              extension = Mime.prototype.extension(headers.contentType);
              if (extension) {
                filename = base + "." + extension;
              }
            }
          }

          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
          filename = capturer.getUniqueFilename(timeId, filename);

          // record the currently available filename
          // we need this data for early return of circular referencing
          accessCurrent.filename = filename;
        },
      }).then((xhr) => {
        // Request aborted, only when a previous access is found.
        // Return that Promise.
        if (!xhr) { return accessPreviousReturn; }

        return Promise.resolve(capturer[rewriteMethod]).then((fn) => {
          if (!fn) { return xhr.response; }
          return fn({
            settings,
            options,
            data: xhr.response,
            charset: headers.charset,
            url: xhr.responseURL,
          });
        }).then((blob) => {
          return capturer.downloadBlob({
            settings,
            options,
            blob,
            filename,
            sourceUrl,
          });
        });
      });
    }).catch((ex) => {
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });

    accessMap.set(accessToken, accessCurrent);
    return accessCurrent;
  });
};

// @FIXME
// When run in a Firefox private window, the background script does not have same
// crenditials as the private window document, and the capture may fail or go wrong.
//
// @TODO:
// implement accessMap cache for same URL
/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 * @return {Promise}
 */
capturer.downLinkFetchHeader = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: downLinkFetchHeader", params);

    const {url: sourceUrl, refUrl} = params;
    const [sourceUrlMain] = scrapbook.splitUrlByAnchor(sourceUrl);

    const headers = {};

    // cannot assign "referer" header directly
    // the prefix will be removed by the onBeforeSendHeaders listener
    const requestHeaders = {};
    if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

    return scrapbook.xhr({
      url: sourceUrlMain,
      responseType: 'blob',
      timeout: 8000,
      requestHeaders,
      onreadystatechange(xhr) {
        if (xhr.readyState !== 2) { return; }

        // get headers
        if (xhr.status !== 0) {
          const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
          if (headerContentDisposition) {
            const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
            headers.isAttachment = (contentDisposition.type === "attachment");
            headers.filename = contentDisposition.parameters.filename;
          }
          const headerContentType = xhr.getResponseHeader("Content-Type");
          if (headerContentType) {
            const contentType = scrapbook.parseHeaderContentType(headerContentType);
            headers.contentType = contentType.type;
            headers.charset = contentType.parameters.charset;
          }
        }

        const responseURL = xhr.responseURL;
        if (responseURL !== sourceUrlMain) {
          prevAccessMap.set(responseURL, p);
        }

        xhr.abort();
      },
    }).catch((ex) => {
      // something wrong for the XMLHttpRequest
      console.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return null;
    }).then(() => {
      if (headers.filename) {
        let [, ext] = scrapbook.filenameParts(headers.filename);

        if (!ext && headers.contentType) {
          ext = Mime.prototype.extension(headers.contentType);
        }

        return ext;
      } else {
        if (headers.contentType) {
          return Mime.prototype.extension(headers.contentType);
        }

        let filename = scrapbook.urlToFilename(sourceUrlMain);
        let [, ext] = scrapbook.filenameParts(filename);
        return ext;
      }
    });
  });
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Blob} params.blob
 *     - {string} params.filename - validated and unique
 *     - {string} params.sourceUrl
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.downloadBlob = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: downloadBlob", params);

    const {blob, filename, sourceUrl, settings, options} = params;
    const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        return scrapbook.readFileAsDataURL(blob).then((dataUri) => {
          if (filename) {
            dataUri = dataUri.replace(";", ";filename=" + encodeURIComponent(filename) + ";");
          }
          return {filename, url: dataUri + sourceUrlHash};
        });
      }

      case "singleHtmlJs": {
        if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
        const zip = capturer.captureInfo.get(timeId).zip = capturer.captureInfo.get(timeId).zip || new JSZip();
        const zipResMap = capturer.captureInfo.get(timeId).zipResMap = capturer.captureInfo.get(timeId).zipResMap || new Map();
        scrapbook.zipAddFile(zip, filename, blob);
        const zipResId = zipResMap.size;
        zipResMap.set(filename, zipResId);
        const url = `data:${blob.type};scrapbook-resource=${zipResId},${sourceUrlHash}`;
        return {filename, url};
      }

      case "zip": {
        if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
        const zip = capturer.captureInfo.get(timeId).zip = capturer.captureInfo.get(timeId).zip || new JSZip();
        scrapbook.zipAddFile(zip, filename, blob);
        return {filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
      }

      case "maff": {
        if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
        const zip = capturer.captureInfo.get(timeId).zip = capturer.captureInfo.get(timeId).zip || new JSZip();
        scrapbook.zipAddFile(zip, timeId + "/" + filename, blob);
        return {filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
      }

      case "folder":
      default: {
        // download the data
        const targetDir = options["capture.scrapbookFolder"] + "/data/" + timeId;

        return capturer.saveBlob({
          timeId,
          blob,
          directory: targetDir,
          filename,
          sourceUrl,
          autoErase: true,
          savePrompt: false,
        }).then((filename) => {
          return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        });
      }
    }
  });
};

/**
 * @param {Object} params
 *     - {string} params.timeId
 *     - {Blob} params.blob
 *     - {string} params.directory
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 *     - {boolean} params.autoErase
 *     - {boolean} params.savePrompt
 * @return {Promise}
 */
capturer.saveBlob = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: saveBlob", params);

    const {timeId, blob, directory, filename, sourceUrl, autoErase, savePrompt} = params;

    return capturer.saveUrl({
      url: URL.createObjectURL(blob),
      directory,
      filename,
      sourceUrl,
      autoErase,
      savePrompt,
    });
  });
};

/**
 * @param {Object} params
 *     - {string} params.timeId
 *     - {string} params.url
 *     - {string} params.directory
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 *     - {boolean} params.autoErase
 *     - {boolean} params.savePrompt
 * @return {Promise}
 */
capturer.saveUrl = function (params) {
  return new Promise((resolve, reject) => {
    isDebug && console.debug("call: saveUrl", params);

    const {timeId, url, directory, filename, sourceUrl, autoErase, savePrompt} = params;

    const downloadParams = {
      url,
      filename: (directory ? directory + "/" : "") + filename,
      conflictAction: "uniquify",
      saveAs: savePrompt,
    };

    isDebug && console.debug("download start", downloadParams);
    chrome.downloads.download(downloadParams, (downloadId) => {
      isDebug && console.debug("download response", downloadId);
      if (downloadId) {
        capturer.downloadInfo.set(downloadId, {
          timeId,
          src: sourceUrl,
          autoErase,
          onComplete: resolve,
          onError: reject,
        });
      } else {
        reject(chrome.runtime.lastError);
      }
    });
  });
};


/**
 * Events handling
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  isDebug && console.debug(message.cmd, "receive", `[${sender.tab ? sender.tab.id : -1}]`, message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    const fn = capturer[message.cmd.slice(9)];
    if (fn) {
      fn(message.args).then((response) => {
        sendResponse(response);
      });
      return true; // async response
    }
  }
});

chrome.downloads.onChanged.addListener((downloadDelta) => {
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  const downloadId = downloadDelta.id, downloadInfo = capturer.downloadInfo;
  if (!downloadInfo.has(downloadId)) { return; }

  let p;
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    p = browser.downloads.search({id: downloadId}).then((results) => {
      const [dir, filename] = scrapbook.filepathParts(results[0].filename);
      downloadInfo.get(downloadId).onComplete(filename);
    });
  } else if (downloadDelta.error) {
    p = Promise.resolve().then(() => {
      downloadInfo.get(downloadId).onError(new Error(downloadDelta.error.current));
    });
  }
  p && p.catch((ex) => {
    console.error(ex);
  }).then(() => {
    // erase the download history of additional downloads (autoErase = true)
    if (downloadInfo.get(downloadId).autoErase) {
      return browser.downloads.erase({id: downloadId});
    }
  }).then((erasedIds) => {
    downloadInfo.delete(downloadId);
  }).catch((ex) => {
    console.error(ex);
  });
});

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  // Some headers (e.g. "referer") are not allowed to be set via
  // XMLHttpRequest.setRequestHeader directly.  Use a prefix and
  // modify it here to workaround.
  details.requestHeaders.forEach((header) => {
    if (header.name.slice(0, 15) === "X-WebScrapBook-") {
      header.name = header.name.slice(15);
    }
  });
  return {requestHeaders: details.requestHeaders};
}, {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"]);

// isDebug && console.debug("loading background.js");
