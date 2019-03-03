/********************************************************************
 *
 * Script for load.html
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 * @public  {boolean} capturer.isContentScript
 *******************************************************************/

((window, document, browser) => {

// overwrite the value of common.js to define this is not a content script
capturer.isContentScript = false;

// missionId is fixed to this page, to identify the capture mission
capturer.missionId = scrapbook.getUuid();

// index.dat is used in legacy ScrapBook
// index.rdf and ^metadata^ are used in MAFF
// http://maf.mozdev.org/maff-specification.html
capturer.defaultFilesSet = new Set(["index.dat", "index.rdf", "^metadata^"]);

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
 *     - {integer} params.tabId
 *     - {integer} params.frameId
 *     - {boolean} params.saveBeyondSelection
 *     - {string} params.mode
 *     - {string} params.options - preset options that overwrites default
 * @return {Promise}
 */
capturer.captureTab = async function (params) {
  try {
    const {tabId, frameId, saveBeyondSelection, mode, options} = params;
    let {url, title, discarded} = await browser.tabs.get(tabId);

    // redirect headless capture
    // if frameId not provided, use current tab title and favIcon
    if (mode === "bookmark" || mode === "source") {
      if (!isNaN(frameId)) {
        ({url, title} = await browser.webNavigation.getFrame({tabId, frameId}));
      }
      return await capturer.captureHeadless({url, title, mode, options});
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
      },
      options: Object.assign(scrapbook.getOptions("capture"), options),
    };

    // save whole page beyond selection?
    message.options["capture.saveBeyondSelection"] = !!saveBeyondSelection;

    // Simply detect the main frame and executeScript for allFrames doesn't
    // work since it's possible that only partial frames have the content
    // script loaded. E.g. the user ran this when the main frame hadn't been
    // completed and some subframes hadn't been loaded.
    isDebug && console.debug("(main) send", source, message);
    capturer.log(`Capturing (document) ${source} ...`);

    // throw error for discarded tab
    // note that tab.discarded is undefined in older Firefox version
    if (discarded === true) {
      throw new Error(scrapbook.lang("ErrorTabDiscarded"));
    }

    const tasks = [];
    const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
    (await browser.webNavigation.getAllFrames({tabId})).forEach(({frameId, url}) => {
      if (!scrapbook.isContentPage(url, allowFileAccess)) { return; }

      // Send a test message to check whether content script is loaded.
      // If no content script, we get an error saying connection cannot be established.
      tasks[tasks.length] = capturer.invoke("isScriptLoaded", null, {tabId, frameId})
        .catch(async (ex) => {
          isDebug && console.debug("inject content scripts", tabId, frameId, url);
          try {
            await browser.tabs.executeScript(tabId, {frameId, file: "/lib/browser-polyfill.js"});
            await browser.tabs.executeScript(tabId, {frameId, file: "/core/common.js"});
            await browser.tabs.executeScript(tabId, {frameId, file: "/capturer/common.js"});
            await browser.tabs.executeScript(tabId, {frameId, file: "/capturer/content.js"});
          } catch (ex) {
            // Chromium may fail to inject content script to some pages due to unclear reason.
            // Record the error and pass.
            console.error(ex);
            const source = `[${tabId}:${frameId}] ${url}`;
            const err = scrapbook.lang("ErrorContentScriptExecute", [source, ex.message]);
            capturer.error(err);
          }
        });
    });
    await Promise.all(tasks);

    const response = await capturer.invoke("captureDocumentOrFile", message, {tabId, frameId});
    isDebug && console.debug("(main) response", source, response);
    capturer.captureInfo.delete(timeId);
    if (response.error) { throw new Error(response.error.message); }
    return response;
  } catch (ex) {
    console.error(ex);
    const err = `Fatal error: ${ex.message}`;
    capturer.error(err);
    return {error: {message: err}};
  }
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.title
 *     - {string} params.mode
 *     - {string} params.options - preset options that overwrites default
 * @return {Promise}
 */
capturer.captureHeadless = async function (params) {
  try {
    const {url, refUrl, title, mode, options} = params;

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
      },
      options: Object.assign(scrapbook.getOptions("capture"), options),
    };

    isDebug && console.debug("(main) capture", source, message);
    capturer.log(`Capturing (${mode}) ${source} ...`);

    let response;
    switch (mode) {
      case "bookmark": {
        response = await capturer.captureBookmark(message);
        break;
      }
      case "source":
      default: {
        response = await capturer.captureUrl(message);
        break;
      }
    }

    isDebug && console.debug("(main) response", source, response);
    capturer.captureInfo.delete(timeId);
    if (response.error) { throw new Error(response.error.message); }
    return response;
  } catch(ex) {
    console.error(ex);
    const err = `Fatal error: ${ex.message}`;
    capturer.error(err);
    return {error: {message: err}};
  }
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
capturer.captureUrl = async function (params) {
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
  const accessCurrent = (async () => {
    try {
      // fail out if sourceUrl is relative,
      // or it will be treated as relative to this extension page.
      if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
        throw new Error(`URL not resolved.`);
      }

      const xhr = await scrapbook.xhr({
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
      });

      // Request aborted, only when a previous access is found.
      // Return that Promise.
      if (!xhr) { return accessPreviousRedirected; }

      const doc = xhr.response;
      if (doc) {
        return await capturer.captureDocumentOrFile({
          doc,
          refUrl,
          title,
          settings,
          options,
        });
      } else {
        return await capturer.captureFile({
          url: sourceUrl,
          refUrl,
          title,
          settings: params.settings,
          options: params.options,
        });
      }
    } catch (ex) {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    }
  })();

  accessMap.set(accessToken, accessCurrent);
  return accessCurrent;
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
capturer.captureBookmark = async function (params) {
  isDebug && console.debug("call: captureBookmark", params);

  const {url: sourceUrl, refUrl, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  let {title} = params;
  let favIconUrl;

  try {
    // attempt to retrieve title and favicon from source page
    try {
      // cannot assign "referer" header directly
      // the prefix will be removed by the onBeforeSendHeaders listener
      const requestHeaders = {};
      if (refUrl && sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
        requestHeaders["X-WebScrapBook-Referer"] = refUrl;
      }

      const doc = await scrapbook.xhr({
        url: sourceUrl.startsWith("data:") ? scrapbook.splitUrlByAnchor(sourceUrl)[0] : sourceUrl,
        responseType: "document",
        requestHeaders,
      }).response;

      // specified sourceUrl may not be a document, maybe a malformed xhtml?
      if (doc) {
        // use the document title if not provided
        if (!title) {
          title = doc.title;
        }

        // use the document favIcon
        // "rel" is matched case-insensitively
        // The "~=" selector checks for "icon" separated by space,
        // not including "-icon" or "_icon".
        let elem = doc.querySelector('link[rel~="icon"][href]');
        if (elem) {
          favIconUrl = elem.href;
        }
      }
    } catch (ex) {
      console.error(ex);
    }

    let html;
    {
      const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(sourceUrl) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="bookmark"' : 
          "";
      const titleElem = title ? `<title>${scrapbook.escapeHtml(title, false)}</title>\n` : "";
      const favIconElem = favIconUrl ? `<link rel="shortcut icon" href="${favIconUrl}">` : "";
      html = `<!DOCTYPE html>
  <html${meta}>
  <head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(sourceUrl)}">
  ${titleElem}${favIconElem}</head>
  <body>
  Bookmark for <a href="${scrapbook.escapeHtml(sourceUrl)}">${scrapbook.escapeHtml(sourceUrl, false)}</a>
  </body>
  </html>`;
    }

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
      return await capturer.saveBlobInMemory({blob: dataBlob});
    }

    filename = await capturer[saveMethod]({
      timeId,
      blob: dataBlob,
      directory: targetDir,
      filename,
      sourceUrl,
      autoErase: false,
      savePrompt,
    });

    return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
  } catch (ex) {
    console.warn(ex);
    capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
    return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
  }
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
capturer.captureFile = async function (params) {
  try {
    isDebug && console.debug("call: captureFile", params);

    const {url: sourceUrl, refUrl, title, charset, settings, options} = params;
    const {timeId} = settings;

    const response = await capturer.downloadFile({
      url: sourceUrl,
      refUrl,
      settings,
      options,
    });

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
      return await capturer.saveDocument({
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
  } catch (ex) {
    console.error(ex);
    return {error: {message: ex.message}};
  }
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise}
 */
capturer.registerDocument = async function (params) {
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
capturer.saveDocument = async function (params) {
  isDebug && console.debug("call: saveDocument", params);

  const {data, documentName, sourceUrl, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  try {
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
            return await capturer.saveBlobInMemory({blob: dataBlob});
          }

          capturer.log(`Preparing download...`);
          return await capturer[saveMethod]({
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
          await p;

          {
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
              return await capturer.saveBlobInMemory({blob: dataBlob});
            }

            capturer.log(`Preparing download...`);
            return await capturer[saveMethod]({
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
          const zipBlob = await zip.generateAsync({type: "blob", mimeType: "application/html+zip"});
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
            return await capturer.saveBlobInMemory({blob: zipBlob});
          }

          capturer.log(`Preparing download...`);
          return await capturer[saveMethod]({
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
          {
            const zipBlob = await zip.generateAsync({type: "blob", mimeType: "application/x-maff"});
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
              return await capturer.saveBlobInMemory({blob: zipBlob});
            }

            capturer.log(`Preparing download...`);
            return await capturer[saveMethod]({
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
          }
        }
        break;
      }

      case "folder":
      default: {
        const targetDir = options["capture.scrapbookFolder"] + "/data/" + timeId;
        const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
        let filename = documentName + ext;
        filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

        filename = await capturer.saveBlob({
          timeId,
          blob: new Blob([data.content], {type: data.mime}),
          directory: targetDir,
          filename,
          sourceUrl,
          autoErase: !settings.frameIsMain || (ext === ".xhtml"),
          savePrompt: false,
        });

        if (settings.frameIsMain && (ext === ".xhtml")) {
          // create index.html that redirects to index.xhtml
          const html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
          const blob = new Blob([html], {type: "text/html"});
          await capturer.saveBlob({
            timeId,
            blob,
            directory: targetDir,
            filename: "index.html",
            sourceUrl,
            autoErase: false,
            savePrompt: false,
          });
        }

        return {timeId, sourceUrl, targetDir, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        break;
      }
    }
  } catch (ex) {
    console.warn(ex);
    capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
    return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
  }
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
capturer.downloadFile = async function (params) {
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

  const accessCurrent = (async () => {
    try {
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

          let blob;
          if (capturer[rewriteMethod]) {
            blob = await capturer[rewriteMethod]({
              settings,
              options,
              data: file,
              charset: null,
              url: null,
            });
          } else {
            blob = file;
          }
          return await capturer.downloadBlob({
            settings,
            options,
            blob,
            filename,
            sourceUrl,
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

          const blob = await capturer[rewriteMethod]({
            settings,
            options: innerOptions,
            data: file,
            charset: null,
            url: null,
          });
          return {url: await scrapbook.readFileAsDataURL(blob)};
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
      const xhr = await scrapbook.xhr({
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

          // if header Content-Type (MIME) is defined:
          // 1. If the file has no extension, assign one according to MIME,
          //    except for certain MIMEs.
          //    (For example, "application/octet-stream" can be anything,
          //    and guessing a "bin" is meaningless.)
          // 2. For several usual MIMEs, if the file extension doesn't match
          //    MIME, append a matching extension to prevent the file be
          //    assigned a bad MIME when served via HTTP, which could cause
          //    the browser to reject it.  For example, a CSS file named 
          //    "foo.php" may be served as "application/x-httpd-php", and
          //    modern browsers would refuse loading the CSS).
          //
          // Basic MIMEs listed in MAFF spec should be included:
          // http://maf.mozdev.org/maff-specification.html
          if (headers.contentType) {
            const mime = headers.contentType;
            let [base, extension] = scrapbook.filenameParts(filename);
            if ((!extension && ![
                  "application/octet-stream",
                ].includes(mime)) || ([
                  "text/html",
                  "text/xml",
                  "text/css",
                  "text/javascript",
                  "application/javascript",
                  "application/x-javascript",
                  "text/ecmascript",
                  "application/ecmascript",
                  "image/bmp",
                  "image/jpeg",
                  "image/gif",
                  "image/png",
                  "image/svg+xml",
                  "audio/wav",
                  "audio/x-wav",
                  "audio/mp3",
                  "audio/ogg",
                  "application/ogg",
                  "audio/mpeg",
                  "video/mp4",
                  "video/webm",
                  "video/ogg",
                ].includes(mime) && !Mime.allExtensions(mime).includes(extension.toLowerCase()))) {
              extension = Mime.extension(mime);
              if (extension) {
                filename += "." + extension;
              }
            }
          }

          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
          filename = capturer.getUniqueFilename(timeId, filename);

          // record the currently available filename
          // we need this data for early return of circular referencing
          accessCurrent.filename = filename;
        },
      });

      // Request aborted, only when a previous access is found.
      // Return that Promise.
      if (!xhr) { return accessPreviousReturn; }

      let blob;
      if (capturer[rewriteMethod]) {
        blob = await capturer[rewriteMethod]({
          settings,
          options,
          data: xhr.response,
          charset: headers.charset,
          url: xhr.responseURL,
        });
      } else {
        blob = xhr.response;
      }
      return await capturer.downloadBlob({
        settings,
        options,
        blob,
        filename,
        sourceUrl,
      });
    } catch (ex) {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    }
  })();

  accessMap.set(accessToken, accessCurrent);
  return accessCurrent;
};

// @TODO: accessMap cache for same URL
/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 * @return {Promise}
 */
capturer.downLinkFetchHeader = async function (params) {
  isDebug && console.debug("call: downLinkFetchHeader", params);

  const {url: sourceUrl, refUrl} = params;
  const [sourceUrlMain] = scrapbook.splitUrlByAnchor(sourceUrl);

  const headers = {};

  // cannot assign "referer" header directly
  // the prefix will be removed by the onBeforeSendHeaders listener
  const requestHeaders = {};
  if (refUrl) { requestHeaders["X-WebScrapBook-Referer"] = refUrl; }

  let xhr;
  try {
    xhr = await scrapbook.xhr({
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
    });
  } catch (ex) {
    // something wrong for the XMLHttpRequest
    console.warn(ex);
    capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
    return null;
  }

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
capturer.downloadBlob = async function (params) {
  isDebug && console.debug("call: downloadBlob", params);

  const {blob, filename, sourceUrl, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  switch (options["capture.saveAs"]) {
    case "singleHtml": {
      let dataUri = await scrapbook.readFileAsDataURL(blob);
      if (dataUri === "data:") {
        // Chromium returns "data:" if the blob is zero byte. Add the mimetype.
        dataUri = `data:${blob.type};base64,`;
      }
      if (filename) {
        dataUri = dataUri.replace(";", ";filename=" + encodeURIComponent(filename) + ";");
      }
      return {filename, url: dataUri + sourceUrlHash};
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
      const changedFilename = await capturer.saveBlob({
        timeId,
        blob,
        directory: targetDir,
        filename,
        sourceUrl,
        autoErase: true,
        savePrompt: false,
      });
      return {
        timeId,
        sourceUrl,
        targetDir,
        filename: changedFilename,
        url: scrapbook.escapeFilename(filename) + sourceUrlHash
      };
    }
  }
};

/**
 * @param {Object} params
 *     - {string} params.timeId
 *     - {Blob} params.blob
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 * @return {Promise}
 */
capturer.saveBlobNaturally = async function (params) {
  const {timeId, blob, filename, sourceUrl} = params;

  // Use the natural download attribute to generate a download.
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);

    capturer.downloadInfo.set(url, {
      timeId,
      src: sourceUrl,
      onComplete: resolve,
      onError: reject,
    });

    if (scrapbook.userAgent.is('gecko')) {
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
};

/**
 * @param {Object} params
 *     - {Blob} params.blob
 * @return {Promise}
 */
capturer.saveBlobInMemory = async function (params) {
  isDebug && console.debug("call: saveBlobInMemory", params);

  const {blob} = params;

  // In Firefox < 56 and Chromium,
  // Blob cannot be stored in browser.storage,
  // fallback to byte string.
  const text = await scrapbook.readFileAsText(blob, false);
  return {
    type: blob.type,
    data: text,
  };
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
capturer.saveBlob = async function (params) {
  isDebug && console.debug("call: saveBlob", params);

  const {timeId, blob, directory, filename, sourceUrl, autoErase, savePrompt} = params;

  return await capturer.saveUrl({
    timeId,
    url: URL.createObjectURL(blob),
    directory,
    filename,
    sourceUrl,
    autoErase,
    savePrompt,
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
capturer.saveUrl = async function (params) {
  isDebug && console.debug("call: saveUrl", params);

  const {timeId, url, directory, filename, sourceUrl, autoErase, savePrompt} = params;

  const downloadParams = {
    url,
    filename: (directory ? directory + "/" : "") + filename,
    conflictAction: "uniquify",
  };

  // Firefox < 52 gets an error if saveAs is defined
  // Firefox Android gets an error if saveAs = true
  if (!(scrapbook.userAgent.is('gecko') &&
      (scrapbook.userAgent.major < 52 || scrapbook.userAgent.is('mobile')))) {
    downloadParams.saveAs = savePrompt;
  }

  isDebug && console.debug("download start", downloadParams);
  const downloadId = await browser.downloads.download(downloadParams);
  isDebug && console.debug("download response", downloadId);
  return await new Promise((resolve, reject) => {
    capturer.downloadInfo.set(downloadId, {
      timeId,
      src: sourceUrl,
      autoErase,
      onComplete: resolve,
      onError: reject,
    });
  });
};


/**
 * Events handling
 */

browser.runtime.onMessage.addListener((message, sender) => {
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
      return fn(message.args).catch((ex) => {
        const err = `Unexpected error: ${ex.message}`;
        capturer.error(err);
      });
    }
  }
});

browser.downloads.onCreated.addListener((downloadItem) => {
  isDebug && console.debug("downloads.onCreated", downloadItem);

  const downloadInfo = capturer.downloadInfo;
  const {id, url, filename} = downloadItem;
  if (!downloadInfo.has(url)) { return; }

  // In Chromium, the onCreated is fired when the "Save as" prompt popups.
  //
  // In Firefox, the onCreated is fired only when the user clicks
  // save in the "Save as" prompt, and no event if the user clicks
  // cancel.
  //
  // We wait until the user clicks save (or cancel in Chromium) to resolve
  // the Promise (and then the window may close).
  if (scrapbook.userAgent.is('gecko')) {
    downloadInfo.get(url).onComplete(scrapbook.filepathParts(filename)[1]);
  } else {
    downloadInfo.set(id, downloadInfo.get(url));
  }
  downloadInfo.delete(url);
});

browser.downloads.onChanged.addListener(async (downloadDelta) => {
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  const downloadId = downloadDelta.id, downloadInfo = capturer.downloadInfo;
  if (!downloadInfo.has(downloadId)) { return; }

  let erase = true;
  try {
    if (downloadDelta.state && downloadDelta.state.current === "complete") {
      const results = await browser.downloads.search({id: downloadId});
      const [dir, filename] = scrapbook.filepathParts(results[0].filename);
      downloadInfo.get(downloadId).onComplete(filename);
    } else if (downloadDelta.error) {
      downloadInfo.get(downloadId).onError(new Error(downloadDelta.error.current));
    } else {
      erase = false;
    }
  } catch (ex) {
    console.error(ex);
  }

  if (erase) {
    // erase the download history of additional downloads (autoErase = true)
    try {
      if (downloadInfo.get(downloadId).autoErase) {
        const erasedIds = await browser.downloads.erase({id: downloadId});
      }
      downloadInfo.delete(downloadId);
    } catch (ex) {
      console.error(ex);
    }
  }
});

// init
document.addEventListener("DOMContentLoaded", async function () {
  scrapbook.loadLanguages(document);

  capturer.logger = document.getElementById('logger');
  capturer.downloader = document.getElementById('downloader');

  await scrapbook.loadOptions();

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

  let autoClose = true;
  if (missionId) {
    // use the missionId to receive further message
    // and avoids auto-closing
    capturer.missionId = missionId;

    autoClose = false;
  } else if (tabFrameList) {
    for (const {tabId, frameId} of tabFrameList) {
      const source = `[${tabId}:${frameId}]`;
      let response;
      try {
        response = await capturer.captureTab({
          tabId,
          frameId,
          saveBeyondSelection,
          mode,
        });
      } catch (ex) {
        const err = `Unexpected error: ${ex.message}`;
        capturer.error(err);
        response = {error: {message: err}};
      }

      if (response.error) { autoClose = false; }
      else { capturer.log(`Done.`); }
      await scrapbook.delay(5);
    }
  } else if (urlTitleList) {
    for (const {url, title} of urlTitleList) {
      const source = `${url}`;
      let response;
      try {
        response = await capturer.captureHeadless({
          url,
          title,
          mode,
        });
      } catch (ex) {
        const err = `Unexpected error: ${ex.message}`;
        console.error(err);
        response = {error: {message: err}};
      }

      if (response.error) { autoClose = false; }
      else { capturer.log(`Done.`); }
      await scrapbook.delay(5);
    }
  } else if (!urlObj.search) {
    capturer.error(`Nothing to capture.`);
    autoClose = false;
  } else {
    capturer.error(`Unexpected error: Parameters not supported.`);
    autoClose = false;
  }

  if (!isDebug && autoClose && scrapbook.getOption("capture.autoCloseDialog")) {
    await scrapbook.delay(1000);
    if (browser.windows) {
      const win = await browser.windows.getCurrent();
      return browser.windows.remove(win.id);
    } else {
      const tab = await browser.tabs.getCurrent();
      return browser.tabs.remove(tab.id);
    }
  }
});

})(this, this.document, this.browser);
