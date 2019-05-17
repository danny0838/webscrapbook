/******************************************************************************
 *
 * Background script of the main capturer (capturer.html).
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 * @override {boolean} capturer.isContentScript
 *****************************************************************************/

((window, document, browser) => {

// overwrite the value of common.js to define this is not a content script
capturer.isContentScript = false;

// whether the capturer is ready to receive an external command
capturer.ready = false;

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
 * Prevent filename conflict. Appends a number if the given filename is used.
 *
 * Filename and path limitation:
 * - Windows API: fullpath < 260 (UTF-16) chars; filename <= 255 (UTF-16) chars
 * - Ext4: filename <= 255 (UTF-8) bytes; fullpath <= 4096 (UTF-8) bytes
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
 * Get a unique (deduplicated) filename for downloading
 *
 * @param {Object} params
 *     - {string} params.filename - may contain directory
 *     - {boolean} params.isFile
 *     - {string} params.options
 * @return {string} The deduplicated filename.
 */
capturer.getAvailableFilename = async function (params) {
  isDebug && console.debug("call: getAvailableFilename", params);

  const {filename, isFile, options} = params;

  const [dir, base] = scrapbook.filepathParts(filename);
  const [basename, ext] = isFile ? scrapbook.filenameParts(base) : [base, ""];

  let isFilenameTaken;
  switch (options["capture.saveTo"]) {
    case "server": {
      await server.init();
      const prefix = server.books[server.bookId].dataUrl +
          scrapbook.escapeFilename(dir ? dir + '/' : '');
      isFilenameTaken = async (path) => {
        const target = prefix + scrapbook.escapeFilename(path);
        const info = await server.request({
          url: target + '?f=json',
          method: "GET",
        }).then(r => r.json()).then(r => r.data);
        return info.type !== null;
      };
      break;
    }
    case "folder": {
      const blob = new Blob([], {type: "text/plain"});
      const url = URL.createObjectURL(blob);
      const prefix = options["capture.saveFolder"] + "/" + (dir ? dir + '/' : '');
      isFilenameTaken = async (path) => {
        const id = await browser.downloads.download({
          url,
          filename: prefix + path,
          conflictAction: "uniquify",
          saveAs: false,
        });
        const newFilename = await new Promise((resolve, reject) => {
          const onChanged = async (delta) => {
            if (delta.id !== id) { return; }
            if (delta.filename) {
              // Chromium: an event with filename change is triggered before download
              const filename = delta.filename.current;
              browser.downloads.onChanged.removeListener(onChanged);
              await browser.downloads.erase({id});
              resolve(filename);
            } else if (delta.state && delta.state.current === "complete") {
              browser.downloads.onChanged.removeListener(onChanged);
              const items = await browser.downloads.search({id});
              const item = items[0];
              const filename = item.filename;
              if (item.exists) { await browser.downloads.removeFile(id); }
              await browser.downloads.erase({id});
              resolve(filename);
            } else if (delta.error) {
              browser.downloads.onChanged.removeListener(onChanged);
              await browser.downloads.erase({id});
              reject(new Error(`Download interruped: ${delta.error.current}.`));
            }
          };
          browser.downloads.onChanged.addListener(onChanged);
        });
        return scrapbook.filepathParts(newFilename)[1] !== path;
      };
      break;
    }
    default: {
      return scrapbook.filepathParts(filename)[1];
    }
  }

  let index = 0, path = base;
  while (await isFilenameTaken(path)) {
    path = basename + '(' + (++index) + ')' + (ext ? '.' + ext : '');
  }
  return path;
};

/**
 * Attempt to access a resource from the web and returns the result.
 *
 * An algorithm to prevent duplicated requests is implemented.
 *
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.role
 *     - {string} params.responseType
 *     - {integer} params.timeout
 *     - {Objet} params.hooks
 *     - {Objet} params.settings
 *     - {Objet} params.options
 */
capturer.access = async function (params) {
  /**
   * Get a unique token for an access.
   */
  const getAccessToken = function (url, role) {
    let token = [scrapbook.splitUrlByAnchor(url)[0], role || "blob"].join("\t");
    token = scrapbook.sha1(token, "TEXT");
    return token;
  };

  /**
   * @param {Object} params
   *     - {Object} params.headers
   *     - {string} params.refUrl
   *     - {string} params.targetUrl
   *     - {Object} params.options
   */
  const setReferrer = function (params) {
    const {
      headers,
      refUrl,
      targetUrl,
      options = {},
    } = params;

    if (!refUrl) { return; }
    if (!refUrl.startsWith('http:') && !refUrl.startsWith('https:')) { return; }
    if (refUrl.startsWith('https:') && (!targetUrl || !targetUrl.startsWith('https:'))) { return; }

    // cannot assign "referer" header directly
    // the prefix will be removed by the onBeforeSendHeaders listener
    let referrer;
    let mode = options["capture.requestReferrer"];

    if (mode === "auto") {
      const u = new URL(refUrl);
      const t = new URL(targetUrl);
      if (u.origin !== t.origin) {
        mode = "origin";
      } else {
        mode = "all";
      }
    }

    switch (mode) {
      case "none": {
        // no referrer
        break;
      }
      case "all": {
        referrer = scrapbook.splitUrlByAnchor(refUrl)[0];
        break;
      }
      case "origin":
      default: {
        const u = new URL(refUrl);
        u.pathname = "/";
        u.search = u.hash = "";
        referrer = u.href;
        break;
      }
    }

    if (referrer) {
      headers["X-WebScrapBook-Referer"] = referrer;
    }
    return headers;
  };
  
  const access = async function (params) {
    isDebug && console.debug("call: access", params);

    const {role, url: sourceUrl, refUrl, responseType = 'blob', timeout, hooks = {}, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

    const {timeId} = settings;
    if (!capturer.captureInfo.has(timeId)) { capturer.captureInfo.set(timeId, {}); }
    const accessMap = capturer.captureInfo.get(timeId).accessMap = capturer.captureInfo.get(timeId).accessMap || new Map();
    const accessToken = getAccessToken(sourceUrlMain, role);

    let urlHash = sourceUrlHash;

    // check for previous access
    {
      const accessPrevious = accessMap.get(accessToken);

      if (accessPrevious) {
        let response;
        if (hooks.duplicate) {
          response = await hooks.duplicate({
            access: accessPrevious,
            url: sourceUrlMain,
            hash: sourceUrlHash,
          });
        } else {
          response = await accessPrevious;
        }
        return response;
      }
    }

    const accessCurrent = (async () => {
      let response;
      try {
        if (hooks.preRequest) {
          const response = await hooks.preRequest({
            url: sourceUrlMain,
            hash: sourceUrlHash,
          });
          if (typeof response !== "undefined") {
            return response;
          }
        }

        const requestHeaders = setReferrer({
          headers: {},
          refUrl,
          targetUrl: sourceUrlMain,
          options,
        });

        let isDuplicateAbort = false;
        let headers = {};
        const xhr = await scrapbook.xhr({
          url: sourceUrlMain,
          responseType,
          requestHeaders,
          timeout,
          onreadystatechange(xhr) {
            if (xhr.readyState !== 2) { return; }

            // check for previous access if redirected
            const [responseUrlMain, responseUrlHash] = scrapbook.splitUrlByAnchor(xhr.responseURL);
            if (responseUrlMain !== sourceUrlMain) {
              urlHash = responseUrlHash;

              const responseAccessToken = getAccessToken(responseUrlMain, role);
              const responseAccessPrevious = accessMap.get(responseAccessToken);
              if (responseAccessPrevious) {
                isDuplicateAbort = true;
                if (hooks.duplicate) {
                  response = hooks.duplicate({
                    access: responseAccessPrevious,
                    url: responseUrlMain,
                    hash: urlHash,
                  });
                } else {
                  response = responseAccessPrevious;
                }
                xhr.abort();
                return;
              }

              accessMap.set(responseAccessToken, accessCurrent);
            }

            // get headers
            if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
              if (hooks.preHeaders) {
                hooks.preHeaders({
                  access: accessCurrent,
                  xhr,
                  hash: urlHash,
                  headers,
                });
              } else {
                if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:")) {
                  const headerContentType = xhr.getResponseHeader("Content-Type");
                  if (headerContentType) {
                    const contentType = scrapbook.parseHeaderContentType(headerContentType);
                    headers.contentType = contentType.type;
                    headers.charset = contentType.parameters.charset;
                  }
                  const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
                  if (headerContentDisposition) {
                    const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
                    headers.isAttachment = (contentDisposition.type === "attachment");
                    headers.filename = contentDisposition.parameters.filename;
                  }
                }
              }
              if (hooks.postHeaders) {
                hooks.postHeaders({
                  access: accessCurrent,
                  xhr,
                  hash: urlHash,
                  headers,
                });
              }
            }
          },
        });

        // This xhr is resolved to undefined when aborted.
        if (!xhr && isDuplicateAbort) {
          return response;
        }

        response = {
          access: accessCurrent,
          xhr,
          hash: urlHash,
          headers,
        };

        if (hooks.response) {
          response = await hooks.response(response);
        }
      } catch (ex) {
        // something wrong with the XMLHttpRequest
        if (hooks.error) {
          response = await hooks.error({
            ex,
            access: accessCurrent,
          });
        } else {
          throw ex;
        }
      }
      return response;
    })();

    accessMap.set(accessToken, accessCurrent);
    return accessCurrent;
  };

  capturer.access = access;
  return await access(params);
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.timeId
 *     - {string} params.title
 *     - {string} params.type
 *     - {string} params.sourceUrl
 *     - {string} params.favIconUrl
 *     - {string} params.charset
 */
capturer.addItemToServer = async function (params) {
  const getShaFile = (data) => {
    if (!data) { throw new Error(`Unable to fetch a file for this favicon URL.`); }

    let {ab, mime, ext} = data;

    // validate that we have a correct image mimetype
    if (!mime.startsWith('image/') && mime !== 'application/octet-stream') {
      throw new Error(`Invalid image mimetype '${mime}'.`);
    }

    // if no extension, generate one according to mime
    if (!ext) { ext = Mime.extension(mime); }

    const sha = scrapbook.sha1(ab, 'ARRAYBUFFER');
    return new File([ab], `${sha}${ext ? '.' + ext : ''}`, {type: mime});
  };

  const getFavIcon = async (favIconUrl) => {
    if (favIconUrl.startsWith("data:")) {
      return scrapbook.dataUriToFile(favIconUrl, false);
    }

    const headers = {};
    const xhr = await scrapbook.xhr({
      url: favIconUrl,
      responseType: 'blob',
      timeout: 5000,
      onreadystatechange(xhr) {
        if (xhr.readyState !== 2) { return; }
        if (xhr.status === 0) { return; }

        // get headers
        const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
        if (headerContentDisposition) {
          const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
          headers.filename = contentDisposition.parameters.filename;
        }
      },
    });

    const [, ext] = scrapbook.filenameParts(headers.filename || scrapbook.urlToFilename(xhr.responseURL));
    const blob = xhr.response;
    const mime = blob.type;

    const ab = await scrapbook.readFileAsArrayBuffer(blob);
    return getShaFile({ab, mime, ext});
  };

  await server.init();
  const book = server.books[server.bookId];
  const index = (params.targetDir ? params.targetDir + '/' : '') + params.filename;
  let icon = params.favIconUrl;
  
  // cache favicon
  if (scrapbook.isUrlAbsolute(icon)) {
    try {
      const base = book.dataUrl + index;
      const file = await getFavIcon(icon);
      const target = book.treeUrl + 'favicon/' + file.name;

      // save image if it doesn't exist
      const json = await server.request({
        url: target + '?f=json',
        method: "GET",
      }).then(r => r.json());

      if (json.data.type === null) {
        const formData = new FormData();
        formData.append('token', await server.acquireToken());
        formData.append('upload', file);

        await server.request({
          url: target + '?a=save&f=json',
          method: "POST",
          body: formData,
        });
      }

      icon = scrapbook.getRelativeUrl(target, base);
    } catch (ex) {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [icon, ex.message]));
    }
  }

  // lock tree before loading to avoid a conflict due to parallel captures
  await book.lockTree({timeout: 60});
  await book.loadTreeFiles(true);
  await book.loadMeta(true);
  await book.loadToc(true);
  await book.addItem({
    item: {
      id: params.timeId,
      index,
      title: params.title,
      type: params.type || "",
      create: params.timeId,
      source: params.sourceUrl,
      icon,
      charset: params.charset,
    },
  });
  await book.saveTreeFiles({meta: true, toc: true, useLock: false});
  await book.unlockTree();
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {integer} params.tabId
 *     - {integer} params.frameId
 *     - {boolean} params.saveBeyondSelection
 *     - {string} params.mode
 *     - {string} params.options - preset options that overwrites default
 * @return {Promise<Object>}
 */
capturer.captureTab = async function (params) {
  try {
    const {tabId, frameId, saveBeyondSelection, mode, options} = params;
    let {url, title, favIconUrl, discarded} = await browser.tabs.get(tabId);

    // redirect headless capture
    // if frameId not provided, use current tab title and favIcon
    if (mode === "bookmark" || mode === "source") {
      if (typeof frameId === "number") {
        ({url, title, favIconUrl} = await browser.webNavigation.getFrame({tabId, frameId}));
      }
      return await capturer.captureHeadless({url, title, favIconUrl, mode, options});
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

    isDebug && console.debug("(main) send", source, message);
    capturer.log(`Capturing (document) ${source} ...`);

    // throw error for a discarded tab
    // note that tab.discarded is undefined in older Firefox version
    if (discarded === true) {
      throw new Error(scrapbook.lang("ErrorTabDiscarded"));
    }

    // Simply run executeScript for allFrames by checking for nonexistence of
    // the content script in the main frame has a potential leak causing only
    // partial frames have the content script loaded. E.g. the user ran this
    // when some subframes haven't been exist. As a result, we have to check
    // existence of content script for every frame and inject on demand.
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
            await browser.tabs.executeScript(tabId, {frameId, file: "/lib/browser-polyfill.js", runAt: "document_start"});
            await browser.tabs.executeScript(tabId, {frameId, file: "/core/common.js", runAt: "document_start"});
            await browser.tabs.executeScript(tabId, {frameId, file: "/capturer/common.js", runAt: "document_start"});
            await browser.tabs.executeScript(tabId, {frameId, file: "/capturer/content.js", runAt: "document_start"});
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

    if (message.options["capture.saveTo"] === "server") {
      await capturer.addItemToServer(response);
    }

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
 *     - {string} params.favIconUrl
 *     - {string} params.mode
 *     - {string} params.options - preset options that overwrites default
 * @return {Promise<Object>}
 */
capturer.captureHeadless = async function (params) {
  try {
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

    if (message.options["capture.saveTo"] === "server") {
      await capturer.addItemToServer(response);
    }

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
 * @return {Promise<Object>}
 */
capturer.captureUrl = async function (params) {
  isDebug && console.debug("call: captureUrl", params);

  const {url: sourceUrl, refUrl, title, settings, options} = params;
  const [sourceUrlMain] = scrapbook.splitUrlByAnchor(sourceUrl);

  try {
    return await capturer.access({
      url: sourceUrl,
      refUrl,
      role: "captureUrl",
      responseType: "document",
      settings,
      options,
      hooks: {
        async preRequest({url, hash}) {
          // fail out if sourceUrl is relative,
          // or it will be treated as relative to this extension page.
          if (!scrapbook.isUrlAbsolute(url)) {
            throw new Error(`Requires an absolute URL.`);
          }
        },

        async response({xhr, headers}) {
          // generate a documentName if not specified
          if (!settings.documentName) {
            // use the filename if it has been defined by header Content-Disposition
            let filename = headers.filename ||
                sourceUrlMain.startsWith("data:") ?
                    scrapbook.dataUriToFile(sourceUrlMain).name :
                    scrapbook.urlToFilename(sourceUrlMain);

            const mime = headers.contentType || Mime.lookup(filename) || "text/html";
            if (!["text/html", "application/xhtml+xml"].includes(mime)) {
              const fn = filename.toLowerCase();
              for (let ext of Mime.allExtensions(mime)) {
                ext = "." + ext.toLowerCase();
                if (fn.endsWith(ext)) {
                  filename = filename.slice(0, -ext.length);
                  break;
                }
              }
            }

            settings.documentName = filename;
          }

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
              charset: headers.charset,
              settings,
              options,
            });
          }
        },
      },
    });
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
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise<Object>}
 */
capturer.captureBookmark = async function (params) {
  isDebug && console.debug("call: captureBookmark", params);

  const {url: sourceUrl, refUrl, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  let {title} = params;
  let {favIconUrl} = settings;

  try {
    // attempt to retrieve title and favicon from source page
    if (!title || !favIconUrl) {
      try {
        const {xhr} = await capturer.access({
          url: sourceUrl,
          refUrl,
          role: "captureBookmark.document",
          responseType: "document",
          settings,
          options,
        });

        const doc = xhr.response;

        // specified sourceUrl may not be a document, maybe a malformed xhtml?
        if (doc) {
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
        }
      } catch (ex) {
        console.error(ex);
      }
    }

    // fetch favicon as data URL
    if (favIconUrl && !favIconUrl.startsWith('data:')) {
      try {
        const {xhr} = await capturer.access({
          url: favIconUrl,
          refUrl: sourceUrl,
          role: "captureBookmark.favicon",
          settings,
          options,
        });
        favIconUrl = await scrapbook.readFileAsDataURL(xhr.response);
      } catch (ex) {
        console.error(ex);
      }
    }

    // save to meta and TOC only
    if (options["capture.saveTo"] === 'server') {
      return {
        timeId,
        title,
        type: "bookmark",
        sourceUrl,
        targetDir: '',
        filename: '',
        url: '',
        favIconUrl,
      };
    }

    let html;
    {
      const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(sourceUrl) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="bookmark"' : 
          "";
      const titleElem = title ? `<title>${scrapbook.escapeHtml(title, false)}</title>\n` : "";
      const favIconElem = favIconUrl ? `<link rel="shortcut icon" href="${scrapbook.escapeHtml(favIconUrl)}">\n` : "";
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

    const blob = new Blob([html], {type: "text/html"});
    const ext = ".htm";

    settings.filename = await capturer.getSaveFilename({
      title: title || scrapbook.filenameParts(scrapbook.urlToFilename(sourceUrl))[0] || "untitled",
      sourceUrl,
      isFolder: false,
      settings,
      options,
    });

    let targetDir;
    let filename;
    let savePrompt;
    let saveMethod;

    title = title || scrapbook.urlToFilename(sourceUrl);
    switch (options["capture.saveTo"]) {
      case 'memory': {
        // special handling (for unit test)
        return await capturer.saveBlobInMemory({blob});
      }
      case 'file': {
        filename = settings.filename + ext;
        saveMethod = "saveBlobNaturally";
        break;
      }
      case 'server': {
        // deprecated; normally we won't get here
        [targetDir, filename] = scrapbook.filepathParts(settings.filename + ext);
        savePrompt = false;
        saveMethod = "saveToServer";
        break;
      }
      case 'folder':
      default: {
        [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + settings.filename + ext);
        savePrompt = false;
        saveMethod = "saveBlob";
        break;
      }
    }

    filename = await capturer[saveMethod]({
      timeId,
      blob,
      directory: targetDir,
      filename,
      sourceUrl,
      autoErase: false,
      savePrompt,
      settings,
      options,
    });

    return {
      timeId,
      title,
      type: "bookmark",
      sourceUrl,
      targetDir,
      filename,
      url: scrapbook.escapeFilename(filename) + sourceUrlHash,
      favIconUrl,
    };
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
 * @return {Promise<Object>}
 */
capturer.captureFile = async function (params) {
  try {
    isDebug && console.debug("call: captureFile", params);

    const {url: sourceUrl, refUrl, title, charset, settings, options} = params;
    const {timeId} = settings;

    if (settings.frameIsMain) {
      settings.filename = await capturer.getSaveFilename({
        title: title || scrapbook.urlToFilename(sourceUrl) || "untitled",
        sourceUrl,
        isFolder: options["capture.saveAs"] === "folder",
        settings,
        options,
      });
    }

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
      }).then((response) => {
        // special handling
        if (options["capture.saveTo"] === 'memory') {
          return response;
        }

        return Object.assign(response, {
          type: "file",
          charset: charset || undefined,
        });
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
 * @return {Promise<Object>}
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
 *     - {Object} params.data
 *         - {string} params.data.mime
 *         - {string} params.data.charset
 *         - {string} params.data.content
 *         - {string} params.data.title
 *         - {string} params.data.favIconUrl
 *     - {string} params.documentName
 *     - {string} params.sourceUrl
 *     - {Object} params.settings
 *     - {Object} params.options
 * @return {Promise<Object>}
 */
capturer.saveDocument = async function (params) {
  isDebug && console.debug("call: saveDocument", params);

  const {data, documentName, sourceUrl, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  try {
    const title = data.title || scrapbook.urlToFilename(sourceUrl);
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
          const blob = new Blob([data.content], {type: data.mime});
          const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
          let targetDir;
          let filename;
          let savePrompt;
          let saveMethod;

          switch (options["capture.saveTo"]) {
            case 'memory': {
              // special handling (for unit test)
              return await capturer.saveBlobInMemory({blob});
            }
            case 'file': {
              filename = settings.filename + ext;
              saveMethod = "saveBlobNaturally";
              break;
            }
            case 'server': {
              [targetDir, filename] = scrapbook.filepathParts(settings.filename + ext);
              savePrompt = false;
              saveMethod = "saveToServer";
              break;
            }
            case 'folder':
            default: {
              [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + settings.filename + ext);
              savePrompt = false;
              saveMethod = "saveBlob";
              break;
            }
          }

          capturer.log(`Preparing download...`);
          return await capturer[saveMethod]({
            timeId,
            blob,
            directory: targetDir,
            filename,
            sourceUrl,
            autoErase: false,
            savePrompt,
            settings,
            options,
          }).then((filename) => {
            return {
              timeId,
              title,
              type: "",
              sourceUrl,
              targetDir,
              filename,
              url: scrapbook.escapeFilename(filename) + sourceUrlHash,
              favIconUrl: data.favIconUrl,
            };
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
          const content = await (async () => {
            const zipData = [];
            for (const [path, entry] of Object.entries(zip.files)) {
              const data = await entry.async('base64');
              zipData[zipResMap.get(path)] = {p: path, d: data};
            }

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

            return content;
          })();

          const blob = new Blob([content], {type: data.mime});
          let targetDir;
          let filename;
          let savePrompt;
          let saveMethod;

          switch (options["capture.saveTo"]) {
            case 'memory': {
              // special handling (for unit test)
              return await capturer.saveBlobInMemory({blob});
            }
            case 'file': {
              filename = settings.filename + ext;
              saveMethod = "saveBlobNaturally";
              break;
            }
            case 'server': {
              [targetDir, filename] = scrapbook.filepathParts(settings.filename + ext);
              savePrompt = false;
              saveMethod = "saveToServer";
              break;
            }
            case 'folder':
            default: {
              [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + settings.filename + ext);
              savePrompt = false;
              saveMethod = "saveBlob";
              break;
            }
          }

          capturer.log(`Preparing download...`);
          return await capturer[saveMethod]({
            timeId,
            blob,
            directory: targetDir,
            filename,
            sourceUrl,
            autoErase: false,
            savePrompt,
            settings,
            options,
          }).then((filename) => {
            return {
              timeId,
              title,
              type: "",
              sourceUrl,
              targetDir,
              filename,
              url: scrapbook.escapeFilename(filename) + sourceUrlHash,
              favIconUrl: data.favIconUrl,
            };
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
          const blob = await zip.generateAsync({type: "blob", mimeType: "application/html+zip"});
          let targetDir;
          // let filename;
          let savePrompt;
          let saveMethod;

          switch (options["capture.saveTo"]) {
            case 'memory': {
              // special handling (for unit test)
              return await capturer.saveBlobInMemory({blob});
            }
            case 'file': {
              filename = settings.filename + ".htz";
              saveMethod = "saveBlobNaturally";
              break;
            }
            case 'server': {
              [targetDir, filename] = scrapbook.filepathParts(settings.filename + ".htz");
              savePrompt = false;
              saveMethod = "saveToServer";
              break;
            }
            case 'folder':
            default: {
              [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + settings.filename + ".htz");
              savePrompt = false;
              saveMethod = "saveBlob";
              break;
            }
          }

          capturer.log(`Preparing download...`);
          return await capturer[saveMethod]({
            timeId,
            blob,
            directory: targetDir,
            filename,
            sourceUrl,
            autoErase: false,
            savePrompt,
            settings,
            options,
          }).then((filename) => {
            return {
              timeId,
              title,
              type: "",
              sourceUrl,
              targetDir,
              filename,
              url: scrapbook.escapeFilename(filename) + sourceUrlHash,
              favIconUrl: data.favIconUrl,
            };
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
          {
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
          }

          // generate and download the zip file
          const blob = await zip.generateAsync({type: "blob", mimeType: "application/x-maff"});
          let targetDir;
          // let filename;
          let savePrompt;
          let saveMethod;

          switch (options["capture.saveTo"]) {
            case 'memory': {
              // special handling (for unit test)
              return await capturer.saveBlobInMemory({blob});
            }
            case 'file': {
              filename = settings.filename + ".maff";
              saveMethod = "saveBlobNaturally";
              break;
            }
            case 'server': {
              [targetDir, filename] = scrapbook.filepathParts(settings.filename + ".maff");
              savePrompt = false;
              saveMethod = "saveToServer";
              break;
            }
            case 'folder':
            default: {
              [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + settings.filename + ".maff");
              savePrompt = false;
              saveMethod = "saveBlob";
              break;
            }
          }

          capturer.log(`Preparing download...`);
          return await capturer[saveMethod]({
            timeId,
            blob,
            directory: targetDir,
            filename,
            sourceUrl,
            autoErase: false,
            savePrompt,
            settings,
            options,
          }).then((filename) => {
            return {
              timeId,
              title,
              type: "",
              sourceUrl,
              targetDir,
              filename,
              url: scrapbook.escapeFilename(filename) + sourceUrlHash,
              favIconUrl: data.favIconUrl,
            };
          });
        }
        break;
      }

      case "folder":
      default: {
        const ext = "." + ((data.mime === "application/xhtml+xml") ? "xhtml" : "html");
        let targetDir;
        let filename = documentName + ext;
        let savePrompt = false;
        let saveMethod;

        switch (options["capture.saveTo"]) {
          case 'server': {
            targetDir = settings.filename;
            saveMethod = "saveToServer";
            break;
          }
          case 'folder':
          case 'file': // fallback
          case 'memory': // fallback
          default: {
            targetDir = options["capture.saveFolder"] + "/" + settings.filename;
            saveMethod = "saveBlob";
            break;
          }
        }

        filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

        filename = await capturer[saveMethod]({
          timeId,
          blob: new Blob([data.content], {type: data.mime}),
          directory: targetDir,
          filename,
          sourceUrl,
          autoErase: !settings.frameIsMain || (ext === ".xhtml"),
          savePrompt,
          settings,
          options,
        });

        if (settings.frameIsMain && (ext === ".xhtml")) {
          // create index.html that redirects to index.xhtml
          const html = '<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.xhtml">';
          const blob = new Blob([html], {type: "text/html"});
          await capturer[saveMethod]({
            timeId,
            blob,
            directory: targetDir,
            filename: "index.html",
            sourceUrl,
            autoErase: false,
            savePrompt,
            settings,
            options,
          });
        }

        return {
          timeId,
          title,
          type: "",
          sourceUrl,
          targetDir,
          filename,
          url: scrapbook.escapeFilename(filename) + sourceUrlHash,
          favIconUrl: data.favIconUrl,
        };
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
 * @return {Promise<Object>}
 */
capturer.downloadFile = async function (params) {
  isDebug && console.debug("call: downloadFile", params);

  const MIMES_NO_EXT_NO_MATCH = [
    "application/octet-stream",
  ];

  const MIMES_NEED_MATCH = [
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
  ];

  const MAP_ACCESS_DATA = new WeakMap();

  const downloadFile = async (params) => {
    const {url: sourceUrl, refUrl, rewriteMethod, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId, recurseChain} = settings;

    try {
      return await capturer.access({
        url: sourceUrl,
        refUrl,
        role: "downloadFile",
        settings,
        options,
        hooks: {
          async preRequest({url, hash}) {
            // fail out if sourceUrl is relative,
            // or it will be treated as relative to this extension page.
            if (!scrapbook.isUrlAbsolute(url)) {
              throw new Error(`Requires an absolute URL.`);
            }

            // special management for data URI
            if (url.startsWith("data:")) {
              /* save data URI as file? */
              if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
                const file = scrapbook.dataUriToFile(url);
                if (!file) { throw new Error("Malformed data URL."); }

                let filename = file.name;
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
                const file = scrapbook.dataUriToFile(url);
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
          },

          postHeaders({access, headers}) {
            // determine the filename
            // use the filename if it has been defined by header Content-Disposition
            let filename = headers.filename || scrapbook.urlToFilename(sourceUrl);

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
              let [base, ext] = scrapbook.filenameParts(filename);
              if ((!ext && !MIMES_NO_EXT_NO_MATCH.includes(mime)) || 
                  (MIMES_NEED_MATCH.includes(mime) && !Mime.allExtensions(mime).includes(ext.toLowerCase()))) {
                ext = Mime.extension(mime);
                if (ext) {
                  filename += "." + ext;
                }
              }
            }

            filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
            filename = capturer.getUniqueFilename(timeId, filename);

            // record the currently available filename
            // we need this data for early return of circular referencing
            MAP_ACCESS_DATA.set(access, {filename});
          },

          async response({access, xhr, hash, headers}) {
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
              filename: MAP_ACCESS_DATA.get(access).filename,
              sourceUrl,
            });
          },

          async duplicate({access, url, hash}) {
            // Normally we wait until the file be downloaded, and possibly
            // renamed, cancelled, or thrown error. However, if there is
            // a circular reference, we have to return early to pervent a
            // dead lock. This returned data could be incorrect if something
            // unexpected happen to the access.
            if (recurseChain.indexOf(sourceUrlMain) !== -1) {
              const filename = MAP_ACCESS_DATA.get(access).filename;
              return {
                filename,
                url: scrapbook.escapeFilename(filename) + hash,
                isCircular: true,
              };
            }

            return await access;
          },
        },
      });
    } catch (ex) {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    }
  };

  capturer.downloadFile = downloadFile;
  return await downloadFile(params);
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.options
 * @return {string} File extension of the URL.
 */
capturer.downLinkFetchHeader = async function (params) {
  isDebug && console.debug("call: downLinkFetchHeader", params);

  const {url: sourceUrl, refUrl, settings, options} = params;

  try {
    return await capturer.access({
      url: sourceUrl,
      refUrl,
      role: "downLinkFetchHeader",
      responseType: "blob",
      timeout: 8000,
      settings,
      options,
      hooks: {
        postHeaders({xhr}) {
          xhr.abort();
        },

        async response({xhr, headers}) {
          if (headers.filename) {
            let [, ext] = scrapbook.filenameParts(headers.filename);

            if (!ext && headers.contentType) {
              ext = Mime.extension(headers.contentType);
            }

            return ext;
          } else if (headers.contentType) {
            return Mime.extension(headers.contentType);
          } else {
            const filename = scrapbook.urlToFilename(sourceUrl);
            const [, ext] = scrapbook.filenameParts(filename);
            return ext;
          }
        },
      },
    });
  } catch (ex) {
    console.warn(ex);
    capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
    return null;
  }
};

/**
 * @kind invokable
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.refUrl
 *     - {string} params.settings
 *     - {string} params.options
 * @return {string} File extension of the URL.
 */
capturer.fetchCss = async function (params) {
  isDebug && console.debug("call: fetchCss", params);

  const {url: sourceUrl, refUrl, settings, options} = params;

  try {
    return await capturer.access({
      url: sourceUrl,
      refUrl,
      role: "fetchCss",
      settings,
      options,
      hooks: {
        async response({xhr, headers}) {
          return await scrapbook.parseCssFile(xhr.response, headers.charset);
        }
      },
    });
  } catch (ex) {
    // something wrong for the XMLHttpRequest
    return {error: {message: ex.message}};
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
 * @return {Promise<Object>}
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
      let targetDir;
      let saveMethod;

      switch (options["capture.saveTo"]) {
        case 'server': {
          targetDir = settings.filename;
          saveMethod = "saveToServer";
          break;
        }
        case 'folder':
        case 'memory': // fallback
        default: {
          targetDir = options["capture.saveFolder"] + "/" + settings.filename;
          saveMethod = "saveBlob";
          break;
        }
      }

      const changedFilename = await capturer[saveMethod]({
        timeId,
        blob,
        directory: targetDir,
        filename,
        sourceUrl,
        autoErase: true,
        savePrompt: false,
        settings,
        options,
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
 * Download a blob in a way like default browser "save as".
 *
 * @param {Object} params
 *     - {string} params.timeId
 *     - {Blob} params.blob
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 * @return {Promise<Object>}
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

  // convert BLOB data to byte string so that it can be sent via messaging
  return {
    type: blob.type,
    data: await scrapbook.readFileAsText(blob, false),
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
 * @return {Promise<string>} Filename of the saved blob.
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
 * @return {Promise<string>} Filename of the saved URL.
 */
capturer.saveUrl = async function (params) {
  isDebug && console.debug("call: saveUrl", params);

  const {timeId, url, directory, filename, sourceUrl, autoErase, savePrompt} = params;

  const downloadParams = {
    url,
    filename: (directory ? directory + "/" : "") + filename,
    conflictAction: "uniquify",
    saveAs: savePrompt,
  };

  // Firefox < 52 gets an error if saveAs is defined
  // Firefox Android gets an error if saveAs = true
  if (scrapbook.userAgent.is('gecko') &&
      (scrapbook.userAgent.major < 52 || scrapbook.userAgent.is('mobile'))) {
    delete downloadParams.saveAs;
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
 * @param {Object} params
 *     - {string} params.timeId
 *     - {string} params.blob
 *     - {string} params.directory - URL of the server
 *     - {string} params.filename
 *     - {string} params.sourceUrl
 *     - {Object} params.options
 * @return {Promise<string>} Filename of the saved blob.
 */
capturer.saveToServer = async function (params) {
  isDebug && console.debug("call: saveToServer", params);

  const {timeId, blob, directory, filename, sourceUrl, options} = params;
  await server.init();
  let newFilename = await capturer.getAvailableFilename({
    filename: (directory ? directory + '/' : '') + filename,
    isFile: true,
    options,
  });

  const target = server.books[server.bookId].dataUrl +
    scrapbook.escapeFilename((directory ? directory + '/' : '') + newFilename);

  const formData = new FormData();
  formData.append('token', await server.acquireToken());
  formData.append('upload', blob);

  try {
    await server.request({
      url: target + '?a=save&f=json',
      method: "POST",
      body: formData,
    });
  } catch (ex) {
    throw new Error(`Unable to upload to backend server: ${ex.message}`);
  }

  return newFilename;
};


/**
 * Events handling
 */

/**
 * @param {Object} message
 *     - {string} message.id
 *     - {string} message.cmd
 *     - {Object} message.args
 */
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.id !== capturer.missionId) {
    return;
  }

  isDebug && console.debug(message.cmd, "receive", `[${sender.tab ? sender.tab.id : -1}]`, message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    const fn = capturer[message.cmd.slice(9)];
    if (fn) {
      return fn(message.args).catch((ex) => {
        console.error(ex);
        const err = `Unexpected error: ${ex.message}`;
        capturer.error(err);
      });
    }
  }
});

{
  const listener = (port) => {
    const onCapturerReady = () => {
      if (port.name !== capturer.missionId) {
        return;
      }
      const onMessage = async (message) => {
        isDebug && console.debug(message.cmd, "receive", port.sender, message.args);

        if (message.cmd.slice(0, 9) == "capturer.") {
          const fn = capturer[message.cmd.slice(9)];
          if (fn) {
            try {
              const response = await fn(message.args);
              port.postMessage({
                cmd: 'capturerResponse',
                args: response,
              });
            } catch (ex) {
              console.error(ex);
              const err = `Unexpected error: ${ex.message}`;
              capturer.error(err);
            }
          }
        }
      };
      port.onMessage.addListener(onMessage);
      port.postMessage({cmd: 'capturerReady', args: {}});
    };
    if (capturer.ready) {
      onCapturerReady();
    } else {
      document.addEventListener("capturerReady", onCapturerReady);
    }
  };

  browser.runtime.onConnect.addListener(listener);

  if (browser.runtime.onConnectExternal) {
    // Available in Firefox >= 54.
    browser.runtime.onConnectExternal.addListener(listener);
  }
}

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

  let autoClose = true;
  if (!urlObj.search) {
    capturer.error(`Nothing to capture.`);
    autoClose = false;
  } else if (s.has('mid')) {
    // use the missionId to receive further message
    // and avoids auto-closing
    capturer.missionId = s.get('mid');

    autoClose = false;
  } else if (s.has('u')) {
    const urls = s.getAll('u');
    const refUrls = s.getAll('r');
    const titles = s.getAll('t');
    const favIconUrls = s.getAll('f');
    const mode = s.get('m') || undefined;

    for (let i = 0, I = urls.length; i < I; i++) {
      const url = urls[i];
      const refUrl = refUrls[i];
      const title = titles[i];
      const favIconUrl = favIconUrls[i];
      let response;
      try {
        response = await capturer.captureHeadless({
          url,
          refUrl,
          title,
          favIconUrl,
          mode,
        });
      } catch (ex) {
        console.error(ex);
        const err = `Unexpected error: ${ex.message}`;
        console.error(err);
        response = {error: {message: err}};
      }

      if (response.error) { autoClose = false; }
      else { capturer.log(`Done.`); }
      await scrapbook.delay(5);
    }
  } else if (s.has('t')) {
    const tabFrameList = s.get('t').split(',').map(x => {
      let [tabId, frameId] = x.split(':');
      tabId = parseInt(tabId, 10);
      if (isNaN(tabId)) { tabId = -1; }
      frameId = parseInt(frameId, 10);
      if (isNaN(frameId)) { frameId = undefined; }
      return {tabId, frameId};
    });
    const mode = s.get('m') || undefined;
    const saveBeyondSelection = !!s.get('f');
    
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
        console.error(ex);
        const err = `Unexpected error: ${ex.message}`;
        capturer.error(err);
        response = {error: {message: err}};
      }

      if (response.error) { autoClose = false; }
      else { capturer.log(`Done.`); }
      await scrapbook.delay(5);
    }
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
  
  document.dispatchEvent(new CustomEvent('capturerReady'));
});

document.addEventListener("capturerReady", function (event) {
  capturer.ready = true;
});

})(this, this.document, this.browser);
