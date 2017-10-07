/********************************************************************
 *
 * Shared utilities for most scripts, including background scripts
 * and content scripts.
 *
 * @public {boolean} isDebug
 * @public {Object} scrapbook
 * @public {Object} browser
 *******************************************************************/

let isDebug = false;
let scrapbook = {
  get isGecko() {
    let m = chrome.runtime.getManifest();
    delete this.isGecko;
    return this.isGecko = !!(m.applications && m.applications.gecko);
  }
};


/********************************************************************
 * Options
 *******************************************************************/

scrapbook.options = {
  "capture.scrapbookFolder": "WebScrapBook",
  "capture.saveAs": "zip", // "folder", "zip", "maff", "singleHtml"
  "capture.saveInScrapbook": false,
  "capture.saveAsciiFilename": false,
  "capture.saveBeyondSelection": false,
  "capture.saveFileAsHtml": false,
  "capture.saveDataUriAsFile": false,
  "capture.favicon": "save", // "save", "link", "blank", "remove"
  "capture.image": "save", // "save", "link", "blank", "remove"
  "capture.imageBackground": "save", // "save", "link", "remove"
  "capture.audio": "save", // "save", "link", "blank", "remove"
  "capture.video": "save", // "save", "link", "blank", "remove"
  "capture.embed": "save", // "save", "link", "blank", "remove"
  "capture.object": "save", // "save", "link", "blank", "remove"
  "capture.applet": "save", // "save", "link", "blank", "remove"
  "capture.canvas": "save", // "save", "blank", "remove"
  "capture.frame": "save", // "save", "link", "blank", "remove"
  "capture.font": "save", // "save", "link", "blank", "remove"
  "capture.style": "save", // "save", "link", "blank", "remove"
  "capture.styleInline": "save", // "save", "blank", "remove"
  "capture.rewriteCss": "url", // "none", "url"
  "capture.script": "blank", // "save", "link", "blank", "remove"
  "capture.scriptAnchor": "blank", // "save", "blank", "remove"
  "capture.scriptAttr": "remove", // "save", "remove"
  "capture.noscript": "save", // "save", "blank", "remove"
  "capture.base": "blank", // "save", "blank", "remove"
  "capture.formStatus": "keep", // "keep", "reset"
  "capture.removeIntegrity": true,
  "capture.recordDocumentMeta": true,
  "capture.recordRemovedNode": false,
  "capture.recordRewrittenAttr": false,
  "capture.recordSourceUri": false,
  "capture.recordErrorUri": false,
  "viewer.useFileSystemApi": true,
  "viewer.viewHtz": true,
  "viewer.viewMaff": true,
};

scrapbook.isOptionsSynced = false;

/**
 * - Firefox < 52: chrome.storage.sync === undefined
 *
 * - Firefox 52: webextensions.storage.sync.enabled is default to false,
 *   and chrome.storage.sync.*() gets an error.
 *
 * - Firefox >= 53: webextensions.storage.sync.enabled is default to true,
 *   and chrome.storage.sync.*() works.
 *
 * An error would occur if the user manually sets 
 * webextensions.storage.sync.enabled to false without restarting Firefox.
 * We don't (and probably cannot) support such user operation since we
 * cannot migrate configs from storage.sync to storage.local when it gets
 * disabled, and we get an inconsistent status if we simply shift configs
 * from storage.sync to storage.local.
 */
scrapbook.getOptionStorage = function () {
  let p = Promise.resolve().then(() => {
    if (!browser.storage.sync) { return browser.storage.local; }
    return browser.storage.sync.get({})
      .then(() => (browser.storage.sync), (ex) => (browser.storage.local));
  });
  scrapbook.getOptionStorage = function () { return p; };
  return p;
};

scrapbook.getOption = function (key, defaultValue) {
  let result = scrapbook.options[key];
  if (result === undefined) {
    result = defaultValue;
  }
  return result;
};

scrapbook.getOptions = function (keyPrefix) {
  let result = {};
  let regex = new RegExp("^" + scrapbook.escapeRegExp(keyPrefix) + ".");
  for (let key in scrapbook.options) {
    if (regex.test(key)) {
      result[key] = scrapbook.getOption(key);
    }
  }
  return result;
};

scrapbook.setOption = function (key, value) {
  return Promise.resolve().then(() => {
    scrapbook.options[key] = value;
    let pair = {key: value};
    return scrapbook.getOptionStorage().then((storage) => {
      return storage.set(pair);
    });
  });
};

scrapbook.loadOptions = function () {
  return scrapbook.getOptionStorage().then((storage) => {
    return storage.get(scrapbook.options);
  }).then((items) => {
    for (let i in items) {
      scrapbook.options[i] = items[i];
      scrapbook.isOptionsSynced = true;
    }
    return items;
  });
};

scrapbook.saveOptions = function () {
  return scrapbook.getOptionStorage().then((storage) => {
    return storage.set(scrapbook.options);
  });
};


/********************************************************************
 * Cache
 * 
 * Use indexedDB for Chrome since storing Blobs is not supported.
 * 
 * Use storage API for Firefox since storing Blobs is supported, and
 * indexedDB is not available for private windows.
 *******************************************************************/

scrapbook.cache = {
  storage: {
    get(key, defaultValue) {
      return new Promise((resolve, reject) => {
        let pair = {[key]: defaultValue};
        chrome.storage.local.get(pair, (items) => {
          if (!chrome.runtime.lastError) {
            resolve(items[key]);
          } else {
            reject(chrome.runtime.lastError);
          }
        });
      });
    },

    set(key, value) {
      return new Promise((resolve, reject) => {
        let pair = {[key]: value};
        chrome.storage.local.set(pair, () => {
          if (!chrome.runtime.lastError) {
            resolve();
          } else {
            reject(chrome.runtime.lastError);
          }
        });
      });
    },

    remove(key) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove(key, () => {
          if (!chrome.runtime.lastError) {
            resolve();
          } else {
            reject(chrome.runtime.lastError);
          }
        });
      });
    },
  },

  indexedDB: {
    connect() {
      let p = new Promise((resolve, reject) => {
        let request = indexedDB.open("scrapbook", 2);
        request.onupgradeneeded = (event) => {
          let db = event.target.result;
          if (event.oldVersion === 1) {
            db.deleteObjectStore("archiveZipFiles");
          }
          db.createObjectStore("cache", {keyPath: "key"});
        };
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
      this.connect = function () {
        return p;
      };
      return p;
    },

    get(key) {
      return this.connect().then((db) => {
        let transaction = db.transaction("cache", "readonly");
        let objectStore = transaction.objectStore(["cache"]);
        return new Promise((resolve, reject) => {
          let request = objectStore.get(key);
          request.onsuccess = function (event) {
            let result = event.target.result;
            resolve(result ? result.value : undefined);
          };
          request.onerror = function (event) {
            reject(event.target.error);
          };
        });
      });
    },

    set(key, value) {
      return this.connect().then((db) => {
        return new Promise((resolve, reject) => {
          let transaction = db.transaction("cache", "readwrite");
          let objectStore = transaction.objectStore(["cache"]);
          let request = objectStore.add({key, value});
          transaction.oncomplete = (event) => {
            resolve();
          };
          transaction.onerror = (event) => {
            reject(event.target.error);
          };
        });
      });
    },

    remove(key) {
      return this.connect().then((db) => {
        return new Promise((resolve, reject) => {
          let transaction = db.transaction("cache", "readwrite");
          let objectStore = transaction.objectStore(["cache"]);
          let request = objectStore.delete(key);
          request.onsuccess = function (event) {
            resolve();
          };
          request.onerror = function (event) {
            reject(event.target.error);
          };
        });
      });
    },
  },
};

scrapbook.getCache = function (key, defaultValue) {
  const keyStr = JSON.stringify(key);

  if (scrapbook.isGecko) {
    return scrapbook.cache.storage.get(keyStr, defaultValue);
  } else {
    return scrapbook.cache.indexedDB.get(keyStr, defaultValue);
  }
};

scrapbook.setCache = function (key, value) {
  const keyStr = JSON.stringify(key);

  if (scrapbook.isGecko) {
    return scrapbook.cache.storage.set(keyStr, value);
  } else {
    return scrapbook.cache.indexedDB.set(keyStr, value);
  }
};

scrapbook.removeCache = function (key) {
  const keyStr = JSON.stringify(key);

  if (scrapbook.isGecko) {
    return scrapbook.cache.storage.remove(keyStr);
  } else {
    return scrapbook.cache.indexedDB.remove(keyStr);
  }
};


/********************************************************************
 * Lang
 *******************************************************************/

scrapbook.lang = function (key, args) {
  return chrome.i18n.getMessage(key, args) || "__MSG_" + key + "__";
};

scrapbook.loadLanguages = function (rootNode) {
  Array.prototype.forEach.call(rootNode.getElementsByTagName("*"), (elem) => {
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


/********************************************************************
 * ScrapBook related path/file/string/etc handling
 *******************************************************************/

/**
 * Escapes the given filename string to be used in the URI
 *
 * Preserves other chars for beauty
 *
 * see also: validateFilename
 */
scrapbook.escapeFilename = function (filename) {
  return filename.replace(/[ %#]+/g, m => encodeURIComponent(m));
};

/**
 * Transliterates the given string to be a safe filename
 *
 * see also: escapeFileName
 *
 * @param {string} filename
 * @param {boolean} forceAscii - also escapes all non-ASCII chars
 */
scrapbook.validateFilename = function (filename, forceAscii) {
  let fn = filename
      // control chars are bad for filename
      .replace(/[\x00-\x1F\x7F]+|^ +/g, "")
      // leading/trailing spaces and dots are not allowed on Windows
      .replace(/^\./, "_.").replace(/^ +/, "").replace(/[. ]+$/, "")
      // bad chars on most OS
      .replace(/[:"?*\\/|]/g, "_")
      // bad chars on Windows, replace with adequate direction
      .replace(/[<]/g, "(").replace(/[>]/g, ")")
      // "~" is not allowed by chrome.downloads
      .replace(/[~]/g, "-");
  if (forceAscii) {
    fn = fn.replace(/[^\x00-\x7F]+/g, m => encodeURIComponent(m));
  }
  fn = fn || "_"; // prevent empty filename
  return fn;
};

scrapbook.urlToFilename = function (url) {
  let name = url, pos;
  pos = name.indexOf("?");
  if (pos !== -1) { name = name.substring(0, pos); }
  pos = name.indexOf("#");
  if (pos !== -1) { name = name.substring(0, pos); }
  pos = name.lastIndexOf("/");
  if (pos !== -1) { name = name.substring(pos + 1); }

  // decode %xx%xx%xx only if it's correctly UTF-8 encoded
  // @TODO: decode using a specified charset
  try {
    name = decodeURIComponent(name);
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

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @param  {Date|undefined} date - Given day, or now if undefined
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
  if (id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/)) {
    dd = new Date(
        parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
        parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10), parseInt(RegExp.$7, 10)
        );
    dd.setTime(dd.valueOf() - dd.getTimezoneOffset() * 60 * 1000);
  }
  return dd;
};

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @deprecated Used by older ScrapBook 1.x, may get inaccurate if used across different timezone
 * @param {Date|undefined} date - Given day, or now if undefined
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
 * @deprecated Used by older ScrapBook 1.x, may get inaccurate if used across different timezone
 * @param {Date} id - Given ScrapBook ID
 */
scrapbook.idToDateOld = function (id) {
  let dd;
  if (id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)) {
    dd = new Date(
        parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
        parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10)
        );
  }
  return dd;
};

/**
 * @return {Promise} The rough match pattern for content pages.
 */
scrapbook.getContentPagePattern = function () {
  const p = browser.extension.isAllowedFileSchemeAccess().then((isAllowedAccess) => {
    const urlMatch = ["http://*/*", "https://*/*"];
    if (isAllowedAccess) { urlMatch.push("file://*"); }
    return urlMatch;
  });
  scrapbook.getContentPagePattern = function () {
    return p;
  };
  return p;
};

/**
 * @param {string} url
 * @param {boolean} isAllowedFileSchemeAccess - Optional for better accuracy.
 * @return {string} Whether the page url is allowed for content scripts.
 */
scrapbook.isContentPage = function (url, isAllowedFileSchemeAccess = !scrapbook.isGecko) {
  const filter = new RegExp(`^(?:https?${isAllowedFileSchemeAccess ? "|file" : ""}):`);
  if (!filter.test(url)) { return false; }
  if (scrapbook.isGecko) {
    if (url.startsWith("https://addons.mozilla.org/")) { return false; }
  } else {
    if (url.startsWith("https://chrome.google.com/webstore/")) { return false; }
  }
  return true;
};


/********************************************************************
 * String handling
 *******************************************************************/

/**
 * Crops the given string
 *
 * @param {boolean} byUtf8   - true to crop texts according to each byte under UTF-8 encoding
 *                             false to crop according to each UTF-16 char
 * @param {boolean} ellipsis - string for ellipsis
 */
scrapbook.crop = function (str, maxLength, byUtf8, ellipsis) {
  if (typeof ellipsis  === "undefined") { ellipsis = "..."; }
  if (byUtf8) {
    let bytes = this.unicodeToUtf8(str);
    if (bytes.length <= maxLength) { return str; }
    bytes = bytes.substring(0, maxLength - this.unicodeToUtf8(ellipsis).length);
    while (true) {
      try {
        return this.utf8ToUnicode(bytes) + ellipsis;
      } catch (ex) {
        // error if we cut a UTF-8 char sequence in the middle
      }
      bytes= bytes.substring(0, bytes.length-1);
    }
  } else {
    return (str.length > maxLength) ? str.substr(0, maxLength - ellipsis.length) + ellipsis : str;
  }
};

scrapbook.getUuid = function () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = Math.random()*16|0, v = (c == 'x') ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

scrapbook.escapeHtml = function (str, noDoubleQuotes, singleQuotes, spaces) {
  let list = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': (noDoubleQuotes ? '"' : "&quot;"),
    "'": (singleQuotes ? "&#39;" : "'"),
    " ": (spaces ? "&nbsp;" : " ")
  };
  return str.replace(/[&<>"']| (?= )/g, m => list[m]);
};

scrapbook.unescapeHtml = function (str) {
  let list = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;" : ">",
    "&quot;" : '"',
    "&apos;" : "'",
    "&nbsp;" : " "
  };
  return str.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:(\d+)|x([0-9A-Fa-f]+));/g, (entity, dec, hex) => {
    if (dec) return String.fromCharCode(parseInt(dec, 10));
    if (hex) return String.fromCharCode(parseInt(hex, 16));
    return list[entity];
  });
};

scrapbook.escapeRegExp = function (str) {
  return str.replace(/([\*\+\?\.\^\/\$\\\|\[\]\{\}\(\)])/g, "\\$1");
};

scrapbook.escapeHtmlComment = function (str) {
  return str.replace(/-([\u200B]*)-/g, "-\u200B$1-");
};

scrapbook.escapeQuotes = function (str) {
  return str.replace(/[\\"]/g, "\\$&");
};

scrapbook.unescapeQuotes = function (str) {
  return str.replace(/\\(.)/g, "$1");
};

scrapbook.unescapeCss = function (str) {
  let that = arguments.callee;
  if (!that.replaceRegex) {
    that.replaceRegex = /\\([0-9A-Fa-f]{1,6}) ?|\\(.)/g;
    that.getCodes = function (n) {
      if (n < 0x10000) return [n];
      n -= 0x10000;
      return [0xD800+(n>>10), 0xDC00+(n&0x3FF)];
    };
    that.replaceFunc = function (m, u, c) {
      if (c) return c;
      if (u) return String.fromCharCode.apply(null, that.getCodes(parseInt(u, 16)));
    };
  }
  return str.replace(that.replaceRegex, that.replaceFunc);
};

/**
 * A URL containing standalone "%"s, e.g. "http://example.com/50%",
 * causes a "Malformed URI sequence" error on decodeURIComponent.
 */
scrapbook.decodeURIComponent = function (uri) {
  return uri.replace(/(%[0-9A-F]{2})+/gi, m => decodeURIComponent(m));
};

scrapbook.stringToDataUri = function (str, mime, charset) {
  mime = mime || "";
  charset = charset ? ";charset=" + charset : "";
  return "data:" + mime + charset + ";base64," + this.unicodeToBase64(str);
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


/********************************************************************
 * String handling - HTML Header parsing
 *******************************************************************/

/**
 * Parse Content-Type string from the HTTP Header
 *
 * @return {{contentType: string, charset: string}}
 */
scrapbook.parseHeaderContentType = function (string) {
  let result = {type: undefined, parameters: {}};

  if (typeof string !== 'string') {
    return result;
  }

  if (/^(.*?)(?=;|$)/i.test(string)) {
    string = RegExp.rightContext;
    result.type = RegExp.$1.trim();
    while (/;((?:"(?:\\.|[^"])*(?:"|$)|[^"])*?)(?=;|$)/i.test(string)) {
      string = RegExp.rightContext;
      let parameter = RegExp.$1;
      if (/\s*(.*?)\s*=\s*("(?:\\.|[^"])*"|[^"]*?)\s*$/i.test(parameter)) {
        let field = RegExp.$1;
        let value = RegExp.$2;

        // manage double quoted value
        if (/^"(.*?)"$/.test(value)) {
          value = scrapbook.unescapeQuotes(RegExp.$1);
        }

        result.parameters[field] = value;
      }
    }
  }

  return result;
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
  let result = {type: undefined, parameters: {}};

  if (typeof string !== 'string') {
    return result;
  }

  if (/^(.*?)(?=;|$)/i.test(string)) {
    string = RegExp.rightContext;
    result.type = RegExp.$1.trim();
    while (/;((?:"(?:\\.|[^"])*(?:"|$)|[^"])*?)(?=;|$)/i.test(string)) {
      string = RegExp.rightContext;
      let parameter = RegExp.$1;
      if (/\s*(.*?)\s*=\s*("(?:\\.|[^"])*"|[^"]*?)\s*$/i.test(parameter)) {
        let field = RegExp.$1;
        let value = RegExp.$2;

        // manage double quoted value
        if (/^"(.*?)"$/.test(value)) {
          value = scrapbook.unescapeQuotes(RegExp.$1);
        }

        if (/^(.*)\*$/.test(field)) {
          // the field uses an ext-value
          field = RegExp.$1;
          if (/^(.*?)'(.*?)'(.*?)$/.test(value)) {
            let charset = RegExp.$1.toLowerCase(), lang = RegExp.$2.toLowerCase(), value = RegExp.$3;
            switch (charset) {
              case 'iso-8859-1':
                value = decodeURIComponent(value).replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
                break;
              case 'utf-8':
                value = decodeURIComponent(value);
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

/**
 * Parse Refresh string from the HTTP Header
 *
 * ref: https://www.w3.org/TR/html5/document-metadata.html
 *
 * @return {{time: string, url: string}}
 */
scrapbook.parseHeaderRefresh = function (string) {
  let result = {time: undefined, url: undefined};

  if (typeof string !== 'string') {
    return result;
  }

  if (/^\s*(.*?)(?=[;,]|$)/i.test(string)) {
    result.time = parseInt(RegExp.$1);
    string = RegExp.rightContext;
    if (/^[;,]\s*url\s*=\s*((["'])?.*)$/i.test(string)) {
      let url = RegExp.$1;
      let quote = RegExp.$2;
      if (quote) {
        let pos = url.indexOf(quote, 1);
        if (pos !== -1) { url = url.slice(1, pos); }
      }
      url = url.trim().replace(/[\t\n\r]+/g, "");
      result.url = url;
    }
  }

  return result;
};


/********************************************************************
 * File/Blob utilities
 *******************************************************************/

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @return {Promise}
 */
scrapbook.readFileAsArrayBuffer = function (blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  }).then((event) => {
    return event.target.result;
  });
};

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @return {Promise}
 */
scrapbook.readFileAsDataURL = function (blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }).then((event) => {
    return event.target.result;
  });
};

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @param {string|false} charset - Read as UTF-8 if undefined and as raw bytes if falsy.
 * @return {Promise}
 */
scrapbook.readFileAsText = function (blob, charset = "UTF-8") {
  if (charset) {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = resolve;
      reader.onerror = reject;
      reader.readAsText(blob, charset);
    }).then((event) => {
      return event.target.result;
    });
  }
  return scrapbook.readFileAsArrayBuffer(blob).then((ab) => {
    return scrapbook.arrayBufferToByteString(ab);
  });
};

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @return {Promise}
 */
scrapbook.readFileAsDocument = function (blob) {
  return scrapbook.xhr({
    url: URL.createObjectURL(blob),
    responseType: "document",
  }).then((xhr) => {
    return xhr.response;
  });
};

scrapbook.dataUriToFile = function (dataUri) {
  if (/^data:([^,]*?)(;base64)?,(.*?)$/i.test(dataUri)) {
    let mediatype = RegExp.$1;
    let base64 = !!RegExp.$2;
    let data = RegExp.$3;

    let parts = mediatype.split(";");
    let mime = parts.shift();
    let parameters = {};
    parts.forEach((part) => {
      if (/^(.*?)=(.*?)$/.test(part)) {
        parameters[RegExp.$1.toLowerCase()] = RegExp.$2;
      }
    });

    let ext = Mime.prototype.extension(mime);
    ext = ext ? ("." + ext) : "";

    let bstr = base64 ? atob(data) : unescape(data);
    let ab = scrapbook.byteStringToArrayBuffer(bstr);
    let filename = parameters.filename ? decodeURIComponent(parameters.filename) : scrapbook.sha1(ab, "ARRAYBUFFER") + ext;
    let file = new File([ab], filename, {type: mediatype});
    return file;
  }
  return null;
};


/********************************************************************
 * HTML DOM related utilities
 *******************************************************************/

scrapbook.doctypeToString = function (doctype) {
  if (!doctype) { return ""; }
  let ret = "<!DOCTYPE " + doctype.name;
  if (doctype.publicId) { ret += ' PUBLIC "' + doctype.publicId + '"'; }
  if (doctype.systemId) { ret += ' "'        + doctype.systemId + '"'; }
  ret += ">\n";
  return ret;
};

/**
 * Process a CSS file and rewrite it
 *
 * Browser normally determine the charset of a CSS file via:
 * 1. HTTP header content-type
 * 2. Unicode BOM in the CSS file
 * 3. @charset rule in the CSS file
 * 4. assume it's UTF-8
 *
 * We save the CSS file as UTF-8 for better compatibility.
 * For case 3, a UTF-8 BOM is prepended to suppress the @charset rule.
 * We don't follow case 4 and save the CSS file as byte string so that
 * the user could fix the encoding manually.
 *
 * @param {Blob} data
 * @param {string} charset
 * @param {Promise} rewriter - The Promise that rewrites the CSS text.
 * @return {Promise}
 */
scrapbook.parseCssFile = function (data, charset, rewriter) {
  return Promise.resolve().then(() => {
    if (charset) {
      return scrapbook.readFileAsText(data, charset);
    }
    return scrapbook.readFileAsText(data, false).then((bytes) => {
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
      } else if (/^@charset (["'])(\w+)\1;/.test(bytes)) {
        charset = RegExp.$2;
      }
      if (charset) {
        // Add BOM to make the browser read as UTF-8 despite @charset rule
        return scrapbook.readFileAsText(data, charset).then((text) => {
          // The read text does not contain a BOM if the original file has.
          // This added UTF-16 BOM will be converted to UTF-8 BOM automatically when creating blob.
          return "\ufeff" + text;
        });
      }
      return bytes;
    });
  }).then((origText) => {
    return rewriter(origText);
  }).then((rewrittenText) => {
    let blob;
    if (charset) {
      blob = new Blob([rewrittenText], {type: "text/css;charset=UTF-8"});
    } else {
      let ab = scrapbook.byteStringToArrayBuffer(rewrittenText);
      blob = new Blob([ab], {type: "text/css"});
    }
    return blob;
  });
};

/**
 * The function that rewrites each URL into a new URL.
 *
 * @callback parseCssTextRewriteFunc
 * @param {string} url
 * @return {string} newUrl
 */

/**
 * process the CSS text of whole <style> or a CSS file
 *
 * @TODO: current code is rather heuristic and ugly,
 *        consider implementing a real CSS parser to prevent potential errors
 *        for certain complicated CSS
 *
 * @param {string} cssText
 * @param {Object} rewriteFuncs
 *     - {parseCssTextRewriteFunc} rewriteImportUrl
 *     - {parseCssTextRewriteFunc} rewriteFontFaceUrl
 *     - {parseCssTextRewriteFunc} rewriteBackgroundUrl
 */
scrapbook.parseCssText = function (cssText, rewriteFuncs) {
  let pCm = "(?:/\\*[\\s\\S]*?\\*/)"; // comment
  let pSp = "(?:[ \\t\\r\\n\\v\\f]*)"; // space equivalents
  let pCmSp = "(?:" + "(?:" + pCm + "|" + pSp + ")" + "*" + ")"; // comment or space
  let pChar = "(?:\\\\.|[^\\\\])"; // a char, or a escaped char sequence
  let pStr = "(?:" + pChar + "*?" + ")"; // string
  let pSStr = "(?:" + pCmSp + pStr + pCmSp + ")"; // spaced string
  let pDQStr = "(?:" + '"' + pStr + '"' + ")"; // double quoted string
  let pSQStr = "(?:" + "'" + pStr + "'" + ")"; // single quoted string
  let pES = "(?:" + "(?:" + [pCm, pDQStr, pSQStr, pChar].join("|") + ")*?" + ")"; // embeded string
  let pUrl = "(?:" + "url\\(" + pSp + "(?:" + [pDQStr, pSQStr, pSStr].join("|") + ")" + pSp + "\\)" + ")"; // URL
  let pUrl2 = "(" + "url\\(" + pSp + ")(" + [pDQStr, pSQStr, pSStr].join("|") + ")(" + pSp + "\\)" + ")"; // URL; catch 3
  let pRImport = "(" + "@import" + pCmSp + ")(" + [pUrl, pDQStr, pSQStr].join("|") + ")(" + pCmSp + ";" + ")"; // rule import; catch 3
  let pRFontFace = "(" + "@font-face" + pCmSp + "{" + pES + "}" + ")"; // rule font-face; catch 1

  let parseUrl = function (text, callback) {
    return text.replace(new RegExp(pUrl2, "gi"), (m, pre, url, post) => {
      let ret;
      if (url.startsWith('"') && url.endsWith('"')) {
        let u = scrapbook.unescapeCss(url.slice(1, -1));
        ret = callback(u);
      } else if (url.startsWith("'") && url.endsWith("'")) {
        let u = scrapbook.unescapeCss(url.slice(1, -1));
        ret = callback(u);
      } else {
        let u = scrapbook.unescapeCss(url.trim());
        ret = callback(u);
      }
      return pre + '"' + scrapbook.escapeQuotes(ret) + '"' + post;
    });
  };

  let newCssText = cssText.replace(
    new RegExp([pCm, pRImport, pRFontFace, "("+pUrl+")"].join("|"), "gi"),
    (m, im1, im2, im3, ff, u) => {
      if (im2) {
        let ret;
        if (im2.startsWith('"') && im2.endsWith('"')) {
          let u = scrapbook.unescapeCss(im2.slice(1, -1));
          ret = 'url("' + scrapbook.escapeQuotes(rewriteFuncs.rewriteImportUrl(u)) + '")';
        } else if (im2.startsWith("'") && im2.endsWith("'")) {
          let u = scrapbook.unescapeCss(im2.slice(1, -1));
          ret = 'url("' + scrapbook.escapeQuotes(rewriteFuncs.rewriteImportUrl(u)) + '")';
        } else {
          ret = parseUrl(im2, rewriteFuncs.rewriteImportUrl);
        }
        return im1 + ret + im3;
      } else if (ff) {
        return parseUrl(m, rewriteFuncs.rewriteFontFaceUrl);
      } else if (u) {
        return parseUrl(m, rewriteFuncs.rewriteBackgroundUrl);
      }
      return m;
    });
  return newCssText;
};

/**
 * The function that rewrites each URL into a new URL.
 *
 * @callback parseSrcsetRewriteFunc
 * @param {string} url
 * @return {string} newUrl
 */

/**
 * @param {string} srcset
 * @param {parseSrcsetRewriteFunc} rewriteFunc
 */
scrapbook.parseSrcset = function (srcset, rewriteFunc) {
  return srcset.replace(/(\s*)([^ ,][^ ]*[^ ,])(\s*(?: [^ ,]+)?\s*(?:,|$))/g, (m, m1, m2, m3) => {
    return m1 + rewriteFunc(m2) + m3;
  });
};


/********************************************************************
 * Network utilities
 *******************************************************************/

scrapbook.httpStatusText = {
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
  511: "Network Authentication Required"
};

/**
 * A simple XMLHttpRequest wrapper for most common tasks.
 * 
 * Don't use fetch() since it doen't support file: protocol.
 *
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.responseType
 *     - {Array} params.requestHeaders
 *     - {function} params.onreadystatechange
 */
scrapbook.xhr = function (params = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (params.onreadystatechange) {
      xhr.onreadystatechange = function (event) {
        params.onreadystatechange(xhr);
      };
    }

    xhr.onload = function (event) {
      if (xhr.status == 200 || xhr.status == 0) {
        // we only care about real loading success
        resolve(xhr);
      } else {
        // treat "404 Not found" or so as error
        let statusText = xhr.statusText || scrapbook.httpStatusText[xhr.status];
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
    xhr.open("GET", params.url, true);

    // Must call setRequestHeader() after open(), but before send().
    if (params.requestHeaders) {
      for (let header in params.requestHeaders) {
        xhr.setRequestHeader(header, params.requestHeaders[header]);
      }
    }

    xhr.send();
  });
};


/********************************************************************
 * Promise utilities
 *******************************************************************/

/**
 * @return {Promise}
 */
scrapbook.delay = function (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
};


true; // return value of executeScript
