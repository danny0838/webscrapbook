/********************************************************************
 *
 * Script for load.html
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 *******************************************************************/

let _isFxBelow52;
let _isFxAndroid;

capturer.isContentScript = false;

// missionId is fixed to this page, to identify the capture mission
capturer.missionId = scrapbook.getUuid();

capturer.defaultFilesSet = new Set(["index.rdf", "index.dat", "metadata"]);

/**
 * @type {Map<string~timeId, {files: Set<string>, accessMap: Map<string, Promise>, zip: JSZip}>}
 */
capturer.captureInfo = new Map();

/**
 * @type {Map<string~downloadId, {timeId: string, src: string, autoErase: boolean, onComplete: function, onError: function}>}
 */
capturer.downloadInfo = new Map();

capturer.log = function (msg) {
  capturer.logger.appendChild(document.createTextNode(msg + '\n'));
};

capturer.warn = function (msg) {
  const span = document.createElement('span');
  span.className = 'warn';
  span.appendChild(document.createTextNode(msg + '\n'));
  logger.appendChild(span);
};

capturer.error = function (msg) {
  const span = document.createElement('span');
  span.className = 'error';
  span.appendChild(document.createTextNode(msg + '\n'));
  logger.appendChild(span);
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
 *     - {Tab} params.tab
 *     - {integer} params.frameId
 *     - {boolean} params.saveBeyondSelection
 *     - {string} params.mode
 *     - {string} params.options - preset options that overwrites default
 * @return {Promise}
 */
capturer.captureTab = function (params) {
  return Promise.resolve().then(() => {
    const {tab, frameId, saveBeyondSelection, mode, options} = params;
    const {id: tabId, url, title, favIconUrl} = tab;

    // redirect headless capture
    // if frameId not provided, use current tab title and favIcon
    if (mode === "bookmark" || mode === "source") {
      return Promise.resolve().then(() => {
        if (isNaN(frameId)) { return {url, title, favIconUrl}; }
        return browser.webNavigation.getFrame({tabId, frameId});
      }).then((details) => {
        const {url, title, favIconUrl} = details;
        return capturer.captureHeadless({url, title, favIconUrl, mode, options});
      });
    }

    const source = `[${tabId}${(frameId ? ':' + frameId : '')}] ${url}`;
    const timeId = scrapbook.dateToId();
    const message = {
      settings: {
        missionId: capturer.missionId,
        timeId,
        frameIsMain: true,
        documentName: "index",
        recurseChain: [],
        favIconUrl,
      },
      options: Object.assign(scrapbook.getOptions("capture"), options),
    };

    // save whole page beyond selection?
    message.options["capture.saveBeyondSelection"] = !!saveBeyondSelection;

    return Promise.resolve().then(() => {
      // Simply detect the main frame and executeScript for allFrames doesn't
      // work since it's possible that only partial frames have the content
      // script loaded. E.g. the user ran this when the main frame hadn't been
      // completed and some subframes hadn't been loaded.
      isDebug && console.debug("(main) send", source, message);
      capturer.log(`Capturing (document) ${source} ...`);
      return browser.webNavigation.getAllFrames({tabId}).then((details) => {
        const tasks = [];
        details.forEach((detail) => {
          const {frameId, url} = detail;
          if (!scrapbook.isContentPage(url)) { return; }

          // Send a test message to check whether content script is loaded.
          // If no content script, we get an error saying connection cannot be established.
          tasks[tasks.length] = capturer.invoke("isScriptLoaded", null, {tabId, frameId}).catch((ex) => {
            isDebug && console.debug("inject content scripts", tabId, frameId, url);
            return browser.tabs.executeScript(tabId, {frameId, file: "/core/polyfill.js"}).then((result) => {
              return browser.tabs.executeScript(tabId, {frameId, file: "/core/common.js"});
            }).then((result) => {
              return browser.tabs.executeScript(tabId, {frameId, file: "/capturer/common.js"});
            }).then((result) => {
              return browser.tabs.executeScript(tabId, {frameId, file: "/capturer/content.js"});
            }).catch((ex) => {
              // Chrome may be failed to inject content script to some pages due to unclear reason.
              // Record the error and pass.
              console.error(ex);
              const source = `[${tabId}:${frameId}] ${url}`;
              const err = scrapbook.lang("ErrorContentScriptExecute", [source, ex.message]);
              capturer.error(err);
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
    }).catch((ex) => {
      console.error(ex);
      const err = `Fatal error: ${ex.message}`;
      capturer.error(err);
      return {error: {message: err}};
    });
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
 *     - {string} params.options - preset options that overwrites default
 * @return {Promise}
 */
capturer.captureHeadless = function (params) {
  return Promise.resolve().then(() => {
    const {url, refUrl, title, favIconUrl, mode, options} = params;

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
      options: Object.assign(scrapbook.getOptions("capture"), options),
    };

    return Promise.resolve().then(() => {
      isDebug && console.debug("(main) capture", source, message);
      capturer.log(`Capturing (${mode}) ${source} ...`);
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
    }).catch((ex) => {
      console.error(ex);
      const err = `Fatal error: ${ex.message}`;
      capturer.error(err);
      return {error: {message: err}};
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
    if (refUrl && sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
      requestHeaders["X-WebScrapBook-Referer"] = refUrl;
    }

    let accessPreviousRedirected;
    const accessCurrent = Promise.resolve().then(() => {
      // fail out if sourceUrl is relative,
      // or it will be treated as relative to this extension page.
      if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
        throw new Error(`URL not resolved.`);
      }

      return scrapbook.xhr({
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
          if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
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

            let mime = headers.contentType || Mime.lookup(filename) || "text/html";
            let fn = filename.toLowerCase();
            if (["text/html", "application/xhtml+xml"].indexOf(mime) !== -1) {
              let exts = Mime.allExtensions(mime);
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
      });
    }).catch((ex) => {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });

    accessMap.set(accessToken, accessCurrent);
    return accessCurrent;
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
    if (refUrl && sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
      requestHeaders["X-WebScrapBook-Referer"] = refUrl;
    }

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
      let saveMethod;

      if (options["capture.saveInScrapbook"]) {
        targetDir = options["capture.scrapbookFolder"] + "/data";
        filename = timeId + ext;
        savePrompt = false;
        saveMethod = "saveBlob";
      } else {
        filename = (title ? title : scrapbook.urlToFilename(sourceUrl));
        filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
        if (!filename.endsWith(ext)) { filename += ext; }
        saveMethod = "saveBlobNaturally";
      }

      const dataBlob = new Blob([html], {type: "text/html"});

      // special handling (for unit test)
      if (options["capture.saveInMemory"]) {
        return capturer.saveBlobInMemory({blob: dataBlob});
      }

      return capturer[saveMethod]({
        timeId,
        blob: dataBlob,
        directory: targetDir,
        filename,
        sourceUrl,
        autoErase: false,
        savePrompt,
      }).then((filename) => {
        return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
      });
    }).catch((ex) => {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
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
 *     - {string} params.charset
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.captureFile = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: captureFile", params);

    const {url: sourceUrl, refUrl, title, charset, settings, options} = params;
    const {timeId} = settings;

    return capturer.downloadFile({
      url: sourceUrl,
      refUrl,
      settings,
      options,
    }).then((response) => {
      if (settings.frameIsMain) {
        // for the main frame, create a index.html that redirects to the file
        const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(sourceUrl) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="file"' + 
          (charset ? ' data-scrapbook-charset="' + charset + '"' : "") : 
          "";

        // do not generate link for singleHtml to avoid doubling the data URL
        const anchor = (options["capture.saveAs"] === "singleHtml") ? 
            `${scrapbook.escapeHtml(response.filename, false)}` : 
            `<a href="${scrapbook.escapeHtml(response.url)}">${scrapbook.escapeHtml(response.filename, false)}</a>`;

        const html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(response.url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file ${anchor}
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
            let saveMethod;

            if (options["capture.saveInScrapbook"]) {
              targetDir = options["capture.scrapbookFolder"] + "/data";
              filename = timeId + ext;
              savePrompt = false;
              saveMethod = "saveBlob";
            } else {
              filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
              filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
              if (!filename.endsWith(ext)) filename += ext;
              saveMethod = "saveBlobNaturally";
            }

            const dataBlob = new Blob([data.content], {type: data.mime});

            // special handling (for unit test)
            if (options["capture.saveInMemory"]) {
              return capturer.saveBlobInMemory({blob: dataBlob});
            }

            capturer.log(`Preparing download...`);
            return capturer[saveMethod]({
              timeId,
              blob: dataBlob,
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

          if (!settings.frameIsMain) {
            const blob = new Blob([data.content], {type: data.mime});
            scrapbook.zipAddFile(zip, filename, blob, true);
            const zipResId = zipResMap.size;
            zipResMap.set(filename, zipResId);
            const charset = data.charset ? ";charset=" + data.charset : "";
            const url = `data:${blob.type}${charset};scrapbook-resource=${zipResId},${sourceUrlHash}`;
            return {timeId, sourceUrl, filename, url};
          } else {
            let targetDir;
            let filename;
            let savePrompt;
            let saveMethod;

            if (options["capture.saveInScrapbook"]) {
              targetDir = options["capture.scrapbookFolder"] + "/data";
              filename = timeId + ext;
              savePrompt = false;
              saveMethod = "saveBlob";
            } else {
              filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
              filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
              if (!filename.endsWith(ext)) filename += ext;
              saveMethod = "saveBlobNaturally";
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

              const [cdataStart, cdataEnd] = (data.mime === "application/xhtml+xml") ? 
                ['<!--//--><![CDATA[//><!--\n', '//--><!]]>'] :
                ['', ''];

              const pageloaderScript = `
<script data-scrapbook-elem="pageloader">${cdataStart}(${scrapbook.compressJsFunc(pageloader)})(
${JSON.stringify(zipData)}
);${cdataEnd}</script>
`;
              let inserted = false;
              let content = data.content.replace(/<\/body>\s*<\/html>\s*$/i, (m) => {
                inserted = true;
                return pageloaderScript + m;
              });

              if (!inserted) {
                // fix broken html
                // Failure of previous insertion is due to post-body contents.
                // Such HTML doc won't validate, but in such cases we need
                // to insert our pageloader after them.
                content = data.content.replace(/<\/html>\s*$/i, (m) => {
                  inserted = true;
                  return pageloaderScript + m;
                });
              }

              if (!inserted) {
                // this is unexpected and should never happen
                throw new Error(`Unable to find the end tag of HTML doc`);
              }

              const dataBlob = new Blob([content], {type: data.mime});

              // special handling (for unit test)
              if (options["capture.saveInMemory"]) {
                return capturer.saveBlobInMemory({blob: dataBlob});
              }

              capturer.log(`Preparing download...`);
              return capturer[saveMethod]({
                timeId,
                blob: dataBlob,
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
            return zip.generateAsync({type: "blob", mimeType: "application/html+zip"}).then((zipBlob) => {
              let targetDir;
              let filename;
              let savePrompt;
              let saveMethod;

              if (options["capture.saveInScrapbook"]) {
                targetDir = options["capture.scrapbookFolder"] + "/data";
                filename = timeId + ".htz";
                savePrompt = false;
                saveMethod = "saveBlob";
              } else {
                filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
                filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
                filename += ".htz";
                saveMethod = "saveBlobNaturally";
              }

              // special handling (for unit test)
              if (options["capture.saveInMemory"]) {
                return capturer.saveBlobInMemory({blob: zipBlob});
              }

              capturer.log(`Preparing download...`);
              return capturer[saveMethod]({
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
            return zip.generateAsync({type: "blob", mimeType: "application/x-maff"}).then((zipBlob) => {
              let targetDir;
              let filename;
              let savePrompt;
              let saveMethod;

              if (options["capture.saveInScrapbook"]) {
                targetDir = options["capture.scrapbookFolder"] + "/data";
                filename = timeId + ".maff";
                savePrompt = false;
                saveMethod = "saveBlob";
              } else {
                filename = (data.title ? data.title : scrapbook.urlToFilename(sourceUrl));
                filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
                filename += ".maff";
                saveMethod = "saveBlobNaturally";
              }

              // special handling (for unit test)
              if (options["capture.saveInMemory"]) {
                return capturer.saveBlobInMemory({blob: zipBlob});
              }

              capturer.log(`Preparing download...`);
              return capturer[saveMethod]({
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
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });
  });
};

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
      // fail out if sourceUrl is relative,
      // or it will be treated as relative to this extension page.
      if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
        throw new Error(`URL not resolved.`);
      }

      // special management for data URI
      if (sourceUrlMain.startsWith("data:")) {
        /* save the data URI as file? */
        if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
          const file = scrapbook.dataUriToFile(sourceUrlMain);
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

        /* rewrite content of the data URI? */
        if (rewriteMethod && capturer[rewriteMethod]) {
          const file = scrapbook.dataUriToFile(sourceUrlMain);
          if (!file) { throw new Error("Malformed data URL."); }

          // Save inner URLs as data URL since data URL is null origin
          // and no relative URLs are allowed in it.
          const innerOptions = JSON.parse(JSON.stringify(options));
          innerOptions["capture.saveAs"] = "singleHtml";

          return capturer[rewriteMethod]({
            settings,
            options: innerOptions,
            data: file,
            charset: null,
            url: null,
          }).then((blob) => {
            return scrapbook.readFileAsDataURL(blob);
          }).then((dataURL) => {
            return {url: dataURL};
          });
        }

        return {url: sourceUrl};
      }

      // cannot assign "referer" header directly
      // the prefix will be removed by the onBeforeSendHeaders listener
      const requestHeaders = {};
      if (refUrl && sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
        requestHeaders["X-WebScrapBook-Referer"] = refUrl;
      }

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
          if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
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
              extension = Mime.extension(headers.contentType);
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
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    });

    accessMap.set(accessToken, accessCurrent);
    return accessCurrent;
  });
};

// @TODO: accessMap cache for same URL
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
        if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
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

        xhr.abort();
      },
    }).catch((ex) => {
      // something wrong for the XMLHttpRequest
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return null;
    }).then(() => {
      if (headers.filename) {
        let [, ext] = scrapbook.filenameParts(headers.filename);

        if (!ext && headers.contentType) {
          ext = Mime.extension(headers.contentType);
        }

        return ext;
      } else {
        if (headers.contentType) {
          return Mime.extension(headers.contentType);
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
          if (dataUri === "data:") {
            // Chrome returns "data:" if the blob is zero byte. Add the mimetype.
            dataUri = `data:${blob.type};base64,`;
          }
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
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 * @return {Promise}
 */
capturer.saveBlobNaturally = function (params) {
  return Promise.resolve().then(() => {
    const {timeId, blob, filename, sourceUrl} = params;

    // Use the natural download attribute to generate a download.
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);

      capturer.downloadInfo.set(url, {
        timeId,
        src: sourceUrl,
        onComplete: resolve,
        onError: reject,
      });

      if (scrapbook.isGecko) {
        // Firefox has a bug that the screen turns unresponsive
        // when an addon page is redirected to a blob URL.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
        //
        // Workaround by creating the anchor in an iframe.
        const iDoc = this.downloader.contentDocument;
        const a = iDoc.createElement('a');
        a.download = filename;
        a.href = url;
        iDoc.body.appendChild(a);
        a.click();
        a.remove();

        // In case the download still fails.
        const file = new File([blob], filename, {type: "application/octet-stream"});
        const url2 = URL.createObjectURL(file);

        capturer.downloadInfo.set(url2, {
          timeId,
          src: sourceUrl,
          onComplete: resolve,
          onError: reject,
        });

        const elem = document.createElement('a');
        elem.target = 'download';
        elem.href = url2;
        elem.textContent = `If the download doesn't start, click me.`;
        capturer.logger.appendChild(elem);
        capturer.log('');
        return;
      }

      const elem = document.createElement('a');
      elem.download = filename;
      elem.href = url;
      elem.textContent = `If the download doesn't start, click me.`;
      capturer.logger.appendChild(elem);
      elem.click();
      capturer.log('');
    }).catch((ex) => {
      // probably USER_CANCELLED
      // treat as capture success and return the filename
      return filename;
    });
  });
};

/**
 * @param {Object} params
 *     - {Blob} params.blob
 * @return {Promise}
 */
capturer.saveBlobInMemory = function (params) {
  return Promise.resolve().then(() => {
    isDebug && console.debug("call: saveBlobInMemory", params);

    const {blob} = params;

    // In Firefox < 56 and Chromium,
    // Blob cannot be stored in chrome.storage,
    // fallback to byte string.
    return scrapbook.readFileAsText(blob, false).then((text) => {
      return {
        type: blob.type,
        data: text,
      };
    });
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
      timeId,
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
    };

    // Firefox < 52 gets an error if saveAs is defined
    // Firefox Android gets an error if saveAs = true
    if (!_isFxBelow52 && !_isFxAndroid) {
      downloadParams.saveAs = savePrompt;
    }

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
  try {
    if (message.args.settings.missionId !== capturer.missionId) {
      return;
    }
  } catch (ex) {
    // no entry of message.args.settings.missionId
    return;
  }

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

chrome.downloads.onCreated.addListener((downloadItem) => {
  isDebug && console.debug("downloads.onCreated", downloadItem);

  const downloadInfo = capturer.downloadInfo;
  const {id, url, filename} = downloadItem;
  if (!downloadInfo.has(url)) { return; }

  // In Chrome, the onCreated is fired when the "Save as" prompt popups.
  //
  // In Firefox, the onCreated is fired only when the user clicks
  // save in the "Save as" prompt, and no event if the user clicks
  // cancel.
  //
  // We wait until the user clicks save (or cancel in Chrome) to resolve
  // the Promise (and then the window may close).
  if (scrapbook.isGecko) {
    downloadInfo.get(url).onComplete(scrapbook.filepathParts(filename)[1]);
  } else {
    downloadInfo.set(id, downloadInfo.get(url));
  }
  downloadInfo.delete(url);
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

// init
document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);

  capturer.logger = document.getElementById('logger');
  capturer.downloader = document.getElementById('downloader');

  scrapbook.loadOptions().then(() => {
    return Promise.resolve().then(() => {
      return browser.runtime.getBrowserInfo();
    }).then((info) => {
      _isFxBelow52 = parseInt(info.version.match(/^(\d+)\./)[1], 10) < 52;
      _isFxAndroid = (info.name === 'Fennec');
    }).catch((ex) => {
      _isFxBelow52 = false;
      _isFxAndroid = false;
    });
  }).then(() => {
    const urlObj = new URL(document.URL);
    const s = urlObj.searchParams;
    const missionId = s.get('mid');
    const tabFrameList = s.has('t') ? s.get('t').split(',').map(x => {
      const [tabId, frameId] = x.split(':');
      return {
        tabId: isNaN(tabId) ? -1 : parseInt(tabId, 10),
        frameId: isNaN(frameId) ? undefined : parseInt(frameId, 10),
      };
    }) : undefined;
    const urlTitleList = s.has('u') ? s.get('u').split(',').map(x => {
      const [url, ...titleParts] = x.split(' ');
      return {url, title: titleParts.join(' ')};
    }) : undefined;
    const mode = s.get('m') || undefined;
    const saveBeyondSelection = !!s.get('f');

    if (missionId) {
      // use the missionId to receive further message
      // and avoids auto-closing
      capturer.missionId = missionId;

      return true;
    } else if (tabFrameList) {
      let hasError = false;
      let p = Promise.resolve();
      tabFrameList.forEach(({tabId, frameId}) => {
        const source = `[${tabId}:${frameId}]`;
        p = p.then(() => {
          // throws if the tab has been closed
          return browser.tabs.get(tabId);
        }).then((tab) => {
          return capturer.captureTab({
            tab,
            frameId,
            saveBeyondSelection,
            mode,
          });
        }).catch((ex) => {
          const err = `Unexpected error: ${ex.message}`;
          capturer.error(err);
          return {error: {message: err}};
        }).then((response) => {
          if (response.error) { hasError = true; }
          else { capturer.log(`Done.`); }
          return scrapbook.delay(5);
        });
      });
      return p.then(() => {
        return hasError;
      });
    } else if (urlTitleList) {
      let hasError = false;
      let p = Promise.resolve();
      urlTitleList.forEach(({url, title}) => {
        const source = `${url}`;
        p = p.then(() => {
          return capturer.captureHeadless({
            url,
            title,
            mode,
          });
        }).catch((ex) => {
          const err = `Unexpected error: ${ex.message}`;
          console.error(err);
          return {error: {message: err}};
        }).then((response) => {
          if (response.error) { hasError = true; }
          else { capturer.log(`Done.`); }
          return scrapbook.delay(5);
        });
      });
      return p.then(() => {
        return hasError;
      });
    } else {
      capturer.error(`Unexpected error: Parameters not supported.`);

      return true;
    }
  }).then((hasError) => {
    if (hasError) { return; }

    return scrapbook.delay(1000).then(() => {
      if (chrome.windows) {
        return browser.windows.getCurrent().then((win) => {
          return browser.windows.remove(win.id);
        });
      } else {
        return browser.tabs.getCurrent().then((tab) => {
          return browser.tabs.remove(tab.id);
        });
      }
    });
  });
});
