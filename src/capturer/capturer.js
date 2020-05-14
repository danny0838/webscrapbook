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

  // overwrite the value of common.js to define this is not a content script
  capturer.isContentScript = false;

  // missionId is fixed to this page, to identify the capture mission
  // generate a unique one, if not otherwise set
  capturer.missionId = scrapbook.getUuid();

  /**
   * @typedef {Object} missionCaptureInfo
   * @property {Set<string>} files
   * @property {Map<string~token, Promise<fetchResult>>} fetchMap
   * @property {Map<string~token, Object>} urlToFilenameMap
   */

  /**
   * @type {MapWithDefault<string~timeId, missionCaptureInfo>}
   */
  capturer.captureInfo = new MapWithDefault(() => ({
    // index.dat is used in legacy ScrapBook
    // index.rdf and ^metadata^ are used in MAFF
    // http://maf.mozdev.org/maff-specification.html
    files: new Set(["index.dat", "index.rdf", "^metadata^"]),

    fetchMap: new Map(),
    urlToFilenameMap: new Map(),
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
   * Get a unique (deduplicated) filename for saving
   *
   * @param {Object} params
   * @param {string} params.filename - may contain directory
   * @param {boolean} params.isFile
   * @param {string} params.options
   * @return {string} The deduplicated filename.
   */
  capturer.getAvailableSaveFilename = async function (params) {
    isDebug && console.debug("call: getAvailableSaveFilename", params);

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

  capturer.saveCache = async function ({timeId, path, source, data}) {
    const key = {table: "pageCache", id: timeId, path, source};
    await scrapbook.cache.set(key, data);
  };

  capturer.loadCache = async function ({timeId}) {
    const key = {table: "pageCache", id: timeId};
    const entries = await scrapbook.cache.getAll(key);

    let mainIdx = -1;
    const result = Object.entries(entries).map(([entry, data], idx) => {
      const {path, source} = JSON.parse(entry);
      if (path === 'index.html') {
        mainIdx = idx;
      }
      return [path, source, data];
    });

    // move index page to the last one because the browser may not be able to
    // show it if it's flooded over by other downloads
    if (mainIdx >= 0) {
      return result.concat(result.splice(mainIdx, 1));
    }

    return result;
  };

  capturer.loadCacheAsZip = async function ({timeId}) {
    const zip = new JSZip();
    const key = {table: "pageCache", id: timeId};
    const entries = await scrapbook.cache.getAll(key);
    for (const [entry, data] of Object.entries(entries)) {
      scrapbook.zipAddFile(zip, JSON.parse(entry).path, data, true);
    }
    return zip;
  };

  capturer.clearCache = async function ({timeId}) {
    const key = {table: "pageCache", id: timeId};
    const entries = await scrapbook.cache.getAll(key);
    await scrapbook.cache.remove(Object.keys(entries));
  };

  /**
   * @typedef {Object} fetchResult
   * @property {string} url
   * @property {integer} status
   * @property {Object} headers
   * @property {Blob} blob
   */

  /**
   * Uniquely fetch a resource from the web.
   *
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.refUrl] - the referrer URL
   * @param {boolean} [params.headerOnly] - fetch HTTP header only
   * @param {Objet} params.settings
   * @param {Objet} params.options
   * @return {Promise<fetchResult>}
   */
  capturer.fetch = async function (params) {
    const getFetchToken = function (url, role) {
      let token = `${scrapbook.normalizeUrl(url)}\t${role}`;
      token = scrapbook.sha1(token, "TEXT");
      return token;
    };

    /**
     * @param {Object} params
     * @param {Object} params.headers
     * @param {string} params.targetUrl
     * @param {string} [params.refUrl]
     * @param {Object} [params.options]
     * @return {Object} The modified headers object.
     */
    const setReferrer = function ({headers, targetUrl, refUrl, options = {}}) {
      if (!refUrl) { return; }
      if (!refUrl.startsWith('http:') && !refUrl.startsWith('https:')) { return; }
      if (refUrl.startsWith('https:') && (!targetUrl || !targetUrl.startsWith('https:'))) { return; }

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
        // Browser does not allow assigning "Referer" header directly.
        // Set a placeholder header, whose prefix will be removed by the
        // listener of browser.webRequest.onBeforeSendHeaders later on.
        headers["X-WebScrapBook-Referer"] = referrer;
      }
      return headers;
    };

    const fetch = capturer.fetch = async function (params) {
      isDebug && console.debug("call: fetch", params);

      const {url: sourceUrl, refUrl, headerOnly = false, settings, options} = params;
      const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

      const {timeId} = settings;
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

        // special handling for data URI
        if (sourceUrlMain.startsWith("data:")) {
          const file = scrapbook.dataUriToFile(sourceUrlMain);
          if (!file) { throw new Error("Malformed data URL."); }

          // simulate headers from data URI parameters
          headers.filename = file.name;
          headers.contentLength = file.size;
          const contentType = scrapbook.parseHeaderContentType(file.type);
          headers.contentType = contentType.type;
          headers.charset = contentType.parameters.charset;

          return {
            url: sourceUrlMain,
            status: 200,
            headers,
            blob: new Blob([file], {type: file.type}),
          };
        }

        // special handling for about:blank or about:srcdoc
        if (sourceUrlMain.startsWith("about:")) {
          return {
            url: sourceUrlMain,
            status: 200,
            headers,
            blob: new Blob([], {type: 'text/html'}),
          };
        }

        const xhr = await scrapbook.xhr({
          url: sourceUrlMain,
          responseType: 'blob',
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

            // skip loading body for a headerOnly fetch
            if (headerOnly) {
              response = {
                url: xhr.responseURL,
                status: xhr.status,
                headers,
                blob: null,
              };
              xhr.abort();
              return;
            }
          },
        });

        // xhr is resolved to undefined when aborted.
        if (!xhr && response) {
          return response;
        }

        return {
          url: xhr.responseURL,
          status: xhr.status,
          headers,
          blob: xhr.response,
        };
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

    const {item, parentId, index} = params;

    await server.init();
    const book = server.books[server.bookId];
    if (!!book.config.no_tree) {
      return;
    }

    capturer.log(`Updating server index...`);

    // cache favicon
    let icon = item.icon;
    if (scrapbook.isUrlAbsolute(icon)) {
      try {
        const base = book.dataUrl + item.index;
        const file = await getFavIcon(icon);
        const target = book.treeUrl + 'favicon/' + file.name;

        const json = await server.request({
          url: target + '?f=json',
          method: "GET",
        }).then(r => r.json());

        // save favicon if nonexistent or emptied
        if (json.data.type === null || 
            (file.size > 0 && json.data.type === 'file' && json.data.size === 0)) {
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
    await book.lockTree({timeout: 60, staleThreshold: 120});
    await book.loadTreeFiles(true);
    await book.loadMeta(true);
    await book.loadToc(true);
    await book.addItem({
      item: Object.assign({}, item, {icon}),
      parentId,
      index,
    });
    await book.saveTreeFiles({meta: true, toc: true, useLock: false});
    await book.unlockTree();
  };

  /**
   * @kind invokable
   * @return {Promise<Object>}
   */
  capturer.getMissionResult = async function () {
    return capturePromise;
  };

  /**
   * @param {Object} params
   * @param {Array} params.tasks
   * @param {string} params.parentId - parent item ID for the captured items
   * @param {integer} params.index - position index for the captured items
   * @return {Promise<Array|Object>} - list of task results (or error), or an object of error
   */
  capturer.runTasks = async function (params) {
    try {
      let {tasks, parentId, index} = params;
      const results = [];
      const globalOptions = scrapbook.getOptions("capture");

      for (const task of tasks) {
        const {
          tabId, frameId, fullPage,
          url, refUrl, title, favIconUrl,
          mode, options,
        } = task;

        let result;
        try {
          if (typeof tabId === 'number') {
            // capture tab
            result = await capturer.captureTab({
              tabId,
              frameId,
              fullPage,
              mode,
              options: Object.assign(globalOptions, options),
              parentId,
              index,
            });
          } else if (typeof url === 'string') {
            // capture headless
            result = await capturer.captureRemote({
              url,
              refUrl,
              title,
              favIconUrl,
              mode,
              options: Object.assign(globalOptions, options),
              parentId,
              index,
            });
          }
        } catch (ex) {
          console.error(ex);
          const err = `Unexpected error: ${ex.message}`;
          capturer.error(err);
          result = {error: {message: err}};
        }

        if (!result.error) {
          index++;
          capturer.log(`Done.`);
        }
        results.push(result);

        // short delay before next task
        await scrapbook.delay(5);
      }

      return results;
    } catch (ex) {
      console.error(ex);
      const err = `Fatal error: ${ex.message}`;
      capturer.error(err);
      return {error: {message: err}};
    }
  };

  /**
   * @param {Object} params
   * @param {integer} params.tabId
   * @param {integer} [params.frameId]
   * @param {boolean} [params.fullPage]
   * @param {string} [params.title] - an overriding title
   * @param {string} [params.mode] - "source", "bookmark", "resave", "internalize"
   * @param {string} params.options
   * @param {string} [params.parentId] - parent item ID for the captured item
   * @param {integer} [params.index] - position index for the captured item
   * @return {Promise<Object>}
   */
  capturer.captureTab = async function (params) {
    try {
      const {tabId, frameId, fullPage, title: title0, mode, options, parentId, index} = params;
      let {url, title, favIconUrl, discarded} = await browser.tabs.get(tabId);

      // redirect headless capture
      // if frameId not provided, use current tab title and favIcon
      if (mode === "bookmark" || mode === "source") {
        if (typeof frameId === "number") {
          ({url, title, favIconUrl} = await browser.webNavigation.getFrame({tabId, frameId}));
        }
        return await capturer.captureRemote({url, title, favIconUrl, mode, options});
      } else if (mode === "resave") {
        return await capturer.resaveTab({tabId, frameId, options});
      } else if (mode === "internalize") {
        return await capturer.resaveTab({tabId, frameId, options, internalize: true});
      }

      const source = `[${tabId}${(frameId ? ':' + frameId : '')}] ${url}`;
      const timeId = scrapbook.dateToId();
      const message = {
        title: title0,
        settings: {
          missionId: capturer.missionId,
          timeId,
          frameIsMain: true,
          documentName: "index",
          fullPage,
          recurseChain: [],
          favIconUrl,
        },
        options,
      };

      capturer.log(`Capturing (document) ${source} ...`);

      // throw error for a discarded tab
      // note that tab.discarded is undefined in older Firefox version
      if (discarded === true) {
        throw new Error(scrapbook.lang("ErrorTabDiscarded"));
      }

      (await scrapbook.initContentScripts(tabId)).forEach(({tabId, frameId, url, error, injected}) => {
        if (error) {
          const source = `[${tabId}:${frameId}] ${url}`;
          const err = scrapbook.lang("ErrorContentScriptExecute", [source, error]);
          capturer.error(err);
        }
      });

      isDebug && console.debug("(main) send", source, message);
      const response = await capturer.invoke("captureDocumentOrFile", message, {tabId, frameId});
      isDebug && console.debug("(main) response", source, response);
      capturer.captureInfo.delete(timeId);
      if (!response) { throw new Error(`Response not received.`); }
      if (response.error) { throw new Error(response.error.message); }

      if (message.options["capture.saveTo"] === "server") {
        await capturer.addItemToServer({
          item: {
            id: response.timeId,
            index: (response.targetDir ? response.targetDir + '/' : '') + response.filename,
            title: response.title,
            type: response.type,
            create: response.timeId,
            source: response.sourceUrl,
            icon: response.favIconUrl,
            charset: response.charset,
          },
          parentId,
          index,
        });
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
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.refUrl]
   * @param {string} [params.title] - an overriding title
   * @param {string} [params.favIconUrl] - fallback favicon
   * @param {string} [params.mode] - "source", "bookmark"
   * @param {string} params.options
   * @param {string} [params.parentId] - parent item ID for the captured item
   * @param {integer} [params.index] - position index for the captured item
   * @return {Promise<Object>}
   */
  capturer.captureRemote = async function (params) {
    try {
      const {url, refUrl, title, favIconUrl, mode, options, parentId, index} = params;

      // default mode => launch a tab to capture
      if (!mode) {
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

        const response = await capturer.captureTab({
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
        options,
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
      if (!response) { throw new Error(`Response not received.`); }
      if (response.error) { throw new Error(response.error.message); }

      if (message.options["capture.saveTo"] === "server") {
        await capturer.addItemToServer({
          item: {
            id: response.timeId,
            index: (response.targetDir ? response.targetDir + '/' : '') + response.filename,
            title: response.title,
            type: response.type,
            create: response.timeId,
            source: response.sourceUrl,
            icon: response.favIconUrl,
            charset: response.charset,
          },
          parentId,
          index,
        });
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
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl]
   * @param {string} [params.title] - an overriding title
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

      const fetchResponse = await capturer.fetch({
        url: sourceUrlMain,
        refUrl,
        settings,
        options,
      });

      let response;
      const doc = await scrapbook.readFileAsDocument(fetchResponse.blob);
      if (doc) {
        response = await capturer.captureDocumentOrFile({
          doc,
          docUrl: fetchResponse.url,
          refUrl,
          title,
          settings,
          options,
        });
      } else {
        response = await capturer.captureFile({
          url: fetchResponse.url,
          refUrl,
          title,
          charset: fetchResponse.headers.charset,
          settings,
          options,
        });
      }

      if (!response.url || response.url.startsWith('data:')) {
        return response;
      }

      // don't add hash if redirected
      if (scrapbook.normalizeUrl(sourceUrlMain) !== scrapbook.normalizeUrl(fetchResponse.url)) {
        return response;
      }

      return Object.assign({}, response, {
        url: response.url + sourceUrlHash,
      });
    } catch (ex) {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    }
  };

  /**
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl]
   * @param {string} [params.title] - an overriding title
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
          const fetchResponse = await capturer.fetch({
            url: sourceUrlMain,
            refUrl,
            settings,
            options,
          });

          const doc = await scrapbook.readFileAsDocument(fetchResponse.blob);

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
                favIconUrl = new URL(elem.getAttribute('href'), fetchResponse.url).href;
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
          const fetchResponse = await capturer.fetch({
            url: favIconUrlMain,
            refUrl: sourceUrl,
            settings,
            options,
          });
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

      settings.filename = await capturer.formatIndexFilename({
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
          saveMethod = "saveBlobToServer";
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
   * @param {string} [params.refUrl] - the referrer URL
   * @param {string} [params.title] - an overriding title
   * @param {string} [params.charset]
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
        settings.filename = await capturer.formatIndexFilename({
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
   * @param {Object} params
   * @param {integer} params.tabId
   * @param {integer} [params.frameId]
   * @param {string} [params.options] - preset options that overwrites default
   * @param {boolean} [params.internalize]
   * @return {Promise<Object>}
   */
  capturer.resaveTab = async function (params) {
    try {
      const {tabId, frameId, options} = params;
      let {internalize = false} = params;
      let {url, title, favIconUrl, discarded} = await browser.tabs.get(tabId);

      const source = `[${tabId}${(frameId ? ':' + frameId : '')}] ${url}`;
      const timeId = scrapbook.dateToId();

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

      if (!!book.config.no_tree) {
        throw new Error(scrapbook.lang("ErrorSaveBookNoTree"));
      }

      if (!url.startsWith(book.dataUrl)) {
        throw new Error(scrapbook.lang("ErrorSaveNotUnderDataDir", [url]));
      }

      const item = await book.findItemFromUrl(url);

      if (item && item.locked) {
        throw new Error(scrapbook.lang("ErrorSaveLockedItem"));
      }

      const frameIsMain = book.isItemIndexUrl(item, url);

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
            if (!internalizePrefix) {
              // unable to determine which subdirectory to be prefix
              internalize = false;
            }
          }
        } else {
          internalize = false;
        }
      }

      (await scrapbook.initContentScripts(tabId)).forEach(({tabId, frameId, url, error, injected}) => {
        if (error) {
          const source = `[${tabId}:${frameId}] ${url}`;
          const err = scrapbook.lang("ErrorContentScriptExecute", [source, error]);
          capturer.error(err);
        }
      });

      const message = {
        internalize,
        settings: {
          item,
          frameIsMain,
        },
        options: Object.assign(scrapbook.getOptions("capture"), options),
      };

      isDebug && console.debug("(main) send", source, message);
      const response = await capturer.invoke("retrieveDocumentContent", message, {tabId, frameId});
      isDebug && console.debug("(main) response", source, response);

      const modify = scrapbook.dateToId();

      // handle resources to internalize
      const resourceMap = new Map();
      if (internalize) {
        for (const [fileUrl, data] of Object.entries(response)) {
          const fetchResource = async (url) => {
            const fullUrl = scrapbook.normalizeUrl(capturer.resolveRelativeUrl(url, fileUrl));
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
              const sha = scrapbook.sha1(await scrapbook.readFileAsArrayBuffer(blob), 'ARRAYBUFFER');
              const ext = Mime.extension(blob.type);
              const file = new File([blob], sha + '.' + ext, {type: blob.type});
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

      // acquire a lock
      await book.lockTree();

      try {
        // validate if we can modify the tree
        if (!await book.validateTree()) {
          throw new Error(scrapbook.lang('ScrapBookMainErrorServerTreeChanged'));
        }

        // documents
        for (const [fileUrl, data] of Object.entries(response)) {
          const target = scrapbook.splitUrl(fileUrl)[0];

          // only save files under dataDir
          if (!fileUrl.startsWith(book.dataUrl)) {
            capturer.warn(scrapbook.lang("ErrorSaveNotUnderDataDir", [target]));
            continue;
          }

          // forbid non-UTF-8 for data safety
          if (data.charset !== "UTF-8") {
            capturer.warn(scrapbook.lang("ErrorSaveNonUTF8", [target]));
            continue;
          }

          // save document
          try {
            let content = data.content;

            // replace resource URLs
            content = content.replace(/urn:scrapbook:url:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
              if (data.resources[key]) {
                if (data.resources[key].file) {
                  const resUrl = internalizePrefix + data.resources[key].file.name;
                  const u = scrapbook.getRelativeUrl(resUrl, fileUrl);
                  return scrapbook.escapeHtml(u);
                } else {
                  return scrapbook.escapeHtml(data.resources[key].url);
                }
              }
              return match;
            });
            
            const blob = new Blob([content], {type: "text/html"});
            const formData = new FormData();
            formData.append('token', await server.acquireToken());
            formData.append('upload', blob);
            await server.request({
              url: target + '?a=save&f=json',
              method: "POST",
              body: formData,
            });
            capturer.log(`Updated ${target}`);
          } catch (ex) {
            console.error(ex);
            capturer.error(scrapbook.lang("ErrorSaveUploadFailure", [target, ex.message]));
          }

          // update item for main frame
          if (frameIsMain && url === fileUrl) {
            item.title = data.info.title;
          }
        }

        // resources
        for (const [url, file] of resourceMap.entries()) {
          if (!file) { continue; }
          const target = internalizePrefix + file.name;
          const formData = new FormData();
          formData.append('token', await server.acquireToken());
          formData.append('upload', file);
          await server.request({
            url: target + '?a=save&f=json',
            method: "POST",
            body: formData,
          });
          capturer.log(`Internalized resource ${target}`);
        }

        // update item
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
    } catch (ex) {
      console.error(ex);
      const err = `Fatal error: ${ex.message}`;
      capturer.error(err);
      return {error: {message: err}};
    }
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
   * @param {boolean} params.settings.frameIsMain
   * @param {string} params.settings.documentName
   * @param {Object} params.options
   * @return {Promise<Object>}
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

      const {timeId, frameIsMain, documentName} = settings;
      const urlToFilenameMap = capturer.captureInfo.get(timeId).urlToFilenameMap;

      const fetchResponse = await capturer.fetch({
        url: sourceUrl,
        headerOnly: true,
        settings,
        options,
      });

      // XHR response URL doesn't contain a hash
      const redirectedUrl = fetchResponse.url;
      const redirected = scrapbook.normalizeUrl(sourceUrlMain) !== scrapbook.normalizeUrl(redirectedUrl);

      let response;
      if (role || frameIsMain) {
        const token = capturer.getRegisterToken(sourceUrlMain, role);

        // if a previous registry exists, return it
        const previousRegistry = urlToFilenameMap.get(token);
        if (previousRegistry) {
          return Object.assign({}, previousRegistry, {
            url: previousRegistry.url + (redirected ? '' : sourceUrlHash),
            isDuplicate: true,
          });
        }

        let documentFileName;
        if (options["capture.frameRename"] || frameIsMain) {
          let documentNameBase = scrapbook.validateFilename(documentName, options["capture.saveAsciiFilename"]);

          // see capturer.getUniqueFilename for filename limitation
          documentNameBase = scrapbook.crop(documentNameBase, 128, 240);

          const files = capturer.captureInfo.get(timeId).files;
          let newDocumentName = documentNameBase;
          let newDocumentNameCI = newDocumentName.toLowerCase();
          let count = 0;
          while (files.has(newDocumentNameCI + ".html") || 
              files.has(newDocumentNameCI + ".xhtml") || 
              files.has(newDocumentNameCI + ".svg")) {
            newDocumentName = documentNameBase + "_" + (++count);
            newDocumentNameCI = newDocumentName.toLowerCase();
          }
          files.add(newDocumentNameCI + ".html");
          files.add(newDocumentNameCI + ".xhtml");
          files.add(newDocumentNameCI + ".svg");
          documentFileName = newDocumentName + "." + getExtFromMime(mime);
        } else {
          documentFileName = getDocumentFileName({
            url: redirectedUrl,
            mime,
            headers: fetchResponse.headers,
            settings,
            options,
          });

          documentFileName = capturer.getUniqueFilename(settings.timeId, documentFileName);
        }

        response = {filename: documentFileName, url: scrapbook.escapeFilename(documentFileName)};

        // update registry
        urlToFilenameMap.set(token, response);
      } else {
        let documentFileName = getDocumentFileName({
          url: redirectedUrl,
          mime,
          headers: fetchResponse.headers,
          settings,
          options,
        });

        response = {filename: documentFileName, url: scrapbook.escapeFilename(documentFileName)};
      }

      return Object.assign({}, response, {
        url: response.url + (redirected ? '' : sourceUrlHash),
      });
    };

    return await registerDocument(params);
  };

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
   * @return {Promise<Object>}
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

      const fetchResponse = await capturer.fetch({
        url: sourceUrl,
        headerOnly: true,
        settings,
        options,
      });

      // XHR response URL doesn't contain a hash
      const redirectedUrl = fetchResponse.url;
      const redirected = scrapbook.normalizeUrl(sourceUrlMain) !== scrapbook.normalizeUrl(redirectedUrl);

      let response;
      if (role) {
        const token = capturer.getRegisterToken(redirectedUrl, role);

        // if a previous registry exists, return it
        const previousRegistry = urlToFilenameMap.get(token);
        if (previousRegistry) {
          return Object.assign({}, previousRegistry, {
            url: previousRegistry.url + (redirected ? '' : sourceUrlHash),
            isDuplicate: true,
          });
        }

        let filename = getFilename({
          url: redirectedUrl,
          headers: fetchResponse.headers,
          settings,
          options,
        });

        filename = capturer.getUniqueFilename(settings.timeId, filename);

        response = {filename, url: scrapbook.escapeFilename(filename)};

        // update registry
        urlToFilenameMap.set(token, response);
      } else {
        let filename = getFilename({
          url: redirectedUrl,
          headers: fetchResponse.headers,
          settings,
          options,
        });

        response = {filename, url: scrapbook.escapeFilename(filename)};
      }

      return Object.assign({}, response, {
        url: response.url + (redirected ? '' : sourceUrlHash),
      });
    };

    return await registerFile(params);
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
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    try {
      if (!settings.frameIsMain &&
          typeof options["capture.resourceSizeLimit"] === "number" && data.content.length >= options["capture.resourceSizeLimit"] * 1024 * 1024) {
        capturer.warn(scrapbook.lang("WarnResourceSizeLimitExceeded", [scrapbook.crop(sourceUrl, 128)]));
        return {url: capturer.getSkipUrl(sourceUrl, options), error: {message: "Resource size limit exceeded."}};
      }

      let filename = documentFileName;
      switch (options["capture.saveAs"]) {
        case "singleHtml": {
          if (settings.frameIsMain) {
            return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
          }

          let url = data.charset === "UTF-8" ? 
              scrapbook.unicodeToDataUri(data.content, data.mime) :
              scrapbook.byteStringToDataUri(scrapbook.unicodeToUtf8(data.content), data.mime, data.charset);
          url = url.replace(",", ";filename=" + encodeURIComponent(filename) + ",");

          // do not add sourceUrlHash as data URL with a hash could cause an error in some browsers
          return {timeId, sourceUrl, filename, url};
        }

        case "zip": {
          await capturer.saveCache({
            timeId,
            path: filename,
            source: sourceUrlMain,
            data: new Blob([data.content], {type: data.mime}),
          });

          if (settings.frameIsMain) {
            return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
          }

          return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        }

        case "maff": {
          await capturer.saveCache({
            timeId,
            path: timeId + "/" + filename,
            source: sourceUrlMain,
            data: new Blob([data.content], {type: data.mime}),
          });

          if (settings.frameIsMain) {
            return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
          }

          return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        }

        case "folder":
        default: {
          await capturer.saveCache({
            timeId,
            path: filename,
            source: sourceUrlMain,
            data: new Blob([data.content], {type: data.mime}),
          });

          if (settings.frameIsMain) {
            return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
          }

          return {timeId, sourceUrl, filename, url: scrapbook.escapeFilename(filename) + sourceUrlHash};
        }
      }
    } catch (ex) {
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileSaveError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    }
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
   * @param {string} params.sourceUrl - may include hash
   * @param {string} params.documentFileName
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.saveMainDocument = async function (params) {
    isDebug && console.debug("call: saveMainDocument", params);

    const {data, sourceUrl, documentFileName, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    const addIndexHtml = async (path, target, title) => {
      const meta = options["capture.recordDocumentMeta"] ? 
          ' data-scrapbook-source="' + scrapbook.escapeHtml(sourceUrl) + '"' + 
          ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' : 
          "";

      const html = `<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(target)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to <a href="${scrapbook.escapeHtml(target)}">${scrapbook.escapeHtml(target, false)}</a>
</body>
</html>`;
      await capturer.saveCache({
        timeId,
        path,
        source: sourceUrlMain,
        data: new Blob([html], {type: "text/html"}),
      });
    };

    try {
      capturer.log(`Saving data...`);
      const title = data.title || scrapbook.urlToFilename(sourceUrl);
      let filename;
      let [, ext] = scrapbook.filenameParts(documentFileName);
      switch (options["capture.saveAs"]) {
        case "singleHtml": {
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
              saveMethod = "saveBlobToServer";
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

          // special handling: single HTML cannot use "index.html"
          if (filename === 'index.html') {
            filename = 'index_.html';
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
            type: "",
            sourceUrl,
            targetDir,
            filename,
            url: scrapbook.escapeFilename(documentFileName) + sourceUrlHash,
            favIconUrl: data.favIconUrl,
          };
        }

        case "zip": {
          // create index.html that redirects to index.xhtml|.svg
          if (ext !== "html") {
            await addIndexHtml("index.html", `index.${ext}`, title);
          }

          // generate and download the zip file
          const zip = await capturer.loadCacheAsZip({timeId});
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
              saveMethod = "saveBlobToServer";
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

          await capturer.clearCache({timeId});

          return {
            timeId,
            title,
            type: "",
            sourceUrl,
            targetDir,
            filename,
            url: scrapbook.escapeFilename(documentFileName) + sourceUrlHash,
            favIconUrl: data.favIconUrl,
          };
        }

        case "maff": {
          {
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
            await capturer.saveCache({
              timeId,
              path: timeId + "/" + "index.rdf",
              source: sourceUrlMain,
              data: new Blob([rdfContent], {type: "application/rdf+xml"}),
            });
          }

          // generate and download the zip file
          const zip = await capturer.loadCacheAsZip({timeId});
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
              saveMethod = "saveBlobToServer";
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

          await capturer.clearCache({timeId});

          return {
            timeId,
            title,
            type: "",
            sourceUrl,
            targetDir,
            filename,
            url: scrapbook.escapeFilename(documentFileName) + sourceUrlHash,
            favIconUrl: data.favIconUrl,
          };
        }

        case "folder":
        default: {
          // create index.html that redirects to index.xhtml|.svg
          if (ext !== "html") {
            await addIndexHtml("index.html", `index.${ext}`, title);
          }

          let targetDir;
          let savePrompt = false;
          let saveMethod;

          {
            const dir = scrapbook.filepathParts(settings.filename)[0];
            const newFilename = await capturer.invoke("getAvailableSaveFilename", {
              filename: settings.filename,
              settings,
              options,
            });
            settings.filename = (dir ? dir + '/' : '') + newFilename;
          }

          const entries = await capturer.loadCache({timeId});
          switch (options["capture.saveTo"]) {
            case 'server': {
              targetDir = settings.filename;
              saveMethod = "saveBlobToServer";

              let workers = options["capture.serverUploadWorkers"];
              if (!(workers >= 1)) { workers = Infinity; }
              workers = Math.min(workers, entries.length);

              let taskIdx = 0;
              const runNextTask = async () => {
                if (taskIdx >= entries.length) { return; }
                const [path, sourceUrl, data] = entries[taskIdx++];
                try {
                  await capturer[saveMethod]({
                    timeId,
                    blob: data,
                    directory: targetDir,
                    filename: path,
                    sourceUrl,
                    autoErase: path !== "index.html",
                    savePrompt,
                    settings,
                    options,
                  });
                } catch (ex) {
                  // throw an unexpected error
                  errorUrl = sourceUrl;
                  throw ex;
                }
                return runNextTask();
              };

              let errorUrl = sourceUrl;
              try {
                await Promise.all(Array.from({length: workers}, _ => runNextTask()));
              } catch (ex) {
                // error out for individual file saving error
                console.error(ex);
                const message = scrapbook.lang("ErrorFileSaveError", [errorUrl, ex.message]);
                return {url: capturer.getErrorUrl(errorUrl, options), error: {message}};
              }
              break;
            }
            case 'folder':
            case 'file': // not supported, fallback to folder
            case 'memory': // not supported, fallback to folder
            default: {
              targetDir = options["capture.saveFolder"] + "/" + settings.filename;
              saveMethod = "saveBlob";
              let errorUrl = sourceUrl;
              try {
                await Promise.all(entries.map(([path, sourceUrl, data]) => {
                  return capturer[saveMethod]({
                    timeId,
                    blob: data,
                    directory: targetDir,
                    filename: path,
                    sourceUrl,
                    autoErase: path !== "index.html",
                    savePrompt,
                    settings,
                    options,
                  }).catch((ex) => {
                    // handle bug for zero-sized in Firefox < 65
                    // path should be same as the download filename (though the
                    // value is not acturally used)
                    // see browser.downloads.onChanged handler
                    if (data.size === 0 && ex.message === "Cannot find downloaded item.") {
                      return path;
                    }

                    // throw an unexpected error
                    errorUrl = sourceUrl;
                    throw ex;
                  });
                }));
              } catch (ex) {
                // error out for individual file saving error
                console.error(ex);
                const message = scrapbook.lang("ErrorFileSaveError", [errorUrl, ex.message]);
                return {url: capturer.getErrorUrl(errorUrl, options), error: {message}};
              }
              break;
            }
          }
          await capturer.clearCache({timeId});

          return {
            timeId,
            title,
            type: "",
            sourceUrl,
            targetDir,
            filename: documentFileName,
            url: scrapbook.escapeFilename(documentFileName) + sourceUrlHash,
            favIconUrl: data.favIconUrl,
          };
        }
      }
    } catch (ex) {
      console.error(ex);
      const message = scrapbook.lang("ErrorFileSaveError", [sourceUrl, ex.message]);
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message}};
    }
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {string} params.url - may include hash
   * @param {string} [params.refUrl] - the referrer URL
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object>}
   */
  capturer.downloadFile = async function (params) {
    isDebug && console.debug("call: downloadFile", params);

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

      // special handling for data URI
      // if not saved as file, save as-is regardless of its MIME type
      if (sourceUrlMain.startsWith("data:")) {
        if (!(options["capture.saveDataUriAsFile"] && !["singleHtml"].includes(options["capture.saveAs"]))) {
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

      // special handling for saving file as data URI
      if (["singleHtml"].includes(options["capture.saveAs"])) {
        const registry = await capturer.registerFile({
          url: sourceUrl,
          settings,
          options,
        });
        const filename = registry.filename;

        const blob = fetchResponse.blob;
        const mime = blob.type;
        const {parameters: {charset}} = scrapbook.parseHeaderContentType(fetchResponse.headers.contentType);

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

        // don't add hash to data URL as some browsers don't support it
        return {filename, url: dataUri};
      }

      const registry = await capturer.registerFile({
        url: sourceUrl,
        role: 'resource',
        settings,
        options,
      });

      if (registry.isDuplicate) {
        return registry;
      }

      const response = await capturer.downloadBlob({
        blob: fetchResponse.blob,
        filename: registry.filename,
        sourceUrl,
        settings,
        options,
      });

      return Object.assign({}, response, {
        url: response.url + scrapbook.splitUrlByAnchor(registry.url)[1],
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
   * @param {string} params.url
   * @param {string} [params.refUrl]
   * @param {string} params.options
   * @return {string} File extension of the URL.
   */
  capturer.downLinkFetchHeader = async function (params) {
    isDebug && console.debug("call: downLinkFetchHeader", params);

    const {url: sourceUrl, refUrl, settings, options} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

    try {
      const fetchResponse = await capturer.fetch({
        url: sourceUrlMain,
        refUrl,
        headerOnly: true,
        options,
        settings,
      });
      const headers = fetchResponse.headers;
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
   * @param {string} [params.refUrl]
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

      const fetchResponse = await capturer.fetch({
        url: sourceUrlMain,
        refUrl,
        settings,
        options,
      });

      const {text, charset} = await scrapbook.parseCssFile(fetchResponse.blob, fetchResponse.headers.charset);
      return {
        url: sourceUrl,
        text,
        charset,
      };
    } catch (ex) {
      // something wrong for the XMLHttpRequest
      console.warn(ex);
      capturer.warn(scrapbook.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
      return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
    }
  };

  /**
   * @kind invokable
   * @param {Object} params
   * @param {Blob|{data: string, type: string}} params.blob
   * @param {string} params.filename - validated and unique
   * @param {string} params.sourceUrl
   * @param {Object} params.settings
   * @param {Object} params.options
   * @return {Promise<Object>}
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

    if (typeof options["capture.resourceSizeLimit"] === "number" && blob.size >= options["capture.resourceSizeLimit"] * 1024 * 1024) {
      capturer.warn(scrapbook.lang("WarnResourceSizeLimitExceeded", [scrapbook.crop(sourceUrlMain, 128)]));
      return {url: capturer.getSkipUrl(sourceUrlMain, options), error: {message: "Resource size limit exceeded."}};
    }

    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        // this should not happen
        return {url: capturer.getErrorUrl(sourceUrl, options), error: {message: "Unable to save as data URL."}};
      }

      case "zip": {
        await capturer.saveCache({
          timeId,
          path: filename,
          source: sourceUrlMain,
          data: blob,
        });
        return {filename, url: scrapbook.escapeFilename(filename)};
      }

      case "maff": {
        await capturer.saveCache({
          timeId,
          path: timeId + "/" + filename,
          source: sourceUrlMain,
          data: blob,
        });
        return {filename, url: scrapbook.escapeFilename(filename)};
      }

      case "folder":
      default: {
        await capturer.saveCache({
          timeId,
          path: filename,
          source: sourceUrlMain,
          data: blob,
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
   * @return {Promise<{type: string, data: string}>}
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
  capturer.saveBlobToServer = async function (params) {
    isDebug && console.debug("call: saveBlobToServer", params);

    const {timeId, blob, directory, filename, sourceUrl, options} = params;
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
          const formData = new FormData();
          formData.append('token', await server.acquireToken());
          formData.append('upload', blob);

          await server.request({
            url: target + '?a=save&f=json',
            method: "POST",
            body: formData,
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
    return {error: {message: ex.message}};
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
        const result = (await browser.downloads.search({id: downloadId}))[0];
        if (result) {
          const [dir, filename] = scrapbook.filepathParts(result.filename);
          downloadHooks.get(downloadId).onComplete(filename);
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

    // pending for special handling and prevents auto-closing
    const pendingMode = s.has('p');

    document.addEventListener("DOMContentLoaded", async function () {
      scrapbook.loadLanguages(document);

      capturer.logger = document.getElementById('logger');
      capturer.downloader = document.getElementById('downloader');

      await scrapbook.loadOptions();

      let autoClose = scrapbook.getOption("capture.autoCloseDialog");
      if (pendingMode) {
        autoClose = false;
      }

      let results;
      if (missionId) {
        const key = {table: "captureMissionCache", id: missionId};
        const data = await scrapbook.cache.get(key);
        await scrapbook.cache.remove(key);
        if (!data || !data.tasks) {
          capturer.error(`Error: missing task data for mission "${missionId}".`);
        } else if (!data.tasks.length) {
          capturer.error(`Error: nothing to capture.`);
        } else {
          results = await capturer.runTasks(data);
        }
      } else {
        capturer.error(`Error: Mission ID not set.`);
      }

      resolve(results);

      // do not autoclose if there's no adequate results
      if (autoClose) {
        if (!results || results.error || results.some(x => x.error)) {
          autoClose = false;
        }
      }

      if (autoClose && !isDebug) {
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
  });

}));
