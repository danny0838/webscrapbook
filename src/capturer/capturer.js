/******************************************************************************
 * Script of the main capturer (capturer.html).
 *
 * @external isDebug
 * @requires scrapbook
 * @requires server
 * @requires capturer
 * @requires JSZip
 * @requires Mime
 * @requires MapWithDefault
 * @requires Referrer
 * @modifies capturer
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
    global.server,
    global.capturer,
    global.JSZip,
    global.Mime,
    global.MapWithDefault,
    global.Referrer,
  );
}(this, function (isDebug, scrapbook, server, capturer, JSZip, Mime, MapWithDefault, Referrer) {

'use strict';

const REBUILD_LINK_ROLE_PATTERN = /^document(?:-[a-f0-9-]+)?$/;
const REBUILD_LINK_SVG_HREF_ATTRS = ['href', 'xlink:href'];

// missionId is fixed to this page, to identify the capture mission
// generate a unique one, if not otherwise set
capturer.missionId = scrapbook.getUuid();

/**
 * @typedef {Object} missionCaptureInfoFilesEntry
 * @property {string} [path]
 * @property {string} [url]
 * @property {string} [role]
 * @property {string} [token]
 * @property {Blob} [blob]
 */

/**
 * @typedef {Object} missionCaptureInfoFilenameMapEntry
 * @property {string} filename
 * @property {string} url
 */

/**
 * @typedef {Object} missionCaptureInfoLinkedPagesEntry
 * @property {string} url
 * @property {boolean} hasMetaRefresh
 * @property {string} [refUrl]
 * @property {integer} depth
 */

/**
 * @typedef {Object} missionCaptureInfo
 * @property {boolean} useDiskCache
 * @property {(integer|undefined)} initialVersion
 * @property {Set<string~filename>} indexPages
 * @property {Map<string~filename, missionCaptureInfoFilesEntry>} files
 * @property {Map<string~token, Promise<fetchResponse>>} fetchMap
 * @property {Map<string~token, missionCaptureInfoFilenameMapEntry>} filenameMap
 * @property {Map<string~url, missionCaptureInfoLinkedPagesEntry>} linkedPages
 * @property {Map<string~url, string~redirectedUrl>} redirects
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
  filenameMap: new Map(),

  linkedPages: new Map(),
  redirects: new Map(),
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

/**
 * @param {...(string|Node)} msg
 */
capturer.log = function (...msg) {
  capturer.logger.append(...msg, '\n');
};

/**
 * @param {...(string|Node)} msg
 */
capturer.warn = function (...msg) {
  const span = document.createElement('span');
  span.className = 'warn';
  span.append(...msg);
  capturer.logger.append(span, '\n');
};

/**
 * @param {...(string|Node)} msg
 */
capturer.error = function (...msg) {
  const span = document.createElement('span');
  span.className = 'error';
  span.append(...msg);
  capturer.logger.append(span, '\n');
};

/**
 * Invoke an invokable capturer method from another script.
 *
 * This overrides the same method in common.js, and should take compatible
 * parameters.
 *
 * - To invoke a background script method, provide nothing.
 * - To invoke a content script method, provide details.tabId and
 *   optionally details.frameId.
 *
 * @override
 * @param {string} method - The capturer method to invoke.
 * @param {Object} [args] - The arguments to pass to the capturer method.
 * @param {Object} [details] - Data to determine invocation behavior.
 * @param {string} [details.tabId]
 * @param {string} [details.frameId]
 * @return {Promise<Object>}
 */
capturer.invoke = async function (method, args, details = {}) {
  const {tabId, frameId = 0} = details;
  if (Number.isInteger(tabId)) {
    const cmd = "capturer." + method;
    return await scrapbook.invokeContentScript({tabId, frameId, cmd, args});
  } else {
    // capturer.html call self
    return await capturer[method](args);
  }
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
 * @param {captureOptions} params.options
 * @return {string} The uniquified filename.
 */
capturer.getUniqueFilename = function (timeId, filename, options) {
  const {files} = capturer.captureInfo.get(timeId);

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
 * @param {captureOptions} params.options
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
      const blob = new Blob([], {type: "application/octet-stream"});
      const url = URL.createObjectURL(blob);
      const prefix = options["capture.saveFolder"] + "/" + (dir ? dir + '/' : '');
      isFilenameTaken = async (path) => {
        const filename = isFile ? prefix + path : prefix + path + '/' + 'index.html';

        try {
          const item = await new Promise((resolve, reject) => {
            async function onChanged(delta) {
              if (delta.id !== id) { return; }
              try {
                if (delta.error) {
                  cleanup();
                  await browser.downloads.erase({id});

                  // Treat download failure as filename being taken.
                  // If ancestor folder path is a file:
                  // - Chromium will prompt the user to select another path.
                  // - Firefox will fail to start downloading.
                  resolve(null);
                } else if (delta.state?.current === "complete") {
                  cleanup();
                  const [item] = await browser.downloads.search({id});
                  resolve(item);
                }
              } catch (ex) {
                // reject an unexpected error
                reject(ex);
              }
            }

            function cleanup() {
              if (cleanup.done) { return; }
              cleanup.done = true;
              browser.downloads.onChanged.removeListener(onChanged);
              clearTimeout(timer);
            }

            let id = null;
            let timer = null;
            browser.downloads.onChanged.addListener(onChanged);

            // Firefox Android >= 79: browser.downloads.download() halts forever.
            // Add a timeout to catch it.
            new Promise((resolve, reject) => {
              browser.downloads.download({
                url,
                filename,
                conflictAction: "uniquify",
                saveAs: false,
              }).then(resolve).catch(reject);
              timer = setTimeout(() => reject(new Error('Timeout for downloads.download()')), 5000);
            }).then(downloadId => {
              id = downloadId;
            }).catch(ex => {
              cleanup();
              reject(ex);
            });
          });

          if (item === null) {
            return true;
          }

          const [, newBasename] = scrapbook.filepathParts(item.filename);
          const [, oldBasename] = scrapbook.filepathParts(filename);
          if (newBasename === oldBasename) {
            await browser.downloads.erase({id: item.id});
            return false;
          }

          removeDummyFile: {
            // A random temporarily OS or API issue may cause the file
            // removal to fail. Retry a few times to alleviate that.
            const retryCount = options["capture.downloadRetryCount"];
            const retryDelay = options["capture.downloadRetryDelay"];
            let tried = 0;
            while (true) {
              try {
                await browser.downloads.removeFile(item.id);
                break;
              } catch (ex) {
                if (tried++ >= retryCount) {
                  throw ex;
                }
                console.error(`Failed to remove downloaded file "${filename}" (tried ${tried}): ${ex.message}`);
                await scrapbook.delay(retryDelay);
              }
            }
          }
          await browser.downloads.erase({id: item.id});

          // This may happen when:
          // 1. The downloaded filename is cropped due to length restriction.
          //    e.g. xxxxxxxxxx => xxxxxx (1)
          //    e.g. xxxxxxx(1) => xxxxxx (1)
          // 2. The browser API cannot return the correct downloaded path
          //    (e.g. on Kiwi Browser), in which case the test will never pass.
          // Fail early for either case.
          if (!newBasename.startsWith(scrapbook.filenameParts(oldBasename)[0])) {
            throw new Error(`Unable to download to the folder.`);
          }

          return true;
        } catch (ex) {
          throw new Error(`Unable to determine target folder name for "${filename}": ${ex.message}`);
        }
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
    await scrapbook.cache.set(key, blob, 'indexedDB');
    blob = await scrapbook.cache.get(key, 'indexedDB');
  }

  const {files} = capturer.captureInfo.get(timeId);
  const filename = scrapbook.filepathParts(path)[1].toLowerCase();
  Object.assign(files.get(filename), {
    path,
    blob,
  });
};

capturer.loadFileCache = async function ({timeId}) {
  const {files} = capturer.captureInfo.get(timeId);
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
  const {files} = capturer.captureInfo.get(timeId);
  for (const [filename, {path, url, blob}] of files) {
    if (!blob) { continue; }
    scrapbook.zipAddFile(zip, path, blob, zipOptions);
  }
  return zip;
};

capturer.clearFileCache = async function ({timeId}) {
  const filter = {
    includes: {
      table: new Set(["pageCache", "fetchCache"]),
      id: timeId,
    },
  };
  await scrapbook.cache.removeAll(filter, 'indexedDB');
};

/**
 * @typedef {Object} fetchError
 * @property {string} name
 * @property {string} message
 */

/**
 * @typedef {Object} fetchResponse
 * @property {string} url - The response URL (without hash).
 * @property {integer} status
 * @property {Object} headers
 * @property {?Blob} blob
 * @property {fetchError} [error] - Error of the fetch request.
 */

/**
 * Uniquely fetch a resource from the web.
 *
 * @param {Object} params
 * @param {string} params.url
 * @param {string} [params.refUrl] - the referrer URL
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {Blob} [params.overrideBlob]
 * @param {boolean} [params.headerOnly] - fetch HTTP header only
 * @param {boolean} [params.ignoreSizeLimit]
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<fetchResponse>}
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
   * @param {string} [params.refPolicy] - the referrer policy
   * @param {Object} [params.options]
   * @return {Object} The modified headers object.
   */
  const setReferrer = function ({headers, targetUrl, refUrl, refPolicy, options = {}}) {
    const defaultPolicy = options["capture.referrerPolicy"];
    const policy = defaultPolicy.startsWith('+') ?
        (defaultPolicy.substring(1) || refPolicy) :
        (refPolicy || defaultPolicy);
    const spoof = options["capture.referrerSpoofSource"];
    const referrer = new Referrer(refUrl, targetUrl, policy, spoof).toString();

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
    await scrapbook.cache.set(key, data, 'indexedDB');
    return await scrapbook.cache.get(key, 'indexedDB');
  };

  const fetch = capturer.fetch = async function (params) {
    isDebug && console.debug("call: fetch", params);

    const {
      url: sourceUrl,
      refUrl,
      refPolicy,
      overrideBlob,
      headerOnly = false,
      ignoreSizeLimit = false,
      settings: {timeId},
      options,
    } = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

    let headers = {};
    let response = {
      url: sourceUrlMain,
      status: 0,
      headers,
      blob: null,
    };

    // Throw an error for a bad URL before generating fetchToken, which
    // requires URL normalization and cannot work for a bad URL.

    // fail out if sourceUrl is empty.
    if (!sourceUrlMain) {
      return Object.assign(response, {
        error: {
          name: 'URIError',
          message: 'URL is empty.',
        },
      });
    }

    // fail out if sourceUrl is relative,
    // or it will be treated as relative to this extension page.
    if (!scrapbook.isUrlAbsolute(sourceUrlMain)) {
      return Object.assign(response, {
        error: {
          name: 'URIError',
          message: 'URL is not absolute.',
        },
      });
    }

    const scheme = sourceUrlMain.match(REGEX_SCHEMES)[1];
    if (!ALLOWED_SCHEMES.has(scheme)) {
      return Object.assign(response, {
        error: {
          name: 'URIError',
          message: 'URL scheme not supported.',
        },
      });
    }

    const {fetchMap} = capturer.captureInfo.get(timeId);
    const fetchRole = headerOnly ? 'head' : 'blob';

    // fail out if sourceUrl is invalid
    let fetchToken;
    try {
      fetchToken = getFetchToken(sourceUrlMain, fetchRole);
    } catch (ex) {
      return Object.assign(response, {
        error: {
          name: 'URIError',
          message: ex.message,
        },
      });
    }

    // check for previous fetch
    {
      const fetchPrevious = fetchMap.get(fetchToken);
      if (fetchPrevious) {
        return fetchPrevious;
      }
    }

    const fetchCurrent = (async () => {
      let overrideUrl;

      try {
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

          return Object.assign(response, {
            status: 200,
            blob,
          });
        }

        // special handling for about:blank or about:srcdoc
        if (scheme === "about") {
          return Object.assign(response, {
            status: 200,
            blob: new Blob([], {type: 'text/html'}),
          });
        }

        // special handling of overrideBlob
        if (overrideBlob) {
          overrideUrl = URL.createObjectURL(overrideBlob);
        }

        const xhr = await scrapbook.xhr({
          url: overrideUrl || sourceUrlMain,
          responseType: 'blob',
          allowAnyStatus: true,
          requestHeaders: setReferrer({
            headers: {},
            refUrl,
            targetUrl: overrideUrl || sourceUrlMain,
            refPolicy,
            options,
          }),
          onreadystatechange(xhr) {
            if (xhr.readyState !== 2) { return; }

            // check for previous fetch if redirected
            // treat as if no redirect when overrideUrl is used
            if (!overrideUrl) {
              // xhr.responseURL must be valid; otherwise the onerror event of the XHR will be triggered
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
            }

            // get headers
            if (sourceUrl.startsWith("http:") || sourceUrl.startsWith("https:") || sourceUrl.startsWith("blob:")) {
              const headerContentType = xhr.getResponseHeader("Content-Type");
              if (headerContentType) {
                const contentType = scrapbook.parseHeaderContentType(headerContentType);
                headers.contentType = contentType.type;
                headers.charset = contentType.parameters.charset;
              }
              const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
              if (headerContentDisposition) {
                const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
                headers.isAttachment = (contentDisposition.type !== "inline");
                headers.filename = contentDisposition.parameters.filename;
              }
              const headerContentLength = xhr.getResponseHeader("Content-Length");
              if (headerContentLength) {
                headers.contentLength = parseInt(headerContentLength, 10);
              }
            }

            let earlyResponse;
            if (headerOnly) {
              // skip loading body for a headerOnly fetch
              earlyResponse = Object.assign(response, {
                url: overrideUrl ? sourceUrlMain : xhr.responseURL,
                status: xhr.status,
              });
            } else if (!ignoreSizeLimit &&
                typeof options["capture.resourceSizeLimit"] === "number" &&
                typeof headers.contentLength === "number" &&
                headers.contentLength >= options["capture.resourceSizeLimit"] * 1024 * 1024) {
              // apply size limit if header contentLength is known
              earlyResponse = Object.assign(response, {
                url: overrideUrl ? sourceUrlMain : xhr.responseURL,
                status: xhr.status,
                error: {
                  name: 'FilterSizeError',
                  message: 'Resource size limit exceeded.',
                },
              });
            }

            if (earlyResponse) {
              // handle HTTP error
              if (!(xhr.status >= 200 && xhr.status < 300)) {
                Object.assign(earlyResponse, {
                  error: {
                    name: 'HttpError',
                    message: `${xhr.status} ${xhr.statusText}`,
                  },
                });
              }

              xhr.abort();
              return;
            }
          },
        }).catch((ex) => {
          Object.assign(response, {
            error: {
              name: 'RequestError',
              message: ex.message,
            },
          });
          return;
        });

        // xhr is resolved to undefined when aborted or on error.
        if (!xhr) {
          return response;
        }

        let blob = xhr.response;
        if (capturer.captureInfo.get(timeId).useDiskCache) {
          blob = await setCache(timeId, fetchToken, blob);
        }

        Object.assign(response, {
          url: overrideUrl ? sourceUrlMain : xhr.responseURL,
          status: xhr.status,
          blob,
        });

        // apply size limit
        if (!ignoreSizeLimit &&
            typeof options["capture.resourceSizeLimit"] === "number" &&
            blob.size >= options["capture.resourceSizeLimit"] * 1024 * 1024) {
          Object.assign(response, {
            blob: null,
            error: {
              name: 'FilterSizeError',
              message: 'Resource size limit exceeded.',
            },
          });
        }

        // handle HTTP error
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 0)) {
          Object.assign(response, {
            error: {
              name: 'HttpError',
              message: `${xhr.status} ${xhr.statusText}`,
            },
          });
        }

        return response;
      } catch (ex) {
        return Object.assign(response, {
          error: {
            name: 'FetchError',
            message: ex.message,
          },
        });
      } finally {
        if (overrideUrl) {
          URL.revokeObjectURL(overrideUrl);
        }
      }
    })();

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
 * @typedef {Object} resolveRedirectsResponse
 * @property {string} url
 * @property {string} refUrl
 * @property {fetchResponse} fetchResponse
 * @property {?Document} doc
 * @property {boolean} [isAttachment]
 * @property {Error} [error] - Target cannot be fetched or circular meta refresh.
 */

/**
 * Resolve redirect and meta refresh.
 *
 * @param {Object} params
 * @param {string} params.url - may include hash
 * @param {string} [params.refUrl]
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {Blob} [params.overrideBlob]
 * @param {boolean} [params.isAttachment] - the resource is known to be an attachment
 * @param {boolean} [params.checkMetaRefresh=true]
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {resolveRedirectsResponse}
 */
capturer.resolveRedirects = async function (params) {
  isDebug && console.debug("call: resolveRedirects", params);

  const {refPolicy, checkMetaRefresh = true, settings, options} = params;
  let {url: sourceUrl, refUrl, overrideBlob, isAttachment} = params;
  let [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

  const ignoreSizeLimit = settings.isMainPage && settings.isMainFrame;
  const metaRefreshChain = [];
  let fetchResponse;
  let doc;
  let error;
  try {
    while (true) {
      fetchResponse = await capturer.fetch({
        url: sourceUrlMain,
        refUrl,
        refPolicy,
        overrideBlob,
        ignoreSizeLimit,
        settings,
        options,
      });

      if (fetchResponse.error) {
        throw new Error(fetchResponse.error.message);
      }

      if (!isAttachment && fetchResponse.headers.isAttachment) {
        isAttachment = true;
      }

      // treat as non-document if it's an attachment
      if (isAttachment) {
        doc = null;
        break;
      }

      doc = await scrapbook.readFileAsDocument(fetchResponse.blob);

      if (!doc) {
        break;
      }

      if (!checkMetaRefresh) {
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
      overrideBlob = null;

      // meta refresh will replace the original hash
      [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(metaRefreshTarget);
    }
    sourceUrl = capturer.getRedirectedUrl(fetchResponse.url, sourceUrlHash);
    [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  } catch (ex) {
    error = ex;
  }

  return {
    url: sourceUrl,
    refUrl,
    fetchResponse,
    doc,
    ...(isAttachment && {isAttachment}),
    ...(error && {error}),
  };
};

/**
 * @type invokable
 * @param {Object} params
 * @param {Object} params.item
 * @param {string} params.parentId
 * @param {integer} params.index
 */
capturer.addItemToServer = async function ({item, parentId, index}) {
  await server.init();
  const book = server.books[server.bookId];
  if (book.config.no_tree) {
    return;
  }

  capturer.log(`Updating server index for item "${item.id}"...`);

  // cache favicon
  let icon = item.icon;
  try {
    icon = await book.cacheFavIcon({item, icon});
  } catch (ex) {
    console.warn(ex);
    capturer.warn(scrapbook.lang("ErrorFileDownloadError", [icon, ex.message]));
  }

  // lock tree before loading to avoid a conflict due to parallel captures
  await book.transaction({
    mode: 'refresh',
    timeout: 60,
    callback: async (book, {updated}) => {
      await book.loadMeta(updated);
      await book.loadToc(updated);

      // insert to root if parentId does not exist
      if (parentId && !book.meta[parentId] && !book.isSpecialItem(parentId)) {
        capturer.warn(`Specified parent ID "${parentId}" is invalid. Append to root instead.`);
        parentId = 'root';
      }

      // update book
      const newItem = book.addItem(
        Object.assign({}, item, {icon}),
      );

      await server.request({
        url: book.topUrl,
        query: {
          a: 'query',
          lock: '',
        },
        method: 'POST',
        format: 'json',
        csrfToken: true,
        body: {
          q: JSON.stringify({
            book: book.id,
            cmd: 'add_item',
            kwargs: {
              item: newItem,
              target_parent_id: parentId,
              target_index: index,
            },
          }),
          auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
        },
      });
    },
  });

  capturer.addItemToServer.added = true;
};

/**
 * @type invokable
 * @return {Promise<Object>}
 */
capturer.getMissionResult = async function () {
  return capturePromise;
};

/**
 * @type invokable
 */
capturer.remoteMsg = async function ({msg, type}) {
  if (['log', 'warn', 'error'].includes(type)) {
    capturer[type](...msg);
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
 * @param {captureOptions} [params.options] - base capture options, overwriting default
 * @param {string} [params.comment] - comment for the captured item
 * @return {Promise<Array|Object>} A list of task results (or error), or an object of error.
 */
capturer.runTasks = async function ({
  tasks,
  bookId, parentId, index, delay,
  mode: baseMode, options: baseOptions,
}) {
  delay = parseFloat(delay) || 5;
  baseOptions = Object.assign(await scrapbook.getOptions("capture"), baseOptions);

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
      capturer.addItemToServer.added = false;

      if (["resave", "internalize"].includes(mode)) {
        result = await capturer.resaveTab({
          tabId, frameId,
          options,
          internalize: mode === "internalize",
        });
      } else if (recaptureInfo) {
        // recapture
        result = await capturer.recapture({
          tabId, frameId,
          url, refUrl,
          mode,
          settings: {fullPage, title, favIconUrl},
          options, comment,
          recaptureInfo,
        });
      } else if (mergeCaptureInfo) {
        // merge capture
        result = await capturer.mergeCapture({
          tabId, frameId,
          url, refUrl,
          mode,
          settings: {fullPage, title, favIconUrl},
          options,
          mergeCaptureInfo,
        });
      } else {
        // capture general
        result = await capturer.captureGeneral({
          tabId, frameId,
          url, refUrl,
          mode,
          settings: {fullPage, title, favIconUrl},
          options, comment,
          bookId, parentId, index,
        });

        // increament the index if an item is added
        if (Number.isInteger(index)) {
          if (capturer.addItemToServer.added) {
            try {
              if (!server.books[bookId].config.new_at_top) {
                index++;
              }
            } catch (ex) {}
          }
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
 * @param {integer} [params.tabId] - ID of the tab to capture
 * @param {integer} [params.frameId] - ID of the frame to capture
 * @param {string} [params.url] - source URL of the page to capture (ignored
 *   when tabId is set)
 * @param {string} [params.refUrl] - the referrer policy
 * @param {string} [params.mode] - "tab", "source", "bookmark"
 * @param {captureSettings} [params.settings] - overriding settings
 * @param {captureOptions} params.options - options for the capture
 * @param {captureOptions} params.presets - preset options, which are never
 *   overwritten by capture helpers, for the capture
 * @param {string} [params.comment] - comment for the captured item
 * @param {?string} [params.bookId] - bookId ID for the captured items
 * @param {string} [params.parentId] - parent item ID for the captured items
 * @param {integer} [params.index] - position index for the captured items
 * @param {boolean} [params.captureOnly] - skip adding item and clean up (for
 *   special modes like recapture and mergeCapture)
 * @return {Promise<captureDocumentResponse|transferableBlob>}
 */
capturer.captureGeneral = async function ({
  tabId, frameId,
  url, refUrl,
  mode,
  settings: {
    timeId = scrapbook.dateToId(),
    documentName = 'index',
    indexFilename,
    fullPage,
    type,
    title,
    favIconUrl,
  } = {},
  options,
  presets,
  comment,
  bookId = null, parentId, index,
  captureOnly = false,
}) {
  // validate capture helpers
  // force disabled if invalid or undefined
  if (options["capture.helpersEnabled"]) {
    if (options["capture.helpers"]) {
      try {
        const helpers = scrapbook.parseOption("capture.helpers", options["capture.helpers"]);

        // apply overriding options
        const docUrl = await (async () => {
          if (Number.isInteger(tabId)) {
            return (await browser.webNavigation.getFrame({
              tabId,
              frameId: Number.isInteger(frameId) ? frameId : 0,
            })).url;
          } else if (typeof url === 'string') {
            // check possible redirect
            // First fetch with overriding options for the initial URL
            // (which may include request related options).
            const _options = capturer.CaptureHelperHandler.getOverwritingOptions(helpers, url);
            const redirectInfo = await capturer.resolveRedirects({
              url,
              refUrl,
              settings: {
                missionId: capturer.missionId,
                timeId,

                // prevent sizeLimit
                isMainPage: true,
                isMainFrame: true,
              },
              options: Object.assign({}, options, _options),
            });
            return redirectInfo.url;
          } else {
            return "";
          }
        })();

        const _options = capturer.CaptureHelperHandler.getOverwritingOptions(helpers, docUrl);
        Object.assign(options, _options);
      } catch (ex) {
        options["capture.helpersEnabled"] = false;
        options["capture.helpers"] = "";
        capturer.warn(`Ignored invalid capture.helpers: ${ex.message}`);
      }
    } else {
      options["capture.helpersEnabled"] = false;
    }
  }

  Object.assign(options, presets);

  // determine bookId at the start of a capture
  if (options["capture.saveTo"] === 'server') {
    if (bookId === null) {
      bookId = (await scrapbook.cache.get({table: "scrapbookServer", key: "currentScrapbook"}, 'storage')) || "";
    }
    await server.init();
    server.bookId = bookId;
  }

  // use disk cache for in-depth capture to prevent memory exhaustion
  capturer.captureInfo.get(timeId).useDiskCache = parseInt(options["capture.downLink.doc.depth"], 10) > 0;

  const settings = {
    missionId: capturer.missionId,
    timeId,
    documentName,
    indexFilename,
    recurseChain: [],
    depth: 0,
    isMainPage: true,
    isMainFrame: true,
    fullPage,
    type,
    title,
    favIconUrl,
  };

  let response;
  if (Number.isInteger(tabId)) {
    // capture tab
    response = await capturer.captureTab({
      tabId, frameId,
      mode, settings, options,
    });
  } else if (typeof url === 'string') {
    // capture headless
    response = await capturer.captureRemote({
      url, refUrl,
      mode, settings, options,
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
      cmd: "background.onCaptureEnd",
      args: {urls: [scrapbook.normalizeUrl(response.sourceUrl)]},
    });

    // preserve info if error out
    capturer.captureInfo.delete(timeId);
    await capturer.clearFileCache({timeId});
  }

  return response;
};

/**
 * @param {Object} params
 * @param {integer} params.tabId
 * @param {integer} [params.frameId]
 * @param {string} [params.mode] - "tab", "source", "bookmark"
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|transferableBlob>}
 */
capturer.captureTab = async function ({
  tabId, frameId,
  mode, settings, options,
}) {
  let {url, title, cookieStoreId, discarded} = await browser.tabs.get(tabId);

  if (Number.isInteger(frameId) && frameId !== 0) {
    ({url} = await browser.webNavigation.getFrame({tabId, frameId}));
  }

  // redirect headless capture
  // infer title from the current tab if frameId not provided
  switch (mode) {
    case "source":
    case "bookmark": {
      if (!Number.isInteger(frameId)) {
        settings = Object.assign({}, settings, {
          title: settings.title || title,
        });
      }
      return await capturer.captureRemote({
        url,
        mode, settings, options,
      });
    }
  }

  const source = `[${tabId}${(frameId ? ':' + frameId : '')}] ${url}`;
  const message = {
    settings,
    options,
  };

  capturer.log(`Capturing (document) ${source} ...`);

  // Do not capture a tab in a container different from the capturer
  // to prevent an inconsistent result.
  if (cookieStoreId) {
    const tab = await browser.tabs.getCurrent();
    if (cookieStoreId !== tab.cookieStoreId) {
      throw new Error(`Disallowed to capture a tab in container "${cookieStoreId}" from container "${tab.cookieStoreId}"`);
    }
  }

  // throw error for a discarded tab
  // note that tab.discarded is undefined in older Firefox version
  if (discarded === true) {
    throw new Error(scrapbook.lang("ErrorTabDiscarded"));
  }

  (await scrapbook.initContentScripts(tabId)).forEach(({tabId, frameId, url, error, injected}) => {
    if (error) {
      const source = `[${tabId}:${frameId}] ${url}`;
      capturer.error(scrapbook.lang("ErrorContentScriptExecute", [source, error.message]));
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
 * @param {string} params.url
 * @param {string} [params.refUrl]
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {string} [params.mode] - "tab", "source", "bookmark"
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|transferableBlob>}
 */
capturer.captureRemote = async function ({
  url, refUrl, refPolicy,
  mode, settings, options,
}) {
  const source = `${url}`;
  const message = {
    url, refUrl, refPolicy,
    settings: Object.assign({}, settings, {
      fullPage: true,
    }),
    options,
  };

  isDebug && console.debug("(main) capture", source, message);

  let captureMode = mode;
  let captureFunc;
  switch (mode) {
    case "tab": {
      captureFunc = capturer.captureRemoteTab;
      break;
    }
    case "bookmark": {
      captureFunc = capturer.captureBookmark;
      break;
    }
    case "source":
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
 * @param {string} params.url
 * @param {string} [params.refUrl]
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|transferableBlob>}
 */
capturer.captureRemoteTab = async function ({
  url, refUrl, refPolicy,
  settings, options,
}) {
  capturer.log(`Launching remote tab ...`);

  const tab = await browser.tabs.create({url, active: false});
  await scrapbook.waitTabLoading(tab);

  const delay = options["capture.remoteTabDelay"];
  if (delay > 0) {
    capturer.log(`Waiting for ${delay} ms...`);
    await scrapbook.delay(delay);
  }

  (await scrapbook.initContentScripts(tab.id)).forEach(({tabId, frameId, url, error, injected}) => {
    if (error) {
      const source = `[${tabId}:${frameId}] ${url}`;
      capturer.error(scrapbook.lang("ErrorContentScriptExecute", [source, error.message]));
    }
  });

  try {
    return await capturer.invoke("captureDocumentOrFile", {
      refUrl,
      refPolicy,
      settings: Object.assign({}, settings, {
        fullPage: true,
      }),
      options,
    }, {
      tabId: tab.id,
      frameId: 0,
    });
  } finally {
    try {
      await browser.tabs.remove(tab.id);
    } catch (ex) {}
  }
};

/**
 * @override
 * @param {Object} params
 * @param {string} params.url - may include hash
 * @param {string} [params.refUrl]
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {Blob} [params.overrideBlob]
 * @param {boolean} [params.isAttachment] - the resource is known to be an
 *   attachment
 * @param {boolean} [params.downLink] - is downLink mode (check filter, and
 *   capture as file or register in linkedPages)
 * @param {boolean} [params.downLinkExtra] - is an extra downLink resource (don't check filter)
 * @param {boolean} [params.downLinkPage] - is a page previously registered in linkedPages
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|transferableBlob|null>} The capture
 *   result, or null if not to be captured.
 */
capturer.captureUrl = async function (params) {
  isDebug && console.debug("call: captureUrl", params);

  const {
    url: sourceUrl,
    refPolicy,
    downLink = false,
    downLinkExtra = false,
    downLinkPage = false,
    settings,
    options,
  } = params;
  let {refUrl, overrideBlob, isAttachment} = params;
  const {timeId, depth} = settings;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

  let downLinkDoc = downLink && parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options["capture.saveAs"] !== "singleHtml";
  let downLinkFile = downLink && ["header", "url"].includes(options["capture.downLink.file.mode"]);
  let downLinkDocValid = downLinkDoc && depth <= parseInt(options["capture.downLink.doc.depth"], 10);
  let downLinkFileValid = downLinkFile;

  // check for downLink URL filter
  if (downLink && !downLinkExtra) {
    // early return if downLink condition not fulfilled
    // (e.g. depth exceeded for downLinkDoc and no downLinkFile)
    if (!downLinkDocValid && !downLinkFileValid) {
      return null;
    }

    // exclude URLs mathing downLinkUrlFilter
    if (capturer.downLinkUrlFilter(sourceUrl, options)) {
      return null;
    }

    // apply extension filter when checking URL
    if (downLinkFileValid && options["capture.downLink.file.mode"] === "url") {
      const filename = scrapbook.urlToFilename(sourceUrl);
      const [, ext] = scrapbook.filenameParts(filename);
      if (!capturer.downLinkFileExtFilter(ext, options)) {
        downLinkFileValid = false;
      }
    }

    // apply in-depth URL filter
    if (downLinkDocValid && !capturer.downLinkDocUrlFilter(sourceUrl, options)) {
      downLinkDocValid = false;
    }

    // return if downLink condition not fulfilled
    if (!downLinkDocValid && !downLinkFileValid) {
      return null;
    }
  }

  const redirectInfo = await capturer.resolveRedirects({
    url: sourceUrl,
    refUrl,
    refPolicy,
    overrideBlob,
    isAttachment,

    // don't check meta refresh for downLink
    checkMetaRefresh: !(downLink || downLinkPage),

    settings,
    options,
  });
  if (redirectInfo.error) {
    // URL not accessible, or meta refresh not resolvable
    if (!downLink) {
      throw redirectInfo.error;
    }

    redirectInfo.fetchResponse = {headers: {}};
    redirectInfo.doc = null;
  }
  ({refUrl, isAttachment} = redirectInfo);
  const {fetchResponse: {headers}, url, doc} = redirectInfo;
  const [urlMain, urlHash] = scrapbook.splitUrlByAnchor(url);

  if (downLink) {
    if (downLinkDoc && doc) {
      // for a document suitable for downLinkDoc, register in linkedPages and return null
      if (downLinkDocValid || downLinkExtra) {
        const {linkedPages} = capturer.captureInfo.get(timeId);
        if (!linkedPages.has(sourceUrlMain)) {
          linkedPages.set(sourceUrlMain, {
            url: urlMain,
            refUrl,
            depth,
          });
        }
      }

      // if downLinkDoc is set, ignore downLinkFile anyway
      // (to prevent same document at deeper depth be downloaded again as file)
      return null;
    }

    // apply downLink header filter
    if (!downLinkExtra && downLinkFileValid && options["capture.downLink.file.mode"] === "header") {
      if (!redirectInfo.error) {
        // determine extension
        const mime = headers.contentType;
        let ext;
        if (mime) {
          ext = Mime.extension(mime);
        } else if (headers.filename) {
          [, ext] = scrapbook.filenameParts(headers.filename);
        } else {
          const filename = scrapbook.urlToFilename(urlMain);
          [, ext] = scrapbook.filenameParts(filename);
        }

        if (!(capturer.downLinkFileMimeFilter(mime, options) || capturer.downLinkFileExtFilter(ext, options))) {
          downLinkFileValid = false;
        }
      } else {
        downLinkFileValid = false;
      }
    }

    if (downLinkFileValid || (downLinkFile && downLinkExtra)) {
      const response = await capturer.downloadFile({
        url: urlMain,
        refUrl,
        refPolicy,
        settings,
        options,
      });
      return Object.assign({}, response, {
        url: capturer.getRedirectedUrl(response.url, urlHash),
      });
    }

    if (downLinkExtra) {
      capturer.warn(`Skipped invalid extra URL: "${sourceUrl}"`);
    }

    return null;
  }

  if (doc) {
    if (downLinkPage && options["capture.downLink.doc.mode"] === "tab") {
      const response = await capturer.captureRemoteTab({
        url,
        refUrl,
        settings,
        options,
      });

      // update linkedPage data for a possible redirection
      // (meta refresh or JavaScript re-location)
      const redirectedUrlMain = response.sourceUrl;
      if (redirectedUrlMain && redirectedUrlMain !== sourceUrlMain) {
        const {linkedPages} = capturer.captureInfo.get(timeId);
        linkedPages.set(sourceUrlMain, {
          url: redirectedUrlMain,
          refUrl,
          depth,
        });
      }

      return response;
    }

    return await capturer.captureDocumentOrFile({
      doc,
      metaDocUrl: url,
      docUrl: url,
      refUrl,
      refPolicy,
      settings,
      options,
    });
  }

  return await capturer.captureFile({
    url,
    refUrl,
    refPolicy,
    charset: headers.charset,
    settings,
    options,
  });
};

/**
 * @param {Object} params
 * @param {string} params.url - may include hash
 * @param {string} [params.refUrl]
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {captureSettings} params.settings
 * @param {string} params.settings.timeId
 * @param {string} [params.settings.title] - item title (also used as index page title)
 * @param {string} [params.settings.favIconUrl] - item favicon (also used as index page favicon)
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|transferableBlob>}
 */
capturer.captureBookmark = async function (params) {
  isDebug && console.debug("call: captureBookmark", params);

  const {refPolicy, settings, options} = params;
  let {url: sourceUrl, refUrl} = params;
  let [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

  const redirectInfo = await capturer.resolveRedirects({
    url: sourceUrl,
    refUrl,
    refPolicy,
    settings,
    options,
  });
  if (redirectInfo.error) {
    throw redirectInfo.error;
  }
  const {doc} = redirectInfo;
  ({url: sourceUrl, refUrl} = redirectInfo);
  [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);

  const {timeId} = settings;
  let {title, favIconUrl} = settings;

  if (doc) {
    // attempt to retrieve title and favicon from source page
    if (!title || !favIconUrl) {
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
            favIconUrl = new URL(elem.getAttribute('href'), sourceUrl).href;
          }
        }
      } catch (ex) {
        console.error(ex);
      }
    }

    // attempt to take site favicon
    if (!favIconUrl) {
      const u = new URL(sourceUrlMain);
      if (['http:', 'https:'].includes(u.protocol)) {
        const url = u.origin + '/' + 'favicon.ico';
        const fetchResponse = await capturer.fetch({
          url,
          refUrl: sourceUrl,
          refPolicy,
          settings,
          options,
        });
        if (!fetchResponse.error) {
          favIconUrl = url;
        }
      }
    }
  }

  // fetch favicon as data URL
  if (favIconUrl && !favIconUrl.startsWith('data:')) {
    try {
      const [favIconUrlMain, favIconUrlHash] = scrapbook.splitUrlByAnchor(favIconUrl);
      const fetchResponse = await capturer.fetch({
        url: favIconUrlMain,
        refUrl: sourceUrl,
        refPolicy,
        settings,
        options,
      });

      if (fetchResponse.error) {
        throw new Error(fetchResponse.error.message);
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

  const html = (() => {
    const url = sourceUrl.startsWith("data:") ? "data:" : sourceUrl;
    const meta = params.options["capture.recordDocumentMeta"] ?
        ' data-scrapbook-source="' + scrapbook.escapeHtml(scrapbook.normalizeUrl(url)) + '"' +
        ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' +
        ' data-scrapbook-type="bookmark"' :
        "";
    const titleElem = title ? `<title>${scrapbook.escapeHtml(title, false)}</title>\n` : "";
    const favIconElem = (favIconUrl && !["blank", "remove", "link"].includes(options["capture.favicon"])) ?
        `<link rel="shortcut icon" href="${scrapbook.escapeHtml(favIconUrl)}">\n` :
        "";
    return `\
<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${scrapbook.escapeHtml(sourceUrl)}">
${titleElem}${favIconElem}</head>
<body>
Bookmark for <a href="${scrapbook.escapeHtml(sourceUrl)}">${scrapbook.escapeHtml(sourceUrl, false)}</a>
</body>
</html>`;
  })();
  const blob = new Blob([html], {type: "text/html"});

  settings.type = settings.type || 'bookmark';
  settings.indexFilename = settings.indexFilename || await capturer.formatIndexFilename({
    title: title || scrapbook.filenameParts(scrapbook.urlToFilename(sourceUrl))[0] || "untitled",
    sourceUrl,
    isFolder: false,
    settings,
    options,
  });

  const registry = await capturer.invoke("registerDocument", {
    docUrl: sourceUrl,
    mime: "text/html",
    role: "document",
    settings,
    options,
  });

  const documentFileName = registry.filename;

  const response = await capturer.saveDocument({
    sourceUrl,
    documentFileName,
    settings,
    options,
    data: {
      blob,
      title,
      favIconUrl,
    },
  });

  // special handling for blob response
  if (!('url' in response)) {
    return response;
  }

  return Object.assign({}, response, {
    url: capturer.getRedirectedUrl(response.url, sourceUrlHash),
  });
};

/**
 * @type invokable
 * @param {Object} params
 * @param {string} params.url - may include hash
 * @param {string} [params.refUrl] - the referrer URL
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {string} [params.charset] - charset for the text file
 * @param {captureSettings} params.settings
 * @param {string} [params.settings.title] - item title (also used as index page title)
 * @param {captureOptions} params.options
 * @return {Promise<captureDocumentResponse|downloadBlobResponse>}
 */
capturer.captureFile = async function (params) {
  isDebug && console.debug("call: captureFile", params);

  const {url: sourceUrl, refUrl, refPolicy, charset, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId, isMainPage, isMainFrame, documentName, title} = settings;

  let response = await capturer.downloadFile({
    url: sourceUrl,
    refUrl,
    refPolicy,
    settings,
    options,
  });

  if (!(isMainPage && isMainFrame)) {
    return Object.assign({}, response, {
      url: capturer.getRedirectedUrl(response.url, sourceUrlHash),
    });
  }

  // This should only happen during a merge capture.
  // Rebuild using the captured main file without generating a redirect page.
  if (settings.type === 'site') {
    return await capturer.saveMainDocument({
      sourceUrl,
      documentFileName: response.filename,
      settings,
      options,
    });
  }

  // for the main frame, create a index.html that redirects to the file
  const html = (() => {
    const url = sourceUrl.startsWith("data:") ? "data:" : sourceUrl;
    const meta = params.options["capture.recordDocumentMeta"] ?
        ' data-scrapbook-source="' + scrapbook.escapeHtml(scrapbook.normalizeUrl(url)) + '"' +
        ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' +
        ' data-scrapbook-type="file"' +
        (charset ? ' data-scrapbook-charset="' + charset + '"' : "") :
        "";
    const titleElem = title ? `<title>${scrapbook.escapeHtml(title, false)}</title>\n` : "";
    return `\
<!DOCTYPE html>
<html${meta}>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${scrapbook.escapeHtml(response.url)}">
${titleElem}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(response.url)}">${scrapbook.escapeHtml(response.filename, false)}</a>
</body>
</html>`;
  })();
  const blob = new Blob([html], {type: "text/html;charset=UTF-8"});

  settings.type = settings.type || 'file';
  settings.indexFilename = settings.indexFilename || await capturer.formatIndexFilename({
    title: title || scrapbook.urlToFilename(sourceUrl) || "untitled",
    sourceUrl,
    isFolder: options["capture.saveAs"] === "folder",
    settings,
    options,
  });

  const registry = await capturer.invoke("registerDocument", {
    docUrl: sourceUrl,
    mime: "text/html",
    role: "document",
    settings,
    options,
  });

  const documentFileName = registry.filename;

  response = await capturer.saveDocument({
    sourceUrl,
    documentFileName,
    settings,
    options,
    data: {
      title,
      blob,
    },
  });

  // special handling for blob response
  if (!('url' in response)) {
    return response;
  }

  return Object.assign({}, response, {
    charset: charset || undefined,
    url: capturer.getRedirectedUrl(response.url, sourceUrlHash),
  });
};

/**
 * @param {Object} params
 * @param {integer} params.tabId
 * @param {integer} [params.frameId]
 * @param {captureOptions} [params.options] - preset options that overwrites default
 * @param {boolean} [params.internalize]
 * @return {Promise<{title: string, sourceUrl: string, favIconUrl: string}>}
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

  await server.init();
  const bookId = await server.findBookIdFromUrl(url);
  const book = server.books[bookId];

  if (!url.startsWith(book.dataUrl)) {
    throw new Error(scrapbook.lang("ErrorSaveNotUnderDataDir", [url]));
  }

  await book.transaction({
    mode: 'update',
    callback: async (book, {updated}) => {
      await book.loadMeta(updated);
      const item = await book.findItemFromUrl(url);
      if (item?.locked) {
        throw new Error(scrapbook.lang("ErrorSaveLockedItem"));
      }

      const isMainDocument = book.isItemIndexUrl(item, url);

      let internalizePrefix;
      if (internalize) {
        if (item?.index) {
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
          capturer.error(scrapbook.lang("ErrorContentScriptExecute", [source, error.message]));
        }
      });

      const message = {
        internalize,
        isMainPage: isMainDocument,
        item,
        options: Object.assign(await scrapbook.getOptions("capture"), options),
      };

      isDebug && console.debug("(main) send", source, message);
      const response = await capturer.invoke("retrieveDocumentContent", message, {tabId, frameId});
      isDebug && console.debug("(main) response", source, response);

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
                const ext = Mime.extension(blob.type) || 'bin';
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

      // documents
      for (const [fileUrl, data] of Object.entries(response)) {
        try {
          const target = scrapbook.splitUrl(fileUrl)[0];

          // only save files under dataDir
          if (!fileUrl.startsWith(book.dataUrl)) {
            throw new Error(scrapbook.lang("ErrorSaveNotUnderDataDir", [target]));
          }

          let {blob} = data;
          blob = await capturer.loadBlobCache(blob);
          const {parameters: {charset}} = scrapbook.parseHeaderContentType(blob.type);

          // forbid non-UTF-8 for data safety
          if (!['UTF-8', 'UTF8'].includes(charset.toUpperCase())) {
            throw new Error(scrapbook.lang("ErrorSaveNonUTF8", [target]));
          }

          // save document
          try {
            let content = await scrapbook.readFileAsText(blob);

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

            await server.request({
              url: target + '?a=save',
              method: "POST",
              format: 'json',
              csrfToken: true,
              body: {
                upload: new Blob([content], {type: blob.type}),
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
        await server.request({
          query: {
            a: 'query',
            lock: '',
          },
          body: {
            q: JSON.stringify({
              book: book.id,
              cmd: 'update_item',
              kwargs: {
                item,
              },
            }),
            auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
          },
          method: 'POST',
          format: 'json',
          csrfToken: true,
        });
      } else {
        if (!book.config.no_tree) {
          capturer.warn(scrapbook.lang("ErrorSaveUnknownItem"));
        }
      }
    },
  });

  await scrapbook.invokeExtensionScript({
    cmd: "background.onServerTreeChange",
  });

  return {
    title,
    sourceUrl: url,
    favIconUrl,
  };
};

/**
 * @param {Object} params
 * @return {Promise<captureDocumentResponse>}
 */
capturer.recapture = async function ({
  tabId, frameId,
  url, refUrl,
  mode,
  settings: {
    timeId = scrapbook.dateToId(),
    fullPage,
    title,
    favIconUrl,
  } = {},
  options, comment, recaptureInfo,
}) {
  const {bookId, itemId} = recaptureInfo;

  capturer.log(`Preparing a re-capture for item "${itemId}" of book "${bookId}"...`);

  await server.init(true);
  const book = server.books[bookId];
  if (!book || book.config.no_tree) {
    throw new Error(`Recapture reference book invalid: "${bookId}".`);
  }

  let result;
  await book.transaction({
    mode: 'refresh',
    callback: async (book, {updated}) => {
      await book.loadMeta(updated);
      const item = book.meta[itemId];
      if (!item) {
        throw new Error(`Recapture reference item invalid: "${itemId}".`);
      }
      if (item.locked) {
        throw new Error(scrapbook.lang("ErrorSaveLockedItem"));
      }

      // record original index
      const oldIndex = item.index;

      // enforce capture to server
      const settings = {timeId, fullPage, title, favIconUrl};
      const presets = {
        "capture.saveTo": "server",
      };

      result = await capturer.captureGeneral({
        tabId, frameId,
        url: url || item.source, refUrl,
        mode, settings, options, presets,
        bookId,
        captureOnly: true,
      });

      if (title) { item.title = title; }
      if (comment) { item.comment = comment; }
      item.index = (result.targetDir ? result.targetDir + '/' : '') + result.filename;
      item.type = result.type;
      item.modify = timeId;
      item.source = scrapbook.normalizeUrl(result.sourceUrl);
      item.icon = result.favIconUrl;

      try {
        item.icon = await book.cacheFavIcon({
          item,
          icon: item.icon,
        });
      } catch (ex) {
        console.warn(ex);
        capturer.warn(scrapbook.lang("ErrorFileDownloadError", [item.icon, ex.message]));
      }

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
                  if (prev?.nodeType === 3) {
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
                    if (next?.nodeType === 3) {
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
      await server.request({
        query: {
          a: 'query',
          lock: '',
        },
        body: {
          q: JSON.stringify({
            book: book.id,
            cmd: 'update_item',
            kwargs: {
              item,
            },
          }),
          auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
        },
        method: 'POST',
        format: 'json',
        csrfToken: true,
      });

      // move current data files to backup
      if (oldIndex) {
        let index = oldIndex;
        if (index.endsWith('/index.html')) {
          index = index.slice(0, -11);
        }
        const target = book.dataUrl + scrapbook.escapeFilename(index);

        if (options["capture.backupForRecapture"]) {
          const anchor = document.createElement('a');
          anchor.target = '_blank';
          anchor.textContent = timeId;
          capturer.log(`Moving old data files "${index}" to backup directory "`, anchor, `"...`);
          const response = await server.request({
            url: target + `?a=backup&ts=${timeId}&note=recapture&move=1`,
            method: "POST",
            format: 'json',
            csrfToken: true,
          }).then(r => r.json());
          if (book.backupUrl) {
            anchor.href = book.backupUrl + response.data + '/' +
              (book.dataUrl + scrapbook.quote(oldIndex)).slice(server.serverRoot.length);
          }
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
    },
  });

  await scrapbook.invokeExtensionScript({
    cmd: "background.onServerTreeChange",
  });

  return result;
};

/**
 * @param {Object} params
 * @return {Promise<captureDocumentResponse>}
 */
capturer.mergeCapture = async function ({
  tabId, frameId,
  url, refUrl,
  mode,
  settings: {
    fullPage,
    title,
    favIconUrl,
  } = {},
  options,
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
    callback: async (book, {updated}) => {
      await book.loadMeta(updated);
      const item = book.meta[itemId];
      if (!item) {
        throw new Error(`Merge capture reference item invalid: "${itemId}".`);
      }
      if (item.type !== 'site') {
        throw new Error(`Merge capture supports only site items.`);
      }
      if (item.locked) {
        throw new Error(scrapbook.lang("ErrorSaveLockedItem"));
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

      await capturer.loadSiteMap({sitemap, info, timeId, indexUrl});

      // enforce some capture options
      const depth = parseInt(options["capture.downLink.doc.depth"], 10);
      const settings = {
        timeId, fullPage, title, favIconUrl,
        documentName: null,

        // save to the same directory (strip "/index.html")
        indexFilename: item.index.slice(0, -11),

        // force item type to always rebuild links and update index.json
        type: item.type,
      };
      const presets = {
        // capture to server
        "capture.saveTo": "server",

        // only saving as folder can be effectively merged,
        // and prevents a conflict with different types
        "capture.saveAs": "folder",

        // overwrite existing files (if mapped to same path)
        "capture.saveOverwrite": true,
      };

      // enforce disk cache
      info.useDiskCache = true;

      result = await capturer.captureGeneral({
        tabId, frameId,
        url, refUrl,
        mode, settings, options, presets,
        bookId,
        captureOnly: true,
      });

      // update item meta
      capturer.log(`Updating server index for item "${itemId}"...`);
      await server.request({
        query: {
          a: 'query',
          lock: '',
        },
        body: {
          q: JSON.stringify({
            book: book.id,
            cmd: 'update_item',
            kwargs: {
              item: {id: item.id},
            },
          }),
          auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
        },
        method: 'POST',
        format: 'json',
        csrfToken: true,
      });

      // preserve info if error out
      capturer.captureInfo.delete(timeId);
      await capturer.clearFileCache({timeId});
    },
  });

  await scrapbook.invokeExtensionScript({
    cmd: "background.onServerTreeChange",
  });

  return result;
};

/**
 * @param {string} url
 * @param {string} role
 * @return {?string} the token, or null for an invalid URL
 */
capturer.getRegisterToken = function (url, role) {
  try {
    url = scrapbook.normalizeUrl(url);
  } catch (ex) {
    // invalid URL
    return null;
  }
  let token = `${url}\t${role}`;
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
 * @type invokable
 * @param {Object} params
 * @param {string} params.docUrl
 * @param {string} params.mime
 * @param {string} [params.role] - "document-*", "document" (headless)
 * @param {captureSettings} params.settings
 * @param {boolean} params.settings.isMainPage
 * @param {boolean} params.settings.isMainFrame
 * @param {string} params.settings.documentName
 * @param {captureOptions} params.options
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
    const {filenameMap, files} = capturer.captureInfo.get(timeId);

    const fetchResponse = await capturer.fetch({
      url: sourceUrl,
      headerOnly: true,
      settings,
      options,
    });

    let response;
    if (role || (isMainPage && isMainFrame)) {
      const token = capturer.getRegisterToken(sourceUrlMain, role);
      if (!token) {
        throw new Error(`Invalid document URL: ${sourceUrlMain}`);
      }

      // if a previous registry exists, return it
      const previousRegistry = filenameMap.get(token);
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
      filenameMap.set(token, response);
      Object.assign(files.get(documentFileName.toLowerCase()), {
        url: fetchResponse.url,
        role,
      });
    } else {
      const documentFileName = getDocumentFileName({
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
 * @type invokable
 * @param {string} params.url
 * @param {string} [params.role] - "resource", "css", "css-*" (dynamic)
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
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
    const {filenameMap, files} = capturer.captureInfo.get(timeId);

    const fetchResponse = await capturer.fetch({
      url: sourceUrl,
      headerOnly: true,
      settings,
      options,
    });

    let response;
    if (role) {
      const token = capturer.getRegisterToken(fetchResponse.url, role);
      if (!token) {
        throw new Error(`Invalid file URL: ${fetchResponse.url}`);
      }

      // if a previous registry exists, return it
      const previousRegistry = filenameMap.get(token);
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
      filenameMap.set(token, response);
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
  let filterText;
  let filters;
  const fn = capturer.downLinkFileExtFilter = (ext, options) => {
    // use the cache if the filter is not changed
    if (filterText !== options["capture.downLink.file.extFilter"]) {
      filterText = options["capture.downLink.file.extFilter"];
      try {
        filters = scrapbook.parseOption("capture.downLink.file.extFilter", filterText).ext;
      } catch (ex) {
        capturer.warn(`Ignored invalid capture.downLink.file.extFilter: ${ex.message}`);
        filters = [];
      }
    }

    if (typeof ext !== 'string') {
      return false;
    }
    return filters.some((filter) => {
      filter.lastIndex = 0;
      return filter.test(ext);
    });
  };
  return fn(ext, options);
};

capturer.downLinkFileMimeFilter = function (mime, options) {
  let filterText;
  let filters;
  const fn = capturer.downLinkFileMimeFilter = (mime, options) => {
    // use the cache if the filter is not changed
    if (filterText !== options["capture.downLink.file.extFilter"]) {
      filterText = options["capture.downLink.file.extFilter"];
      try {
        filters = scrapbook.parseOption("capture.downLink.file.extFilter", filterText).mime;
      } catch (ex) {
        capturer.warn(`Ignored invalid capture.downLink.file.extFilter: ${ex.message}`);
        filters = [];
      }
    }

    if (typeof mime !== 'string') {
      return false;
    }
    return filters.some((filter) => {
      filter.lastIndex = 0;
      return filter.test(mime);
    });
  };
  return fn(mime, options);
};

capturer.downLinkDocUrlFilter = function (url, options) {
  let filterText;
  let filters;
  const fn = capturer.downLinkDocUrlFilter = (url, options) => {
    // use the cache if the filter is not changed
    if (filterText !== options["capture.downLink.doc.urlFilter"]) {
      filterText = options["capture.downLink.doc.urlFilter"];
      try {
        filters = scrapbook.parseOption("capture.downLink.doc.urlFilter", filterText);
      } catch (ex) {
        capturer.warn(`Ignored invalid capture.downLink.doc.urlFilter: ${ex.message}`);
        filters = [];
      }
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

      filter.lastIndex = 0;
      return filter.test(matchUrl);
    });
  };
  return fn(url, options);
};

capturer.downLinkUrlFilter = function (url, options) {
  let filterText;
  let filters;
  const fn = capturer.downLinkUrlFilter = (url, options) => {
    // use the cache if the filter is not changed
    if (filterText !== options["capture.downLink.urlFilter"]) {
      filterText = options["capture.downLink.urlFilter"];
      try {
        filters = scrapbook.parseOption("capture.downLink.urlFilter", filterText);
      } catch (ex) {
        capturer.warn(`Ignored invalid capture.downLink.urlFilter: ${ex.message}`);
        filters = [];
      }
    }

    // match the URL without hash
    const matchUrl = scrapbook.splitUrlByAnchor(url)[0];

    return filters.some((filter) => {
      // plain text rule must match full URL
      if (typeof filter === 'string') {
        return filter === matchUrl;
      }

      filter.lastIndex = 0;
      return filter.test(matchUrl);
    });
  };
  return fn(url, options);
};

/**
 * @override
 * @type invokable
 * @param {Object} params
 * @param {Object} params.data
 * @param {transferableBlob} params.data.blob
 * @param {string} [params.data.title]
 * @param {string} [params.data.favIconUrl]
 * @param {string} params.documentFileName
 * @param {string} params.sourceUrl - may include hash
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<saveMainDocumentResponse|downloadBlobResponse|transferableBlob>}
 */
capturer.saveDocument = async function (params) {
  isDebug && console.debug("call: saveDocument", params);

  const {data, documentFileName, sourceUrl, settings, options} = params;
  const {isMainPage, isMainFrame} = settings;

  const downloadBlob = async () => {
    const blob = await capturer.loadBlobCache(data.blob);
    return await capturer.downloadBlob({
      blob,
      filename: documentFileName,
      sourceUrl,
      settings,
      options,
    });
  };

  if (!(isMainPage && isMainFrame)) {
    return await downloadBlob();
  }

  if (options["capture.saveAs"] !== "singleHtml") {
    await downloadBlob();
  }

  return capturer.saveMainDocument({data, sourceUrl, documentFileName, settings, options});
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
 * @type invokable
 * @param {Object} params
 * @param {Object} [params.data]
 * @param {transferableBlob} [params.data.blob]
 * @param {string} [params.data.title]
 * @param {string} [params.data.favIconUrl]
 * @param {string} params.sourceUrl - may include hash
 * @param {string} params.documentFileName
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<saveMainDocumentResponse|transferableBlob>}
 */
capturer.saveMainDocument = async function (params) {
  isDebug && console.debug("call: saveMainDocument", params);

  const {data = {}, sourceUrl, documentFileName, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId, type: itemType} = settings;

  const addIndexHtml = async (path, target, title) => {
    const meta = options["capture.recordDocumentMeta"] ?
        ' data-scrapbook-source="' + scrapbook.escapeHtml(scrapbook.normalizeUrl(sourceUrl)) + '"' +
        ' data-scrapbook-create="' + scrapbook.escapeHtml(timeId) + '"' +
        (settings.title ? ' data-scrapbook-title="' + scrapbook.escapeHtml(settings.title) + '"' : "") +
        (settings.favIconUrl ? ' data-scrapbook-icon="' + scrapbook.escapeHtml(settings.favIconUrl) + '"' : "") +
        (itemType ? ' data-scrapbook-type="' + scrapbook.escapeHtml(itemType) + '"' : "") :
        "";

    const html = `\
<!DOCTYPE html>
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
        return await capturer.saveBlobCache(blob, Infinity);
      }
      case 'file': {
        const downloadItem = await capturer.saveBlobNaturally({
          timeId,
          blob,
          filename,
          sourceUrl,
        });
        capturer.log(`Saved to "${downloadItem.filename}"`);
        filename = scrapbook.filepathParts(downloadItem.filename)[1];
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
        const runTask = async () => {
          while (taskIdx < entries.length) {
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
          }
        };

        await Promise.all(Array.from({length: workers}, () => runTask()));

        capturer.log(`Saved to "${targetDir}"`);

        break;
      }
      case 'folder':
      case 'file': // not supported, fallback to folder
      case 'memory': // not supported, fallback to folder
      default: {
        targetDir = options["capture.saveFolder"] + "/" + settings.indexFilename;

        let workers = options["capture.downloadWorkers"];
        if (!(workers >= 1)) { workers = Infinity; }
        workers = Math.min(workers, entries.length);

        const downloadItems = [];
        let taskIdx = 0;
        const saveEntry = async ([path, sourceUrl, blob]) => {
          try {
            return await capturer.saveBlob({
              timeId,
              blob,
              directory: targetDir,
              filename: path,
              sourceUrl,
              autoErase: path !== "index.html",
              savePrompt: false,
              conflictAction: "overwrite",
              settings,
              options,
            });
          } catch (ex) {
            // show message for individual saving error
            console.error(ex);
            capturer.error(scrapbook.lang("ErrorFileSaveError", [sourceUrl, path, ex.message]));
            return {filename: targetDir + "/" + path, error: {message: ex.message}};
          }
        };
        const runTask = async () => {
          while (taskIdx < entries.length) {
            const idx = taskIdx++;
            downloadItems[idx] = await saveEntry(entries[idx]);
          }
        };
        await Promise.all(Array.from({length: workers}, () => runTask()));

        const downloadItem = downloadItems.pop();
        if (downloadItem.error) {
          throw new Error(`Unable to save index.html`);
        }
        capturer.log(`Saved to "${downloadItem.filename}"`);
        filename = scrapbook.filepathParts(downloadItem.filename)[1];
        break;
      }
    }
  };

  // throw for unexpected item type
  if (!itemType) {
    throw new Error(`unexpected item type: ${JSON.stringify(itemType)}`);
  }

  capturer.captureInfo.get(timeId).indexPages.add(documentFileName);

  // handle in-depth capture
  if (itemType === 'site') {
    const sitemapPath = options["capture.saveAs"] === 'maff' ? `${timeId}/index.json` : 'index.json';

    await capturer.captureLinkedPages({settings, options});

    capturer.log('Rebuilding links...');
    await capturer.rebuildLinks({timeId, options});
    await capturer.dumpSiteMap({timeId, path: sitemapPath});
  }

  // save captured data to files
  capturer.log(`Saving data...`);
  const title = data.title || scrapbook.urlToFilename(sourceUrl);
  let saveAs = options["capture.saveAs"];
  let targetDir;
  let filename;
  let [basename, ext] = scrapbook.filenameParts(documentFileName);

  // special handling for bookmark (as a special case of singleHtml)
  if (itemType === 'bookmark') {
    saveAs = 'singleHtml';
    ext = 'htm';
  }

  switch (saveAs) {
    case "singleHtml": {
      let {blob} = data;
      blob = await capturer.loadBlobCache(blob);
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
      // create index.html that redirects to index.xhtml|.svg
      if (basename === "index" && ext !== "html") {
        await addIndexHtml(`${basename}.html`, documentFileName, title);
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
      // create index.html that redirects to index.xhtml|.svg
      if (basename === "index" && ext !== "html") {
        await addIndexHtml(`${timeId}/${basename}.html`, documentFileName, title);
      }

      // generate index.rdf
      const rdfContent = `\
<?xml version="1.0"?>
<RDF:RDF xmlns:MAF="http://maf.mozdev.org/metadata/rdf#"
         xmlns:NC="http://home.netscape.com/NC-rdf#"
         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<RDF:Description RDF:about="urn:root">
<MAF:originalurl RDF:resource="${scrapbook.escapeHtml(sourceUrl)}"/>
<MAF:title RDF:resource="${scrapbook.escapeHtml(data.title || '')}"/>
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
      filename = documentFileName;

      // create index.html that redirects to index.xhtml|.svg
      if (basename === "index" && ext !== "html") {
        filename = `${basename}.html`;
        await addIndexHtml(filename, documentFileName, title);
      }

      getTargetDirName: {
        const dir = scrapbook.filepathParts(settings.indexFilename)[0];
        const newFilename = await capturer.invoke("getAvailableSaveFilename", {
          filename: settings.indexFilename,
          options,
        });
        settings.indexFilename = (dir ? dir + '/' : '') + newFilename;
      }

      const entries = await capturer.loadFileCache({timeId});
      const rv = await saveEntries(entries);
      if (rv) { return rv; }

      break;
    }
  }

  return {
    timeId,
    title,
    type: itemType === 'document' ? '' : itemType,
    sourceUrl,
    targetDir,
    filename,
    url: scrapbook.escapeFilename(documentFileName),
    favIconUrl: data.favIconUrl,
  };
};

/**
 * @override
 * @type invokable
 * @param {Object} params
 * @param {string} params.url - may include hash
 * @param {string} [params.refUrl] - the referrer URL
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {Blob} [params.overrideBlob]
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<downloadBlobResponse>}
 */
capturer.downloadFile = async function (params) {
  isDebug && console.debug("call: downloadFile", params);

  const {url: sourceUrl, refUrl, refPolicy, overrideBlob, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  // special handling for data URI
  // if not to save as file, save as-is regardless of its MIME type
  if (sourceUrlMain.startsWith("data:")) {
    if (!(options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml")) {
      return {url: sourceUrlMain};
    }
  }

  // fetch first to ensure refUrl be handled
  const fetchResponse = await capturer.fetch({
    url: sourceUrlMain,
    refUrl,
    refPolicy,
    overrideBlob,
    settings,
    options,
  });

  if (fetchResponse.error) {
    throw new Error(fetchResponse.error.message);
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
 * @override
 * @type invokable
 * @param {Object} params
 * @param {string} params.url
 * @param {string} [params.refUrl]
 * @param {string} [params.refPolicy] - the referrer policy
 * @param {string} [params.envCharset] - the environment charset
 * @param {Blob} [params.overrideBlob]
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<fetchCssResponse>}
 */
capturer.fetchCss = async function (params) {
  isDebug && console.debug("call: fetchCss", params);

  const {url: sourceUrl, refUrl, refPolicy, envCharset, overrideBlob, settings, options} = params;
  const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
  const {timeId} = settings;

  const fetchResponse = await capturer.fetch({
    url: sourceUrlMain,
    refUrl,
    refPolicy,
    overrideBlob,
    settings,
    options,
  });

  if (fetchResponse.error) {
    throw new Error(fetchResponse.error.message);
  }

  return await scrapbook.parseCssFile(fetchResponse.blob, fetchResponse.headers.charset, envCharset);
};

/**
 * @typedef {Object} downloadBlobResponse
 * @property {string} [filename] - The downloaded filename.
 * @property {string} url - URL of the downloaded filename (without hash).
 */

/**
 * @type invokable
 * @param {Object} params
 * @param {transferableBlob} params.blob - may include charset
 * @param {string} [params.filename] - validated and unique; may be absent when
 *   saveAs = singleHtml
 * @param {string} params.sourceUrl
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<downloadBlobResponse|string>}
 */
capturer.downloadBlob = async function (params) {
  const makeDataUri = async (blob, filename) => {
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
  };

  const downloadBlob = capturer.downloadBlob = async function (params) {
    isDebug && console.debug("call: downloadBlob", params);

    const {filename, sourceUrl, settings, options} = params;
    let {blob} = params;
    const [sourceUrlMain, sourceUrlHash] = scrapbook.splitUrlByAnchor(sourceUrl);
    const {timeId} = settings;

    blob = await capturer.loadBlobCache(blob);

    // special handling for data URI
    // if not to save as file, convert the blob to a data URL
    if (sourceUrlMain.startsWith("data:")) {
      if (!(options["capture.saveDataUriAsFile"] && options["capture.saveAs"] !== "singleHtml")) {
        return await makeDataUri(blob, filename);
      }
    }

    switch (options["capture.saveAs"]) {
      case "singleHtml": {
        return await makeDataUri(blob, filename);
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

  return await downloadBlob(params);
};

/**
 * Download a blob in a way like default browser "save as".
 *
 * @param {Object} params
 * @param {string} params.timeId
 * @param {Blob} params.blob
 * @param {string} params.filename
 * @param {string} params.sourceUrl
 * @return {Promise<DownloadItem>} DownloadItem for the saved blob.
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

    const elem = document.createElement('a');
    elem.download = filename;
    elem.href = url;
    elem.textContent = `If the download doesn't start, click me.`;
    capturer.log(elem);
    elem.click();
  });
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

  // Firefox Android gets an error if saveAs = true
  if (scrapbook.userAgent.is('gecko') && scrapbook.userAgent.is('mobile')) {
    delete downloadParams.saveAs;
  }

  isDebug && console.debug("download start", downloadParams);

  // Firefox Android >= 79: browser.downloads.download() halts forever.
  // Add a timeout to catch it.
  const downloadId = await new Promise((resolve, reject) => {
    browser.downloads.download(downloadParams).then(resolve).catch(reject);
    setTimeout(() => reject(new Error(`Timeout for downloads.download()`)), 5000);
  });

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
 * @param {captureOptions} params.options
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
 * @param {captureSettings} params.settings
 * @param {captureOptions} params.options
 * @return {Promise<string>}
 */
capturer.captureLinkedPages = async function (params) {
  isDebug && console.debug("call: captureLinkedPages", params);

  const {settings, options} = params;
  const {timeId} = settings;

  const delay = options["capture.downLink.doc.delay"];
  const subSettings = Object.assign({}, settings, {
    isMainPage: false,
    isMainFrame: true,
    fullPage: true,
  });

  const {linkedPages, redirects} = capturer.captureInfo.get(timeId);
  for (const [sourceUrl, {url, refUrl, depth}] of linkedPages) {
    if (sourceUrl !== url) {
      redirects.set(sourceUrl, url);
    }

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
      downLinkPage: true,
      settings: subSettings,
      options,
    }).catch((ex) => {
      console.error(ex);
      capturer.error(`Subpage fatal error (${url}): ${ex.message}`);
      return {url: capturer.getErrorUrl(url, options), error: {message: ex.message}};
    });

    // add pages with depth 0 to indexPages
    if (depth === 0) {
      capturer.captureInfo.get(timeId).indexPages.add(response.filename);
    }

    if (delay > 0) {
      capturer.log(`Waiting for ${delay} ms...`);
      await scrapbook.delay(delay);
    }
  }
};

/**
 * @param {Object} params
 * @param {string} params.timeId
 * @param {captureOptions} params.options
 */
capturer.rebuildLinks = async function (params) {
  const rewriteUrl = (url, filenameMap, redirects) => {
    // assume a non-absolute URL to be already mapped
    if (!scrapbook.isUrlAbsolute(url)) {
      return null;
    }

    let [urlMain, urlHash] = scrapbook.splitUrlByAnchor(url);

    // handle possible redirect
    const redirectedUrl = redirects.get(urlMain);
    if (redirectedUrl) {
      [urlMain, urlHash] = scrapbook.splitUrlByAnchor(capturer.getRedirectedUrl(redirectedUrl, urlHash));
    }

    const token = capturer.getRegisterToken(urlMain, 'document');
    if (!token) {
      // skip invalid URL
      return null;
    }
    const p = filenameMap.get(token);
    if (!p) { return null; }

    return capturer.getRedirectedUrl(p.url, urlHash);
  };

  const rewriteHref = (elem, attr, filenameMap, redirects) => {
    const url = elem.getAttribute(attr);
    const newUrl = rewriteUrl(url, filenameMap, redirects);
    if (!newUrl) { return; }
    elem.setAttribute(attr, newUrl);
  };

  const rewriteMetaRefresh = (elem, filenameMap, redirects) => {
    const {time, url} = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
    if (!url) { return; }
    const newUrl = rewriteUrl(url, filenameMap, redirects);
    if (!newUrl) { return; }
    elem.setAttribute("content", `${time}; url=${newUrl}`);
  };

  const processRootNode = (rootNode, filenameMap, redirects) => {
    // rewrite links
    switch (rootNode.nodeName.toLowerCase()) {
      case 'svg': {
        for (const elem of rootNode.querySelectorAll('a[*|href]')) {
          for (const attr of REBUILD_LINK_SVG_HREF_ATTRS) {
            if (!elem.hasAttribute(attr)) { continue; }
            rewriteHref(elem, attr, filenameMap, redirects);
          }
        }
        break;
      }
      case 'math': {
        for (const elem of rootNode.querySelectorAll('[href]')) {
          rewriteHref(elem, 'href', filenameMap, redirects);
        }
        break;
      }
      case 'html':
      case '#document-fragment': {
        for (const elem of rootNode.querySelectorAll('a[href], area[href]')) {
          if (elem.closest('svg, math')) { continue; }
          if (elem.hasAttribute('download')) { continue; }
          rewriteHref(elem, 'href', filenameMap, redirects);
        }
        for (const elem of rootNode.querySelectorAll('meta[http-equiv="refresh" i][content]')) {
          rewriteMetaRefresh(elem, filenameMap, redirects);
        }
        for (const elem of rootNode.querySelectorAll('iframe[srcdoc]')) {
          const doc = (new DOMParser()).parseFromString(elem.srcdoc, 'text/html');
          processRootNode(doc.documentElement, filenameMap, redirects);
          elem.srcdoc = doc.documentElement.outerHTML;
        }
        for (const elem of rootNode.querySelectorAll('svg, math')) {
          processRootNode(elem, filenameMap, redirects);
        }
        break;
      }
    }

    // recurse into shadow roots
    for (const elem of rootNode.querySelectorAll('[data-scrapbook-shadowdom]')) {
      const shadowRoot = elem.attachShadow({mode: 'open'});
      shadowRoot.innerHTML = elem.getAttribute('data-scrapbook-shadowdom');
      processRootNode(shadowRoot, filenameMap, redirects);
      elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
    }
  };

  const rebuildLinks = capturer.rebuildLinks = async ({timeId, options}) => {
    const {files, filenameMap, redirects} = capturer.captureInfo.get(timeId);

    for (const [filename, {path, role, blob}] of files) {
      if (!blob) {
        continue;
      }

      if (!REBUILD_LINK_ROLE_PATTERN.test(role)) {
        continue;
      }

      const doc = await scrapbook.readFileAsDocument(blob);
      if (!doc) {
        capturer.warn(`Failed to rebuild links for file ${filename}: corrupted document.`);
        continue;
      }

      processRootNode(doc.documentElement, filenameMap, redirects);

      const content = scrapbook.documentToString(doc, options["capture.prettyPrint"]);
      await capturer.saveFileCache({
        timeId,
        path,
        blob: new Blob([content], {type: blob.type}),
      });
    }
  };

  return await rebuildLinks(params);
};

/**
 * @param {Object} params
 * @param {string} params.timeId - timeId of the capture
 * @param {string} params.path - path to save the sitemap
 */
capturer.dumpSiteMap = async function ({timeId, path}) {
  const version = 3;
  const {
    files, filenameMap,
    initialVersion, indexPages, redirects,
  } = capturer.captureInfo.get(timeId);

  const sitemap = {
    version,
    ...(initialVersion !== version && {initialVersion}),
    indexPages: [...indexPages],
    redirects: [...redirects],
    files: [],
  };

  for (let [filename, {path, url, role, token}] of files) {
    if (!token) {
      const t = capturer.getRegisterToken(url, role);
      if (t && filenameMap.has(t)) {
        token = t;
      }
    }

    // Don't record real URL for data:, blob:, etc.
    if (url) {
      if (!(url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:'))) {
        url = undefined;
      }
    }

    sitemap.files.push({
      path: path ? path.replace(/^.*\//, '') : filename,
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

/**
 * @param {Object} params
 * @param {Object} params.sitemap
 * @param {missionCaptureInfo} params.info
 * @param {string} params.timeId
 * @param {string} params.indexUrl
 */
capturer.loadSiteMap = async function (...args) {
  const loadFilenameMap = ({token, path, info}) => {
    info.filenameMap.set(token, {
      filename: path,
      url: scrapbook.escapeFilename(path),
    });
  };

  // load previously captured page to blob
  const loadPage = async ({path, url, role, timeId, indexUrl}) => {
    if (!REBUILD_LINK_ROLE_PATTERN.test(role)) {
      return;
    }

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
    }
  };

  const fn = capturer.loadSiteMap = async ({sitemap, info, timeId, indexUrl}) => {
    info.initialVersion = sitemap.initialVersion || sitemap.version;

    switch (sitemap.version) {
      case 1: {
        for (const {path, url, role, primary} of sitemap.files) {
          info.files.set(path, {
            url,
            role,
          });

          if (primary) {
            const token = capturer.getRegisterToken(url, role);
            if (!token) {
              // skip invalid or undefined URL
              continue;
            }

            loadFilenameMap({token, path, info});
            await loadPage({path, url, role, timeId, indexUrl});
          }
        }
        break;
      }
      case 2: {
        for (const indexPage of sitemap.indexPages) {
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
              if (!t) {
                // skip invalid URL
                continue;
              }
              if (t !== token) {
                token = t;
                console.error(`Taking token from url and role for mismatching token: "${path}"`);
              }
            }

            loadFilenameMap({token, path, info});
            await loadPage({path, url, role, timeId, indexUrl});
          }
        }
        break;
      }
      case 3: {
        for (const indexPage of sitemap.indexPages) {
          info.indexPages.add(indexPage);
        }
        for (const [sourceUrl, url] of (sitemap.redirects || [])) {
          if (sourceUrl !== url) {
            info.redirects.set(sourceUrl, url);
          }
        }
        for (let {path, url, role, token} of sitemap.files) {
          info.files.set(path.toLowerCase(), {
            path,
            url,
            role,
            token,
          });

          if (token) {
            // use url and role if token not matched
            // (possibly modified arbitrarily)
            if (url && role) {
              const t = capturer.getRegisterToken(url, role);
              if (!t) {
                // skip invalid URL
                continue;
              }
              if (t !== token) {
                token = t;
                console.error(`Taking token from url and role for mismatching token: "${path}"`);
              }
            }

            loadFilenameMap({token, path, info});
            await loadPage({path, url, role, timeId, indexUrl});
          }
        }
        break;
      }
      default: {
        throw new Error(`Sitemap version ${sitemap.version} not supported.`);
      }
    }
  };

  return await fn(...args);
};


/****************************************************************************
 * Events handling
 ***************************************************************************/

scrapbook.addMessageListener((message, sender) => {
  if (!message.cmd.startsWith("capturer.")) { return false; }
  if (message.id !== capturer.missionId) { return false; }
  return true;
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
    if (downloadDelta.state?.current === "complete") {
      const downloadItem = (await browser.downloads.search({id: downloadId}))[0];
      if (downloadItem) {
        downloadHooks.get(downloadId).onComplete(downloadItem);
      } else {
        // This should not happen.
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
      // eslint-disable-next-line no-fallthrough
      case "noerror": {
        if (capturer.logger.querySelector('.error')) {
          break;
        }
      }
      // eslint-disable-next-line no-fallthrough
      case "nofailure": {
        if (hasFailure) {
          break;
        }
      }
      // eslint-disable-next-line no-fallthrough
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
