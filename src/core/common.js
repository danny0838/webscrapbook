/******************************************************************************
 *
 * Shared utilities for most background and content scripts.
 *
 * @require {Object} browser
 * @public {boolean} isDebug
 * @public {Object} scrapbook
 *****************************************************************************/

/**
 * Polyfills
 */

// Polyfill for Firefox < 53
// As shadowRoot is not supported, we can simply skip implementing options.
if (Node && !Node.prototype.getRootNode) {
  Node.prototype.getRootNode = function getRootNode(options) {
    var current = this, parent;
    while (parent = current.parentNode) {
      current = parent;
    }
    return current;
  };
}

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('scrapbook')) { return; }
  root.scrapbook = factory(
    root.isDebug,
    root.browser,
    root.JSZip,
    root.jsSHA,
    root.Mime,
    window,
    console,
    crypto,
    navigator,
  );
}(this, function (isDebug, browser, JSZip, jsSHA, Mime, window, console, crypto, navigator) {

  'use strict';

  const BACKEND_MIN_VERSION = '0.23.0';

  const DEFAULT_OPTIONS = {
    "ui.showContextMenu": true,
    "server.url": "",
    "server.user": "",
    "server.password": "",
    "capture.serverUploadWorkers": 4,
    "capture.serverUploadRetryCount": 2,
    "capture.serverUploadRetryDelay": 2000,
    "capture.saveTo": "folder", // "server", "folder", "memory"
    "capture.saveFolder": "WebScrapBook/data",
    "capture.saveAs": "folder", // "folder", "zip", "maff", "singleHtml"
    "capture.saveFilename": "%ID%",
    "capture.saveAsciiFilename": false,
    "capture.saveFileAsHtml": false,
    "capture.saveDataUriAsFile": true,
    "capture.saveDataUriAsSrcdoc": true,
    "capture.autoCloseDialog": false,
    "capture.resourceSizeLimit": null,
    "capture.image": "save", // "save", "save-current", "link", "blank", "remove"
    "capture.imageBackground": "save-used", // "save", "save-used", "link", "blank"
    "capture.favicon": "save", // "save", "link", "blank", "remove"
    "capture.canvas": "save", // "save", "blank", "remove"
    "capture.audio": "save", // "save", "save-current", "link", "blank", "remove"
    "capture.video": "save", // "save", "save-current", "link", "blank", "remove"
    "capture.embed": "blank", // "save", "link", "blank", "remove"
    "capture.object": "blank", // "save", "link", "blank", "remove"
    "capture.applet": "blank", // "save", "link", "blank", "remove"
    "capture.frame": "save", // "save", "link", "blank", "remove"
    "capture.frameRename": true,
    "capture.font": "save-used", // "save", "save-used", "link", "blank"
    "capture.style": "save", // "save", "link", "blank", "remove"
    "capture.styleInline": "save", // "save", "blank", "remove"
    "capture.rewriteCss": "url", // "none", "url", "tidy", "match"
    "capture.mergeCssResources": true,
    "capture.script": "remove", // "save", "link", "blank", "remove"
    "capture.noscript": "save", // "save", "blank", "remove"
    "capture.base": "blank", // "save", "blank", "remove"
    "capture.formStatus": "keep", // "keep", "reset"
    "capture.shadowDom": "save", // "save", "remove"
    "capture.removeHidden": "none", // "none", "undisplayed"
    "capture.linkUnsavedUri": false,
    "capture.downLink.mode": "none", // "none", "url", "header"
    "capture.downLink.extFilter": "###image\n#bmp, gif, ico, jpg, jpeg, jpe, jp2, png, tif, tiff, svg\n###audio\n#aac, ape, flac, mid, midi, mp3, ogg, oga, ra, ram, rm, rmx, wav, wma\n###video\n#avc, avi, flv, mkv, mov, mpg, mpeg, mp4, wmv\n###archive\n#zip, rar, jar, bz2, gz, tar, rpm, 7z, 7zip, xz, jar, xpi, lzh, lha, lzma\n#/z[0-9]{2}|r[0-9]{2}/\n###document\n#pdf, doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, odg, odf, rtf, txt, csv\n###executable\n#exe, msi, dmg, bin, xpi, iso\n###any non-web-page\n#/(?!$|html?|xht(ml)?|php|py|pl|aspx?|cgi|jsp)(.*)/i",
    "capture.downLink.urlFilter": "###skip common logout URL\n/[/=]logout\\b/i",
    "capture.removeIntegrity": true,
    "capture.requestReferrer": "auto", // "none", "auto", "origin", "all"
    "capture.recordDocumentMeta": true,
    "capture.recordRewrites": false,
    "capture.insertInfoBar": false,
    "capture.helpersEnabled": false,
    "capture.helpers": "",
    "capture.remoteTabDelay": null,
    "capture.deleteErasedOnCapture": true,
    "capture.deleteErasedOnSave": false,
    "capture.backupForRecapture": true,
    "editor.autoInit": true,
    "editor.useNativeTags": false,
    "editor.lineMarker.style.1": "background: #FFFF00; background: linear-gradient(transparent 40%, rgba(255,255,0,0.9) 90%, transparent 100%);",
    "editor.lineMarker.style.2": "background: #00FF00; background: linear-gradient(transparent 40%, rgba(0,255,0,0.9) 90%, transparent 100%);",
    "editor.lineMarker.style.3": "background: #FF0000; background: linear-gradient(transparent 40%, rgba(255,0,0,0.9) 90%, transparent 100%);",
    "editor.lineMarker.style.4": "background: #0000FF; background: linear-gradient(transparent 40%, rgba(0,0,255,0.9) 90%, transparent 100%);",
    "editor.lineMarker.style.5": "background-color: #FFFF7C; color: black;",
    "editor.lineMarker.style.6": "background-color: #93EF8D; color: black;",
    "editor.lineMarker.style.7": "background-color: #FFBBB6; color: black;",
    "editor.lineMarker.style.8": "background-color: #95D0FF; color: black;",
    "editor.lineMarker.style.9": "background-color: #FFFF99; color: #000000; border: thin dashed #FFCC00;",
    "editor.lineMarker.style.10": "background-color: #CCFFFF; color: #000000; border: thin solid #0099FF;",
    "editor.lineMarker.style.11": "background-color: #EE3311; color: #FFFFFF; font-weight: bold;",
    "editor.lineMarker.style.12": "border-bottom: 2px dotted #FF0000;",
    "editor.insertDateFormat": "%Y-%m-%d %H:%M:%S",
    "viewer.viewHtz": true,
    "viewer.viewMaff": true,
    "indexer.createStaticSite": false,
    "indexer.createStaticIndex": false,
    "indexer.createRssFeed": false,
    "indexer.createRssFeedBase": "",
    "indexer.createRssFeedCount": 50,
    "indexer.fulltextCache": true,
    "indexer.fulltextCacheFrameAsPageContent": true,
    "indexer.fulltextCacheRecreate": false,
    "indexer.makeBackup": false,
    "checker.resolveInvalidId": true,
    "checker.resolveMissingIndex": true,
    "checker.resolveMissingIndexFile": true,
    "checker.resolveMissingDate": true,
    "checker.resolveOlderMtime": false,
    "checker.resolveTocUnreachable": true,
    "checker.resolveTocInvalid": true,
    "checker.resolveTocEmptySubtree": true,
    "checker.resolveUnindexedFiles": true,
    "checker.resolveAbsoluteIcon": true,
    "checker.resolveUnusedIcon": true,
    "checker.makeBackup": true,
    "scrapbook.notifyPageCaptured": false,
    "scrapbook.defaultSearch": "-type:folder -type:separator",
    "scrapbook.fulltextCacheRemoteSizeLimit": null,
    "scrapbook.fulltextCacheUpdateThreshold": 5 * 24 * 60 * 60 * 1000,
  };

  const CONTENT_SCRIPT_FILES = [
    "/lib/browser-polyfill.js",
    "/lib/mime.js",
    "/lib/sha_dev.js",
    "/lib/deferred.js",
    "/lib/map-with-default.js",
    "/lib/strftime.js",
    "/core/common.js",
    "/core/optionsAuto.js",
    "/core/content.js",
    "/capturer/common.js",
    "/editor/content.js",
    ];

  const HTTP_STATUS_TEXT = {
    // 1××: Informational
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",

    // 2××: Success
    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    207: "Multi-Status",
    208: "Already Reported",
    226: "IM Used",

    // 3××: Redirection
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    306: "Switch Proxy",
    307: "Temporary Redirect",
    308: "Permanent Redirect",

    // 4××: Client Errors
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Payload Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    418: "I'm a teapot",
    421: "Misdirected Request",
    422: "Unprocessable Entity",
    423: "Locked",
    424: "Failed Dependency",
    426: "Upgrade Required",
    428: "Precondition Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    451: "Unavailable For Legal Reasons",

    // 5××: Server Errors
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
    506: "Variant Also Negotiates",
    507: "Insufficient Storage",
    508: "Loop Detected",
    510: "Not Extended",
    511: "Network Authentication Required",
  };

  const ANNOTATION_CSS = `\
[data-scrapbook-elem="linemarker"][title] {
  cursor: help;
}
[data-scrapbook-elem="sticky"] {
  display: block;
  overflow: auto;
}
[data-scrapbook-elem="sticky"].styled {
  position: absolute;
  z-index: 500000;
  opacity: .95;
  box-sizing: border-box;
  margin: 0;
  border: 1px solid #CCCCCC;
  border-top-width: 1.25em;
  border-radius: .25em;
  padding: .25em;
  min-width: 6em;
  min-height: 4em;
  background: #FAFFFA;
  box-shadow: .15em .15em .3em black;
  font: .875em/1.2 sans-serif;
  color: black;
  overflow-wrap: break-word;
  cursor: help;
}
[data-scrapbook-elem="sticky"].styled.relative {
  position: relative;
  margin: 16px auto;
}
[data-scrapbook-elem="sticky"].styled.plaintext {
  white-space: pre-wrap;
}
[data-scrapbook-elem="sticky"].dragging {
  opacity: .75;
  z-index: 2147483641;
}
`;

  const scrapbook = {
    BACKEND_MIN_VERSION,
    ANNOTATION_CSS,

    /**
     * scrapbook.userAgent
     *
     * ref: source code of vAPI.webextFlavor of uBlock Origin
     */
    get userAgent() {
      const ua = navigator.userAgent;
      const manifest = browser.runtime.getManifest();

      const soup = new Set(['webext']);
      const flavor = {
        major: 0,
        soup: soup,
        is: (value) => soup.has(value),
      };

      const dispatch = function() {
        window.dispatchEvent(new CustomEvent('browserInfoLoaded'));
      };

      // Whether this is a dev build.
      if (/^\d+\.\d+\.\d+\D/.test(browser.runtime.getManifest().version)) {
        soup.add('devbuild');
      }

      if (/\bMobile\b/.test(ua)) {
        soup.add('mobile');
      }

      // Asynchronous -- more accurate detection for Firefox
      (async () => {
        try {
          const info = await browser.runtime.getBrowserInfo();
          flavor.major = parseInt(info.version, 10) || 0;
          soup.add(info.vendor.toLowerCase());
          soup.add(info.name.toLowerCase());
        } catch (ex) {
          // dummy event for potential listeners
          dispatch();
        }
      })();

      // Synchronous -- order of tests is important
      let match;
      if ((match = /\bFirefox\/(\d+)/.exec(ua)) !== null) {
        flavor.major = parseInt(match[1], 10) || 0;
        soup.add('mozilla').add('firefox');
      } else if ((match = /\bEdge\/(\d+)/.exec(ua)) !== null) {
        flavor.major = parseInt(match[1], 10) || 0;
        soup.add('microsoft').add('edge');
      } else if ((match = /\bOPR\/(\d+)/.exec(ua)) !== null) {
        const reEx = /\bChrom(?:e|ium)\/([\d.]+)/;
        if (reEx.test(ua)) { match = reEx.exec(ua); }
        flavor.major = parseInt(match[1], 10) || 0;
        soup.add('opera').add('chromium');
      } else if ((match = /\bChromium\/(\d+)/.exec(ua)) !== null) {
        flavor.major = parseInt(match[1], 10) || 0;
        soup.add('chromium');
      } else if ((match = /\bChrome\/(\d+)/.exec(ua)) !== null) {
        flavor.major = parseInt(match[1], 10) || 0;
        soup.add('google').add('chromium');
      } else if ((match = /\bSafari\/(\d+)/.exec(ua)) !== null) {
        flavor.major = parseInt(match[1], 10) || 0;
        soup.add('apple').add('safari');
      }

      if (manifest.browser_specific_settings && manifest.browser_specific_settings.gecko) {
        soup.add('gecko');
      }

      Object.defineProperty(this, 'userAgent', { value: flavor });
      return flavor;
    },

  };

  /****************************************************************************
   * Options
   ***************************************************************************/

  scrapbook.options = DEFAULT_OPTIONS;
  scrapbook.isOptionsSynced = false;

  /**
   * - Firefox < 52: browser.storage.sync === undefined
   *
   * - Firefox 52: webextensions.storage.sync.enabled is default to false,
   *   and browser.storage.sync.*() gets an error.
   *
   * - Firefox >= 53: webextensions.storage.sync.enabled is default to true,
   *   and browser.storage.sync.*() works.
   *
   * An error would occur if the user manually sets
   * webextensions.storage.sync.enabled to false without restarting Firefox.
   * We don't (and probably cannot) support such user operation since we
   * cannot migrate configs from storage.sync to storage.local when it gets
   * disabled, and we get an inconsistent status if we simply shift configs
   * from storage.sync to storage.local.
   */
  scrapbook.getOptionStorage = async function () {
    const storage = (async () => {
      if (!browser.storage.sync) {
        return browser.storage.local;
      }
      try {
        await browser.storage.sync.get({});
        return browser.storage.sync;
      } catch (ex) {
        return browser.storage.local;
      }
    })();
    scrapbook.getOptionStorage = () => storage;
    return storage;
  };

  /**
   * run scrapbook.loadOptions before calling this
   */
  scrapbook.getOption = function (key, defaultValue) {
    if (!scrapbook.isOptionsSynced) {
      throw new Error('Options not synced yet.');
    }

    let result = scrapbook.options[key];
    if (result === undefined) {
      result = defaultValue;
    }
    return result;
  };

  /**
   * run scrapbook.loadOptions before calling this
   */
  scrapbook.getOptions = function (keyPrefix) {
    if (!scrapbook.isOptionsSynced) {
      throw new Error('Options not synced yet.');
    }

    let result = {};
    let regex = new RegExp("^" + scrapbook.escapeRegExp(keyPrefix) + "\.");
    for (let key in scrapbook.options) {
      if (regex.test(key)) {
        result[key] = scrapbook.getOption(key);
      }
    }
    return result;
  };

  scrapbook.setOption = async function (key, value) {
    scrapbook.options[key] = value;
    const storage = await scrapbook.getOptionStorage();
    return await storage.set({[key]: value});
  };

  /**
   * load all options and store in scrapbook.options for later usage
   */
  scrapbook.loadOptions = async function () {
    const storage = await scrapbook.getOptionStorage();
    const items = await storage.get(scrapbook.options);
    for (let i in items) {
      scrapbook.options[i] = items[i];
    }
    scrapbook.isOptionsSynced = true;
    return items;
  };

  scrapbook.saveOptions = async function () {
    const storage = await scrapbook.getOptionStorage();
    return await storage.set(scrapbook.options);
  };


  /****************************************************************************
   * Cache system
   *
   * - IndexedDb is powerful but more restricted (not available for a content
   *   script and a Firefox private window, and not shared with an incognito
   *   window in Chromium). Arbitrarily use storage if needed.
   * - Storage API does not support storing a Blob or File in Firefox < 56 and
   *   Chromium. A shim with byte-string based object is implemented, but it's
   *   not performant and should thus be avoided whenever possible.
   * - By default, use indexedDB for Chromium and storage API for Firefox, due
   *   to above reasons.
   ***************************************************************************/

  scrapbook.cache = {
    _current: 'auto',

    get current() {
      if (this._current === 'auto') {
        if (scrapbook.userAgent.is('gecko')) {
          this._current = 'storage';
        } else {
          this._current = 'indexedDB';
        }
      }
      return this._current;
    },

    set current(value) {
      this._current = value;
    },

    async _escapeObject(obj) {
      if (obj instanceof File) {
        return {
          __type__: 'File',
          name: obj.name,
          type: obj.type,
          lastModified: obj.lastModified,
          data: await scrapbook.readFileAsText(obj, false),
        };
      } else if (obj instanceof Blob) {
        return {
          __type__: 'Blob',
          type: obj.type,
          data: await scrapbook.readFileAsText(obj, false),
        };
      }
      return obj;
    },

    _unescapeObject(obj) {
      try {
        switch (obj.__type__) {
          case "File": {
            return new File(
              [scrapbook.byteStringToArrayBuffer(obj.data)],
              obj.name,
              {type: obj.type, lastModified: obj.lastModified}
            );
          }
          case "Blob": {
            return new Blob(
              [scrapbook.byteStringToArrayBuffer(obj.data)],
              {type: obj.type}
            );
          }
        }
      } catch (ex) {}
      return obj;
    },

    _filterByObject(filter, obj) {
      for (let cond in filter) {
        if (obj[cond] !== filter[cond]) {
          return false;
        }
      }
      return true;
    },

    /**
     * @param {string|Object} key
     */
    async get(key, cache = this.current) {
      const keyStr = (typeof key === "string") ? key : JSON.stringify(key);
      return this[cache].get(keyStr);
    },

    /**
     * @param {Object|Function|string} filter
     */
    async getAll(filter, cache = this.current) {
      if (typeof filter === 'function') {
        // use unchanged filter
      } else if (typeof filter === 'object') {
        filter = this._filterByObject.bind(this, filter);
      } else if (typeof filter === 'string') {
        filter = this._filterByObject.bind(this, JSON.parse(filter));
      } else {
        // unsupported type
        filter = this._filterByObject.bind(this, {});
      }
      return this[cache].getAll(filter);
    },

    /**
     * @param {string|Object} key
     */
    async set(key, value, cache = this.current) {
      const keyStr = (typeof key === "string") ? key : JSON.stringify(key);
      return this[cache].set(keyStr, value);
    },

    /**
     * @param {string|Object|Array} keys - a key (string or Object) or an array of keys
     */
    async remove(keys, cache = this.current) {
      if (!Array.isArray(keys)) { keys = [keys]; }
      keys = keys.map((key) => {
        return (typeof key === "string") ? key : JSON.stringify(key);
      });
      return this[cache].remove(keys);
    },

    storage: {
      get _escapeObjectNeeded() {
        delete this._escapeObjectNeeded;
        return this._escapeObjectNeeded = 
            (scrapbook.userAgent.major < 56 && scrapbook.userAgent.is('gecko')) || 
            scrapbook.userAgent.is('chromium');
      },

      async _escapeObject(obj) {
        // In Firefox < 56 and Chromium,
        // Blob cannot be stored in browser.storage,
        // fallback to an object containing byte string data.
        if (this._escapeObjectNeeded) {
          return await scrapbook.cache._escapeObject(obj);
        }

        // otherwise return the original object
        return obj;
      },

      _unescapeObject(obj) {
        return scrapbook.cache._unescapeObject(obj);
      },

      async get(key) {
        const items = await browser.storage.local.get(key);
        return this._unescapeObject(items[key]);
      },

      async getAll(filter) {
        const items = await browser.storage.local.get(null);
        for (let key in items) {
          try {
            let obj = JSON.parse(key);
            if (!filter(obj)) {
              throw new Error("filter not matched");
            }
            items[key] = this._unescapeObject(items[key]);
          } catch (ex) {
            // invalid JSON format => meaning not a cache
            // or does not match the filter
            delete(items[key]);
          }
        }
        return items;
      },

      async set(key, value) {
        return await browser.storage.local.set({[key]: await this._escapeObject(value)});
      },

      async remove(keys) {
        return await browser.storage.local.remove(keys);
      },
    },

    indexedDB: {
      async connect() {
        const p = new Promise((resolve, reject) => {
          const request = indexedDB.open("scrapbook", 2);
          request.onupgradeneeded = (event) => {
            let db = event.target.result;
            if (event.oldVersion === 1) {
              db.deleteObjectStore("archiveZipFiles");
            }
            db.createObjectStore("cache", {keyPath: "key"});
          };
          request.onblocked = (event) => {
            reject("Upgrade of the indexedDB is blocked by another connection.");
          };
          request.onsuccess = (event) => {
            resolve(event.target.result);
          };
          request.onerror = (event) => {
            reject(event.target.error);
          };
        });
        this.connect = () => p;
        return p;
      },

      async get(key) {
        const db = await this.connect();
        const transaction = db.transaction("cache", "readonly");
        const objectStore = transaction.objectStore(["cache"]);

        return await new Promise((resolve, reject) => {
          const request = objectStore.get(key);
          request.onsuccess = function (event) {
            const result = event.target.result;
            resolve(result ? result.value : undefined);
          };
          request.onerror = function (event) {
            reject(event.target.error);
          };
        });
      },

      async getAll(filter) {
        const db = await this.connect();
        const transaction = db.transaction("cache", "readonly");
        const objectStore = transaction.objectStore(["cache"]);

        return await new Promise((resolve, reject) => {
          const request = objectStore.getAll();
          request.onsuccess = function (event) {
            const items = event.target.result;
            const result = {};
            for (let item of items) {
              try {
                let obj = JSON.parse(item.key);
                if (!filter(obj)) {
                  throw new Error("filter not matched");
                }
                result[item.key] = item.value;
              } catch (ex) {
                // invalid JSON format => meaning not a cache
                // or does not match the filter
              }
            }
            resolve(result);
          };
          request.onerror = function (event) {
            reject(event.target.error);
          };
        });
      },

      async set(key, value) {
        const db = await this.connect();

        return await new Promise((resolve, reject) => {
          const transaction = db.transaction("cache", "readwrite");
          const objectStore = transaction.objectStore(["cache"]);
          const request = objectStore.add({key, value});
          transaction.oncomplete = (event) => {
            resolve();
          };
          transaction.onerror = (event) => {
            reject(event.target.error);
          };
        });
      },

      async remove(keys) {
        const db = await this.connect();

        const transaction = db.transaction("cache", "readwrite");
        const objectStore = transaction.objectStore(["cache"]);
        const tasks = keys.map((key) => {
          return new Promise((resolve, reject) => {
            const request = objectStore.delete(key);
            request.onsuccess = function (event) {
              resolve();
            };
            request.onerror = function (event) {
              reject(event.target.error);
            };
          });
        });
        return await Promise.all(tasks).catch((ex) => {
          transaction.abort();
          throw ex;
        });
      },
    },

    sessionStorage: {
      async _escapeObject(obj) {
        return await scrapbook.cache._escapeObject(obj);
      },

      _unescapeObject(obj) {
        return scrapbook.cache._unescapeObject(obj);
      },

      async get(key) {
        return this._unescapeObject(JSON.parse(sessionStorage.getItem(key)));
      },

      async getAll(filter) {
        const items = [];
        for (var i = 0, I = sessionStorage.length; i < I; i++) {
          const key = sessionStorage.key(i);
          try {
            let obj = JSON.parse(key);
            if (!filter(obj)) {
              throw new Error("filter not matched");
            }
            items[key] = this._unescapeObject(JSON.parse(sessionStorage.getItem(key)));
          } catch (ex) {
            // invalid JSON format => meaning not a cache
            // or does not match the filter
          }
        }
        return items;
      },

      async set(key, value) {
        return sessionStorage.setItem(key, JSON.stringify(await this._escapeObject(value)));
      },

      async remove(keys) {
        for (const key of keys) {
          sessionStorage.removeItem(key);
        }
      },
    },
  };


  /****************************************************************************
   * Lang
   ***************************************************************************/

  scrapbook.lang = function (key, args) {
    return browser.i18n.getMessage(key, args) || "__MSG_" + key + "__";
  };

  scrapbook.loadLanguages = function (rootNode) {
    Array.prototype.forEach.call(rootNode.querySelectorAll('*'), (elem) => {
      if (elem.childNodes.length === 1) {
        let child = elem.firstChild;
        if (child.nodeType === 3) {
          child.nodeValue = child.nodeValue.replace(/__MSG_(.*?)__/, (m, k) => scrapbook.lang(k));
        }
      }
      Array.prototype.forEach.call(elem.attributes, (attr) => {
        attr.nodeValue = attr.nodeValue.replace(/__MSG_(.*?)__/, (m, k) => scrapbook.lang(k));
      }, this);
    }, this);
  };


  /****************************************************************************
   * ScrapBook messaging
   ***************************************************************************/

  /**
   * Init content scripts in the specified tab.
   *
   * @param {integer} tabId - The tab's ID to init content script.
   * @return {Promise<Object>}
   */
  scrapbook.initContentScripts = async function (tabId) {
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
      tasks.push(
        browser.tabs.sendMessage(tabId, {cmd: "core.isScriptLoaded"}, {frameId})
          .catch(async (ex) => {
            isDebug && console.debug("inject content scripts", tabId, frameId, url);
            try {
              for (const file of CONTENT_SCRIPT_FILES) {
                await browser.tabs.executeScript(tabId, {frameId, file, runAt: "document_start"});
              }
              await browser.tabs.executeScript(tabId, {frameId, code: `core.frameId = ${frameId};`, runAt: "document_start"});
            } catch (ex) {
              // Chromium may fail to inject content script to some pages due to unclear reason.
              // Record the error and pass.
              console.error(ex);
              return ex.message;
            }
          })
          .then((response) => {
            const result = {
              tabId,
              frameId,
              url,
              injected: true,
            };
            if (response === true) {
              result.injected = false;
            } else if (typeof response === "string") {
              result.injected = false;
              result.error = response;
            }
            return result;
          })
      );
    });
    return await Promise.all(tasks);
  };

  /**
   * Invoke an invokable command in the extension script.
   *
   * @param {Object} params
   * @param {string} params.id
   * @param {string} params.cmd
   * @param {Object} [params.args]
   * @return {Promise<Object>}
   */
  scrapbook.invokeExtensionScript = async function (params) {
    const {id, cmd, args} = params;

    isDebug && console.debug(cmd, "send to extension page", args);
    const response = await browser.runtime.sendMessage({id, cmd, args});
    isDebug && console.debug(cmd, "response from extension page", response);
    return response;
  };

  /**
   * Invoke an invokable command in the content script.
   *
   * @param {Object} params
   * @param {integer} params.tabId
   * @param {integer} params.frameId
   * @param {string} params.cmd
   * @param {Object} [params.args]
   * @return {Promise<Object>}
   */
  scrapbook.invokeContentScript = async function (params) {
    const {tabId, frameId, cmd, args} = params;

    isDebug && console.debug(cmd, "send to content script", `[${tabId}:${frameId}]`, args);
    const response = await browser.tabs.sendMessage(tabId, {cmd, args}, {frameId});
    isDebug && console.debug(cmd, "response from content script", `[${tabId}:${frameId}]`, response);
    return response;
  };

  /**
   * Invoke an invokable command in a frame.
   *
   * @param {Object} params
   * @param {integer} params.frameWindow
   * @param {string} params.cmd
   * @param {Object} [params.args]
   * @return {Promise<Object>}
   */
  scrapbook.invokeFrameScript = async function (params) {
    const {frameWindow, cmd, args} = params;

    const frameId = await new Promise((resolve, reject) => {
      const extension = browser.runtime.getURL('');
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        resolve(undefined);
        channel.port1.close();
      }, 1000);
      channel.port1.onmessage = (event) => {
        const {frameId} = event.data;
        resolve(frameId);
        channel.port1.close();
        clearTimeout(timeout);
      };
      frameWindow.postMessage(extension, "*", [channel.port2]);
    });

    if (frameId) {
      return await scrapbook.invokeExtensionScript({
        cmd: "background.invokeFrameScript",
        args: {frameId, cmd, args},
      });
    }
  };


  /****************************************************************************
   * ScrapBook related path/file/string/etc handling
   ***************************************************************************/

  /**
   * Escapes the given filename (may contain '/') string to be used in the URI
   *
   * Preserves non-URL-functional chars for beauty.
   *
   * decodeURIComponent do the inverse to convert a relative URL to filename.
   *
   * see also: validateFilename
   */
  scrapbook.escapeFilename = function (filename) {
    return filename.replace(/\\/g, '/').replace(/[ %#]+/g, m => encodeURIComponent(m));
  };

  /**
   * Escapes the given filename (may contain '/') string to be used in a canonical URI
   */
  scrapbook.quote = function (filename) {
    return filename.replace(/[^\/]+/g, m => encodeURIComponent(m));
  };

  /**
   * Transliterates the given string to be a safe filename
   *
   * see also: escapeFileName
   *
   * @param {string} filename
   * @param {boolean} [forceAscii] - also escapes all non-ASCII chars
   */
  scrapbook.validateFilename = function (filename, forceAscii) {
    let fn = filename
        // control chars are bad for filename
        .replace(/[\x00-\x1F\x7F]+/g, "")
        // leading/trailing spaces and dots are not allowed on Windows
        .replace(/^\./, "_.").replace(/^ +/, "").replace(/[. ]+$/, "")
        // bad chars on most OS
        .replace(/[:"?*\\/|]/g, "_")
        // bad chars on Windows, replace with adequate direction
        .replace(/[<]/g, "(").replace(/[>]/g, ")")
        // "~" is not allowed by browser.downloads
        .replace(/[~]/g, "-");
    if (forceAscii) {
      fn = fn.replace(/[^\x00-\x7F]+/g, m => encodeURIComponent(m));
    }
    fn = fn || "_"; // prevent empty filename
    return fn;
  };

  /**
   * Returns the ScrapBook ID from a given Date object
   *
   * @param  {Date} [date] - Given day, or now if not provided.
   * @return {string} the ScrapBook ID
   */
  scrapbook.dateToId = function (date) {
    let dd = date || new Date();
    return dd.getUTCFullYear() +
        this.intToFixedStr(dd.getUTCMonth() + 1, 2) +
        this.intToFixedStr(dd.getUTCDate(), 2) +
        this.intToFixedStr(dd.getUTCHours(), 2) +
        this.intToFixedStr(dd.getUTCMinutes(), 2) +
        this.intToFixedStr(dd.getUTCSeconds(), 2) +
        this.intToFixedStr(dd.getUTCMilliseconds(), 3);
  };

  /**
   * @param {Date} id - Given ScrapBook ID
   */
  scrapbook.idToDate = function (id) {
    let dd;
    if (/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/.test(id)) {
      dd = new Date(
          parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
          parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10), parseInt(RegExp.$7, 10)
          );
      dd.setTime(dd.valueOf() - dd.getTimezoneOffset() * 60 * 1000);
    }
    return dd;
  };

  /**
   * Returns the legacy ScrapBook ID from a given Date object
   *
   * @deprecated Used by legacy ScrapBook. Inaccurate when used across timezone. Same seconds issue.
   * @param {Date} [date] - Given day, or now if not provided.
   * @return {string} the ScrapBook ID
   */
  scrapbook.dateToIdOld = function (date) {
    let dd = date || new Date();
    return dd.getFullYear() +
        this.intToFixedStr(dd.getMonth() + 1, 2) +
        this.intToFixedStr(dd.getDate(), 2) +
        this.intToFixedStr(dd.getHours(), 2) +
        this.intToFixedStr(dd.getMinutes(), 2) +
        this.intToFixedStr(dd.getSeconds(), 2);
  };

  /**
   * @deprecated See scrapbook.dateToIdOld for details.
   * @param {Date} id - Given ScrapBook ID
   */
  scrapbook.idToDateOld = function (id) {
    let dd;
    if (/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.test(id)) {
      dd = new Date(
          parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
          parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10)
          );
    }
    return dd;
  };

  /**
   * @param {string} url
   * @param {boolean} [allowFileAccess] - Optional for better accuracy.
   * @return {string} Whether the page url is allowed for content scripts.
   */
  scrapbook.isContentPage = function (url, allowFileAccess = !scrapbook.userAgent.is('gecko')) {
    const filter = new RegExp(`^(?:https?${allowFileAccess ? "|file" : ""}):`);
    if (!filter.test(url)) { return false; }
    return true;
  };


  /****************************************************************************
   * ScrapBook related DOM handling
   ***************************************************************************/

  /**
   * - Markings
   *   linemarker (span) (since SB, SBX)
   *   inline (span) (for SB, SBX)
   *   annotation (span) (for 1.12.0a <= SBX <= 1.12.0a45)
   *   link-url (a) (for SBX)
   *   link-inner (a) (for SBX)
   *   link-file (a) (for SBX)
   *   freenote (div) (for 1.12.0a35 <= SBX)
   *   freenote-header (for 1.12.0a35 <= SBX)
   *   freenote-body (for 1.12.0a35 <= SBX)
   *   freenote-footer (for 1.12.0a35 <= SBX)
   *   freenote-save (for 1.12.0a35 <= SBX)
   *   freenote-delete (for 1.12.0a35 <= SBX)
   *   sticky (div) (for 0.22.10? <= SB, SBX <= 1.12.0a34; reworked in WSB)
   *   sticky-header (for 0.22.10? <= SB, SBX <= 1.12.0a34)
   *   sticky-footer (for 0.22.10? <= SB, SBX <= 1.12.0a34)
   *   sticky-save (for 0.22.10? <= SB, SBX <= 1.12.0a34)
   *   sticky-delete (for 0.22.10? <= SB, SBX <= 1.12.0a34)
   *   block-comment (div) (for SB < 0.19?)
   *   erased (since WSB)
   *
   *   title (*) (since SBX)
   *   title-src (*) (since SBX)
   *   todo (input, textarea) (since SBX)
   *
   *   custom (*) (custom objects to be removed by the eraser) (since SBX)
   *   custom-wrapper (*) (custom objects to be unwrapped by the eraser) (since SBX)
   *
   * - Other special elements
   *   toolbar (since WSB)
   *   toolbar-* (since WSB)
   *   fulltext (for 1.12.0a37 <= SBX)
   *   infobar (since WSB)
   *
   * - CSS and JS
   *   adoptedStyleSheet (since 0.56.4 <= WSB)
   *   css-resource-map (since 0.52.0 <= WSB)
   *   basic-loader (since 0.69.0 <= WSB)
   *   annotation-css (since 0.70.0 <= WSB)
   *   annotation-loader (since 0.70.0 <= WSB)
   *   infobar-loader (since 0.82.0 <= WSB)
   *   canvas-loader (for 0.51 <= WSB < 0.69)
   *   shadowroot-loader (for 0.51 <= WSB < 0.69)
   *   stylesheet (link, style) (for SBX)
   *   stylesheet-temp (link, style) (for SBX)
   *
   *   custom-css (should not be altered by the capturer or editor) (since 0.70 <= WSB)
   *   custom-script (should not be altered by the capturer or editor) (since 0.70 <= WSB)
   *   custom-script-safe (known safe for page resaving) (since 0.70 <= WSB)
   *
   * @return {false|string} Scrapbook object type of the element; or false.
   */
  scrapbook.getScrapbookObjectType = function (elem) {
    if (elem.nodeType === 8) {
      const m = elem.nodeValue.match(/^scrapbook-(.*?)(?:-\d+)?=/);
      if (m) {
        return m[1];
      }
      return false;
    }

    if (elem.nodeType !== 1) { return false; }

    let type = elem.getAttribute("data-scrapbook-elem");
    if (type) { return type; }

    // for downward compatibility with legacy ScrapBook X
    type = elem.getAttribute("data-sb-obj");
    if (type) { return type; }

    // for downward compatibility with legacy ScrapBook
    switch (elem.className) {
      case "linemarker-marked-line":
        return "linemarker";
      case "scrapbook-inline":
        return "inline";
      case "scrapbook-sticky":
      case "scrapbook-sticky scrapbook-sticky-relative":
        return "sticky";
      case "scrapbook-sticky-header":
        return "sticky-header";
      case "scrapbook-sticky-footer":
        return "sticky-footer";
      case "scrapbook-block-comment":
        return "block-comment";
    }

    if (elem.id == "scrapbook-sticky-css") {
      return "stylesheet";
    }

    return false;
  };

  /**
   * @return {integer} Scrapbook object remove type of the element.
   *     -1: not a scrapbook object
   *      0: not removable as a scrapbook object
   *      1: should remove
   *      2: should unwrap
   *      3: should uncomment
   */
  scrapbook.getScrapBookObjectRemoveType = function (elem) {
    let type = scrapbook.getScrapbookObjectType(elem);
    if (!type) { return -1; }
    if (["annotation", "freenote", "sticky", "block-comment", "custom"].includes(type)) { return 1; }
    if (["linemarker", "inline", "link-url", "link-inner", "link-file", "custom-wrapper"].includes(type)) { return 2; }
    if (["erased"].includes(type)) { return 3; }
    return 0;
  };

  /**
   * @return {Array<Element>} Related elements having the shared ID; or the
   *     original element.
   */
  scrapbook.getScrapBookObjectsById = function (elem) {
    let id = elem.getAttribute("data-scrapbook-id");
    if (id) {
      return elem.ownerDocument.querySelectorAll(`[data-scrapbook-id="${CSS.escape(id)}"]`);
    }

    // for downward compatibility with legacy ScrapBook (X)
    id = elem.getAttribute("data-sb-id");
    if (id) {
      return elem.ownerDocument.querySelectorAll(`[data-sb-id="${CSS.escape(id)}"]`);
    }

    return [elem];
  };


  /****************************************************************************
   * String handling
   ***************************************************************************/

  /**
   * Compare given 2 versions.
   *
   * @return {integer} 1: a > b; 0: a = b; -1: a < b
   */
  scrapbook.versionCompare = function (a, b) {
    //treat non-numerical characters as lower version
    //replacing them with a negative number based on charcode of each character
    function fix(s) {
      return "." + (s.toLowerCase().charCodeAt(0) - 2147483647) + ".";
    }

    a = ("" + a).replace(/[^0-9\.]/g, fix).split('.');
    b = ("" + b).replace(/[^0-9\.]/g, fix).split('.');
    const c = Math.max(a.length, b.length);
    for (let i = 0; i < c; i++) {
      //convert to integer the most efficient way
      a[i] = ~~a[i];
      b[i] = ~~b[i];

      if (a[i] > b[i]) {
        return 1;
      } else if (a[i] < b[i]) {
        return -1;
      }
    }
    return 0;
  };

  /**
   * Crops the given string
   *
   * @param {integer} [charLimit] - UTF-16 chars limit, beyond which will be cropped. 0 means no crop.
   * @param {integer} [byteLimit] - UTF-8 bytes limit, beyond which will be cropped. 0 means no crop.
   * @param {string} [ellipsis] - string for ellipsis
   */
  scrapbook.crop = function (str, charLimit, byteLimit, ellipsis = '...') {
    if (charLimit) {
      if (str.length > charLimit) {
        str = str.substring(0, charLimit - ellipsis.length) + ellipsis;
      }
    }
    if (byteLimit) {
      let bytes = this.unicodeToUtf8(str);
      if (bytes.length > byteLimit) {
        bytes = bytes.substring(0, byteLimit - this.unicodeToUtf8(ellipsis).length);
        while (true) {
          try {
            return this.utf8ToUnicode(bytes) + ellipsis;
          } catch(e) {
            // error if we cut a UTF-8 char sequence in the middle
          };
          bytes = bytes.substring(0, bytes.length-1);
        }
      }
    }
    return str;
  };

  /**
   * Revised from Jeff Ward and folk's version.
   *
   * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
   */
  scrapbook.getUuid = function () {
    const lut = Array(256).fill().map((_, i) => (i < 16 ? '0' : '') + (i).toString(16));
    const formatUuid = ([d0, d1, d2, d3]) =>
      lut[d0       & 0xff]        + lut[d0 >>  8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
      lut[d1       & 0xff]        + lut[d1 >>  8 & 0xff] + '-' +
      lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
      lut[d2       & 0x3f | 0x80] + lut[d2 >>  8 & 0xff] + '-' +
      lut[d2 >> 16 & 0xff]        + lut[d2 >> 24 & 0xff] +
      lut[d3       & 0xff]        + lut[d3 >>  8 & 0xff] +
      lut[d3 >> 16 & 0xff]        + lut[d3 >> 24 & 0xff];

    const getRandomValuesFunc = crypto && crypto.getRandomValues ?
      () => {
        const dvals = new Uint32Array(4);
        crypto.getRandomValues(dvals);
        return dvals;
      } :
      () => ([
        Math.random() * 0x100000000 >>> 0,
        Math.random() * 0x100000000 >>> 0,
        Math.random() * 0x100000000 >>> 0,
        Math.random() * 0x100000000 >>> 0,
      ]);

    const uuid = () => formatUuid(getRandomValuesFunc());
    scrapbook.getUuid = uuid;
    return uuid();
  };

  scrapbook.escapeHtml = function (str, noDoubleQuotes, singleQuotes, spaces) {
    const regex = /[&<>"']| (?= )/g;
    const func = m => map[m];
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;"
    };
    const fn = scrapbook.escapeHtml = function (str, noDoubleQuotes, singleQuotes, spaces) {
      map['"'] = noDoubleQuotes ? '"' : "&quot;";
      map["'"] = singleQuotes ? "&#39;" : "'";
      map[" "] = spaces ? "&nbsp;" : " ";
      return str.replace(regex, func);
    };
    return fn(str, noDoubleQuotes, singleQuotes, spaces);
  };

  scrapbook.unescapeHtml = function (str) {
    const regex = /&(?:(?:amp|lt|gt|quot|apos|nbsp)|#(?:(\d+)|x([0-9A-Fa-f]+)));/g;
    const func = (entity, dec, hex) => {
      if (dec) { return String.fromCharCode(parseInt(dec, 10)); }
      if (hex) { return String.fromCharCode(parseInt(hex, 16)); }
      return map[entity];
    };
    const map = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;" : ">",
      "&quot;" : '"',
      "&apos;" : "'",
      "&nbsp;" : " "
    };
    const fn = scrapbook.unescapeHtml = function (str) {
      return str.replace(regex, func);
    };
    return fn(str);
  };

  scrapbook.escapeRegExp = function (str) {
    // Don't escape "-" as it causes an error for a RegExp with unicode flag.
    // Escaping "-" allows the result be embedded in a character class.
    // Escaping "/" allows the result be embedded in a JS regex literal.
    const regex = /[/\\^$*+?.|()[\]{}]/g;
    const fn = scrapbook.escapeRegExp = function (str) {
      return str.replace(regex, "\\$&");
    };
    return fn(str);
  };

  scrapbook.escapeHtmlComment = function (str) {
    const regex = /-([\u200B]*)-/g;
    const fn = scrapbook.escapeHtmlComment = function (str) {
      return str.replace(regex, "-\u200B$1-");
    };
    return fn(str);
  };

  scrapbook.unescapeHtmlComment = function (str) {
    const regex = /-[\u200B]([\u200B]*)-/g;
    const fn = scrapbook.unescapeHtmlComment = function (str) {
      return str.replace(regex, "-$1-");
    };
    return fn(str);
  };

  scrapbook.escapeQuotes = function (str) {
    const regex = /[\\"]/g;
    const fn = scrapbook.escapeQuotes = function (str) {
      return str.replace(regex, "\\$&");
    };
    return fn(str);
  };

  scrapbook.unescapeQuotes = function (str) {
    const regex = /\\(.)/g;
    const fn = scrapbook.unescapeQuotes = function (str) {
      return str.replace(regex, "$1");
    };
    return fn(str);
  };

  scrapbook.escapeCssComment = function (str) {
    const regex = /\*\//g;
    const fn = scrapbook.escapeCssComment = function (str) {
      return str.replace(regex, "*\u200B/");
    };
    return fn(str);
  };

  scrapbook.unescapeCss = function (str) {
    const replaceRegex = /\\(?:([0-9A-Fa-f]{1,6}) ?|(.))/g;
    const getCodes = function (n) {
      if (n < 0x10000) return [n];
      n -= 0x10000;
      return [0xD800+(n>>10), 0xDC00+(n&0x3FF)];
    };
    const replaceFunc = function (m, u, c) {
      if (c) { return c; }
      if (u) { return String.fromCharCode.apply(null, getCodes(parseInt(u, 16))); }
    };
    const fn = scrapbook.unescapeCss = function (str) {
      return str.replace(replaceRegex, replaceFunc);
    };
    return fn(str);
  };

  scrapbook.quoteXPath = function (str) {
    const reTail = /,""\)$/;
    const fn = scrapbook.quoteXPath = (str) => {
      const parts = str.split('"');
      return parts.length > 1 ? 
          ('concat("' + parts.join(`",'"',"`) + '")').replace(reTail, ")") : 
          `"${str}"`;
    };
    return fn(str);
  };

  /**
   * A URL containing standalone "%"s, e.g. "http://example.com/50%",
   * causes a "Malformed URI sequence" error on decodeURIComponent.
   */
  scrapbook.decodeURIComponent = function (uri) {
    const regex = /(%[0-9A-F]{2})+/gi;
    const func = m => decodeURIComponent(m);
    const fn = scrapbook.decodeURIComponent = function (uri) {
      return uri.replace(regex, func);
    };
    return fn(uri);
  };

  /**
   * This forces UTF-8 charset.
   *
   * Chars need encoding adopted from: https://github.com/nicktimko/svgenc
   * Also encodes control chars and " " for safety in srcset.
   */
  scrapbook.unicodeToDataUri = function (str, mime) {
    const regex = /[\x00-\x1F\x7F "'#%<>[\]^`{|}]+/g;
    const func = m => encodeURIComponent(m);
    const fn = scrapbook.unicodeToDataUri = (str, mime) =>  {
      return `data:${(mime || "")};charset=UTF-8,${str.replace(regex, func)}`;
    };
    return fn(str, mime);
  };

  scrapbook.byteStringToDataUri = function (str, mime, charset) {
    return `data:${mime || ""}${charset ? ";charset=" + encodeURIComponent(charset) : ""},${escape(str)}`;
  };

  scrapbook.unicodeToUtf8 = function (chars) {
    return unescape(encodeURIComponent(chars));
  };

  scrapbook.utf8ToUnicode = function (bytes) {
    return decodeURIComponent(escape(bytes));
  };

  scrapbook.unicodeToBase64 = function (str) {
    return btoa(unescape(encodeURIComponent(str)));
  };

  scrapbook.base64ToUnicode = function (str) {
    return decodeURIComponent(escape(atob(str)));
  };

  /**
   * supported data types: HEX, TEXT, B64, BYTES, or ARRAYBUFFER
   *
   * @require jsSHA
   */
  scrapbook.sha1 = function (data, type) {
    let shaObj = new jsSHA("SHA-1", type);
    shaObj.update(data);
    return shaObj.getHash("HEX");
  };

  scrapbook.intToFixedStr = function (number, width, padder) {
    padder = padder || "0";
    number = number.toString(10);
    return number.length >= width ? number : new Array(width - number.length + 1).join(padder) + number;
  };

  /**
   * Alt. 1:
   *
   * return new TextEncoder("utf-8").encode(bstr).buffer;
   *
   * Faster, but not used due to potential error (see TextDecoder below).
   *
   * Alt. 2:
   *
   * return (new Uint8Array(Array.prototype.map.call(bstr, x => x.charCodeAt(0)))).buffer;
   *
   * Straightforward, but slow (1/28 of current version).
   */
  scrapbook.byteStringToArrayBuffer = function (bstr) {
    let n = bstr.length, u8ar = new Uint8Array(n);
    while (n--) { u8ar[n] = bstr.charCodeAt(n); }
    return u8ar.buffer;
  };

  /**
   * Alt. 1:
   *
   * return new TextDecoder("utf-8").decode(new Uint8Array(ab));
   *
   * Faster, but UTF-16 BOM are incorrectly converted to U+FFFD.
   *
   * Alt. 2:
   *
   * return String.fromCharCode.apply(null, new Uint8Array(ab));
   *
   * Simpler, but passing a very large array to function.apply causes a
   * "Maximum call stack size exceeded" error.
   */
  scrapbook.arrayBufferToByteString = function (ab) {
    let u8ar = new Uint8Array(ab), bstr = "", CHUNK_SIZE = 65535;
    for (let i = 0, I = u8ar.length; i < I; i += CHUNK_SIZE) {
      bstr += String.fromCharCode.apply(null, u8ar.subarray(i, i + CHUNK_SIZE));
    }
    return bstr;
  };


  /****************************************************************************
   * String handling - URL and filename
   ***************************************************************************/

  /**
   * Ensure normalizeUrl(url1) === normalizeUrl(url2)
   *
   * - Encode chars that requires percent encoding with all upper case.
   * - Encode standalone "%"s, which can cause error for decodeURIComponent().
   * - Decode over-encoded chars, such as [0-9a-z:!()+,;=], in pathname.
   * - Decode unreserved chars [0-9A-Za-z\-_.~] in search and hash.
   * - e.g. normalizeUrl("http://abc/def:中!%") === normalizeUrl("http://ab%63/def%3A%E4%B8%AD%21%25")
   */
  scrapbook.normalizeUrl = function (url) {
    // ref: https://url.spec.whatwg.org/#percent-encoded-bytes
    // reserved = :/?#[]@!$&'()*+,;=
    const percentEncodingRegex = /%(?:[0-9A-F]{2}(?:%[0-9A-F]{2})*)?/gi;
    const fixPathnameRegex = /[^:\/[\]@!$&'()*+,;=]+/g;
    const extraReservedCharsRegex = /[!*'()]+/g;  // these are not covered by encodeURIComponent

    const fixPathnameReplace = str => str.replace(percentEncodingRegex, fixPathnameReplace2);
    const fixPathnameReplace2 = m => {
      if (m.length === 1) { return encodeURIComponent(m); }
      return decodeURIComponent(m).replace(fixPathnameRegex, encodeURIComponent);
    };
    const fixSearchReplace = str => str.replace(percentEncodingRegex, fixSearchReplace2);
    const fixSearchReplace2 = m => {
      if (m.length === 1) { return encodeURIComponent(m); }
      return encodeURIComponent(decodeURIComponent(m)).replace(extraReservedCharsRegex, fixSearchReplace3);
    };
    const fixSearchReplace3 = m => {
      return `%${m.charCodeAt(0).toString(16).toUpperCase()}`;
    };

    const fn = scrapbook.normalizeUrl = (url) => {
      const u = new URL(url);
      try {
        u.pathname = fixPathnameReplace(u.pathname);
        u.search = fixSearchReplace(u.search);
        u.hash = fixSearchReplace(u.hash);
      } catch (ex) {
        // @FIXME:
        // This URL gets decodeURIComponent error since it's not encoded as
        // UTF-8. Keep it unchanged since we cannot reliably decode it without
        // breaking functional URL chars.
        console.error(ex);
      }
      return u.href;
    };
    return fn(url);
  };

  scrapbook.isUrlAbsolute = function (url) {
    const regex = /^[a-z][a-z0-9+.-]*:/i;
    const isUrlAbsolute = function (url) {
      return regex.test(url || "");
    };
    scrapbook.isUrlAbsolute = isUrlAbsolute;
    return isUrlAbsolute(url);
  };

  scrapbook.getRelativeUrl = function (targetUrl, baseUrl) {
    let targetUrlObj;
    let baseUrlObj;
    if (scrapbook.isUrlAbsolute(targetUrl) && scrapbook.isUrlAbsolute(baseUrl)) {
      targetUrlObj = new URL(targetUrl);
      baseUrlObj = new URL(baseUrl);
    } else if (scrapbook.isUrlAbsolute(targetUrl)) {
      return new URL(targetUrl).href;
    } else if (scrapbook.isUrlAbsolute(baseUrl)) {
      // this should not happen
      throw new Error("Unable to get a relative URL from an absolute URL to a non-absolute URL");
    } else {
      // assume that both URLs are realative to the same root
      targetUrlObj = new URL('file:///' + targetUrl);
      baseUrlObj = new URL('file:///' + baseUrl);
    }

    // absolute
    if (targetUrlObj.protocol !== baseUrlObj.protocol) {
      return targetUrlObj.href;
    }

    // protocol-relative
    if (targetUrlObj.host !== baseUrlObj.host) {
      return '//' + targetUrlObj.host + targetUrlObj.pathname + targetUrlObj.search + targetUrlObj.hash;
    }

    if (targetUrlObj.pathname !== baseUrlObj.pathname) {
      const targetPathParts = targetUrlObj.pathname.split('/');
      const basePathParts = baseUrlObj.pathname.split('/');

      let commonIndex;
      basePathParts.every((v, i) => {
        if (v === targetPathParts[i]) {
          commonIndex = i;
          return true;
        }
        return false;
      });

      let pathname = '../'.repeat(basePathParts.length - commonIndex - 2);
      pathname += targetPathParts.slice(commonIndex + 1).join('/');
      return pathname + targetUrlObj.search + targetUrlObj.hash;
    }

    if (targetUrlObj.search !== baseUrlObj.search) {
      return targetUrlObj.search + targetUrlObj.hash;
    }

    if (targetUrlObj.hash !== baseUrlObj.hash) {
      return targetUrlObj.hash;
    }

    return '';
  };

  scrapbook.urlToFilename = function (url) {
    let name = scrapbook.filepathParts(new URL(url).pathname)[1];

    // decode %xx%xx%xx only if it's correctly UTF-8 encoded
    // @TODO: decode using a specified charset
    try {
      name = scrapbook.decodeURIComponent(name);
    } catch (ex) {}
    return name;
  };

  scrapbook.splitUrl = function (url) {
    let name = url, search = "", hash = "", pos;
    pos = name.indexOf("#");
    if (pos !== -1) { hash = name.slice(pos); name = name.slice(0, pos); }
    pos = name.indexOf("?");
    if (pos !== -1) { search = name.slice(pos); name = name.slice(0, pos); }
    return [name, search, hash];
  };

  scrapbook.splitUrlByAnchor = function (url) {
    let [name, search, hash] = scrapbook.splitUrl(url);
    return [name + search, hash];
  };

  scrapbook.filepathParts = function (filepath) {
    let pos = Math.max(filepath.lastIndexOf("/"), filepath.lastIndexOf("\\"));
    if (pos != -1) {
      return [filepath.slice(0, pos), filepath.slice(pos + 1, filepath.length)];
    }
    return ["", filepath];
  };

  scrapbook.filenameParts = function (filename) {
    let pos = filename.lastIndexOf(".");
    if (pos != -1) {
      return [filename.substring(0, pos), filename.substring(pos + 1, filename.length)];
    }
    return [filename, ""];
  };

  scrapbook.splitXmlAttribute = function (attr) {
    let ns = "", name = attr, pos;
    pos = name.indexOf(":");
    if (pos !== -1) { ns = name.slice(0, pos); name = name.slice(pos + 1); }
    return [ns, name];
  };


  /****************************************************************************
   * String handling - HTML Header parsing
   ***************************************************************************/

  /**
   * Parse Content-Type string from the HTTP Header
   *
   * @return {{type: string, parameters: {[charset: string]}}}
   */
  scrapbook.parseHeaderContentType = function (string) {
    const regexFields = /^(.*?)(?=;|$)/i;
    const regexDoubleQuotedField = /;((?:"(?:\\.|[^"])*(?:"|$)|[^"])*?)(?=;|$)/i;
    const regexKeyValue = /\s*(.*?)\s*=\s*("(?:\\.|[^"])*"|[^"]*?)\s*$/i;
    const regexDoubleQuotedValue = /^"(.*?)"$/;
    const fn = scrapbook.parseHeaderContentType = function (string) {
      const result = {type: undefined, parameters: {}};

      if (typeof string !== 'string') {
        return result;
      }

      if (regexFields.test(string)) {
        string = RegExp.rightContext;
        result.type = RegExp.$1.trim();
        while (regexDoubleQuotedField.test(string)) {
          string = RegExp.rightContext;
          let parameter = RegExp.$1;
          if (regexKeyValue.test(parameter)) {
            let field = RegExp.$1;
            let value = RegExp.$2;

            // manage double quoted value
            if (regexDoubleQuotedValue.test(value)) {
              value = scrapbook.unescapeQuotes(RegExp.$1);
            }

            result.parameters[field] = value;
          }
        }
      }

      return result;
    };
    return fn(string);
  };

  /**
   * Parse Content-Disposition string from the HTTP Header
   *
   * ref: https://github.com/jshttp/content-disposition/blob/master/index.js
   *
   * @param {string} string - The string to parse, not including "Content-Disposition: "
   * @return {{type: ('inline'|'attachment'), parameters: {[filename: string]}}}
   */
  scrapbook.parseHeaderContentDisposition = function (string) {
    const regexFields = /^(.*?)(?=;|$)/i;
    const regexDoubleQuotedField = /;((?:"(?:\\.|[^"])*(?:"|$)|[^"])*?)(?=;|$)/i;
    const regexKeyValue = /\s*(.*?)\s*=\s*("(?:\\.|[^"])*"|[^"]*?)\s*$/i;
    const regexDoubleQuotedValue = /^"(.*?)"$/;
    const regexExtField = /^(.*)\*$/;
    const regexExtValue = /^(.*?)'(.*?)'(.*?)$/;
    const fn = scrapbook.parseHeaderContentDisposition = function (string) {
      const result = {type: undefined, parameters: {}};

      if (typeof string !== 'string') {
        return result;
      }

      if (regexFields.test(string)) {
        string = RegExp.rightContext;
        result.type = RegExp.$1.trim();
        while (regexDoubleQuotedField.test(string)) {
          string = RegExp.rightContext;
          let parameter = RegExp.$1;
          if (regexKeyValue.test(parameter)) {
            let field = RegExp.$1;
            let value = RegExp.$2;

            // manage double quoted value
            if (regexDoubleQuotedValue.test(value)) {
              value = scrapbook.unescapeQuotes(RegExp.$1);
            }

            if (regexExtField.test(field)) {
              // the field uses an ext-value
              field = RegExp.$1;
              if (regexExtValue.test(value)) {
                let charset = RegExp.$1.toLowerCase(), lang = RegExp.$2.toLowerCase(), valueEncoded = RegExp.$3;
                switch (charset) {
                  case 'iso-8859-1':
                    value = decodeURIComponent(valueEncoded).replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
                    break;
                  case 'utf-8':
                    value = decodeURIComponent(valueEncoded);
                    break;
                  default:
                    console.error('Unsupported charset in the extended field of header content-disposition: ' + charset);
                    break;
                }
              }
            }

            result.parameters[field] = value;
          }
        }
      }

      return result;
    };
    return fn(string);
  };

  /**
   * Parse Refresh string from the HTTP Header
   *
   * ref: https://www.w3.org/TR/html5/document-metadata.html
   *
   * @return {{time: integer, url: string}}
   */
  scrapbook.parseHeaderRefresh = function (string) {
    const regexFields = /^\s*(.*?)(?=[;,]|$)/i;
    const regexFieldValue = /^[;,]\s*url\s*=\s*((["'])?.*)$/i;
    const regexEscape = /[\t\n\r]+/g;
    const fn = scrapbook.parseHeaderRefresh = function (string) {
      const result = {time: undefined, url: undefined};

      if (typeof string !== 'string') {
        return result;
      }

      if (regexFields.test(string)) {
        result.time = parseInt(RegExp.$1);
        string = RegExp.rightContext;
        if (regexFieldValue.test(string)) {
          let url = RegExp.$1;
          let quote = RegExp.$2;
          if (quote) {
            let pos = url.indexOf(quote, 1);
            if (pos !== -1) { url = url.slice(1, pos); }
          }
          url = url.trim().replace(regexEscape, "");
          result.url = url;
        }
      }

      return result;
    };
    return fn(string);
  };


  /****************************************************************************
   * String handling - Misc. utilities
   ***************************************************************************/

  /**
   * A simple tool to compress code (CSS or JavaScript)
   */
  scrapbook.compressCode = function (code) {
    const regex = /[^\S　]+/g;
    const fn = scrapbook.compressCode = function (code) {
      return code.toString().replace(regex, " ");
    };
    return fn(code);
  };

  /**
   * A shortcut to compress javascript code
   */
  scrapbook.compressJsFunc = function (func) {
    return scrapbook.compressCode(func.toString());
  };


  /****************************************************************************
   * File/Blob utilities
   ***************************************************************************/

  /**
   * @param {Blob} blob - The Blob of File object to be read.
   * @return {Promise<ArrayBuffer>}
   */
  scrapbook.readFileAsArrayBuffer = async function (blob) {
    const event = await new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = resolve;
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    return event.target.result;
  };

  /**
   * @param {Blob} blob - The Blob of File object to be read.
   * @return {Promise<string>}
   */
  scrapbook.readFileAsDataURL = async function (blob) {
    const event = await new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = resolve;
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return event.target.result;
  };

  /**
   * @param {Blob} blob - The Blob of File object to be read.
   * @param {string|false} [charset] - Read as UTF-8 if undefined and as raw bytes if falsy.
   * @return {Promise<string>}
   */
  scrapbook.readFileAsText = async function (blob, charset = "UTF-8") {
    if (charset) {
      const event = await new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = resolve;
        reader.onerror = reject;
        reader.readAsText(blob, charset);
      });
      return event.target.result;
    }
    const ab = await scrapbook.readFileAsArrayBuffer(blob);
    return scrapbook.arrayBufferToByteString(ab);
  };

  /**
   * @param {Blob} blob - The Blob of File object to be read.
   * @return {Promise<Document>}
   */
  scrapbook.readFileAsDocument = async function (blob) {
    const xhr = await scrapbook.xhr({
      url: URL.createObjectURL(blob),
      responseType: "document",
    });
    return xhr.response;
  };

  scrapbook.dataUriToFile = function (dataUri, useFilename = true) {
    const regexFields = /^data:([^,]*?)(;base64)?,([^#]*)/i;
    const regexFieldValue = /^(.*?)=(.*?)$/;
    const regexUtf8 = /[^\x00-\x7F]+/g;
    const fnUtf8 = m => encodeURIComponent(m);
    const fn = scrapbook.dataUriToFile = function (dataUri, useFilename = true) {
      if (regexFields.test(dataUri)) {
        const mediatype = RegExp.$1;
        const base64 = !!RegExp.$2;

        // browsers treat a non-ASCII char in an URL as a UTF-8 byte sequence
        const data = RegExp.$3.replace(regexUtf8, fnUtf8);

        const parts = mediatype.split(";");
        const mime = parts.shift();
        const parameters = {};
        parts.forEach((part) => {
          if (regexFieldValue.test(part)) {
            parameters[RegExp.$1.toLowerCase()] = RegExp.$2;
          }
        });

        const bstr = base64 ? atob(data) : unescape(data);
        const ab = scrapbook.byteStringToArrayBuffer(bstr);

        let filename;
        if (useFilename && parameters.filename) {
          filename = decodeURIComponent(parameters.filename);
        } else {
          let ext = parameters.filename && scrapbook.filenameParts(parameters.filename)[1] || Mime.extension(mime);
          ext = ext ? ("." + ext) : "";
          filename = scrapbook.sha1(ab, "ARRAYBUFFER") + ext;
        }

        const file = new File([ab], filename, {type: mediatype});
        return file;
      }
      return null;
    };
    return fn(dataUri, useFilename);
  };

  /**
   * Assume non-text for undefined types.
   */
  scrapbook.mimeIsText = function (mime) {
    const map = new Set([
      "application/ecmascript",
      "application/javascript",
      "application/json",
      "application/xml",
      "application/sql",
    ]);
    const fn = scrapbook.mimeIsText = (mime) => {
      if (mime.startsWith("text/") || mime.endsWith("+xml") || mime.endsWith("+json")) {
        return true;
      } else if (mime.endsWith("+zip")) {
        return false;
      }
      return map.has(mime);
    };
    return fn(mime);
  };


  /****************************************************************************
   * HTML DOM related utilities
   ***************************************************************************/

  scrapbook.doctypeToString = function (doctype) {
    if (!doctype) { return ""; }
    let ret = "<!DOCTYPE " + doctype.name;
    if (doctype.publicId) { ret += ' PUBLIC "' + doctype.publicId + '"'; }
    if (doctype.systemId) { ret += ' "'        + doctype.systemId + '"'; }
    ret += ">\n";
    return ret;
  };

  /**
   * Read charset and text of a CSS file.
   *
   * Browser normally determine the charset of a CSS file via:
   * 1. HTTP header content-type
   * 2. Unicode BOM in the CSS file
   * 3. @charset rule in the CSS file
   * 4. assume it's UTF-8
   *
   * We save the CSS file as UTF-8 for better compatibility.
   * For case 3, UTF-8 BOM is prepended to inactivate the @charset rule.
   * We don't follow case 4 and read the CSS file as byte string so that
   * the user has a chance to correct the encoding manually.
   *
   * @param {Blob} data - The CSS file blob.
   * @param {string} [charset] - Charset of the CSS file blob.
   * @return {{text: string, charset: string|null}}
   */
  scrapbook.parseCssFile = async function (data, charset) {
    const regexAtCharset = /^@charset "([^"]*)";/;
    const fn = scrapbook.parseCssFile = async function (data, charset) {
      if (charset) {
        let text = await scrapbook.readFileAsText(data, charset);

        // Add a BOM to inactivate the @charset rule
        if (regexAtCharset.test(text)) {
          text = "\ufeff" + text;
        }

        return {text, charset};
      }

      const bytes = await scrapbook.readFileAsText(data, false);
      if (bytes.startsWith("\xEF\xBB\xBF")) {
        charset = "UTF-8";
      } else if (bytes.startsWith("\xFE\xFF")) {
        charset = "UTF-16BE";
      } else if (bytes.startsWith("\xFF\xFE")) {
        charset = "UTF-16LE";
      } else if (bytes.startsWith("\x00\x00\xFE\xFF")) {
        charset = "UTF-32BE";
      } else if (bytes.startsWith("\x00\x00\xFF\xFE")) {
        charset = "UTF-32LE";
      } else if (regexAtCharset.test(bytes)) {
        charset = RegExp.$1;
      }

      if (charset) {
        let text = await scrapbook.readFileAsText(data, charset);

        // Add a BOM to inactivate the @charset rule
        if (regexAtCharset.test(text)) {
          text = "\ufeff" + text;
        }

        return {text, charset};
      }

      return {text: bytes, charset: null};
    };
    return await fn(data, charset);
  };

  /**
   * The function that rewrites the CSS text.
   *
   * @callback rewriteCssFileRewriter
   * @param {string} cssText - The CSS text to rewrite.
   * @return {string|Promise<string>} The rewritten CSS text.
   */

  /**
   * Process a CSS file and rewrite it
   *
   * @param {Blob} data - The CSS file blob.
   * @param {string} [charset] - Charset of the CSS file blob.
   * @param {rewriteCssFileRewriter} rewriter
   * @return {Promise<Blob>} The rewritten CSS file blob.
   */
  scrapbook.rewriteCssFile = async function (data, charset, rewriter) {
    const {text: cssText, charset: cssCharset} = await scrapbook.parseCssFile(data, charset);

    const rewrittenText = await rewriter(cssText);

    let blob;
    if (cssCharset) {
      blob = new Blob([rewrittenText], {type: "text/css;charset=UTF-8"});
    } else {
      let ab = scrapbook.byteStringToArrayBuffer(rewrittenText);
      blob = new Blob([ab], {type: "text/css"});
    }
    return blob;
  };

  /**
   * The function that rewrites each URL into a new URL.
   *
   * @callback rewriteCssTextRewriter
   * @param {string} url
   * @return {{url: string, recordUrl: string}|Promise<{url: string, recordUrl: string}>}
   */

  /**
   * process the CSS text of whole <style> or a CSS file
   *
   * @TODO: current code is rather heuristic and ugly,
   *        consider implementing a real CSS parser to prevent potential errors
   *        for certain complicated CSS
   *
   * @param {string} cssText
   * @param {Object} options
   * @param {rewriteCssTextRewriter} options.rewriteImportUrl
   * @param {rewriteCssTextRewriter} options.rewriteFontFaceUrl
   * @param {rewriteCssTextRewriter} options.rewriteBackgroundUrl
   * @param {Object} [options.resourceMap] - A Map to group same resources.
   */
  scrapbook.rewriteCssText = function (cssText, options) {
    const pCm = `(?:/\\*[\\s\\S]*?(?:\\*/|$))`; // comment
    const pSp = `(?:[ \\t\\r\\n\\v\\f]*)`; // space equivalents
    const pCmSp = `(?:(?:${pCm}|${pSp})*)`; // comment or space
    const pCmSp2 = `(?:(?:${pCm}|${pSp})+)`; // comment or space, at least one
    const pChar = `(?:\\\\.|[^\\\\"'])`; // a non-quote char or an escaped char sequence
    const pStr = `(?:${pChar}*?)`; // string
    const pSStr = `(?:${pCmSp}${pStr}${pCmSp})`; // comment-or-space enclosed string
    const pDQStr = `(?:"[^\\\\"]*(?:\\\\.[^\\\\"]*)*")`; // double quoted string
    const pSQStr = `(?:'[^\\\\']*(?:\\\\.[^\\\\']*)*')`; // single quoted string
    const pES = `(?:(?:${pCm}|${pDQStr}|${pSQStr}|${pChar})*?)`; // embeded string
    const pUrl = `(?:\\burl\\(${pSp}(?:${pDQStr}|${pSQStr}|${pStr})${pSp}\\))`; // URL
    const pUrl2 = `(\\burl\\(${pSp})(${pDQStr}|${pSQStr}|${pStr})(${pSp}\\))`; // URL; catch 3
    const pRImport = `(@import${pCmSp})(${pUrl}|${pDQStr}|${pSQStr})`; // @import; catch 2
    const pRFontFace = `(@font-face${pCmSp}{${pES}})`; // @font-face; catch 1
    const pRNamespace = `(@namespace${pCmSp}(?:${pStr}${pCmSp2})?${pUrl})`; // @namespace; catch 1

    const KEY_PREFIX = "urn:scrapbook:str:";
    const REGEX_UUID = new RegExp(KEY_PREFIX + "([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})", 'g');
    const REGEX_RESOURCE_MAP = /^(.+?-)\d+$/;
    const REGEX_REWRITE_CSS = new RegExp(`${pCm}|${pRImport}|${pRFontFace}|${pRNamespace}|(${pUrl})`, "gi");
    const REGEX_PARSE_URL = new RegExp(pUrl2, "gi");

    const fn = scrapbook.rewriteCssText = function (cssText, options = {}) {
      let mapUrlPromise;

      const handleRewrittenData = function (data, prefix, postfix, noResMap) {
        const {url, recordUrl} = data;
        let record;
        if (!recordUrl || url === recordUrl) {
          record = "";
        } else {
          record = '/*scrapbook-orig-url="' + scrapbook.escapeCssComment(recordUrl) + '"*/';
        }

        if (resourceMap && !noResMap) {
          let name = resourceMap[url];
          if (!name) {
            const values = Object.keys(resourceMap);
            if (!values.length) {
              name = '--sb' + Date.now().toString().slice(-4) + '-1';
            } else {
              const p = Object.values(resourceMap)[0].match(REGEX_RESOURCE_MAP)[1];
              name = p + (values.length + 1);
            }
            resourceMap[url] = name;
          }
          return record + 'var(' + name + ')';
        }

        return record + prefix + '"' + scrapbook.escapeQuotes(url) + '"' + postfix;
      };

      const handleRewritten = function (data, prefix, postfix, noResMap) {
        if (scrapbook.isPromise(data)) {
          if (!mapUrlPromise) { mapUrlPromise = new Map(); }
          const key = scrapbook.getUuid();
          mapUrlPromise.set(key, data.then(r => {
            mapUrlPromise.set(key, handleRewrittenData(r, prefix, postfix, noResMap));
          }));
          return KEY_PREFIX + key;
        }
        return handleRewrittenData(data, prefix, postfix, noResMap);
      };

      const parseUrl = (text, callback, noResMap) => {
        return text.replace(REGEX_PARSE_URL, (m, pre, url, post) => {
          let rewritten;
          if (url.startsWith('"') && url.endsWith('"')) {
            const u = scrapbook.unescapeCss(url.slice(1, -1));
            rewritten = callback(u);
          } else if (url.startsWith("'") && url.endsWith("'")) {
            const u = scrapbook.unescapeCss(url.slice(1, -1));
            rewritten = callback(u);
          } else {
            const u = scrapbook.unescapeCss(url.trim());
            rewritten = callback(u);
          }

          return handleRewritten(rewritten, pre, post, noResMap);
        });
      };

      const {rewriteImportUrl, rewriteFontFaceUrl, rewriteBackgroundUrl, resourceMap} = options;
      const response = cssText.replace(
        REGEX_REWRITE_CSS,
        (m, im1, im2, ff, ns, u) => {
          if (im2) {
            let rewritten;
            if (im2.startsWith('"') && im2.endsWith('"')) {
              const u = scrapbook.unescapeCss(im2.slice(1, -1));
              rewritten = handleRewritten(rewriteImportUrl(u), '', '', true);
            } else if (im2.startsWith("'") && im2.endsWith("'")) {
              const u = scrapbook.unescapeCss(im2.slice(1, -1));
              rewritten = handleRewritten(rewriteImportUrl(u), '', '', true);
            } else {
              rewritten = parseUrl(im2, rewriteImportUrl, true);
            }
            return im1 + rewritten;
          } else if (ff) {
            return parseUrl(m, rewriteFontFaceUrl, true);
          } else if (ns) {
            // do not rewrite @namespace rule
            return ns;
          } else if (u) {
            return parseUrl(m, rewriteBackgroundUrl);
          }
          return m;
        });

      if (!mapUrlPromise) {
        return response;
      }

      return Promise.all(Array.from(mapUrlPromise.values())).then(() => {
        return response.replace(REGEX_UUID, (match, key) => {
          if (mapUrlPromise.has(key)) {
            return mapUrlPromise.get(key);
          }
          return match;
        });
      });
    };
    return fn(cssText, options);
  };

  /**
   * The function that rewrites each URL into a new URL.
   *
   * @callback rewriteSrcsetRewriter
   * @param {string} url
   * @return {string|Promise<string>} The rewritten URL.
   */

  /**
   * @param {string} srcset
   * @param {rewriteSrcsetRewriter} rewriter
   * @return {string|Promise<string>} The rewritten URL.
   */
  scrapbook.rewriteSrcset = function (srcset, rewriter) {
    const KEY_PREFIX = "urn:scrapbook:str:";
    const REGEX_SRCSET = /(\s*)([^ ,][^ ]*[^ ,])(\s*(?: [^ ,]+)?\s*(?:,|$))/g;
    const REGEX_UUID = new RegExp(KEY_PREFIX + "([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})", 'g');

    const fn = scrapbook.rewriteSrcset = function (srcset, rewriter) {
      let mapUrlPromise;
      const response = srcset.replace(REGEX_SRCSET, (m, m1, m2, m3) => {
        let replacement = rewriter(m2);
        if (scrapbook.isPromise(replacement)) {
          if (!mapUrlPromise) { mapUrlPromise = new Map(); }
          const key = scrapbook.getUuid();
          mapUrlPromise.set(key, replacement.then(r => {
            mapUrlPromise.set(key, r);
          }));
          replacement = KEY_PREFIX + key;
        }
        return m1 + replacement + m3;
      });

      if (!mapUrlPromise) {
        return response;
      }

      return Promise.all(Array.from(mapUrlPromise.values())).then(() => {
        return response.replace(REGEX_UUID, (match, key) => {
          if (mapUrlPromise.has(key)) {
            return mapUrlPromise.get(key);
          }
          return match;
        });
      });
    };
    return fn(srcset, rewriter);
  };

  /**
   * Get all accessible descendant frames.
   */
  scrapbook.flattenFrames = function (doc) {
    let result = [doc];
    for (const frameElem of doc.querySelectorAll('frame[src], iframe[src]')) {
      let doc;
      try {
        doc = frameElem.contentDocument;
        if (!doc) { throw new Error('contentDocument is null'); }
      } catch (ex) {
        // failed to get frame document, prabably cross-origin
        continue;
      }
      result = result.concat(scrapbook.flattenFrames(doc));
    }
    return result;
  };

  scrapbook.parseMaffRdfDocument = function (doc) {
    const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    const MAF = "http://maf.mozdev.org/metadata/rdf#";
    const fn = scrapbook.parseMaffRdfDocument = function (doc) {
      const result = {};
      let elem;

      elem = doc.getElementsByTagNameNS(MAF, "originalurl")[0];
      if (elem) { result.originalurl = elem.getAttributeNS(RDF, "resource"); }

      elem = doc.getElementsByTagNameNS(MAF, "title")[0];
      if (elem) { result.title = elem.getAttributeNS(RDF, "resource"); }

      elem = doc.getElementsByTagNameNS(MAF, "archivetime")[0];
      if (elem) { result.archivetime = elem.getAttributeNS(RDF, "resource"); }

      elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
      if (elem) { result.indexfilename = elem.getAttributeNS(RDF, "resource"); }

      elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
      if (elem) { result.charset = elem.getAttributeNS(RDF, "resource"); }

      return result;
    };
    return fn(doc);
  };

  /**
   * Get dimentions of the viewport (main window)
   *
   * @return {{width: integer, height: integer, scrollX: integer, scrollY: integer}}
   */
  scrapbook.getViewport = function (win) {
    const doc = win.document;
    const isQuirkMode = doc.compatMode == "BackCompat";
    return {
      scrollX: win.scrollX,
      scrollY: win.scrollY,
      width: (isQuirkMode ? doc.body : doc.documentElement).clientWidth,
      height: (isQuirkMode ? doc.body : doc.documentElement).clientHeight,
    };
  };

  /**
   * Get appropriate offset for absolute positioning.
   *
   * @return {{left: integer, top: integer}}
   */
  scrapbook.getAnchoredPosition = function (elem, {clientX, clientY}, viewport) {
    const win = elem.ownerDocument.defaultView;

    // The innermost ancestor element that is relatively positioned.
    let relativeAncestor = null;
    let ancestor = elem.parentElement;
    while (ancestor && ancestor.nodeType === 1) {
      if (win.getComputedStyle(ancestor).getPropertyValue('position') === 'relative') {
        relativeAncestor = ancestor;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    let deltaX;
    let deltaY;
    if (relativeAncestor) {
      // - getBoundingClientRect is border + padding + width (content-box)
      // - CSS left and top are relative to the box (padding + width)
      //   of relativeAncestor.
      const ancestorRect = relativeAncestor.getBoundingClientRect();
      const ancestorStyle = win.getComputedStyle(relativeAncestor);
      deltaX = ancestorRect.left + parseFloat(ancestorStyle.getPropertyValue('border-left-width'));
      deltaY = ancestorRect.top + parseFloat(ancestorStyle.getPropertyValue('border-top-width'));
    } else {
      viewport = viewport || scrapbook.getViewport(win);
      deltaX = -viewport.scrollX;
      deltaY = -viewport.scrollY;
    }

    return {
      left: clientX - deltaX,
      top: clientY - deltaY,
    };
  };

  /**
   * Get primary meta refresh target URL.
   *
   * For a document with multiple meta refresh, Firefox and Chromium both take
   * the last one of those with least refresh time.
   *
   * @param {Document} doc
   * @param {string} [refUrl] - An arbitarary reference URL. Use document.URL if not set.
   * @param {boolean} [ignoreDelayedRefresh] - Only consider meta refresh with 0 refresh time.
   * @param {boolean} [includeNoscript] - Also consider meta refresh in <noscript>.
   * @return {string|undefined} Absolute URL of the meta refresh target.
   */
  scrapbook.getMetaRefreshTarget = function (doc, refUrl = doc.URL,
      ignoreDelayedRefresh = false, includeNoscript = false) {
    let lastMetaRefreshTime = Infinity;
    let lastMetaRefreshUrl;
    for (const elem of doc.querySelectorAll('meta[http-equiv="refresh"][content]')) {
      const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
      if (metaRefresh.url && metaRefresh.url !== refUrl) {
        if (!ignoreDelayedRefresh || metaRefresh.time === 0) {
          if (includeNoscript || !elem.closest('noscript')) {
            if (metaRefresh.time <= lastMetaRefreshTime) {
              lastMetaRefreshTime = metaRefresh.time;
              lastMetaRefreshUrl = metaRefresh.url;
            }
          }
        }
      }
    }
    if (lastMetaRefreshUrl) {
      return new URL(lastMetaRefreshUrl, refUrl).href;
    }
  };

  /**
   * Get nodes in the selected range(s).
   *
   * @param {Object} params
   * @param {Window} params.win - The Window to operate on.
   * @param {Range} [params.range] - The Range object to get selected nodes within.
   * @param {integer} [params.whatToShow] - Filter for allowed node types.
   * @param {Function} [params.nodeFilter] - A function to filter allowed nodes.
   * @param {boolean} [params.fuzzy] - Include partially selected nodes.
   * @return {Array<Element>} Elements in the selected range(s).
   */
  scrapbook.getSelectedNodes = function ({win = window, range, whatToShow = -1, nodeFilter, fuzzy = false}) {
    const doc = win.document;
    const result = [];
    const ranges = range ? [range] : scrapbook.getSelectionRanges(win);
    for (let range of ranges) {
      if (range.collapsed) {
        continue;
      }

      // A fuzzy match can include an ancestor of the selected nodes,
      // and thus we must traverse all nodes in the document.
      // e.g. <node><b><span>...[foo]...</span>...</b></node> includes <node>
      const root = fuzzy ? doc : range.commonAncestorContainer;

      const nodeRange = doc.createRange();
      const walker = doc.createTreeWalker(
        root,
        whatToShow,
        {
          acceptNode: (node) => {
            nodeRange.selectNode(node);
            if (fuzzy) {
              if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0
                  && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0) {
                if (typeof nodeFilter !== "function" || nodeFilter(node)) {
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            } else {
              if (nodeRange.compareBoundaryPoints(Range.START_TO_START, range) >= 0
                  && nodeRange.compareBoundaryPoints(Range.END_TO_END, range) <= 0) {
                if (typeof nodeFilter !== "function" || nodeFilter(node)) {
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );
      let node;
      while (node = walker.nextNode()) {
        result.push(node);
      }
    }
    return result;
  };

  scrapbook.getSelectionRanges = function (win = window) {
    let result = [];
    const sel = win.getSelection();
    if (sel) {
      for (let i = 0; i < sel.rangeCount; i++) {
        result.push(sel.getRangeAt(i));
      }
    }
    return result;
  };

  /**
   * See scrapbook.getSafeRanges() for details.
   */
  scrapbook.getSafeSelectionRanges = function (win = window) {
    let result = [];
    const sel = win.getSelection();
    if (sel) {
      for (let i = 0; i < sel.rangeCount; i++) {
        const range = sel.getRangeAt(i);
        result = result.concat(scrapbook.getSafeRanges(range, win.document));
      }
    }
    return result;
  };

  /**
   * Get splitted selection range parts which do not cross an element boundary.
   *
   * Revised from:
   * https://stackoverflow.com/a/12823606/1667884
   */
  scrapbook.getSafeRanges = (dangerous) => {
    const ca = dangerous.commonAncestorContainer;
    const doc = ca.ownerDocument;

    // Start -- Work inward from the start, selecting the largest safe range
    // <n1>n1s<n2>n2s[n2e</n2>n1e</n1> => <n1>n1s<n2>n2s[n2e]</n2>[n1e]</n1>
    const s = [], rs = [];
    if (dangerous.startContainer !== ca) {
      for (let i = dangerous.startContainer; i !== ca; i = i.parentNode) {
        s.push(i);
      }
      for (let i = 0; i < s.length; i++) {
        const xs = doc.createRange();
        if (i) {
          xs.setStartAfter(s[i-1]);
          xs.setEnd(s[i], s[i].childNodes.length);
        } else {
          xs.setStart(s[i], dangerous.startOffset);
          if ([3, 4, 8].includes(s[i].nodeType)) {
            xs.setEndAfter(s[i]);
          } else {
            xs.setEnd(s[i], s[i].childNodes.length);
          }
        }
        rs.push(xs);
      }
    }

    // End -- same logic as start, with reversed direction
    // <n3>n3s<n4>n4s]n4e</n4>n3e</n3> => <n3>[n3s]<n4>[n4s]n4e</n4>n3e</n3>
    const e = [], re = [];
    if (dangerous.endContainer !== ca) {
      for (let i = dangerous.endContainer; i !== ca; i = i.parentNode) {
        e.push(i);
      }
      for (let i = 0; i < e.length; i++) {
        const xe = doc.createRange();
        if (i) {
          xe.setStart(e[i], 0);
          xe.setEndBefore(e[i-1]);
        } else {
          if ([3, 4, 8].includes(e[i].nodeType)) {
            xe.setStartBefore(e[i]);
          } else {
            xe.setStart(e[i], 0);
          }
          xe.setEnd(e[i], dangerous.endOffset);
        }
        re.unshift(xe);
      }
    }

    // Middle -- the range after start and before end in commonAncestorContainer
    // (<ca>cas|...</n1>)[...](<n3>...|cae</ca>)
    const xm = doc.createRange();
    if (s.length) {
      xm.setStartAfter(s[s.length - 1]);
    } else {
      xm.setStart(dangerous.startContainer, dangerous.startOffset);
    }
    if (e.length) {
      xm.setEndBefore(e[e.length - 1]);
    } else {
      xm.setEnd(dangerous.endContainer, dangerous.endOffset);
    }
    rs.push(xm);

    return rs.concat(re);
  };

  /**
   * Remove the element while keeping all children.
   */
  scrapbook.unwrapElement = function (elem) {
    const parent = elem.parentNode;
    if (!parent) { return; }
    const frag = elem.ownerDocument.createDocumentFragment();
    let child;
    while (child = elem.firstChild) { frag.appendChild(child); }
    parent.replaceChild(frag, elem);
    parent.normalize();
  };

  /**
   * Check if a canvas is blank.
   */
  scrapbook.isCanvasBlank = function (canvas) {
    const context = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(
      context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(color => color !== 0);
  };


  /****************************************************************************
   * Network utilities
   ***************************************************************************/

  /**
   * A simple XMLHttpRequest wrapper for most common tasks.
   *
   * Don't use fetch() since it doen't support file: protocol.
   *
   * @param {Object} params
   * @param {string} params.url
   * @param {string} [params.user]
   * @param {string} [params.password]
   * @param {string} [params.method]
   * @param {string} [params.responseType]
   * @param {integer} [params.timeout]
   * @param {Object} [params.requestHeaders]
   * @param {Object} [params.formData]
   * @param {function} [params.onreadystatechange]
   * @param {boolean} [params.allowAnyStatus] - whether to allow non-2xx response
   */
  scrapbook.xhr = async function (params = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (params.onreadystatechange) {
        xhr.onreadystatechange = function (event) {
          params.onreadystatechange(xhr);
        };
      }

      xhr.onload = function (event) {
        if (params.allowAnyStatus || (xhr.status >= 200 && xhr.status < 300) || xhr.status == 0) {
          // we only care about real loading success
          resolve(xhr);
        } else {
          // treat "404 Not found" or so as error
          let statusText = xhr.statusText || HTTP_STATUS_TEXT[xhr.status];
          statusText = xhr.status + (statusText ? " " + statusText : "");
          reject(new Error(statusText));
        }
      };

      xhr.onabort = function (event) {
        // resolve with no param
        resolve();
      };

      xhr.onerror = function (event) {
        // No additional useful information can be get from the event object.
        reject(new Error("Network request failed."));
      };

      xhr.ontimeout = function (event) {
        reject(new Error("Request timeout."));
      };

      xhr.responseType = params.responseType;
      xhr.open(params.method || "GET", params.url, true, params.user, params.password);

      if (params.timeout) { xhr.timeout = params.timeout; }

      // Must call setRequestHeader() after open(), but before send().
      if (params.requestHeaders) {
        for (let header in params.requestHeaders) {
          xhr.setRequestHeader(header, params.requestHeaders[header]);
        }
      }

      xhr.send(params.formData);
    });
  };

  /**
   * Check for whether a server backend is set
   */
  scrapbook.hasServer = function () {
    const url = scrapbook.getOption("server.url");
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch (ex) {
      return false;
    }
  };


  /****************************************************************************
   * Promise utilities
   ***************************************************************************/

  scrapbook.delay = async function (ms) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, ms);
    });
  };

  scrapbook.isPromise = function (object) {
    return object && typeof object.then === 'function';
  };


  /****************************************************************************
   * Miscellaneous utilities
   ***************************************************************************/

  /**
   * A polled prompt for a multi-line input.
   */
  scrapbook.prompt = function (message, prefill = '', linebreak = '  ') {
    const linesNew = [];
    const lines = prefill.split(/\n|\r?\n/g);
    let i = 0;
    while (true) {
      let line = lines[i] || '';
      if (linesNew.length < lines.length - 1) {
        line += linebreak;
      }
      const lineNew = prompt(message, line);
      if (lineNew === null) {
        return null;
      }
      if (!lineNew.endsWith(linebreak)) {
        linesNew.push(lineNew);
        break;
      }
      linesNew.push(lineNew.slice(0, -linebreak.length));
      i++;
    }
    return linesNew.join('\n');
  };

  /****************************************************************************
   * Zip utilities
   *
   * @require JSZip
   ***************************************************************************/

  scrapbook.zipAddFile = function (zipObj, filename, blob, isText, options = {}) {
    if (typeof isText === 'undefined' || isText === null) {
      isText = /^text\/|\b(?:xml|json|javascript)\b/.test(blob.type);
    }

    // Binary and small text data usually have poor compression rate.
    const zipOptions = (isText && blob.size >= 128) ?
        {compression: "DEFLATE", compressionOptions: {level: 9}} :
        {compression: "STORE"};
    Object.assign(zipOptions, options);

    // The timestamp field of zip usually use local time, while JSZip writes UTC
    // time for compatibility purpose since it does not support extended UTC
    // fields. For example, a file modified at 08:00 (UTC+8) is stored with
    // timestamp 00:00. We fix this by ourselves.
    // https://github.com/Stuk/jszip/issues/369
    const _defaultDate = JSZip.defaults.date;
    const d = options.date || new Date();
    d.setTime(d.valueOf() - d.getTimezoneOffset() * 60 * 1000);
    JSZip.defaults.date = d;
    delete zipOptions.date;

    zipObj.file(filename, blob, zipOptions);

    JSZip.defaults.date = _defaultDate;
  };

  // JSZip assumes timestamp of every file be UTC time and returns adjusted local
  // time. For example, retrieving date for an entry with timestamp 00:00 gets
  // 08:00 if the timezone is UTC+8. We fix this by ourselves.
  // https://github.com/Stuk/jszip/issues/369
  scrapbook.zipFixModifiedTime = function (dateInZip) {
    return new Date(dateInZip.valueOf() + dateInZip.getTimezoneOffset() * 60 * 1000);
  };

  scrapbook.getMaffIndexFiles = async function (zipObj) {
    // get the list of top-folders
    const topdirs = new Set();
    for (const inZipPath in zipObj.files) {
      const depth = inZipPath.split("/").length - 1;
      if (depth === 1) {
        const dirname = inZipPath.replace(/\/.*$/, "");
        topdirs.add(dirname + '/');
      }
    }

    // get index files in each topdir
    const indexFiles = [];
    for (const topdir of topdirs) {
      try {
        const zipDir = zipObj.folder(topdir);
        const zipRdfFile = zipDir.file('index.rdf');
        if (zipRdfFile) {
          let doc;
          try {
            const ab = await zipRdfFile.async('arraybuffer');
            const file = new File([ab], 'index.rdf', {type: "application/rdf+xml"});
            doc = await scrapbook.readFileAsDocument(file);
          } catch (ex) {
            throw new Error(`Unable to load 'index.rdf'.`);
          }

          const meta = scrapbook.parseMaffRdfDocument(doc);

          if (!meta.indexfilename) {
            throw new Error(`'index.rdf' specifies no index file.`);
          }

          if (!/^index[.][^./]+$/.test(meta.indexfilename)) {
            throw new Error(`'index.rdf' specified index file '${meta.indexfilename}' is invalid.`);
          }

          const zipIndexFile = zipDir.file(meta.indexfilename);
          if (!zipIndexFile) {
            throw new Error(`'index.rdf' specified index file '${meta.indexfilename}' not found.`);
          }

          indexFiles.push(zipIndexFile.name);
        } else {
          const files = zipDir.file(/^index[.][^./]+$/);
          if (files.length) {
            indexFiles.push(files[0].name);
          } else {
            throw new Error(`'index.*' file not found.`);
          }
        }
      } catch (ex) {
        throw new Error(`Unable to get index file in directory: '${topdir}': ${ex.message}`);
      }
    }
    return indexFiles;
  };


  return scrapbook;

}));
