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

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    root.capturer,
    root.JSZip,
    root.Deferred,
    root.MapWithDefault,
    root,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, capturer, JSZip, Deferred, MapWithDefault, root, window, document, console) {

  'use strict';

  const SHADOW_ROOT_SUPPORTED = !!document.documentElement.attachShadow;
  const REBUILD_LINK_SUPPORT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml']);
  const REBUILD_LINK_SVG_HREF_ATTRS = ['href', 'xlink:href'];

  // overwrite the value of common.js to define this is not a content script
  capturer.isContentScript = false;

  // missionId is fixed to this page, to identify the capture mission
  // generate a unique one, if not otherwise set
  capturer.missionId = scrapbook.getUuid();

  /**
   * @typedef {Object} missionCaptureInfo
   * @property {boolean} useDiskCache
   * @property {Set<string~filename>} indexPages
   * @property {Map<string~filename, Object>} files
   * @property {Map<string~token, Promise<fetchResult>>} fetchMap
   * @property {Map<string~token, Object>} urlToFilenameMap
   * @property {Map<string~url, Object>} linkedPages
   */

  /**
   * @type {MapWithDefault<string~timeId, missionCaptureInfo>}
   */
  capturer.captureInfo = new MapWithDefault(() => ({
    useDiskCache: false,

    initialVersion: undefined,
    indexPages: new Set(),

    // index.json is for site map
    // index.dat is used in legacy ScrapBook
    // index.rdf, history.rdf, and ^metadata^ are used in MAFF
    // http://maf.mozdev.org/maff-specification.html
    files: new Map([
      ["index.json", {}],
      ["index.dat", {}],
      ["index.rdf", {}],
      ["history.rdf", {}],
      ["^metadata^", {}],
    ]),

    fetchMap: new Map(),
    urlToFilenameMap: new Map(),

    linkedPages: new Map(),
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
   * @param {Object} params.options
   * @return {string} The uniquified filename.
   */
  capturer.getUniqueFilename = function (timeId, filename, options) {
    const files = capturer.captureInfo.get(timeId).files;

    let newFilename = filename || "untitled";
    let [newFilenameBase, newFilenameExt] = scrapbook.filenameParts(newFilename);
    newFilenameBase = scrapbook.crop(newFilenameBase, options["capture.saveFilenameMaxLenUtf16"], options["capture.saveFilenameMaxLenUtf8"], "");
    newFilenameExt = newFilenameExt ? "." + newFilenameExt : "";
    newFilename = newFilenameBase + newFilenameExt;
    let newFilenameCI = newFilename.toLowerCase();
    let count = 0;
    while (files.has(newFilenameCI)) {
      newFilename = newFilenameBase + "-" + (++count) + newFilenameExt;
      newFilenameCI = newFilename.toLowerCase();
    }
    files.set(newFilenameCI, {});
    return newFilename;
  };

  /**
   * Get a unique (deduplicated) filename for saving
   *
   * @param {Object} params
   * @param {string} params.filename - may contain directory
   * @param {boolean} params.isFile
   * @param {Object} params.options
   * @return {string} The deduplicated filename.
   */
  capturer.getAvailableSaveFilename = async function (params) {
    isDebug && console.debug("call: getAvailableSaveFilename", params);

    const {filename, isFile, options} = params;

    const [dir, base] = scrapbook.filepathParts(filename);

    if (options["capture.saveOverwrite"]) {
      return base;
    }

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
            url: target,
            format: 'json',
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

  capturer.saveFileCache = async function ({timeId, path, blob}) {
    if (capturer.captureInfo.get(timeId).useDiskCache) {
      const key = {table: "pageCache", id: timeId, path};
      await scrapbook.cache.set(key, blob);
      blob = await scrapbook.cache.get(key);
    }

    const files = capturer.captureInfo.get(timeId).files;
    const filename = scrapbook.filepathParts(path)[1].toLowerCase();
    Object.assign(files.get(filename), {
      path,
      blob,
    });
  };

  capturer.loadFileCache = async function ({timeId}) {
    const files = capturer.captureInfo.get(timeId).files;
    const result = [];
    let indexEntry;

    for (const [filename, {path, url, blob}] of files) {
      if (!blob) { continue; }

      const entry = [path, url, blob];

      // Move index page to last because the browser may not be able to show it
      // if it's flooded over by other downloads.
      if (path === 'index.html') {
        indexEntry = entry;
        continue;
      }

      result.push(entry);
    }

    if (indexEntry) {
      result.push(indexEntry);
    }

    return result;
  };

  capturer.loadFileCacheAsZip = async function ({timeId, options}) {
    let zipOptions;
    const compressLevel = options["capture.zipCompressLevel"];
    if (Number.isInteger(compressLevel)) {
      if (compressLevel > 0) {
        zipOptions = {
          compression: "DEFLATE",
          compressionOptions: {level: compressLevel},
        };
      } else {
        zipOptions = {
          compression: "STORE",
        };
      }
    }

    const zip = new JSZip();
    const files = capturer.captureInfo.get(timeId).files;
    for (const [filename, {path, url, blob}] of files) {
      if (!blob) { continue; }
      scrapbook.zipAddFile(zip, path, blob, zipOptions);
    }
    return zip;
  };

  capturer.clearFileCache = async function ({timeId}) {
    const tableSet = new Set(["pageCache", "fetchCache"]);
    await scrapbook.cache.remove((obj) => {
      return tableSet.has(obj.table) && obj.id === timeId;
    });
  };

  /**
   * @typedef {Object} fetchResult
   * @property {string} url - The response URL (without hash).
   * @property {integer} status
   * @property {Object} headers
   * @property {Blob} blob
   * @property {string} error - The error message for the request.
   */

  /**
   * Uniquely fetch a resource from the web.
   *
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.refUrl] - the referrer URL
   * @param {boolean} [params.headerOnly] - fetch HTTP header only
   * @param {boolean} [params.ignoreSizeLimit]
   * @param {Objet} params.settings
   * @param {Objet} params.options
   * @return {Promise<fetchResult>}
   */
  capturer.fetch = async function (params) {
    const REGEX_SCHEMES = /^([^:]+):/;
    const ALLOWED_SCHEMES = new Set(['http', 'https', 'file', 'data', 'blob', 'about']);
    if (!await browser.extension.isAllowedFileSchemeAccess()) {
      ALLOWED_SCHEMES.delete('file');
    }

    const getFetchToken = function (url, role) {
      let token = `${scrapbook.normalizeUrl(url)}\t${role}`;
      token = scrapbook.sha1(token, "TEXT");
      return token;
    };

    /**
     * Set referrer for the request according to the specified referrer policy.
     *
     * @param {Object} params
     * @param {Object} params.headers
     * @param {string} params.targetUrl
     * @param {string} [params.refUrl]
     * @param {Object} [params.options]
     * @return {Object} The modified headers object.
     */
    const setReferrer = function ({headers, targetUrl, refUrl, options = {}}) {
      const referrer = new Referrer(refUrl, targetUrl, options["capture.referrerPolicy"], options["capture.referrerSpoofSource"]).getReferrer();

      if (referrer) {
        // Browser does not allow assigning "Referer" header directly.
        // Set a placeholder header, whose prefix will be removed by the
        // listener of browser.webRequest.onBeforeSendHeaders later on.
        headers["X-WebScrapBook-Referer"] = referrer;
      }

      return headers;
    };

    const setCache = async (id, token, data) => {
      const key = {table: "fetchCache", id, token};
      await scrapbook.cache.set(key, data);
      return await scrapbook.cache.get(key);
    };

    const fetch = capturer.fetch = async function (params) {
      isDebug && console.debug("call: fetch", params);

      const {url: sourceUrl, refUrl, headerOnly = false, ignoreSizeLimit = false, settings: {timeId}, options} = params;
      const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

      const fetchMap = capturer.captureInfo.get(timeId).fetchMap;
      const fetchRole = headerOnly ? 'head' : 'blob';
      const fetchToken = getFetchToken(sourceUrlMain, fetchRole);

      // check for previous fetch
      {
        const fetchPrevious = fetchMap.get(fetchToken);
        if (fetchPrevious) {
          return fetchPrevious;
        }
      }

      const deferred = new Deferred();
      const fetchCurrent = deferred.promise;
      (async () => {
        let response;
        let headers = {};

        // fail out if sourceUrl is empty.
        if (!sourceUrlMain) {
          throw new Error(`Source URL is empty.`);
        }

        // fail out if sourceUrl is relative,
        // or it will be treated as relative to this extension page.
        if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
          throw new Error(`Requires an absolute URL.`);
        }

        const scheme = sourceUrlMain.match(REGEX_SCHEMES)[1];
        if (!ALLOWED_SCHEMES.has(scheme)) {
          throw new Error(`URI scheme not supported.`);
        }

        // special handling for data URI
        if (scheme === "data") {
          const file = scrapbook.dataUriToFile(sourceUrlMain);
          if (!file) { throw new Error("Malformed data URL."); }

          // simulate headers from data URI parameters
          headers.filename = file.name;
          headers.contentLength = file.size;
          const contentType = scrapbook.parseHeaderContentType(file.type);
          headers.contentType = contentType.type;
          headers.charset = contentType.parameters.charset;

          let blob = new Blob([file], {type: file.type});
          if (capturer.captureInfo.get(timeId).useDiskCache) {
            blob = await setCache(timeId, fetchToken, blob);
          }

          return {
            url: sourceUrlMain,
            status: 200,
            headers,
            blob,
          };
        }

        // special handling for about:blank or about:srcdoc
        if (scheme === "about") {
          return {
            url: sourceUrlMain,
            status: 200,
            headers,
            blob: new Blob([], {type: 'text/html'}),
          };
        }

        try {
          const xhr = await scrapbook.xhr({
            url: sourceUrlMain,
            responseType: 'blob',
            allowAnyStatus: true,
            requestHeaders: setReferrer({
              headers: {},
              refUrl,
              targetUrl: sourceUrlMain,
              options,
            }),
            onreadystatechange(xhr) {
              if (xhr.readyState !== 2) { return; }

              // check for previous fetch if redirected
              const [responseUrlMain, responseUrlHash] = scrapbook.splitUrlByAnchor(xhr.responseURL);
              if (responseUrlMain !== sourceUrlMain) {
                const responseFetchToken = getFetchToken(responseUrlMain, fetchRole);
                const responseFetchPrevious = fetchMap.get(responseFetchToken);

                // a fetch to the redirected URL exists, abort the request and return it
                if (responseFetchPrevious) {
                  response = responseFetchPrevious;
                  xhr.abort();
                  return;
                }

                // otherwise, map the redirected URL to the same fetch promise
                fetchMap.set(responseFetchToken, fetchCurrent);
                if (!headerOnly) {
                  const responseFetchToken = getFetchToken(responseUrlMain, 'head');
                  fetchMap.set(responseFetchToken, fetchCurrent);
                }
              }

              // get headers
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
                const headerContentLength = xhr.getResponseHeader("Content-Length");
                if (headerContentLength) {
                  headers.contentLength = parseInt(headerContentLength, 10);
                }
              }

              if (headerOnly) {
                // skip loading body for a headerOnly fetch
                response = {
                  url: xhr.responseURL,
                  status: xhr.status,
                  headers,
                  blob: null,
                };
              } else if (!ignoreSizeLimit &&
                  typeof options["capture.resourceSizeLimit"] === "number" &&
                  typeof headers.contentLength === "number" &&
                  headers.contentLength >= options["capture.resourceSizeLimit"] * 1024 * 1024) {
                // apply size limit if header contentLength is known
                response = {
                  url: xhr.responseURL,
                  status: xhr.status,
                  headers,
                  blob: null,
                  error: `Resource size limit exceeded.`,
                };
              }

              if (response) {
                if (!(xhr.status >= 200 && xhr.status < 300)) {
                  response.error = `${xhr.status} ${xhr.statusText}`;
                }

                xhr.abort();
                return;
              }
            },
          });

          // xhr is resolved to undefined when aborted.
          if (!xhr && response) {
            return response;
          }

          let blob = xhr.response;
          if (capturer.captureInfo.get(timeId).useDiskCache) {
            blob = await setCache(timeId, fetchToken, blob);
          }

          response = {
            url: xhr.responseURL,
            status: xhr.status,
            headers,
            blob,
          };

          // apply size limit
          if (!ignoreSizeLimit &&
              typeof options["capture.resourceSizeLimit"] === "number" &&
              blob.size >= options["capture.resourceSizeLimit"] * 1024 * 1024) {
            response.blob = null;
            response.error = `Resource size limit exceeded.`;
          }

          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 0)) {
            response.error = `${xhr.status} ${xhr.statusText}`;
          }

          return response;
        } catch (ex) {
          return {
            url: sourceUrlMain,
            status: 0,
            headers,
            blob: null,
            error: ex.message,
          };
        }
      })().then(deferred.resolve, deferred.reject);

      fetchMap.set(fetchToken, fetchCurrent);
      if (!headerOnly) {
        const fetchToken = getFetchToken(sourceUrlMain, 'head');
        fetchMap.set(fetchToken, fetchCurrent);
      }

      return fetchCurrent;
    };

    return await fetch(params);
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Object} params.item
   * @param {string} params.parentId
   * @param {integer} params.index
   */
  capturer.addItemToServer = async function ({item, parentId, index}) {
    await server.init();
    const book = server.books[server.bookId];
    if (!!book.config.no_tree) {
      return;
    }

    capturer.log(`Updating server index for item "${item.id}"...`);

    // cache favicon
    let icon = item.icon;
    icon = await book.cacheFavIcon({item, icon});

    // lock tree before loading to avoid a conflict due to parallel captures
    await book.transaction({
      mode: 'refresh',
      timeout: 60,
      callback: async (book, updated) => {
        await book.loadMeta(updated);
        await book.loadToc(updated);

        // insert to root if parentId does not exist
        if (parentId && !book.meta[parentId] && !book.isSpecialItem(parentId)) {
          capturer.warn(`Specified parent ID "${parentId}" is invalid. Append to root instead.`);
          parentId = 'root';
        }

        await book.addItem({
          item: Object.assign({}, item, {icon}),
          parentId,
          index,
        });
        await book.saveMeta();
        await book.saveToc();

        if (scrapbook.getOption("indexer.fulltextCache")) {
          await server.requestSse({
            query: {
              "a": "cache",
              "book": book.id,
              "item": item.id,
              "fulltext": 1,
              "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
              "no_lock": 1,
              "no_backup": 1,
            },
            onMessage(info) {
              if (['error', 'critical'].includes(info.type)) {
                capturer.error(`Error when generating fulltext cache: ${info.msg}`);
              }
            },
          });
        }

        await book.loadTreeFiles(true);  // update treeLastModified
      },
    });
  };

  /**
   * @kind invokable
   * @return {Promise<Object>}
   */
  capturer.getMissionResult = async function () {
    return capturePromise;
  };

  /**
   * @kind invokable
   */
  capturer.remoteMsg = async function ({msg, type}) {
    if (['log', 'warn', 'error'].includes(type)) {
      capturer[type](msg);
      return true;
    }
    return false;
  };

  /**
   * @param {Object} params
   * @param {Array} params.tasks
   * @param {string} [params.bookId] - bookId ID for the captured items
   * @param {string} [params.parentId] - parent item ID for the captured items
   * @param {integer} [params.index] - position index for the captured items
   * @param {float} [params.delay] - delay between tasks (ms)
   * @param {string} [params.mode] - base capture mode
   * @param {Object} [params.options] - base capture options, overwriting default
   * @param {string} [params.comment] - comment for the captured item
   * @return {Promise<Array|Object>} - list of task results (or error), or an object of error
   */
  capturer.runTasks = async function ({
    tasks,
    bookId, parentId, index, delay,
    mode: baseMode, options: baseOptions,
  }) {
    delay = parseFloat(delay) || 5;
    baseOptions = Object.assign(scrapbook.getOptions("capture"), baseOptions);

    const results = [];

    for (const task of tasks) {
      const {
        tabId, frameId, fullPage,
        url, refUrl, title, favIconUrl,
        mode = baseMode, options: taskOptions, comment,
        recaptureInfo, mergeCaptureInfo,
      } = task;

      const options = Object.assign({}, baseOptions, taskOptions);

      let result;
      try {
        if (["resave", "internalize"].includes(mode)) {
          result = await capturer.resaveTab({
            tabId, frameId,
            options,
            internalize: mode === "internalize",
          });
        } else if (recaptureInfo) {
          // recapture
          result = await capturer.recapture({
            tabId, frameId, fullPage,
            url, refUrl, title, favIconUrl,
            mode, options, comment,
            recaptureInfo,
          });
        } else if (mergeCaptureInfo) {
          // merge capture
          result = await capturer.mergeCapture({
            tabId, frameId, fullPage,
            url, refUrl, title, favIconUrl,
            mode, options,
            mergeCaptureInfo,
          });
        } else {
          // capture general
          result = await capturer.captureGeneral({
            tabId, frameId, fullPage,
            url, refUrl, title, favIconUrl,
            mode, options, comment,
            bookId, parentId, index,
          });

          if (Number.isInteger(index)) {
            index++;
          }
        }

        capturer.log(`Done.`);
      } catch (ex) {
        console.error(ex);
        const err = `Fatal error: ${ex.message}`;
        capturer.error(err);
        result = {error: {message: err}};
      }

      results.push(result);

      // short delay before next task
      await scrapbook.delay(delay);
    }

    return results;
  };

  /**
   * @param {Object} params
   * @param {string} [params.timeId] - an overriding timeId
   * @param {?string} [params.documentName] - default filename for the main
   *     document
   * @param {boolean} [params.captureOnly] - skip adding item and clean up
   *     (for special modes like recapture and mergeCapture)
   * @param {integer} [params.tabId]
   * @param {integer} [params.frameId]
   * @param {boolean} [params.fullPage]
   * @param {string} [params.url]
   * @param {string} [params.refUrl]
   * @param {string} [params.title] - item title
   * @param {string} [params.favIconUrl] - item favicon
   * @param {string} [params.mode] - "tab", "source", "bookmark"
   * @param {Object} params.options
   * @param {string} [params.comment] - comment for the captured item
   * @param {string} [params.bookId] - bookId ID for the captured items
   * @param {string} [params.parentId] - parent item ID for the captured items
   * @param {integer} [params.index] - position index for the captured items
   * @return {Promise<Object>}
   */
  capturer.captureGeneral = async function ({
    timeId = scrapbook.dateToId(),
    documentName = 'index',
    captureOnly = false,
    tabId, frameId, fullPage,
    url, refUrl, title, favIconUrl,
    mode, options, comment,
    bookId, parentId, index,
  }) {
    // determine bookId at the start of a capture
    if (options["capture.saveTo"] === 'server') {
      if (typeof bookId === 'undefined') {
        bookId = (await scrapbook.cache.get({table: "scrapbookServer", key: "currentScrapbook"}, 'storage')) || "";
      }
      await server.init();
      server.bookId = bookId;
    }

    let response;
    if (Number.isInteger(tabId)) {
      // capture tab
      response = await capturer.captureTab({
        timeId,
        tabId, frameId, fullPage,
        title, favIconUrl,
        mode, options,
        documentName,
      });
    } else if (typeof url === 'string') {
      // capture headless
      response = await capturer.captureRemote({
        timeId,
        url, refUrl, title, favIconUrl,
        mode, options,
        documentName,
      });
    } else {
      // nothing to capture
      throw new Error(`Bad parameters.`);
    }

    // special handling (for unit test)
    if (options["capture.saveTo"] === "memory") {
      return response;
    }

    if (!captureOnly) {
      if (options["capture.saveTo"] === "server") {
        await capturer.addItemToServer({
          item: {
            id: response.timeId,
            index: (response.targetDir ? response.targetDir + '/' : '') + response.filename,
            title: response.title,
            type: response.type,
            create: response.timeId,
            source: scrapbook.normalizeUrl(response.sourceUrl),
            icon: response.favIconUrl,
            comment: typeof comment === 'string' ? comment : undefined,
            charset: response.charset,
          },
          parentId,
          index,
        });
      }

      await scrapbook.invokeExtensionScript({
        cmd: "background.setCapturedUrls",
        args: {urls: [scrapbook.normalizeUrl(response.sourceUrl)]},
      });

      await scrapbook.invokeExtensionScript({
        cmd: "background.updateBadgeForAllTabs",
      });

      // preserve info if error out
      capturer.captureInfo.delete(timeId);
      await capturer.clearFileCache({timeId});
    }

    return response;
  };

  /**
   * @param {Object} params
   * @param {string} params.timeId
   * @param {?string} [params.documentName]
   * @param {integer} params.tabId
   * @param {integer} [params.frameId]
   * @param {boolean} [params.fullPage]
   * @param {string} [params.title] - item title
   * @param {string} [params.favIconUrl] - item favicon
   * @param {string} [params.mode] - "tab", "source", "bookmark"
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureTab = async function ({
    timeId,
    documentName,
    tabId, frameId, fullPage,
    title, favIconUrl,
    mode, options,
  }) {
    let {url, discarded} = await browser.tabs.get(tabId);

    // redirect headless capture
    // if frameId not provided, use current tab title and favIcon
    switch (mode) {
      case "source":
      case "bookmark": {
        if (Number.isInteger(frameId)) {
          ({url} = await browser.webNavigation.getFrame({tabId, frameId}));
        }
        return await capturer.captureRemote({
          timeId,
          documentName,
          url, title, favIconUrl,
          mode, options,
        });
      }
    }

    const source = `[${tabId}${(frameId ? ':' + frameId : '')}] ${url}`;
    const message = {
      settings: {
        missionId: capturer.missionId,
        timeId,
        documentName,
        recurseChain: [],
        depth: 0,
        indexFilename: null,
        isMainPage: true,
        isMainFrame: true,
        fullPage,
        title,
        favIconUrl,
      },
      options,
    };

    // use disk cache for in-depth capture to prevent memory exhaustion
    capturer.captureInfo.get(timeId).useDiskCache = options["capture.downLink.doc.depth"] > 0;

    capturer.log(`Capturing (document) ${source} ...`);

    // throw error for a discarded tab
    // note that tab.discarded is undefined in older Firefox version
    if (discarded === true) {
      throw new Error(scrapbook.lang("ErrorTabDiscarded"));
    }

    (await scrapbook.initContentScripts(tabId)).forEach(({tabId, frameId, url, error, injected}) => {
      if (error) {
        const source = `[${tabId}:${frameId}] ${url}`;
        capturer.error(scrapbook.lang("ErrorContentScriptExecute", [source, error]));
      }
    });

    isDebug && console.debug("(main) send", source, message);
    const response = await capturer.invoke("captureDocumentOrFile", message, {tabId, frameId});
    isDebug && console.debug("(main) response", source, response);
    if (!response) { throw new Error(`Response not received.`); }
    if (response.error) { throw new Error(response.error.message); }
    return response;
  };

  /**
   * @param {Object} params
   * @param {string} params.timeId
   * @param {?string} [params.documentName]
   * @param {string} params.url
   * @param {string} [params.refUrl]
   * @param {string} [params.title] - item title
   * @param {string} [params.favIconUrl] - item favicon
   * @param {string} [params.mode] - "tab", "source", "bookmark"
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureRemote = async function ({
    timeId,
    documentName,
    url, refUrl, title, favIconUrl,
    mode, options,
  }) {
    // default mode => launch a tab to capture
    if (mode === "tab") {
      capturer.log(`Launching remote tab ...`);

      const tab = await browser.tabs.create({
        url,
        active: false,
      });

      // wait until tab loading complete
      await new Promise((resolve, reject) => {
        const listener = (tabId, changeInfo, t) => {
          if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
          browser.tabs.onUpdated.removeListener(listener);
          browser.tabs.onRemoved.removeListener(listener2);
          resolve(t);
        };
        const listener2 = (tabId, removeInfo) => {
          if (!(tabId === tab.id)) { return; }
          browser.tabs.onUpdated.removeListener(listener);
          browser.tabs.onRemoved.removeListener(listener2);
          reject({message: `Tab removed before loading complete.`});
        };
        browser.tabs.onUpdated.addListener(listener);
        browser.tabs.onRemoved.addListener(listener2);
      });

      {
        const delay = options["capture.remoteTabDelay"];
        if (delay > 0) {
          capturer.log(`Waiting for ${delay} ms...`);
          await scrapbook.delay(delay);
        }
      }

      const response = await capturer.captureTab({
        timeId,
        documentName,
        tabId: tab.id,
        fullPage: true,
        title,
        options,
      });

      try {
        await browser.tabs.remove(tab.id);
      } catch (ex) {}

      return response;
    }

    const source = `${url}`;
    const message = {
      url,
      refUrl,
      settings: {
        missionId: capturer.missionId,
        timeId,
        documentName,
        recurseChain: [],
        depth: 0,
        isHeadless: true,
        indexFilename: null,
        isMainPage: true,
        isMainFrame: true,
        title,
        favIconUrl,
      },
      options,
    };

    // use disk cache for in-depth capture to prevent memory exhaustion
    capturer.captureInfo.get(timeId).useDiskCache = options["capture.downLink.doc.depth"] > 0;

    isDebug && console.debug("(main) capture", source, message);

    let captureMode = mode;
    let captureFunc;
    switch (mode) {
      case "bookmark": {
        captureFunc = capturer.captureBookmark;
        break;
      }
      case "source": {
        captureFunc = capturer.captureUrl;
        break;
      }
      default: {
        captureMode = "source";
        captureFunc = capturer.captureUrl;
        break;
      }
    }

    capturer.log(`Capturing (${captureMode}) ${source} ...`);
    const response = await captureFunc(message);
    isDebug && console.debug("(main) response", source, response);
    if (!response) { throw new Error(`Response not received.`); }
    if (response.error) { throw new Error(response.error.message); }
    return response;
  };

  /**
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl]
   * @param {boolean} [params.downLink] - is downLink mode (check filter, download as file)
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object|null>} - The capture result, or null if not to be captured.
   */
  capturer.captureUrl = async function (params) {
    isDebug && console.debug("call: captureUrl", params);

    const {downLink = false, settings, options} = params;
    let {timeId, depth} = settings;
    let {url: sourceUrl, refUrl} = params;
    let [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

    depth++;
    let downLinkInDepth = downLink && depth <= options["capture.downLink.doc.depth"];
    let downLinkFile = downLink && ["header", "url"].includes(options["capture.downLink.file.mode"]);

    // check for downLink URL filter
    if (downLink) {
      // exclude URLs mathing downLinkUrlFilter
      if (capturer.downLinkUrlFilter(sourceUrl, options)) {
        return null;
      }

      // apply extension filter when checking URL
      if (downLinkFile && options["capture.downLink.file.mode"] === "url") {
        const filename = scrapbook.urlToFilename(sourceUrl);
        const [, ext] = scrapbook.filenameParts(filename);
        if (!capturer.downLinkFileExtFilter(ext, options)) {
          downLinkFile = false;
        }
      }

      // apply in-depth URL filter
      if (downLinkInDepth && !capturer.downLinkDocUrlFilter(sourceUrl, options)) {
        downLinkInDepth = false;
      }

      // return if downLink condition not fulfilled
      if (!downLinkFile && !downLinkInDepth) {
        return null;
      }
    }

    let fetchResponse;
    let doc;

    // resolve meta refresh
    const metaRefreshChain = [];
    try {
      let urlMain = sourceUrlMain;
      while (true) {
        fetchResponse = await capturer.fetch({
          url: urlMain,
          refUrl,
          ignoreSizeLimit: settings.isMainPage && settings.isMainFrame,
          settings,
          options,
        });

        if (fetchResponse.error) {
          throw new Error(fetchResponse.error);
        }

        doc = await scrapbook.readFileAsDocument(fetchResponse.blob);

        if (!doc) {
          break;
        }

        const metaRefreshTarget = scrapbook.getMetaRefreshTarget(doc, fetchResponse.url);

        if (!metaRefreshTarget) {
          break;
        }

        if (metaRefreshChain.includes(metaRefreshTarget)) {
          throw new Error(`Circular meta refresh.`);
        }

        metaRefreshChain.push(fetchResponse.url);
        refUrl = fetchResponse.url;

        // meta refresh will replace the original hash
        [urlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(metaRefreshTarget);
      }
    } catch (ex) {
      // URL not accessible
      if (!downLink) {
        throw ex;
      }

      doc = null;
    }

    if (downLink) {
      // check for downLink header filter
      if (downLinkFile && options["capture.downLink.file.mode"] === "header") {
        // determine extension
        const headers = fetchResponse.headers;
        let ext;
        if (headers.filename) {
          [, ext] = scrapbook.filenameParts(headers.filename);
          if (!ext && headers.contentType) {
            ext = Mime.extension(headers.contentType);
          }
        } else if (headers.contentType) {
          ext = Mime.extension(headers.contentType);
        } else {
          const filename = scrapbook.urlToFilename(fetchResponse.url);
          [, ext] = scrapbook.filenameParts(filename);
        }

        if (!capturer.downLinkFileExtFilter(ext, options)) {
          downLinkFile = false;
        }
      }

      if (downLinkFile) {
        return await capturer.downloadFile({
          url: fetchResponse.url,
          refUrl,
          settings,
          options,
        })
        .then(response => {
          return Object.assign({}, response, {
            url: capturer.getRedirectedUrl(response.url, sourceUrlHash),
          });
        });
      }

      if (downLinkInDepth && doc) {
        const linkedPages = capturer.captureInfo.get(timeId).linkedPages;
        if (!linkedPages.has(sourceUrlMain)) {
          linkedPages.set(sourceUrlMain, {
            url: metaRefreshChain.length > 0 ? capturer.getRedirectedUrl(fetchResponse.url, sourceUrlHash) : fetchResponse.url,
            hasMetaRefresh: metaRefreshChain.length > 0,
            refUrl,
            depth,
          });
        }
      }

      return null;
    }

    if (doc) {
      return await capturer.captureDocumentOrFile({
        doc,
        docUrl: capturer.getRedirectedUrl(fetchResponse.url, sourceUrlHash),
        refUrl,
        settings,
        options,
      });
    }

    return await capturer.captureFile({
      url: capturer.getRedirectedUrl(fetchResponse.url, sourceUrlHash),
      refUrl,
      charset: fetchResponse.headers.charset,
      settings,
      options,
    });
  };

  /**
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl]
   * @param {Object} params.settings
   * @param {string} params.settings.timeId
   * @param {string} [params.settings.title] - item title (also used as index page title)
   * @param {string} [params.settings.favIconUrl] - item favicon (also used as index page favicon)
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureBookmark = async function (params) {
    isDebug && console.debug("call: captureBookmark", params);

    const {settings, options} = params;
    let {url: sourceUrl, refUrl} = params;
    let [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    let fetchResponse;
    let doc;

    // resolve meta refresh
    const metaRefreshChain = [];
    while (true) {
      fetchResponse = await capturer.fetch({
        url: sourceUrlMain,
        refUrl,
        settings,
        options,
      });

      if (fetchResponse.error) {
        throw new Error(fetchResponse.error);
      }

      doc = await scrapbook.readFileAsDocument(fetchResponse.blob);

      if (!doc) {
        break;
      }

      const metaRefreshTarget = scrapbook.getMetaRefreshTarget(doc, fetchResponse.url);

      if (!metaRefreshTarget) {
        break;
      }

      if (metaRefreshChain.includes(metaRefreshTarget)) {
        throw new Error(`Circular meta refresh.`);
      }

      metaRefreshChain.push(fetchResponse.url);
      refUrl = fetchResponse.url;
      sourceUrl = metaRefreshTarget;
      [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    }

    const {timeId} = settings;
    let {title, favIconUrl} = settings;

    // attempt to retrieve title and favicon from source page
    if (doc && (!title || !favIconUrl)) {
      try {
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
            favIconUrl = new URL(elem.getAttribute('href'), fetchResponse.url).href;
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
        const fetchResponse = await capturer.fetch({
          url: favIconUrlMain,
          refUrl: sourceUrl,
          settings,
          options,
        });

        if (fetchResponse.error) {
          throw new Error(fetchResponse.error);
        }

        favIconUrl = await scrapbook.readFileAsDataURL(fetchResponse.blob);
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
          ' data-scrapbook-source="' + scrapbook.escapeHtml(scrapbook.normalizeUrl(url)) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="bookmark"' : 
          "";
      const titleElem = title ? `<title>${scrapbook.escapeHtml(title, false)}</title>\n` : "";
      const favIconElem = favIconUrl ? `<link rel="shortcut icon" href="${scrapbook.escapeHtml(favIconUrl)}">\n` : "";
      html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${scrapbook.escapeHtml(sourceUrl)}">
${titleElem}${favIconElem}</head>
<body>
Bookmark for <a href="${scrapbook.escapeHtml(sourceUrl)}">${scrapbook.escapeHtml(sourceUrl, false)}</a>
</body>
</html>`;
    }

    const blob = new Blob([html], {type: "text/html"});
    const ext = ".htm";

    settings.indexFilename = await capturer.formatIndexFilename({
      title: title || scrapbook.filenameParts(scrapbook.urlToFilename(sourceUrl))[0] || "untitled",
      sourceUrl,
      isFolder: false,
      settings,
      options,
    });

    let targetDir;
    let filename = settings.indexFilename + ext;

    title = title || scrapbook.urlToFilename(sourceUrl);
    switch (options["capture.saveTo"]) {
      case 'memory': {
        // special handling (for unit test)
        return await capturer.saveBlobInMemory({blob});
      }
      case 'file': {
        const downloadItem = await capturer.saveBlobNaturally({
          timeId,
          blob,
          filename,
          sourceUrl,
        });
        if (typeof downloadItem === 'object') {
          capturer.log(`Saved to "${downloadItem.filename}"`);
          filename = scrapbook.filepathParts(downloadItem.filename)[1];
        } else {
          // save failed (possibly user cancel)
          filename = downloadItem;
        }
        break;
      }
      case 'server': {
        // we get here only if the book is no_tree
        [targetDir, filename] = scrapbook.filepathParts(filename);
        filename = await capturer.saveBlobToServer({
          timeId,
          blob,
          directory: targetDir,
          filename,
          settings,
          options,
        });
        capturer.log(`Saved to "${(targetDir ? targetDir + '/' : '') + filename}"`);
        break;
      }
      case 'folder':
      default: {
        [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + filename);
        const downloadItem = await capturer.saveBlob({
          timeId,
          blob,
          directory: targetDir,
          filename,
          sourceUrl,
          autoErase: false,
          savePrompt: false,
          conflictAction: options["capture.saveOverwrite"] ? "overwrite" : "uniquify",
          settings,
          options,
        });
        capturer.log(`Saved to "${downloadItem.filename}"`);
        filename = scrapbook.filepathParts(downloadItem.filename)[1];
        break;
      }
    }

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
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl] - the referrer URL
   * @param {string} [params.charset] - charset for the text file
   * @param {Object} params.settings
   * @param {string} [params.settings.title] - item title (also used as index page title)
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.captureFile = async function (params) {
    isDebug && console.debug("call: captureFile", params);

    const {url: sourceUrl, refUrl, charset, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId, isMainPage, isMainFrame, documentName, title} = settings;

    if (isMainPage && isMainFrame) {
      settings.indexFilename = await capturer.formatIndexFilename({
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

    if (isMainPage && isMainFrame) {
      // for the main frame, create a index.html that redirects to the file
      const url = sourceUrl.startsWith("data:") ? "data:" : sourceUrl;
      const meta = params.options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(scrapbook.normalizeUrl(url)) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' + 
          ' data-scrapbook-type="file"' + 
          (charset ? ' data-scrapbook-charset="' + charset + '"' : "") : 
          "";

      let content =`<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${scrapbook.escapeHtml(response.url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(response.url)}">${scrapbook.escapeHtml(response.filename, false)}</a>
</body>
</html>`;

      // pass content as Blob to prevent size limitation of a message
      // (for a supported browser)
      if (scrapbook.userAgent.is('gecko')) {
        content = new Blob([content], {type: 'text/plain'});
      }

      const mime = "text/html";
      const documentFileName = documentName + ".html";

      const registry = await capturer.invoke("registerDocument", {
        docUrl: 'about:blank',
        mime,
        role: `document-${scrapbook.getUuid()}`,
        settings,
        options,
      });

      {
        const response = await capturer.saveDocument({
          sourceUrl,
          documentFileName,
          settings,
          options,
          data: {
            title,
            mime,
            content,
          },
        });

        // special handling for blob response
        if (response.__type__ === 'Blob') {
          return response;
        }

        return Object.assign({}, response, {
          type: "file",
          charset: charset || undefined,
          url: capturer.getRedirectedUrl(response.url, sourceUrlHash),
        });
      }
    } else {
      return Object.assign({}, response, {
        url: capturer.getRedirectedUrl(response.url, sourceUrlHash),
      });
    }
  };

  /**
   * @param {Object} params
   * @param {integer} params.tabId
   * @param {integer} [params.frameId]
   * @param {string} [params.options] - preset options that overwrites default
   * @param {boolean} [params.internalize]
   * @return {Promise<Object>}
   */
  capturer.resaveTab = async function ({
    tabId, frameId, options,
    internalize = false,
  }) {
    let {url, title, favIconUrl, discarded} = await browser.tabs.get(tabId);

    const source = `[${tabId}${(frameId ? ':' + frameId : '')}] ${url}`;

    capturer.log(`Saving (document) ${source} ...`);

    // throw error for a discarded tab
    // note that tab.discarded is undefined in older Firefox version
    if (discarded === true) {
      throw new Error(scrapbook.lang("ErrorTabDiscarded"));
    }

    const mime = Mime.lookup(scrapbook.urlToFilename(url));
    if (!["text/html", "application/xhtml+xml"].includes(mime)) {
      throw new Error(scrapbook.lang("ErrorSaveNonHtml", [url]));
    }

    // Load server config and verify whether we can actually save the page.
    await server.init();
    const bookId = await server.findBookIdFromUrl(url);
    const book = server.books[bookId];

    if (!url.startsWith(book.dataUrl)) {
      throw new Error(scrapbook.lang("ErrorSaveNotUnderDataDir", [url]));
    }

    const item = await book.findItemFromUrl(url);

    if (item && item.locked) {
      throw new Error(scrapbook.lang("ErrorSaveLockedItem"));
    }

    const isMainDocument = book.isItemIndexUrl(item, url);

    let internalizePrefix;
    if (internalize) {
      if (item && item.index) {
        const index = item.index;
        const indexCI = index.toLowerCase();
        if (index.endsWith('/index.html')) {
          internalizePrefix = scrapbook.normalizeUrl(book.dataUrl + scrapbook.escapeFilename(index.slice(0, -10)));
        } else if (indexCI.endsWith('.htz')) {
          internalizePrefix = scrapbook.normalizeUrl(book.dataUrl + scrapbook.escapeFilename(item.index + '!/'));
        } else if (indexCI.endsWith('.maff')) {
          // Trust only the subdirectory in the current URL, as it is
          // possible that */index.html be redirected to another page.
          const base = scrapbook.normalizeUrl(book.dataUrl + scrapbook.escapeFilename(item.index + '!/'));
          const urlN = scrapbook.normalizeUrl(url);
          if (urlN.startsWith(base)) {
            const m = urlN.slice(base.length).match(/^[^/]+\//);
            if (m) {
              internalizePrefix = base + m[0];
            }
          }
        }
      }
    }

    (await scrapbook.initContentScripts(tabId)).forEach(({tabId, frameId, url, error, injected}) => {
      if (error) {
        const source = `[${tabId}:${frameId}] ${url}`;
        capturer.error(scrapbook.lang("ErrorContentScriptExecute", [source, error]));
      }
    });

    const message = {
      internalize,
      isMainPage: isMainDocument,
      item,
      options: Object.assign(scrapbook.getOptions("capture"), options),
    };

    isDebug && console.debug("(main) send", source, message);
    const response = await capturer.invoke("retrieveDocumentContent", message, {tabId, frameId});
    isDebug && console.debug("(main) response", source, response);

    const modify = scrapbook.dateToId();

    // handle resources to internalize
    const resourceMap = new Map();
    if (internalize) {
      const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
      for (const [fileUrl, data] of Object.entries(response)) {
        const fetchResource = async (url) => {
          const fullUrl = scrapbook.normalizeUrl(capturer.resolveRelativeUrl(url, fileUrl));
          if (!scrapbook.isContentPage(fullUrl, allowFileAccess)) { return null; }
          if (fullUrl.startsWith(internalizePrefix)) { return null; }

          const file = resourceMap.get(fullUrl);
          if (typeof file !== 'undefined') { return file; }

          resourceMap.set(fullUrl, null);

          try {
            const xhr = await scrapbook.xhr({
              url: fullUrl,
              responseType: 'blob',
            });
            const blob = xhr.response;

            let file;
            if (internalizePrefix) {
              const sha = scrapbook.sha1(await scrapbook.readFileAsArrayBuffer(blob), 'ARRAYBUFFER');
              const ext = Mime.extension(blob.type);
              file = new File([blob], sha + '.' + ext, {type: blob.type});
            } else {
              file = await scrapbook.readFileAsDataURL(blob);
            }
            resourceMap.set(fullUrl, file);
            return file;
          } catch (ex) {
            console.error(ex);
            capturer.warn(`Unable to internalize resource "${scrapbook.crop(url, 256)}": ${ex.message}`);
          }
        };

        for (const [uuid, url] of Object.entries(data.resources)) {
          const file = await fetchResource(url);
          data.resources[uuid] = {url, file};
        }
      }
    }

    await book.transaction({
      mode: 'validate',
      callback: async (book) => {
        // documents
        for (const [fileUrl, data] of Object.entries(response)) {
          try {
            const target = scrapbook.splitUrl(fileUrl)[0];

            // only save files under dataDir
            if (!fileUrl.startsWith(book.dataUrl)) {
              throw new Error(scrapbook.lang("ErrorSaveNotUnderDataDir", [target]));
            }

            // forbid non-UTF-8 for data safety
            if (data.charset !== "UTF-8") {
              throw new Error(scrapbook.lang("ErrorSaveNonUTF8", [target]));
            }

            // save document
            try {
              let content = data.content;
              if (typeof content !== 'string') {
                content = await scrapbook.readFileAsText(content);
              }

              // replace resource URLs
              content = content.replace(/urn:scrapbook:url:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
                if (data.resources[key]) {
                  const file = data.resources[key].file;

                  if (!file) {
                    return scrapbook.escapeHtml(data.resources[key].url);
                  }

                  if (typeof file === 'string') {
                    return scrapbook.escapeHtml(file);
                  }

                  const resUrl = internalizePrefix + file.name;
                  const u = scrapbook.getRelativeUrl(resUrl, fileUrl);
                  return scrapbook.escapeHtml(u);
                }
                return match;
              });

              const blob = new Blob([content], {type: "text/html"});
              await server.request({
                url: target + '?a=save',
                method: "POST",
                format: 'json',
                csrfToken: true,
                body: {
                  upload: blob,
                },
              });
              capturer.log(`Updated ${target}`);
            } catch (ex) {
              console.error(ex);
              throw new Error(scrapbook.lang("ErrorSaveUploadFailure", [target, ex.message]));
            }

            // update item for main document
            if (isMainDocument && url === fileUrl) {
              item.title = data.info.title;
            }
          } catch (ex) {
            if (data.info.isMainFrame) {
              throw ex;
            } else {
              capturer.error(ex);
              continue;
            }
          }
        }

        // resources
        for (const [url, file] of resourceMap.entries()) {
          if (!file) { continue; }

          let target;
          if (typeof file === 'string') {
            target = file;
          } else {
            target = internalizePrefix + file.name;
            await server.request({
              url: target + '?a=save',
              method: "POST",
              format: 'json',
              csrfToken: true,
              body: {
                upload: file,
              },
            });
          }

          capturer.log(`Internalized resource: ${scrapbook.crop(target, 256)}`);
        }

        // update item
        if (item) {
          capturer.log(`Updating server index for item "${item.id}"...`);
          item.modify = modify;
          book.meta[item.id] = item;
          await book.saveMeta();

          if (scrapbook.getOption("indexer.fulltextCache")) {
            await server.requestSse({
              query: {
                "a": "cache",
                "book": book.id,
                "item": item.id,
                "fulltext": 1,
                "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
                "no_lock": 1,
                "no_backup": 1,
              },
              onMessage(info) {
                if (['error', 'critical'].includes(info.type)) {
                  capturer.error(`Error when updating fulltext cache: ${info.msg}`);
                }
              },
            });
          }

          await book.loadTreeFiles(true);  // update treeLastModified
        } else {
          if (!book.config.no_tree) {
            capturer.warn(scrapbook.lang("ErrorSaveUnknownItem"));
          }
        }
      },
    });

    return {
      title,
      sourceUrl: url,
      favIconUrl,
    };
  };

  /**
   * @param {Object} params
   * @return {Promise<Object>}
   */
  capturer.recapture = async function ({
    tabId, frameId, fullPage,
    url, refUrl, title, favIconUrl,
    mode, options, comment, recaptureInfo,
  }) {
    const {bookId, itemId} = recaptureInfo;

    capturer.log(`Preparing a re-capture for item "${itemId}" of book "${bookId}"...`);

    await server.init(true);
    const book = server.books[bookId];
    if (!book || book.config.no_tree) {
      throw new Error(`Recapture reference book invalid: "${bookId}".`);
    }

    const timeId = scrapbook.dateToId();

    let result;
    await book.transaction({
      mode: 'refresh',
      callback: async (book, updated) => {
        await book.loadMeta(updated);
        const item = book.meta[itemId];
        if (!item) {
          throw new Error(`Recapture reference item invalid: "${itemId}".`);
        }

        // record original index
        const oldIndex = item.index;

        // enforce capture to server
        options["capture.saveTo"] = "server";

        result = await capturer.captureGeneral({
          timeId,
          tabId, frameId, fullPage,
          url: url || item.source, refUrl, title, favIconUrl,
          mode, options,
          bookId,
          captureOnly: true,
        });

        if (title) { item.title = title; }
        if (comment) { item.comment = comment; }
        item.index = (result.targetDir ? result.targetDir + '/' : '') + result.filename;
        item.type = result.type;
        item.modify = timeId;
        item.source = scrapbook.normalizeUrl(result.sourceUrl);
        item.icon = await book.cacheFavIcon({
          item,
          icon: result.favIconUrl,
        });

        // attempt to migrate annotations
        // @TODO:
        // - Handle more legacy annotations?
        // - Handle annotations in frame or shadow root?
        // - Handle more special annotations?
        // - Detect moved text content.
        migrateAnnotations: {
          if (!(oldIndex && item.index)) { break migrateAnnotations; }

          let oldDoc;
          try {
            oldDoc = (await scrapbook.xhr({
              url: book.dataUrl + scrapbook.escapeFilename(oldIndex),
              responseType: 'document',
            })).response;
          } catch (ex) {
            console.error(ex);
            capturer.warn(`Failed to read old page. Skipped migrating annotations.`);
            break migrateAnnotations;
          }

          const newXhr = await scrapbook.xhr({
            url: book.dataUrl + scrapbook.escapeFilename(item.index),
            responseType: 'document',
          });
          const newIndexUrl = newXhr.responseURL;
          const newDoc = newXhr.response;

          const getOffset = (elem) => {
            const parent = elem.parentElement;
            let pos = 0;
            for (const sibling of parent.childNodes) {
              if (sibling === elem) {
                return pos;
              }
              pos++;
            }
            return null;
          };

          const getXPath = (elem, root) => {
            if (elem.nodeType === 3) {
              const parent = elem.parentElement;
              return `${getXPath(parent, root)}/node()[${getOffset(elem) + 1}]`;
            }

            if (elem.id) {
              return `//*[@id=${scrapbook.quoteXPath(elem.id)}]`;
            }

            const tag = elem.nodeName.toLowerCase();
            if (elem === root) {
              return `/${tag}[1]`;
            }

            const parent = elem.parentElement;
            let pos = 0;
            for (const sibling of parent.children) {
              if (sibling === elem) {
                return `${getXPath(parent, root)}/${tag}[${pos + 1}]`;
              }
              if (sibling.nodeName.toLowerCase() === tag) {
                pos++;
              }
            }
          };

          const oldRootNode = oldDoc.documentElement;
          const annotations = new Map();
          for (const elem of oldRootNode.querySelectorAll([
                '[data-scrapbook-elem="linemarker"]',
                '[data-scrapbook-elem="sticky"]',
                '[data-scrapbook-elem="custom"]',
                '[data-scrapbook-elem="custom-wrapper"]',
              ].join(', '))) {
            const removeType = scrapbook.getScrapBookObjectRemoveType(elem);
            if (![1, 2].includes(removeType)) { continue; }
            annotations.set(elem, {
              elemPath: getXPath(elem, oldRootNode),
              removeType,
            });
          }
          for (const [elem, annotation] of annotations) {
            switch (annotation.removeType) {
              case 1: {
                let startContainer = elem.parentElement;
                let startOffset = getOffset(elem);

                elem.remove();

                Object.assign(annotation, {
                  startContainerPath: getXPath(startContainer, oldRootNode),
                  startOffset,
                });
                break;
              }
              case 2: {
                let startContainer = elem.parentElement;
                let startOffset = getOffset(elem);
                let endContainer = elem.parentElement;
                let endOffset = startOffset + elem.childNodes.length;

                fixStartEnd: {
                  const firstChild = elem.firstChild;
                  const lastChild = elem.lastChild;

                  if (firstChild.nodeType === 3) {
                    const prev = elem.previousSibling;
                    if (prev && prev.nodeType === 3) {
                      startContainer = prev;
                      startOffset = prev.nodeValue.length;
                    }
                  }

                  if (lastChild.nodeType === 3) {
                    // lastChild will be merged into startContainer after normaliz() in this case
                    if (lastChild === firstChild && startContainer.nodeType === 3) {
                      endContainer = startContainer;
                      endOffset = startOffset + lastChild.nodeValue.length;
                    } else {
                      const next = elem.nextSibling;
                      if (next && next.nodeType === 3) {
                        endContainer = lastChild;
                        endOffset = lastChild.nodeValue.length;
                      }
                    }
                  }
                }

                const text = elem.textContent;
                const startCheck = text.slice(0, 3);
                const endCheck = text.slice(-3);

                scrapbook.unwrapNode(elem);

                Object.assign(annotation, {
                  startContainerPath: getXPath(startContainer, oldRootNode),
                  startOffset,
                  endContainerPath: getXPath(endContainer, oldRootNode),
                  endOffset,
                  startCheck,
                  endCheck,
                });
                break;
              }
            }
          }

          const errors = [];

          // Apply annotations in reverse order so that the latter annotation
          // won't fail to apply due to DOM change by former annotation.
          for (const [refElem, annotation] of [...annotations].reverse()) {
            switch (annotation.removeType) {
              case 1: {
                let {elemPath, startContainerPath, startOffset} = annotation;
                const startContainer = newDoc.evaluate(startContainerPath, newDoc, null, 0, null).iterateNext();
                try {
                  if (!startContainer) {
                    throw new Error(`startContainer "${startContainerPath}" not found: ${elemPath}`);
                  }
                  startContainer.insertBefore(refElem.cloneNode(true), startContainer.childNodes[startOffset]);
                } catch (ex) {
                  console.error(ex);
                  errors.push(`Unable to apply annotation: ${elemPath}`);
                }
                break;
              }
              case 2: {
                let {elemPath, startContainerPath, startOffset, endContainerPath, endOffset, startCheck, endCheck} = annotation;
                const startContainer = newDoc.evaluate(startContainerPath, newDoc, null, 0, null).iterateNext();
                const endContainer = newDoc.evaluate(endContainerPath, newDoc, null, 0, null).iterateNext();
                try {
                  if (!startContainer) {
                    throw new Error(`startContainer "${startContainerPath}" not found: ${elemPath}`);
                  }
                  if (!endContainer) {
                    throw new Error(`endContainer "${endContainerPath}" not found: ${elemPath}`);
                  }

                  const range = new Range();
                  range.setStart(startContainer, startOffset);
                  range.setEnd(endContainer, endOffset);
                  const text = range.toString();
                  if (!text.startsWith(startCheck)) {
                    throw new Error(`startCheck "${startCheck}" not match: ${elemPath}`);
                  }
                  if (!text.endsWith(endCheck)) {
                    throw new Error(`endCheck "${endCheck}" not match: ${elemPath}`);
                  }

                  range.surroundContents(refElem.cloneNode(false));
                } catch (ex) {
                  console.error(ex);
                  errors.push(`Unable to apply annotation: ${elemPath}`);
                }
                break;
              }
            }
          }
          for (const error of errors.reverse()) {
            capturer.warn(`Failed to migrate annotation: ${error}`);
          }

          await capturer.preSaveProcess({
            rootNode: newDoc.documentElement,
            isMainDocument: true,
            deleteErased: false,
            requireBasicLoader: !!newDoc.querySelector('script[data-scrapbook-elem="basic-loader"]'),
            insertInfoBar: !!newDoc.querySelector('script[data-scrapbook-elem="infobar-loader"]'),
          });

          const content = scrapbook.documentToString(newDoc, options["capture.prettyPrint"]);
          const blob = new Blob([content], {type: "text/html"});
          await server.request({
            url: newIndexUrl + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              upload: blob,
            },
          });
        }

        // update item meta
        capturer.log(`Updating server index for item "${itemId}"...`);
        await book.saveMeta();

        if (scrapbook.getOption("indexer.fulltextCache")) {
          await server.requestSse({
            query: {
              "a": "cache",
              "book": bookId,
              "item": itemId,
              "fulltext": 1,
              "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
              "no_lock": 1,
              "no_backup": 1,
            },
            onMessage(info) {
              if (['error', 'critical'].includes(info.type)) {
                capturer.error(`Error when generating fulltext cache: ${info.msg}`);
              }
            },
          });
        }

        // move current data files to backup
        if (oldIndex) {
          let index = oldIndex;
          if (index.endsWith('/index.html')) {
            index = index.slice(0, -11);
          }
          const target = book.dataUrl + scrapbook.escapeFilename(index);

          if (options["capture.backupForRecapture"]) {
            capturer.log(`Moving old data files "${index}" to backup directory "${timeId}"...`);
            await server.request({
              url: target + `?a=backup&ts=${timeId}&note=recapture&move=1`,
              method: "POST",
              format: 'json',
              csrfToken: true,
            });
          } else {
            capturer.log(`Deleting old data files "${index}"...`);
            try {
              await server.request({
                url: target + `?a=delete`,
                method: "POST",
                format: 'json',
                csrfToken: true,
              });
            } catch (ex) {
              if (ex.status === 404) {
                console.error(ex);
              } else {
                throw ex;
              }
            }
          }
        }

        // preserve info if error out
        capturer.captureInfo.delete(timeId);
        await capturer.clearFileCache({timeId});

        await book.loadTreeFiles(true);  // update treeLastModified
      },
    });

    return result;
  };

  /**
   * @param {Object} params
   * @return {Promise<Object>}
   */
  capturer.mergeCapture = async function ({
    tabId, frameId, fullPage,
    url, refUrl, title, favIconUrl,
    mode, options,
    mergeCaptureInfo,
  }) {
    const {bookId, itemId} = mergeCaptureInfo;

    capturer.log(`Preparing a merge capture for item "${itemId}" of book "${bookId}"...`);

    if (mode === "bookmark") {
      throw new Error(`Invalid mode for merge capture: "${mode}"`);
    }

    await server.init(true);
    const book = server.books[bookId];
    if (!book || book.config.no_tree) {
      throw new Error(`Merge capture reference book invalid: "${bookId}".`);
    }

    let result;
    await book.transaction({
      mode: 'refresh',
      callback: async (book, updated) => {
        await book.loadMeta(updated);
        const item = book.meta[itemId];
        if (!item) {
          throw new Error(`Merge capture reference item invalid: "${itemId}".`);
        }
        if (item.type !== 'site') {
          throw new Error(`Merge capture supports only site items.`);
        }

        const timeId = item.id;
        const info = capturer.captureInfo.get(timeId);

        // load indexUrl for reference
        if (!item.index.endsWith('/index.html')) {
          throw new Error(`Index page is not "*/index.html".`);
        }

        let indexUrl;
        try {
          indexUrl = (await server.request({
            method: 'HEAD',
            url: book.dataUrl + scrapbook.escapeFilename(item.index),
          })).url;
        } catch (ex) {
          throw new Error(`Unable to locate index file for item "${itemId}".`);
        }

        // load sitemap and merge to info
        let sitemap;
        try {
          sitemap = await server.request({
            url: new URL('index.json', indexUrl).href,
          }).then(r => r.json());
        } catch (ex) {
          throw new Error(`Unable to access "index.json" for item "${itemId}".`);
        }

        switch (sitemap.version) {
          case 1: {
            info.initialVersion = sitemap.version;
            for (const {path, url, role, primary} of sitemap.files) {
              info.files.set(path, {
                url,
                role,
              });

              if (primary) {
                let token;
                try {
                  token = capturer.getRegisterToken(url, role);
                } catch (ex) {
                  // skip special or undefined URL
                  continue;
                }

                info.urlToFilenameMap.set(token, {
                  filename: path,
                  url: scrapbook.escapeFilename(path),
                });

                // load previously captured pages to blob
                if (REBUILD_LINK_SUPPORT_TYPES.has(Mime.lookup(path))) {
                  const fileUrl = new URL(scrapbook.escapeFilename(path), indexUrl).href;
                  try {
                    const response = await server.request({
                      url: fileUrl,
                    });
                    if (!response.ok) {
                      throw new Error(`Bad status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    await capturer.saveFileCache({
                      timeId,
                      path,
                      url,
                      blob,
                    });
                  } catch (ex) {
                    // skip missing resource
                    continue;
                  }
                }
              }
            }
            break;
          }
          case 2: {
            for (let indexPage of sitemap.indexPages) {
              info.indexPages.add(indexPage);
            }
            for (let {path, url, role, token} of sitemap.files) {
              info.files.set(path, {
                url,
                role,
                token,
              });

              if (token) {
                // use url and role if token not matched
                // (possibly modified arbitrarily)
                if (url && role) {
                  const t = capturer.getRegisterToken(url, role);
                  if (t !== token) {
                    token = t;
                    console.error(`Taking token from url and role for mismatching token: "${path}"`);
                  }
                }

                info.urlToFilenameMap.set(token, {
                  filename: path,
                  url: scrapbook.escapeFilename(path),
                });

                // load previously captured pages to blob
                if (REBUILD_LINK_SUPPORT_TYPES.has(Mime.lookup(path))) {
                  const fileUrl = new URL(scrapbook.escapeFilename(path), indexUrl).href;
                  try {
                    const response = await server.request({
                      url: fileUrl,
                    });
                    if (!response.ok) {
                      throw new Error(`Bad status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    await capturer.saveFileCache({
                      timeId,
                      path,
                      url,
                      blob,
                    });
                  } catch (ex) {
                    // skip missing resource
                    continue;
                  }
                }
              }
            }
            break;
          }
          default: {
            throw new Error(`Sitemap version ${sitemap.version} not supported.`);
            break;
          }
        }

        // enforce some capture options
        let depth = options["capture.downLink.doc.depth"];
        Object.assign(options, {
          // capture to server
          "capture.saveTo": "server",
          // only saving as folder can be effectively merged,
          // and prevents a conflict of different types
          "capture.saveAs": "folder",
          // save to the same directory
          "capture.saveFilename": item.index.slice(0, -11),
          "capture.saveOverwrite": true,
          // always rebuild links and update index.json
          "capture.downLink.doc.depth": depth > 0 ? depth : 0,
        });

        // enforce disk cache
        info.useDiskCache = true;

        const modified = scrapbook.dateToId();

        result = await capturer.captureGeneral({
          timeId,
          tabId, frameId, fullPage,
          url, refUrl, title, favIconUrl,
          mode, options,
          bookId,
          documentName: null,
          captureOnly: true,
        });

        item.modify = modified;

        // update item meta
        capturer.log(`Updating server index for item "${itemId}"...`);
        await book.saveMeta();

        if (scrapbook.getOption("indexer.fulltextCache")) {
          await server.requestSse({
            query: {
              "a": "cache",
              "book": bookId,
              "item": itemId,
              "fulltext": 1,
              "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
              "no_lock": 1,
              "no_backup": 1,
            },
            onMessage(info) {
              if (['error', 'critical'].includes(info.type)) {
                capturer.error(`Error when generating fulltext cache: ${info.msg}`);
              }
            },
          });
        }

        // preserve info if error out
        capturer.captureInfo.delete(timeId);
        await capturer.clearFileCache({timeId});

        await book.loadTreeFiles(true);  // update treeLastModified
      },
    });

    return result;
  };

  /**
   * @param {string} url
   * @param {string} role
   * @return {string}
   */
  capturer.getRegisterToken = function (url, role) {
    let token = `${scrapbook.normalizeUrl(url)}\t${role}`;
    token = scrapbook.sha1(token, "TEXT");
    return token;
  };

  /**
   * @typedef {Object} registerDocumentResponse
   * @property {string} filename - The registered filename.
   * @property {string} url - URL of the registered filename (without hash).
   */

  /**
   * Register a document filename uniquified for the specified docUrl and role.
   *
   * - If role is not provided, return a non-uniquified document filename
   *   without registration.
   *
   * @kind invokable
   * @param {Object} params
   * @param {string} params.docUrl
   * @param {string} params.mime
   * @param {string} [params.role] - "document-*", "document" (headless)
   * @param {Object} params.settings
   * @param {boolean} params.settings.isMainPage
   * @param {boolean} params.settings.isMainFrame
   * @param {string} params.settings.documentName
   * @param {Object} params.options
   * @return {Promise<registerDocumentResponse>}
   */
  capturer.registerDocument = async function (params) {
    const MIME_EXT_MAP = {
      "text/html": "html",
      "application/xhtml+xml": "xhtml",
      "image/svg+xml": "svg",
    };

    const getExtFromMime = (mime) => {
      return MIME_EXT_MAP[mime] || "html";
    };

    const getDocumentFileName = (params) => {
      const {url: sourceUrl, mime, headers = {}, settings, options} = params;

      let documentFileName = headers.filename || scrapbook.urlToFilename(sourceUrl);

      // fix extension
      const fn = documentFileName.toLowerCase();
      for (let ext of Mime.allExtensions(mime)) {
        ext = "." + ext.toLowerCase();
        if (fn.endsWith(ext)) {
          documentFileName = documentFileName.slice(0, -ext.length);
          break;
        }
      }
      documentFileName += "." + getExtFromMime(mime);

      documentFileName = scrapbook.validateFilename(documentFileName, options["capture.saveAsciiFilename"]);

      return documentFileName;
    };

    const registerDocument = capturer.registerDocument = async function (params) {
      isDebug && console.debug("call: registerDocument", params);

      const {docUrl: sourceUrl, mime, role, settings, options} = params;
      const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

      const {timeId, isMainPage, isMainFrame, documentName} = settings;
      const urlToFilenameMap = capturer.captureInfo.get(timeId).urlToFilenameMap;
      const files = capturer.captureInfo.get(timeId).files;

      const fetchResponse = await capturer.fetch({
        url: sourceUrl,
        headerOnly: true,
        settings,
        options,
      });

      let response;
      if (role || (isMainPage && isMainFrame)) {
        const token = capturer.getRegisterToken(sourceUrlMain, role);

        // if a previous registry exists, return it
        const previousRegistry = urlToFilenameMap.get(token);
        if (previousRegistry) {
          return Object.assign({}, previousRegistry, {
            isDuplicate: true,
          });
        }

        let documentFileName;
        if (documentName && ((isMainPage && isMainFrame) || options["capture.frameRename"])) {
          let documentNameBase = scrapbook.validateFilename(documentName, options["capture.saveAsciiFilename"]);

          // see capturer.getUniqueFilename for filename limitation
          documentNameBase = scrapbook.crop(documentNameBase, options["capture.saveFilenameMaxLenUtf16"], options["capture.saveFilenameMaxLenUtf8"], "");

          let newDocumentName = documentNameBase;
          let newDocumentNameCI = newDocumentName.toLowerCase();
          let count = 0;
          while (files.has(newDocumentNameCI + ".html") || 
              files.has(newDocumentNameCI + ".xhtml") || 
              files.has(newDocumentNameCI + ".svg")) {
            newDocumentName = documentNameBase + "_" + (++count);
            newDocumentNameCI = newDocumentName.toLowerCase();
          }
          files.set(newDocumentNameCI + ".html", {role});
          files.set(newDocumentNameCI + ".xhtml", {role});
          files.set(newDocumentNameCI + ".svg", {role});
          documentFileName = newDocumentName + "." + getExtFromMime(mime);
        } else {
          documentFileName = getDocumentFileName({
            url: fetchResponse.url,
            mime,
            headers: fetchResponse.headers,
            settings,
            options,
          });

          documentFileName = capturer.getUniqueFilename(settings.timeId, documentFileName, options);
        }

        response = {filename: documentFileName, url: scrapbook.escapeFilename(documentFileName)};

        // update registry
        urlToFilenameMap.set(token, response);
        Object.assign(files.get(documentFileName.toLowerCase()), {
          url: fetchResponse.url,
          role,
        });
      } else {
        let documentFileName = getDocumentFileName({
          url: fetchResponse.url,
          mime,
          headers: fetchResponse.headers,
          settings,
          options,
        });

        response = {filename: documentFileName, url: scrapbook.escapeFilename(documentFileName)};
      }

      return response;
    };

    return await registerDocument(params);
  };

  /**
   * @typedef {Object} registerFileResponse
   * @property {string} filename - The registered filename.
   * @property {string} url - URL of the registered filename (without hash).
   */

  /**
   * Register a filename uniquified for the specifiied url and role.
   *
   * - If role is not provided, return a non-uniquified filename without
   *   registration.
   *
   * @kind invokable
   * @param {string} params.url
   * @param {string} [params.role] - "resource", "css", "css-*" (dynamic)
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<registerFileResponse>}
   */
  capturer.registerFile = async function (params) {
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

    const getFilename = (params) => {
      const {url: sourceUrl, headers = {}, settings, options} = params;

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
        if ((!ext && !MIMES_NO_EXT_OK.has(mime)) || 
            (MIMES_NEED_MATCH.has(mime) && !Mime.allExtensions(mime).includes(ext.toLowerCase()))) {
          ext = Mime.extension(mime);
          if (ext) {
            filename += "." + ext;
          }
        }
      }

      filename = scrapbook.validateFilename(filename, options["capture.saveAsciiFilename"]);

      return filename;
    };

    const registerFile = capturer.registerFile = async function (params) {
      isDebug && console.debug("call: registerFile", params);

      const {url: sourceUrl, role, settings, options} = params;
      const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

      const {timeId} = settings;
      const urlToFilenameMap = capturer.captureInfo.get(timeId).urlToFilenameMap;
      const files = capturer.captureInfo.get(timeId).files;

      const fetchResponse = await capturer.fetch({
        url: sourceUrl,
        headerOnly: true,
        settings,
        options,
      });

      let response;
      if (role) {
        const token = capturer.getRegisterToken(fetchResponse.url, role);

        // if a previous registry exists, return it
        const previousRegistry = urlToFilenameMap.get(token);
        if (previousRegistry) {
          return Object.assign({}, previousRegistry, {
            isDuplicate: true,
          });
        }

        let filename = getFilename({
          url: fetchResponse.url,
          headers: fetchResponse.headers,
          settings,
          options,
        });

        filename = capturer.getUniqueFilename(settings.timeId, filename, options);

        response = {filename, url: scrapbook.escapeFilename(filename)};

        // update registry
        urlToFilenameMap.set(token, response);
        Object.assign(files.get(filename.toLowerCase()), {
          url: fetchResponse.url,
          role,
        });
      } else {
        let filename = getFilename({
          url: fetchResponse.url,
          headers: fetchResponse.headers,
          settings,
          options,
        });

        response = {filename, url: scrapbook.escapeFilename(filename)};
      }

      return response;
    };

    return await registerFile(params);
  };

  capturer.downLinkFileExtFilter = function (ext, options) {
    const REGEX_LINEFEEDS = /[\r\n]+/;
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const REGEX_EXT_SEP = /[,;\s]+/;
    const compileFilters = (source) => {
      const ret = [];
      for (let line of source.split(REGEX_LINEFEEDS)) {
        line = line.trim();
        if (!line || line.startsWith("#")) { continue; }

        if (REGEX_PATTERN.test(line)) {
          try {
            ret.push(new RegExp(`^(?:${RegExp.$1})$`, RegExp.$2));
          } catch (ex) {
            console.error(ex);
          }
        } else {
          const regex = line.split(REGEX_EXT_SEP)
            .filter(x => !!x)
            .map(x => scrapbook.escapeRegExp(x))
            .join('|');
          ret.push(new RegExp(`^(?:${regex})$`, 'i'));
        }
      }
      return ret;
    };
    let filterText;
    let filters;

    const fn = capturer.downLinkFileExtFilter = (ext, options) => {
      // use the cache if the filter is not changed
      if (filterText !== options["capture.downLink.file.extFilter"]) {
        filterText = options["capture.downLink.file.extFilter"];
        filters = compileFilters(filterText);
      }

      return filters.some((filter) => {
        return filter.test(ext);
      });
    };
    return fn(ext, options);
  };

  capturer.downLinkDocUrlFilter = function (url, options) {
    const REGEX_LINEFEEDS = /[\r\n]+/;
    const REGEX_SPACES = /\s+/;
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const compileFilters = (source) => {
      const ret = [];
      for (let line of source.split(REGEX_LINEFEEDS)) {
        line = line.trim();
        if (!line || line.startsWith("#")) { continue; }

        line = line.split(REGEX_SPACES)[0];
        if (REGEX_PATTERN.test(line)) {
          try {
            ret.push(new RegExp(RegExp.$1, RegExp.$2));
          } catch (ex) {
            console.error(ex);
          }
        } else {
          line = scrapbook.splitUrlByAnchor(line)[0];
          ret.push(line);
        }
      }
      return ret;
    };
    let filterText;
    let filters;

    const fn = capturer.downLinkDocUrlFilter = (url, options) => {
      // use the cache if the filter is not changed
      if (filterText !== options["capture.downLink.doc.urlFilter"]) {
        filterText = options["capture.downLink.doc.urlFilter"];
        filters = compileFilters(filterText);
      }

      // match the URL without hash
      const matchUrl = scrapbook.splitUrlByAnchor(url)[0];

      // match everything if no filters
      if (!filters.length) {
        return true;
      }

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

  capturer.downLinkUrlFilter = function (url, options) {
    const REGEX_LINEFEEDS = /[\r\n]+/;
    const REGEX_SPACES = /\s+/;
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const compileFilters = (source) => {
      const ret = [];
      for (let line of source.split(REGEX_LINEFEEDS)) {
        line = line.trim();
        if (!line || line.startsWith("#")) { continue; }

        line = line.split(REGEX_SPACES)[0];
        if (REGEX_PATTERN.test(line)) {
          try {
            ret.push(new RegExp(RegExp.$1, RegExp.$2));
          } catch (ex) {
            console.error(ex);
          }
        } else {
          line = scrapbook.splitUrlByAnchor(line)[0];
          ret.push(line);
        }
      }
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

  /**
   * @typedef {Object} saveDocumentResponse
   * @property {string} filename - The saved filename.
   * @property {string} url - URL of the saved filename (without hash).
   */

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Object} params.data
   * @param {string} params.data.mime
   * @param {string|Blob} params.data.content - USVString or byte string
   * @param {string} [params.data.charset] - save USVString as UTF-8 if omitted
   * @param {string} [params.data.title]
   * @param {string} [params.data.favIconUrl]
   * @param {string} params.documentFileName
   * @param {string} params.sourceUrl - may include hash
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<saveDocumentResponse>}
   */
  capturer.saveDocument = async function (params) {
    isDebug && console.debug("call: saveDocument", params);

    const {data, documentFileName, sourceUrl, settings, options} = params;

    // special handling for saving file as data URI
    if (options["capture.saveAs"] === "singleHtml") {
      if (settings.isMainPage && settings.isMainFrame) {
        return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
      }
    }

    let {content, mime, charset} = data;
    if (charset) {
      if (typeof content === 'string') {
        content = scrapbook.byteStringToArrayBuffer(content);
      }
    } else {
      charset = 'UTF-8';
    }
    const blob = new Blob([content], {type: `${mime};charset=${charset}`});
    const response = await capturer.downloadBlob({
      blob,
      filename: documentFileName,
      sourceUrl,
      settings,
      options,
    });

    if (settings.isMainPage && settings.isMainFrame) {
      return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
    }

    return response;
  };

  /**
   * @typedef {Object} saveMainDocumentResponse
   * @property {string} timeId
   * @property {string} title
   * @property {string} type
   * @property {string} sourceUrl
   * @property {string} [targetDir]
   * @property {string} filename - The saved filename.
   * @property {string} url - URL of the saved filename (without hash).
   * @property {string} [favIconUrl]
   */

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Object} params.data
   * @param {string} [params.data.mime]
   * @param {string|Blob} [params.data.content] - USVString or byte string
   * @param {string} [params.data.charset] - save USVString as UTF-8 if omitted
   * @param {string} [params.data.title]
   * @param {string} [params.data.favIconUrl]
   * @param {string} params.sourceUrl - may include hash
   * @param {string} params.documentFileName
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<saveMainDocumentResponse>}
   */
  capturer.saveMainDocument = async function (params) {
    isDebug && console.debug("call: saveMainDocument", params);

    const {data, sourceUrl, documentFileName, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    const addIndexHtml = async (path, target, title) => {
      const meta = options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(scrapbook.normalizeUrl(sourceUrl)) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' : 
          "";

      const html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${scrapbook.escapeHtml(target)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to <a href="${scrapbook.escapeHtml(target)}">${scrapbook.escapeHtml(target, false)}</a>
</body>
</html>`;
      await capturer.saveFileCache({
        timeId,
        path,
        url: sourceUrlMain,
        blob: new Blob([html], {type: "text/html"}),
      });
    };

    const saveBlob = async (blob) => {
      switch (options["capture.saveTo"]) {
        case 'memory': {
          // special handling (for unit test)
          return await capturer.saveBlobInMemory({blob});
        }
        case 'file': {
          const downloadItem = await capturer.saveBlobNaturally({
            timeId,
            blob,
            filename,
            sourceUrl,
          });
          if (typeof downloadItem === 'object') {
            capturer.log(`Saved to "${downloadItem.filename}"`);
            filename = scrapbook.filepathParts(downloadItem.filename)[1];
          } else {
            // save failed (possibly user cancel)
            filename = downloadItem;
          }
          break;
        }
        case 'server': {
          [targetDir, filename] = scrapbook.filepathParts(filename);
          filename = await capturer.saveBlobToServer({
            timeId,
            blob,
            directory: targetDir,
            filename,
            settings,
            options,
          });
          capturer.log(`Saved to "${(targetDir ? targetDir + '/' : '') + filename}"`);
          break;
        }
        case 'folder':
        default: {
          [targetDir, filename] = scrapbook.filepathParts(options["capture.saveFolder"] + "/" + filename);
          const downloadItem = await capturer.saveBlob({
            timeId,
            blob,
            directory: targetDir,
            filename,
            sourceUrl,
            autoErase: false,
            savePrompt: false,
            conflictAction: options["capture.saveOverwrite"] ? "overwrite" : "uniquify",
            settings,
            options,
          });
          capturer.log(`Saved to "${downloadItem.filename}"`);
          filename = scrapbook.filepathParts(downloadItem.filename)[1];
          break;
        }
      }
    };

    const saveEntries = async (entries) => {
      switch (options["capture.saveTo"]) {
        case 'server': {
          targetDir = settings.indexFilename;

          let workers = options["capture.serverUploadWorkers"];
          if (!(workers >= 1)) { workers = Infinity; }
          workers = Math.min(workers, entries.length);

          let taskIdx = 0;
          const runNextTask = async () => {
            if (taskIdx >= entries.length) { return; }
            const [path, sourceUrl, blob] = entries[taskIdx++];
            try {
              await capturer.saveBlobToServer({
                timeId,
                blob,
                directory: targetDir,
                filename: path,
                settings,
                options,
              });
            } catch (ex) {
              // show message for individual saving error
              console.error(ex);
              capturer.error(scrapbook.lang("ErrorFileSaveError", [sourceUrl, path, ex.message]));
            }
            return runNextTask();
          };

          await Promise.all(Array.from({length: workers}, _ => runNextTask()));

          capturer.log(`Saved to "${targetDir}"`);

          break;
        }
        case 'folder':
        case 'file': // not supported, fallback to folder
        case 'memory': // not supported, fallback to folder
        default: {
          targetDir = options["capture.saveFolder"] + "/" + settings.indexFilename;
          const downloadItems = await Promise.all(entries.map(([path, sourceUrl, blob]) => {
            return capturer.saveBlob({
              timeId,
              blob,
              directory: targetDir,
              filename: path,
              sourceUrl,
              autoErase: path !== "index.html",
              savePrompt: false,
              conflictAction: options["capture.saveOverwrite"] ? "overwrite" : "uniquify",
              settings,
              options,
            }).catch((ex) => {
              // handle bug for zero-sized in Firefox < 65
              // path should be same as the download filename (though the
              // value is not acturally used)
              // see browser.downloads.onChanged handler
              if (blob.size === 0 && ex.message === "Cannot find downloaded item.") {
                return path;
              }

              // show message for individual saving error
              console.error(ex);
              capturer.error(scrapbook.lang("ErrorFileSaveError", [sourceUrl, path, ex.message]));
              return {filename: targetDir + "/" + path};
            });
          }));
          const downloadItem = downloadItems.pop();
          capturer.log(`Saved to "${downloadItem.filename}"`);
          filename = scrapbook.filepathParts(downloadItem.filename)[1];
          break;
        }
      }
    };

    const handleDeepCapture = async (path) => {
      if (!(parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options["capture.saveAs"] !== "singleHtml")) {
        return;
      }

      const delay = options["capture.downLink.doc.delay"];
      const linkedPages = capturer.captureInfo.get(timeId).linkedPages;

      const subSettings = Object.assign({}, settings, {
        isMainPage: false,
        isMainFrame: true,
        fullPage: true,
        isHeadless: true,
      });

      for (const [sourceUrl, info] of linkedPages.entries()) {
        const {url, refUrl, depth} = info;

        capturer.log(`Capturing linked page (${depth}) ${sourceUrl} ...`);

        Object.assign(subSettings, {
          recurseChain: [],
          depth,
          documentName: undefined,
          usedCssFontUrl: undefined,
          usedCssImageUrl: undefined,
        });

        const response = await capturer.captureUrl({
          url,
          refUrl,
          settings: subSettings,
          options,
        });

        if (delay > 0) {
          capturer.log(`Waiting for ${delay} ms...`);
          await scrapbook.delay(delay);
        }
      }

      capturer.log('Rebuilding links...');
      await capturer.rebuildLinks({timeId, options});
      await capturer.generateSiteMap({timeId, path});
    };

    capturer.log(`Saving data...`);
    const title = data.title || scrapbook.urlToFilename(sourceUrl);
    let type = parseInt(options["capture.downLink.doc.depth"], 10) >= 0 ? "site" : "";
    let targetDir;
    let filename;
    let [, ext] = scrapbook.filenameParts(documentFileName);
    capturer.captureInfo.get(timeId).indexPages.add(documentFileName);
    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        // singleHtml does not support deep capture
        type = "";

        let {content, mime, charset} = data;
        if (charset) {
          if (typeof content === 'string') {
            content = scrapbook.byteStringToArrayBuffer(content);
          }
        } else {
          charset = 'UTF-8';
        }
        const blob = new Blob([content], {type: `${mime};charset=${charset}`});
        filename = settings.indexFilename + "." + ext;

        // special handling: single HTML cannot use "index.html"
        if (filename === 'index.html') {
          filename = 'index_.html';
        }

        const rv = await saveBlob(blob);
        if (rv) { return rv; }

        break;
      }

      case "zip": {
        // handle deep capture
        await handleDeepCapture(`index.json`);

        // create index.html that redirects to index.xhtml|.svg
        if (ext !== "html") {
          await addIndexHtml("index.html", `index.${ext}`, title);
        }

        // generate and download the zip file
        const zip = await capturer.loadFileCacheAsZip({timeId, options});
        const blob = await zip.generateAsync({type: "blob", mimeType: "application/html+zip"});
        filename = settings.indexFilename + ".htz";

        const rv = await saveBlob(blob);
        if (rv) { return rv; }

        break;
      }

      case "maff": {
        // handle deep capture
        await handleDeepCapture(`${timeId}/index.json`);

        // create index.html that redirects to index.xhtml|.svg
        if (ext !== "html") {
          await addIndexHtml(`${timeId}/index.html`, `index.${ext}`, title);
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
  <MAF:indexfilename RDF:resource="${documentFileName}"/>
  <MAF:charset RDF:resource="UTF-8"/>
</RDF:Description>
</RDF:RDF>
`;
        await capturer.saveFileCache({
          timeId,
          path: timeId + "/" + "index.rdf",
          url: sourceUrlMain,
          blob: new Blob([rdfContent], {type: "application/rdf+xml"}),
        });

        // generate and download the zip file
        const zip = await capturer.loadFileCacheAsZip({timeId, options});
        const blob = await zip.generateAsync({type: "blob", mimeType: "application/x-maff"});
        filename = settings.indexFilename + ".maff";

        const rv = await saveBlob(blob);
        if (rv) { return rv; }

        break;
      }

      case "folder":
      default: {
        // handle deep capture
        await handleDeepCapture(`index.json`);

        // create index.html that redirects to index.xhtml|.svg
        if (ext !== "html") {
          await addIndexHtml("index.html", `index.${ext}`, title);
        }

        getTargetDirName: {
          const dir = scrapbook.filepathParts(settings.indexFilename)[0];
          const newFilename = await capturer.invoke("getAvailableSaveFilename", {
            filename: settings.indexFilename,
            settings,
            options,
          });
          settings.indexFilename = (dir ? dir + '/' : '') + newFilename;
        }

        filename = 'index.html';

        const entries = await capturer.loadFileCache({timeId});
        const rv = await saveEntries(entries);
        if (rv) { return rv; }

        break;
      }
    }

    return {
      timeId,
      title,
      type,
      sourceUrl,
      targetDir,
      filename,
      url: scrapbook.escapeFilename(documentFileName),
      favIconUrl: data.favIconUrl,
    };
  };

  /**
   * @typedef {Object} downloadFileResponse
   * @property {string} filename - The downloaded filename.
   * @property {string} url - URL of the downloaded filename (without hash).
   */

  /**
   * @kind invokable
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl] - the referrer URL
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<downloadFileResponse>}
   */
  capturer.downloadFile = async function (params) {
    isDebug && console.debug("call: downloadFile", params);

    const {url: sourceUrl, refUrl, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    // special handling for data URI
    // if not saved as file, save as-is regardless of its MIME type
    if (sourceUrlMain.startsWith("data:")) {
      if (!(options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml")) {
        return {url: sourceUrlMain};
      }
    }

    // fetch first to ensure refUrl be handled
    const fetchResponse = await capturer.fetch({
      url: sourceUrlMain,
      refUrl,
      settings,
      options,
    });

    if (fetchResponse.error) {
      throw new Error(fetchResponse.error);
    }

    const registry = await capturer.registerFile({
      url: sourceUrl,
      role: options["capture.saveAs"] === "singleHtml" ? undefined : 'resource',
      settings,
      options,
    });

    if (registry.isDuplicate) {
      return registry;
    }

    let blob = fetchResponse.blob;
    const {parameters: {charset}} = scrapbook.parseHeaderContentType(fetchResponse.headers.contentType);
    if (charset) {
      blob = new Blob([blob], {type: `${blob.type};charset=${charset}`});
    }

    return await capturer.downloadBlob({
      blob,
      filename: registry.filename,
      sourceUrl,
      settings,
      options,
    });
  };

  /**
   * @typedef {Object} fetchCssResponse
   * @property {string} text - The CSS text .
   * @property {string} charset - The CSS charset.
   */

  /**
   * Fetch a remote CSS and resolve its charset and text.
   *
   * @kind invokable
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.refUrl]
   * @param {string} params.settings
   * @param {Object} params.options
   * @return {Promise<fetchCssResponse>}
   */
  capturer.fetchCss = async function (params) {
    isDebug && console.debug("call: fetchCss", params);

    const {url: sourceUrl, refUrl, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    const fetchResponse = await capturer.fetch({
      url: sourceUrlMain,
      refUrl,
      settings,
      options,
    });

    if (fetchResponse.error) {
      throw new Error(fetchResponse.error);
    }

    return await scrapbook.parseCssFile(fetchResponse.blob, fetchResponse.headers.charset);
  };

  /**
   * @typedef {Object} blobObject
   * @property {string} __type__ - "Blob", "File"
   * @property {string} type
   * @property {string} data - byte string
   */

  /**
   * @typedef {Object} downloadBlobResponse
   * @property {string} filename - The downloaded filename.
   * @property {string} url - URL of the downloaded filename (without hash).
   */

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Blob|blobObject} params.blob - may include charset
   * @param {string} [params.filename] - validated and unique;
   *     may be absent when saveAs = singleHtml
   * @param {string} params.sourceUrl
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<downloadBlobResponse>}
   */
  capturer.downloadBlob = async function (params) {
    isDebug && console.debug("call: downloadBlob", params);

    const {filename, sourceUrl, settings, options} = params;
    let {blob} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    if (!(blob instanceof Blob)) {
      const ab = scrapbook.byteStringToArrayBuffer(blob.data);
      blob = new Blob([ab], {type: blob.type});
    }

    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        const {type: mime, parameters: {charset}} = scrapbook.parseHeaderContentType(blob.type);

        let dataUri;
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
            dataUri = `data:${mime};base64,`;
          }
        }

        if (filename) {
          dataUri = dataUri.replace(/(;base64)?,/, m => ";filename=" + encodeURIComponent(filename) + m);
        }

        return {filename, url: dataUri};
      }

      case "zip": {
        await capturer.saveFileCache({
          timeId,
          path: filename,
          url: sourceUrlMain,
          blob,
        });
        return {filename, url: scrapbook.escapeFilename(filename)};
      }

      case "maff": {
        await capturer.saveFileCache({
          timeId,
          path: timeId + "/" + filename,
          url: sourceUrlMain,
          blob,
        });
        return {filename, url: scrapbook.escapeFilename(filename)};
      }

      case "folder":
      default: {
        await capturer.saveFileCache({
          timeId,
          path: filename,
          url: sourceUrlMain,
          blob,
        });
        return {filename, url: scrapbook.escapeFilename(filename)};
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
   * @return {Promise<DownloadItem|string>} DownloadItem for the saved blob,
   *     or filename if error.
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
   * @return {Promise<blobObject>}
   */
  capturer.saveBlobInMemory = async function (params) {
    isDebug && console.debug("call: saveBlobInMemory", params);

    const {blob} = params;

    // convert BLOB data to byte string so that it can be sent via messaging
    return {
      __type__: 'Blob',
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
   * @param {string} params.conflictAction
   * @return {Promise<DownloadItem>} DownloadItem for the saved blob.
   */
  capturer.saveBlob = async function (params) {
    isDebug && console.debug("call: saveBlob", params);

    const {timeId, blob, directory, filename, sourceUrl, autoErase, savePrompt, conflictAction} = params;

    // In Chromium >= 78, the file extension downloaded by chrome.downloads.download
    // is altered to match the content type. Create a new blob with a safe MIME type
    // to avoid this issue.
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1021638
    const fixedBlob = new Blob([blob], {type: "application/octet-stream"});

    return await capturer.saveUrl({
      timeId,
      url: URL.createObjectURL(fixedBlob),
      directory,
      filename,
      sourceUrl,
      autoErase,
      savePrompt,
      conflictAction,
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
   * @param {string} params.conflictAction
   * @return {Promise<DownloadItem>} DownloadItem for the saved URL..
   */
  capturer.saveUrl = async function (params) {
    isDebug && console.debug("call: saveUrl", params);

    const {timeId, url, directory, filename, sourceUrl, autoErase, savePrompt, conflictAction} = params;

    const downloadParams = {
      url,
      filename: (directory ? directory + "/" : "") + filename,
      conflictAction,
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
   * @param {Object} params.options
   * @return {Promise<string>} Filename of the saved blob.
   */
  capturer.saveBlobToServer = async function (params) {
    isDebug && console.debug("call: saveBlobToServer", params);

    const {timeId, blob, directory, filename, options} = params;
    await server.init();
    let newFilename = await capturer.getAvailableSaveFilename({
      filename: (directory ? directory + '/' : '') + filename,
      isFile: true,
      options,
    });

    const target = server.books[server.bookId].dataUrl +
      scrapbook.escapeFilename((directory ? directory + '/' : '') + newFilename);

    try {
      const retryCount = options["capture.serverUploadRetryCount"];
      const retryDelay = options["capture.serverUploadRetryDelay"];
      let tried = 0;
      while (true) {
        try {
          await server.request({
            url: target + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              upload: blob,
            },
          });
          break;
        } catch (ex) {
          if (tried++ < retryCount) {
            console.error(`Upload failed for "${target}" (tried ${tried}): ${ex.message}`);
            await scrapbook.delay(retryDelay);
          } else {
            throw ex;
          }
        }
      }
    } catch (ex) {
      throw new Error(`Unable to upload to backend server: ${ex.message}`);
    }

    return newFilename;
  };

  /**
   * @param {Object} params
   * @param {string} params.timeId
   * @param {Object} params.options
   */
  capturer.rebuildLinks = async function (params) {
    const rewriteHref = (elem, attr, urlToFilenameMap, linkedPages) => {
      let u;
      try {
        u = new URL(elem.getAttribute(attr));
      } catch (ex) {
        // not absolute URL, probably already mapped
        return;
      }

      let urlHash = u.hash;
      u.hash = '';
      let urlMain = u.href;

      // handle possible redirect
      const linkedPageItem = linkedPages.get(urlMain);
      if (linkedPageItem) {
        if (linkedPageItem.hasMetaRefresh) {
          [urlMain, urlHash] = scrapbook.splitUrlByAnchor(linkedPageItem.url);
        } else {
          [urlMain, urlHash] = scrapbook.splitUrlByAnchor(capturer.getRedirectedUrl(linkedPageItem.url, urlHash));
        }
      }

      const token = capturer.getRegisterToken(urlMain, 'document');
      const p = urlToFilenameMap.get(token);
      if (!p) { return; }

      elem.setAttribute(attr, capturer.getRedirectedUrl(p.url, urlHash));
    };

    const processRootNode = (rootNode, urlToFilenameMap, linkedPages) => {
      // rewrite links
      switch (rootNode.nodeName.toLowerCase()) {
        case 'svg': {
          for (const elem of rootNode.querySelectorAll('a[*|href]')) {
            for (const attr of REBUILD_LINK_SVG_HREF_ATTRS) {
              if (!elem.hasAttribute(attr)) { continue; }
              rewriteHref(elem, attr, urlToFilenameMap, linkedPages);
            }
          }
          break;
        }
        case 'html':
        case '#document-fragment': {
          for (const elem of rootNode.querySelectorAll('a[href], area[href]')) {
            rewriteHref(elem, 'href', urlToFilenameMap, linkedPages);
          }
          break;
        }
      }

      // recurse into shadow roots
      if (SHADOW_ROOT_SUPPORTED) {
        for (const elem of rootNode.querySelectorAll('[data-scrapbook-shadowdom]')) {
          const shadowRoot = elem.attachShadow({mode: 'open'});
          shadowRoot.innerHTML = elem.getAttribute('data-scrapbook-shadowdom');
          processRootNode(shadowRoot, urlToFilenameMap, linkedPages);
          elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
        }
      }
    };

    const rebuildLinks = capturer.rebuildLinks = async ({timeId, options}) => {
      const info = capturer.captureInfo.get(timeId);
      const files = info.files;
      const urlToFilenameMap = info.urlToFilenameMap;
      const linkedPages = info.linkedPages;

      for (const [filename, item] of files.entries()) {
        const blob = item.blob;
        if (!blob) {
          continue;
        }

        const {type} = scrapbook.parseHeaderContentType(blob.type);
        if (!REBUILD_LINK_SUPPORT_TYPES.has(type)) {
          continue;
        }

        const doc = await scrapbook.readFileAsDocument(blob);
        processRootNode(doc.documentElement, urlToFilenameMap, linkedPages);

        const content = scrapbook.documentToString(doc, options["capture.prettyPrint"]);
        await capturer.saveFileCache({
          timeId,
          path: item.path,
          blob: new Blob([content], {type: blob.type}),
        });
      }
    };

    return await rebuildLinks(params);
  };

  /**
   * @param {Object} params
   * @param {string} params.timeId
   * @param {string} params.path
   */
  capturer.generateSiteMap = async function ({timeId, path}) {
    const info = capturer.captureInfo.get(timeId);
    const files = info.files;
    const urlToFilenameMap = info.urlToFilenameMap;

    const sitemap = {
      version: 2,
      initialVersion: info.initialVersion,
      indexPages: [...info.indexPages],
      files: [],
    };

    for (let [path, {url, role, token}] of files.entries()) {
      if (!token) {
        try {
          const t = capturer.getRegisterToken(url, role);
          if (urlToFilenameMap.has(t)) {
            token = t;
          }
        } catch (ex) {
          // skip special or undefined URL
        }
      }

      // Don't record real URL for data:, blob:, etc.
      if (url) {
        if (!(url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:'))) {
          url = undefined;
        }
      }

      sitemap.files.push({
        path,
        url,
        role,
        token,
      });
    }

    const data = JSON.stringify(sitemap, null, 1);
    const blob = new Blob([data], {type: 'application/json'});
    await capturer.saveFileCache({
      timeId,
      path,
      blob,
    });
  };


  /****************************************************************************
   * Events handling
   ***************************************************************************/

  scrapbook.addMessageListener((message, sender) => {
    if (!message.cmd.startsWith("capturer.")) { return false; }
    if (message.id !== capturer.missionId) { return false; }
    return true;
  }, (ex) => {
    console.error(ex);
    throw ex;
  });

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
      downloadHooks.get(url).onComplete(downloadItem);
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
        const downloadItem = (await browser.downloads.search({id: downloadId}))[0];
        if (downloadItem) {
          downloadHooks.get(downloadId).onComplete(downloadItem);
        } else {
          // Firefox < 65 has a bug that a zero-sized file is never found by
          // browser.downloads.search.
          // https://bugzilla.mozilla.org/show_bug.cgi?id=1503760
          downloadHooks.get(downloadId).onError(new Error("Cannot find downloaded item."));
        }
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

  const capturePromise = new Promise((resolve, reject) => {
    const urlObj = new URL(document.URL);
    const s = urlObj.searchParams;

    // use missionId provided from URL params to read task data
    const missionId = capturer.missionId = s.get('mid');

    const closeWindow = async () => {
      await scrapbook.delay(1000);

      const tab = await browser.tabs.getCurrent();
      return await browser.tabs.remove(tab.id);
    };

    document.addEventListener("DOMContentLoaded", async function () {
      scrapbook.loadLanguages(document);

      capturer.logger = document.getElementById('logger');
      capturer.downloader = document.getElementById('downloader');

      await scrapbook.loadOptions();

      let autoClose = scrapbook.getOption("ui.autoCloseCaptureDialog");

      let results;
      runTasks: {
        if (!missionId) {
          capturer.error(`Error: Mission ID not set.`);
          break runTasks;
        }

        const key = {table: "captureMissionCache", id: missionId};
        const taskInfo = await scrapbook.cache.get(key);
        await scrapbook.cache.remove(key);
        if (!taskInfo || !taskInfo.tasks) {
          capturer.error(`Error: missing task data for mission "${missionId}".`);
          break runTasks;
        }

        if (typeof taskInfo.autoClose === 'string') {
          autoClose = taskInfo.autoClose;
        }

        if (!taskInfo.tasks.length) {
          capturer.error(`Error: nothing to capture.`);
          break runTasks;
        }

        try {
          results = await capturer.runTasks(taskInfo);
        } catch (ex) {
          console.error(ex);
          capturer.error(`Unexpected error: ${ex.message}`);
          break runTasks;
        }
      }

      resolve(results);

      const hasFailure = !results || results.some(x => x.error);

      switch (autoClose) {
        case "nowarn": {
          if (capturer.logger.querySelector('.warn, .error')) {
            break;
          }
        }
        case "noerror": {
          if (capturer.logger.querySelector('.error')) {
            break;
          }
        }
        case "nofailure": {
          if (hasFailure) {
            break;
          }
        }
        case "always": {
          await closeWindow();
          break;
        }
        case "none":
        default: {
          break;
        }
      }
    });
  });

}));
