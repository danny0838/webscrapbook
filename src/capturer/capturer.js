/******************************************************************************
 *
 * Background script of the main capturer (capturer.html).
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} server
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

/**
 * @typedef {Object} missionCaptureInfo
 * @property {Set<string>} files
 * @property {Map<string, Promise>} accessMap
 * @property {JSZip} zip
 */

/**
 * @type {ProxyMap<string~timeId, missionCaptureInfo>}
 */
capturer.captureInfo = new scrapbook.ProxyMap(() => ({
  // index.dat is used in legacy ScrapBook
  // index.rdf and ^metadata^ are used in MAFF
  // http://maf.mozdev.org/maff-specification.html
  files: new Set(["index.dat", "index.rdf", "^metadata^"]),

  accessMap: new Map(),
  zip: new JSZip(),
}));

/**
 * @typedef {Object} downloadHook
 * @property {string} timeId
 * @property {string} src
 * @property {boolean} autoErase
 * @property {Function} onComplete
 * @property {Function} onError
 */

/**
 * @type {Map<string~urlOrDownloadId, downloadHook>}
 */
capturer.downloadHooks = new Map();

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
  const files = capturer.captureInfo.get(timeId).files;

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
 * @param {string} params.filename - may contain directory
 * @param {boolean} params.isFile
 * @param {string} params.options
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
      // Firefox < 65 has a bug that a zero-sized file is never found by
      // browser.downloads.search. Fill the probe file with a null byte to work
      // around.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1503760
      const blob = new Blob(['\x00'], {type: "application/octet-stream"});
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
 * @param {string} params.url
 * @param {string} params.role
 * @param {string} params.responseType
 * @param {integer} params.timeout
 * @param {Objet} params.hooks
 * @param {Objet} params.settings
 * @param {Objet} params.options
 */
capturer.access = async function (params) {
  /**
   * Get a unique token for an access.
   */
  const getAccessToken = function (url, role) {
    let token = [url, role || "blob"].join("\t");
    token = scrapbook.sha1(token, "TEXT");
    return token;
  };

  /**
   * @param {Object} params
   * @param {Object} params.headers
   * @param {string} params.refUrl
   * @param {string} params.targetUrl
   * @param {Object} params.options
   */
  const setReferrer = function ({headers, refUrl, targetUrl, options = {}}) {
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
    const accessMap = capturer.captureInfo.get(timeId).accessMap;
    const accessToken = getAccessToken(sourceUrlMain, role);

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

    const deferred = new scrapbook.Deferred();
    const accessCurrent = deferred.promise;
    (async () => {
      let response;
      try {
        if (hooks.preRequest) {
          const response = await hooks.preRequest({
            access: accessCurrent,
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

        let isIntendedAbort = false;
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
              const responseAccessToken = getAccessToken(responseUrlMain, role);
              const responseAccessPrevious = accessMap.get(responseAccessToken);
              if (responseAccessPrevious) {
                isIntendedAbort = true;
                if (hooks.duplicate) {
                  response = hooks.duplicate({
                    access: responseAccessPrevious,
                    url: sourceUrlMain,
                    hash: sourceUrlHash,
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
                // synchronous only
                const _response = hooks.preHeaders({
                  access: accessCurrent,
                  xhr,
                  url: sourceUrlMain,
                  hash: sourceUrlHash,
                  headers,
                });
                if (typeof _response !== "undefined") {
                  isIntendedAbort = true;
                  response = _response;
                  xhr.abort();
                  return;
                }
              } else {
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
                const headerContentLength = xhr.getResponseHeader("Content-Length");
                if (headerContentLength) {
                  headers.contentLength = parseInt(headerContentLength, 10);
                }
              }
            }

            if (hooks.postHeaders) {
              // synchronous only
              const _response = hooks.postHeaders({
                access: accessCurrent,
                xhr,
                url: sourceUrlMain,
                hash: sourceUrlHash,
                headers,
              });
              if (typeof _response !== "undefined") {
                isIntendedAbort = true;
                response = _response;
                xhr.abort();
                return;
              }
            }
          },
        });

        // This xhr is resolved to undefined when aborted.
        if (!xhr && isIntendedAbort) {
          return response;
        }

        response = {
          access: accessCurrent,
          xhr,
          url: sourceUrlMain,
          hash: sourceUrlHash,
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
            url: sourceUrlMain,
            hash: sourceUrlHash,
          });
        } else {
          throw ex;
        }
      }
      return response;
    })().then(deferred.resolve, deferred.reject);

    accessMap.set(accessToken, accessCurrent);
    accessCurrent.id = accessToken;

    return accessCurrent;
  };

  capturer.access = access;
  return await access(params);
};

/**
 * @kind invokable
 * @param {Object} params
 * @param {string} params.timeId
 * @param {string} params.title
 * @param {string} params.type
 * @param {string} params.sourceUrl
 * @param {string} params.favIconUrl
 * @param {string} params.charset
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
  if (!!book.config.no_tree) {
    return;
  }

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
 * @param {integer} params.tabId
 * @param {integer} params.frameId
 * @param {boolean} params.saveBeyondSelection
 * @param {string} params.mode
 * @param {string} params.options - preset options that overwrites default
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
    if (mode === 'save') {
      capturer.log(`Saving (document) ${source} ...`);
    } else {
      capturer.log(`Capturing (document) ${source} ...`);
    }

    // throw error for a discarded tab
    // note that tab.discarded is undefined in older Firefox version
    if (discarded === true) {
      throw new Error(scrapbook.lang("ErrorTabDiscarded"));
    }

    if (mode === 'save') {
      // Load server config and verify whether we can actually save the page.
      await server.init();
      const book = server.books[server.bookId];

      if (!!book.config.no_tree) {
        throw new Error(scrapbook.lang("ErrorSaveBookNoTree"));
      }

      if (!url.startsWith(book.dataUrl)) {
        throw new Error(scrapbook.lang("ErrorSaveNotUnderDataDir", [url]));
      }

      const mime = Mime.lookup(scrapbook.urlToFilename(url));
      if (!["text/html", "application/xhtml+xml"].includes(mime)) {
        throw new Error(scrapbook.lang("ErrorSaveNonHtml", [url]));
      }
    }

    (await scrapbook.initContentScripts(tabId)).forEach(({tabId, frameId, url, error, injected}) => {
      if (error) {
        const source = `[${tabId}:${frameId}] ${url}`;
        const err = scrapbook.lang("ErrorContentScriptExecute", [source, error]);
        capturer.error(err);
      }
    });

    if (mode === 'save') {
      const response = await capturer.invoke("retrieveDocumentContent", message, {tabId, frameId});
      isDebug && console.debug("(main) response", source, response);

      const book = server.books[server.bookId];
      const modify = scrapbook.dateToId();

      // acquire a lock
      await book.lockTree();

      try {
        // validate if we can modify the tree
        if (!await book.validateTree()) {
          throw new Error(scrapbook.lang('ScrapBookMainErrorServerTreeChanged'));
        }

        for (const [url, data] of Object.entries(response)) {
          const target = scrapbook.splitUrl(url)[0];

          // only save files under dataDir
          if (!url.startsWith(book.dataUrl)) {
            capturer.warn(scrapbook.lang("ErrorSaveNotUnderDataDir", [target]));
            continue;
          }

          // forbid non-UTF-8 for data safety
          if (data.charset !== "UTF-8") {
            capturer.warn(scrapbook.lang("ErrorSaveNonUTF8", [target]));
            continue;
          }

          try {
            const file = new File([data.content], scrapbook.urlToFilename(url), {type: "text/html"});

            const formData = new FormData();
            formData.append('token', await server.acquireToken());
            formData.append('upload', file);

            await server.request({
              url: target + '?a=save&f=json',
              method: "POST",
              body: formData,
            });
            capturer.log(`Updated ${target}`);
          } catch (ex) {
            capturer.error(scrapbook.lang("ErrorSaveUploadFailure", [target, ex.message]));
          }
        }

        // update item
        const item = await book.findItemFromUrl(url);
        if (item) {
          item.modify = modify;
          book.meta[item.id] = item;
          await book.saveMeta();
        } else {
          capturer.warn(scrapbook.lang("ErrorSaveUnknownItem"));
        }
      } catch (ex) {
        await book.unlockTree();
        throw ex;
      }

      // release the lock
      await book.unlockTree();

      return {
        timeId,
        title,
        sourceUrl: url,
        favIconUrl,
      };
    }

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
 * @param {string} params.url
 * @param {string} params.refUrl
 * @param {string} params.title
 * @param {string} params.favIconUrl
 * @param {string} params.mode
 * @param {string} params.options - preset options that overwrites default
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
 * @param {string} params.url - may include hash
 * @param {string} params.refUrl
 * @param {string} params.title
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.captureUrl = async function (params) {
  isDebug && console.debug("call: captureUrl", params);

  const {url: sourceUrl, refUrl, title, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

  try {
    // fail out if sourceUrl is empty.
    if (!sourceUrlMain) {
      throw new Error(`Source URL is empty.`);
    }

    // fail out if sourceUrl is relative,
    // or it will be treated as relative to this extension page.
    if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
      throw new Error(`Requires an absolute URL.`);
    }

    return await capturer.access({
      url: sourceUrlMain,
      refUrl,
      role: "captureUrl",
      responseType: "document",
      settings,
      options,
      hooks: {
        async response({xhr, headers}) {
          // generate a documentName if not specified
          if (!settings.documentName) {
            // use the filename if it has been defined by header Content-Disposition
            let filename = headers.filename ||
                sourceUrlMain.startsWith("data:") ?
                    scrapbook.dataUriToFile(sourceUrlMain).name :
                    scrapbook.urlToFilename(xhr.responseURL);

            // remove corresponding file extension for true documents
            const mime = headers.contentType || Mime.lookup(filename) || "text/html";
            if (["text/html", "application/xhtml+xml", "image/svg+xml"].includes(mime)) {
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
              url: xhr.responseURL,
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
 * @param {string} params.url - may include hash
 * @param {string} params.refUrl
 * @param {string} params.title
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.captureBookmark = async function (params) {
  isDebug && console.debug("call: captureBookmark", params);

  const {url: sourceUrl, refUrl, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  let {title} = params;
  let {favIconUrl} = settings;

  try {
    // attempt to retrieve title and favicon from source page
    if (!title || !favIconUrl) {
      try {
        const {xhr} = await capturer.access({
          url: sourceUrlMain,
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
        const [favIconUrlMain, favIconUrlHash] = scrapbook.splitUrlByAnchor(favIconUrl);
        const {xhr} = await capturer.access({
          url: favIconUrlMain,
          refUrl: sourceUrl,
          role: "captureBookmark.favicon",
          settings,
          options,
        });
        favIconUrl = (await scrapbook.readFileAsDataURL(xhr.response)) + favIconUrlHash;
      } catch (ex) {
        console.error(ex);
      }
    }

    // save to meta and TOC only
    if (options["capture.saveTo"] === 'server') {
      await server.init();
      const book = server.books[server.bookId];
      if (!book.config.no_tree) {
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
    }

    let html;
    {
      const url = sourceUrl.startsWith("data:") ? "data:" : sourceUrl;
      const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(url) + '"' + 
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
 * @param {string} params.url - may include hash
 * @param {string} params.refUrl
 * @param {string} params.title
 * @param {string} params.charset
 * @param {Object} params.settings
 * @param {Object} params.options
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
      const url = sourceUrl.startsWith("data:") ? "data:" : sourceUrl;
      const meta = params.options["capture.recordDocumentMeta"] ? 
        ' data-scrapbook-source="' + scrapbook.escapeHtml(url) + '"' + 
        ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
        ' data-scrapbook-type="file"' + 
        (charset ? ' data-scrapbook-charset="' + charset + '"' : "") : 
        "";

      const html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(response.url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(response.url)}">${scrapbook.escapeHtml(response.filename, false)}</a>
</body>
</html>`;

      return await capturer.saveDocument({
        sourceUrl,
        documentFileName: settings.documentName + ".html",
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
 * @param {string} params.docUrl
 * @param {string} params.mime
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.registerDocument = async function (params) {
  isDebug && console.debug("call: registerDocument", params);

  const {docUrl, mime, settings, options} = params;
  const {timeId, documentName} = settings;

  const files = capturer.captureInfo.get(timeId).files;

  const ext = mime === "application/xhtml+xml" ? "xhtml" : 
    mime === "image/svg+xml" ? "svg" : 
    "html";

  let documentFileName;
  if (options["capture.frameRename"]) {
    let newDocumentName = scrapbook.validateFilename(documentName, options["capture.saveAsciiFilename"]);
    let newDocumentNameCI = newDocumentName.toLowerCase();
    let count = 0;
    while (files.has(newDocumentNameCI + ".html") || 
        files.has(newDocumentNameCI + ".xhtml") || 
        files.has(newDocumentNameCI + ".svg")) {
      newDocumentName = documentName + "_" + (++count);
      newDocumentNameCI = newDocumentName.toLowerCase();
    }
    files.add(newDocumentNameCI + ".html");
    files.add(newDocumentNameCI + ".xhtml");
    files.add(newDocumentNameCI + ".svg");
    documentFileName = newDocumentName + "." + ext;
  } else {
    let newDocumentName = documentName || scrapbook.urlToFilename(docUrl);
    if (!newDocumentName.endsWith("." + ext)) {
      newDocumentName += "." + ext;
    }
    newDocumentName = scrapbook.validateFilename(newDocumentName, options["capture.saveAsciiFilename"]);
    documentFileName = capturer.getUniqueFilename(timeId, newDocumentName);
  }

  return {documentFileName};
};

/**
 * @kind invokable
 * @param {Object} params
 * @param {Object} params.data
 *         - {string} params.data.mime
 *         - {string} params.data.charset
 *         - {string} params.data.content
 *         - {string} params.data.title
 *         - {string} params.data.favIconUrl
 * @param {string} params.documentFileName
 * @param {string} params.sourceUrl - may include hash
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.saveDocument = async function (params) {
  isDebug && console.debug("call: saveDocument", params);

  const {data, documentFileName, sourceUrl, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  try {
    const mapMimeExt = (mime) => {
      if (mime === "application/xhtml+xml") { return "xhtml"; }
      if (mime === "image/svg+xml") { return "svg"; }
      return "html";
    };

    if (!settings.frameIsMain &&
        typeof options["capture.pageSizeLimit"] === "number" && data.content.length >= options["capture.pageSizeLimit"] * 1024) {
      capturer.warn(scrapbook.lang("WarnPageSizeLimitExceeded", [scrapbook.crop(sourceUrl, 128)]));
      return {url: capturer.getSkipUrl(sourceUrl), error: {message: "Page size limit exceeded."}};
    }

    const title = data.title || scrapbook.urlToFilename(sourceUrl);
    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        let filename = documentFileName;
        let ext = scrapbook.filenameParts(filename)[1];

        if (!settings.frameIsMain) {
          let url = data.charset === "UTF-8" ? 
              scrapbook.unicodeToDataUri(data.content, data.mime) :
              scrapbook.byteStringToDataUri(scrapbook.unicodeToUtf8(data.content), data.mime, data.charset);
          url = url.replace(",", ";filename=" + encodeURIComponent(filename) + ",");

          return {timeId, sourceUrl, filename, url};
        } else {
          const blob = new Blob([data.content], {type: data.mime});
          let targetDir;
          let savePrompt;
          let saveMethod;

          switch (options["capture.saveTo"]) {
            case 'memory': {
              // special handling (for unit test)
              return await capturer.saveBlobInMemory({blob});
            }
            case 'file': {
              filename = settings.filename + "." + ext;
              saveMethod = "saveBlobNaturally";
              break;
            }
            case 'server': {
              [targetDir, filename] = scrapbook.filepathParts(settings.filename + "." + ext);
              savePrompt = false;
              saveMethod = "saveToServer";
              break;
            }
            case 'folder':
            default: {
              [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + settings.filename + "." + ext);
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
        let filename = documentFileName;
        let ext = scrapbook.filenameParts(filename)[1];

        const zip = capturer.captureInfo.get(timeId).zip;
        scrapbook.zipAddFile(zip, filename, new Blob([data.content], {type: data.mime}), true);

        if (!settings.frameIsMain) {
          return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        } else {
          // create index.html that redirects to index.xhtml|.svg
          if (ext !== "html") {
            const html = `<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.${ext}">`;
            scrapbook.zipAddFile(zip, "index.html", new Blob([html], {type: "text/html"}), true);
          }

          // generate and download the zip file
          const blob = await zip.generateAsync({type: "blob", mimeType: "application/html+zip"});
          let targetDir;
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
        let filename = documentFileName;
        let ext = scrapbook.filenameParts(filename)[1];

        const zip = capturer.captureInfo.get(timeId).zip;
        scrapbook.zipAddFile(zip, timeId + "/" + filename, new Blob([data.content], {type: data.mime}), true);

        if (!settings.frameIsMain) {
          return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        } else {
          {
            // create index.html that redirects to index.xhtml|.svg
            if (ext !== "html") {
              const html = `<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.${ext}">`;
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
        let targetDir;
        let filename = documentFileName;
        let ext = scrapbook.filenameParts(filename)[1];
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

        filename = await capturer[saveMethod]({
          timeId,
          blob: new Blob([data.content], {type: data.mime}),
          directory: targetDir,
          filename,
          sourceUrl,
          autoErase: !settings.frameIsMain || (ext !== "html"),
          savePrompt,
          settings,
          options,
        });

        if (settings.frameIsMain && (ext !== "html")) {
          // create index.html that redirects to index.xhtml
          const html = `<meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.${ext}">`;
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
 * @param {string} params.url - may include hash
 * @param {string} params.refUrl
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.downloadFile = async function (params) {
  const MIMES_NO_EXT_OK = new Set([
    "application/octet-stream",
  ]);

  const MIMES_NEED_MATCH = new Set([
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
  ]);

  const downloadFile = async (params) => {
    isDebug && console.debug("call: downloadFile", params);

    const {url: sourceUrl, refUrl, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId, recurseChain} = settings;

    try {
      // fail out if sourceUrl is empty.
      if (!sourceUrlMain) {
        throw new Error(`Source URL is empty.`);
      }

      // fail out if sourceUrl is relative,
      // or it will be treated as relative to this extension page.
      if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
        throw new Error(`Requires an absolute URL.`);
      }

      const response = await capturer.access({
        url: sourceUrlMain,
        refUrl,
        role: "downloadFile",
        settings,
        options,
        hooks: {
          async preRequest({url, hash}) {
            // special management for data URI
            if (url.startsWith("data:")) {
              /* save data URI as file? */
              if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
                const file = scrapbook.dataUriToFile(url);
                if (!file) { throw new Error("Malformed data URL."); }

                let filename = file.name;
                filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
                filename = capturer.getUniqueFilename(timeId, filename);

                return await capturer.downloadBlob({
                  settings,
                  options,
                  blob: file,
                  filename,
                  sourceUrl: sourceUrlMain,
                });
              }

              return {url: sourceUrlMain};
            }
          },

          postHeaders({access, xhr, headers}) {
            // abort fetching body for a size exceeding resource
            if (typeof options["capture.resourceSizeLimit"] === "number" && 
                headers.contentLength >= options["capture.resourceSizeLimit"] * 1024) {
              capturer.warn(scrapbook.lang("WarnResourceSizeLimitExceeded", [scrapbook.crop(sourceUrl, 128)]));
              return {url: capturer.getSkipUrl(sourceUrl), error: {message: "Resource size limit exceeded."}};
            }
          },

          async response({access, xhr, hash, headers}) {
            // determine the filename
            // use the filename if it has been defined by header Content-Disposition
            let filename = headers.filename || scrapbook.urlToFilename(xhr.responseURL);

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
              if ((!ext && !MIMES_NO_EXT_OK.has(mime)) || 
                  (MIMES_NEED_MATCH.has(mime) && !Mime.allExtensions(mime).includes(ext.toLowerCase()))) {
                ext = Mime.extension(mime);
                if (ext) {
                  filename += "." + ext;
                }
              }
            }

            filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
            filename = capturer.getUniqueFilename(timeId, filename);

            return await capturer.downloadBlob({
              settings,
              options,
              blob: xhr.response,
              filename,
              sourceUrl: sourceUrlMain,
            });
          },
        },
      });
      return Object.assign({}, response, {
        url: response.url + sourceUrlHash,
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
 * @param {string} params.url
 * @param {string} params.refUrl
 * @param {string} params.options
 * @return {string} File extension of the URL.
 */
capturer.downLinkFetchHeader = async function (params) {
  isDebug && console.debug("call: downLinkFetchHeader", params);

  const {url: sourceUrl, refUrl, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

  try {
    return await capturer.access({
      url: sourceUrlMain,
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
 * @param {string} params.url
 * @param {string} params.refUrl
 * @param {string} params.settings
 * @param {string} params.options
 * @return {Promise<Object>}
 */
capturer.fetchCss = async function (params) {
  isDebug && console.debug("call: fetchCss", params);

  const {url: sourceUrl, refUrl, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  try {
    // fail out if sourceUrl is empty.
    if (!sourceUrlMain) {
      throw new Error(`Source URL is empty.`);
    }

    // fail out if sourceUrl is relative,
    // or it will be treated as relative to this extension page.
    if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
      throw new Error(`Requires an absolute URL.`);
    }

    let filename;
    return await capturer.access({
      url: sourceUrlMain,
      refUrl,
      role: "fetchCss",
      settings,
      options,
      hooks: {
        async preRequest({access, url, hash}) {
          // special management for data URI
          if (url.startsWith("data:")) {
            const file = scrapbook.dataUriToFile(url);
            if (!file) { throw new Error("Malformed data URL."); }

            let filename;

            // save data URI as file?
            if (options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml") {
              filename = file.name;
              filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
              url = scrapbook.escapeFilename(filename) + hash;
            } else {
              url += hash;
            }

            const {parameters: {fileCharset}} = scrapbook.parseHeaderContentType(file.type);
            const {text, charset} = await scrapbook.parseCssFile(file, fileCharset);
            return {
              accessId: access.id,
              text,
              charset,
              filename,
              url,
            };
          }
        },

        postHeaders({access, headers}) {
          // abort fetching body for a size exceeding resource
          if (typeof options["capture.resourceSizeLimit"] === "number" && 
              headers.contentLength >= options["capture.resourceSizeLimit"] * 1024) {
            capturer.warn(scrapbook.lang("WarnResourceSizeLimitExceeded", [scrapbook.crop(sourceUrl, 128)]));
            return {url: capturer.getSkipUrl(sourceUrl), error: {message: "Resource size limit exceeded."}};
          }

          // determine the filename
          filename = headers.filename || scrapbook.urlToFilename(sourceUrl);
          if (scrapbook.filenameParts(filename)[1].toLowerCase() !== 'css') {
            filename += ".css";
          }

          filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);
        },
        async response({xhr, hash, headers, access}) {
          const {text, charset} = await scrapbook.parseCssFile(xhr.response, headers.charset);
          return {
            accessId: access.id,
            text,
            charset,
            filename,
            url: scrapbook.escapeFilename(filename) + hash,
          };
        },
        async duplicate({access, url, hash}) {
          const response = await access;
          return Object.assign({}, response, {
            url: scrapbook.splitUrlByAnchor(response.url)[0] + hash,
            isDuplicate: true,
          });
        },
      },
    });
  } catch (ex) {
    // something wrong for the XMLHttpRequest
    console.warn(ex);
    capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
    return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
  }
};

/**
 * @kind invokable
 * @param {string} params.filename - validated, not uniquified
 * @param {string} params.sourceUrl
 * @param {string} params.accessId - ID of the bound access
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.registerFile = async function (params) {
  isDebug && console.debug("call: registerFile", params);

  const {filename, sourceUrl, accessId, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  // obtain a unique filename for each boundAccess
  // (if no boundAccess, always obtain one)
  let newFilename;
  const boundAccess = capturer.captureInfo.get(timeId).accessMap.get(accessId);
  if (boundAccess) {
    newFilename = boundAccess.newFilename;
  }

  if (!newFilename) {
    newFilename = capturer.getUniqueFilename(timeId, filename);

    if (boundAccess) {
      boundAccess.newFilename = newFilename;
      boundAccess.deferred = new scrapbook.Deferred();
    }

    return {
      filename: newFilename,
      url: scrapbook.escapeFilename(newFilename) + sourceUrlHash,
    };
  }

  return {
    filename: newFilename,
    url: scrapbook.escapeFilename(newFilename) + sourceUrlHash,
    isDuplicate: true,
  };
};

/**
 * @kind invokable
 * @param {Object} params
 * @param {string} params.bytes - as byte string
 * @param {string} params.mime - may include parameters like charset
 * @param {string} params.filename - validated and unique
 * @param {string} params.sourceUrl - may include hash
 * @param {string} params.accessId - ID of the bound access
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.downloadBytes = async function (params) {
  isDebug && console.debug("call: downloadBytes", params);

  const {bytes, mime, filename, sourceUrl, accessId, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  const ab = scrapbook.byteStringToArrayBuffer(bytes);
  const blob = new Blob([ab], {type: mime});
  const access = capturer.downloadBlob({
    blob,
    filename,
    sourceUrl: sourceUrlMain,
    settings,
    options,
  }).then((response) => {
    return Object.assign({}, response, {
      url: response.url + sourceUrlHash,
    });
  });

  const boundAccess = capturer.captureInfo.get(timeId).accessMap.get(accessId);
  if (boundAccess) {
    access.then(boundAccess.deferred.resolve, boundAccess.deferred.reject);
  }

  return await access;
};

/**
 * @kind invokable
 * @param {Object} params
 * @param {string} params.sourceUrl
 * @param {string} params.accessId - ID of the bound access
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.getAccessResult = async function (params) {
  isDebug && console.debug("call: getAccessResult", params);

  const {sourceUrl, accessId, settings, options} = params;
  const [, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  const boundAccess = capturer.captureInfo.get(timeId).accessMap.get(accessId);
  const response = await boundAccess.deferred.promise;
  return Object.assign({}, response, {
    url: scrapbook.splitUrlByAnchor(response.url)[0] + sourceUrlHash,
  });
};

/**
 * @param {Object} params
 * @param {Blob} params.blob
 * @param {string} params.filename - validated and unique
 * @param {string} params.sourceUrl - must not include hash
 * @param {Object} params.settings
 * @param {Object} params.options
 * @return {Promise<Object>}
 */
capturer.downloadBlob = async function (params) {
  isDebug && console.debug("call: downloadBlob", params);

  const {blob, filename, sourceUrl, settings, options} = params;
  const {timeId} = settings;

  if (typeof options["capture.resourceSizeLimit"] === "number" && blob.size >= options["capture.resourceSizeLimit"] * 1024) {
    capturer.warn(scrapbook.lang("WarnResourceSizeLimitExceeded", [scrapbook.crop(sourceUrl, 128)]));
    return {url: capturer.getSkipUrl(sourceUrl), error: {message: "Resource size limit exceeded."}};
  }

  switch (options["capture.saveAs"]) {
    case "singleHtml": {
      let dataUri;
      const {type: mime, parameters: {charset}} = scrapbook.parseHeaderContentType(blob.type);

      if (charset || scrapbook.mimeIsText(mime)) {
        if (charset && /utf-?8/i.test(charset)) {
          const str = await scrapbook.readFileAsText(blob, "UTF-8");
          dataUri = scrapbook.unicodeToDataUri(str, mime);
        } else {
          const str = await scrapbook.readFileAsText(blob, false);
          dataUri = scrapbook.byteStringToDataUri(str, mime, charset);
        }
      } else {
        dataUri = await scrapbook.readFileAsDataURL(blob);
        if (dataUri === "data:") {
          // Chromium returns "data:" if the blob is zero byte. Add the mimetype.
          dataUri = `data:${blob.type};base64,`;
        }
      }

      if (filename) {
        dataUri = dataUri.replace(/(;base64)?,/, m => ";filename=" + encodeURIComponent(filename) + m);
      }

      return {filename, url: dataUri};
    }

    case "zip": {
      const zip = capturer.captureInfo.get(timeId).zip;
      scrapbook.zipAddFile(zip, filename, blob);
      return {filename, url: scrapbook.escapeFilename(filename)};
    }

    case "maff": {
      const zip = capturer.captureInfo.get(timeId).zip;
      scrapbook.zipAddFile(zip, timeId + "/" + filename, blob);
      return {filename, url: scrapbook.escapeFilename(filename)};
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
        url: scrapbook.escapeFilename(changedFilename),
      };
    }
  }
};

/**
 * Download a blob in a way like default browser "save as".
 *
 * @param {Object} params
 * @param {string} params.timeId
 * @param {Blob} params.blob
 * @param {string} params.filename
 * @param {string} params.sourceUrl
 * @return {Promise<Object>}
 */
capturer.saveBlobNaturally = async function (params) {
  const {timeId, blob, filename, sourceUrl} = params;

  // Use the natural download attribute to generate a download.
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);

    capturer.downloadHooks.set(url, {
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

      capturer.downloadHooks.set(url2, {
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
 * @param {Blob} params.blob
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
 * @param {string} params.timeId
 * @param {Blob} params.blob
 * @param {string} params.directory
 * @param {string} params.filename
 * @param {string} params.sourceUrl
 * @param {boolean} params.autoErase
 * @param {boolean} params.savePrompt
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
 * @param {string} params.timeId
 * @param {string} params.url
 * @param {string} params.directory
 * @param {string} params.filename
 * @param {string} params.sourceUrl
 * @param {boolean} params.autoErase
 * @param {boolean} params.savePrompt
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
    capturer.downloadHooks.set(downloadId, {
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
 * @param {string} params.timeId
 * @param {string} params.blob
 * @param {string} params.directory - URL of the server
 * @param {string} params.filename
 * @param {string} params.sourceUrl
 * @param {Object} params.options
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

scrapbook.addMessageListener((message, sender) => {
  if (!message.cmd.startsWith("capturer.")) { return false; }
  if (message.id !== capturer.missionId) { return false; }
  return true;
}, (ex) => {
  console.error(ex);
  const err = `Unexpected error: ${ex.message}`;
  capturer.error(err);
});

{
  const listener = (port) => {
    const onCapturerReady = () => {
      if (port.name !== capturer.missionId) {
        return;
      }
      const onMessage = async (message) => {
        const {cmd, args} = message;
        const [mainCmd, subCmd] = cmd.split(".");
        if (mainCmd !== "capturer") { return; }
        isDebug && console.debug(cmd, "receive", port.sender, args);

        if (!capturer[subCmd]) { return; }

        try {
          const response = await capturer[subCmd](args);
          port.postMessage({
            cmd: 'capturerResponse',
            args: response,
          });
        } catch (ex) {
          console.error(ex);
          const err = `Unexpected error: ${ex.message}`;
          capturer.error(err);
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

  const downloadHooks = capturer.downloadHooks;
  const {id, url, filename} = downloadItem;
  if (!downloadHooks.has(url)) { return; }

  // In Chromium, the onCreated is fired when the "Save as" prompt popups.
  //
  // In Firefox, the onCreated is fired only when the user clicks
  // save in the "Save as" prompt, and no event if the user clicks
  // cancel.
  //
  // We wait until the user clicks save (or cancel in Chromium) to resolve
  // the Promise (and then the window may close).
  if (scrapbook.userAgent.is('gecko')) {
    downloadHooks.get(url).onComplete(scrapbook.filepathParts(filename)[1]);
  } else {
    downloadHooks.set(id, downloadHooks.get(url));
  }
  downloadHooks.delete(url);
});

browser.downloads.onChanged.addListener(async (downloadDelta) => {
  isDebug && console.debug("downloads.onChanged", downloadDelta);

  const downloadId = downloadDelta.id, downloadHooks = capturer.downloadHooks;
  if (!downloadHooks.has(downloadId)) { return; }

  let erase = true;
  try {
    if (downloadDelta.state && downloadDelta.state.current === "complete") {
      const results = await browser.downloads.search({id: downloadId});
      const [dir, filename] = scrapbook.filepathParts(results[0].filename);
      downloadHooks.get(downloadId).onComplete(filename);
    } else if (downloadDelta.error) {
      downloadHooks.get(downloadId).onError(new Error(downloadDelta.error.current));
    } else {
      erase = false;
    }
  } catch (ex) {
    console.error(ex);
  }

  if (erase) {
    // erase the download history of additional downloads (autoErase = true)
    try {
      if (downloadHooks.get(downloadId).autoErase) {
        const erasedIds = await browser.downloads.erase({id: downloadId});
      }
      downloadHooks.delete(downloadId);
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
