/******************************************************************************
 * Shared general utilities.
 *
 * @requires browser
 *****************************************************************************/

import "./polyfill.mjs";
import {isDebug} from "./debug.mjs";

const BACKEND_MIN_VERSION = '2.6.0';

/**
 * @typedef {Object} scrapbookOptions
 */
const DEFAULT_OPTIONS = {
  "ui.toolbar.showCaptureTab": true,
  "ui.toolbar.showCaptureTabSource": true,
  "ui.toolbar.showCaptureTabBookmark": true,
  "ui.toolbar.showCaptureTabAs": true,
  "ui.toolbar.showBatchCapture": false,
  "ui.toolbar.showBatchCaptureLinks": true,
  "ui.toolbar.showEditTab": true,
  "ui.toolbar.showSearchCaptures": true,
  "ui.toolbar.showOpenScrapBook": true,
  "ui.toolbar.showOpenViewer": true,
  "ui.toolbar.showOpenOptions": true,
  "ui.autoCloseBrowserAction": true,
  "ui.showContextMenu": true,
  "ui.autoCloseCaptureDialog": "none", // "none", "nowarn", "noerror", "nofailure", "always"
  "ui.notifyPageCaptured": true,
  "ui.screen.left": 0,
  "ui.screen.top": 0,
  "ui.screen.width": 1920,
  "ui.screen.height": 1080,
  "server.url": "",
  "server.user": "",
  "server.password": "",
  "capture.serverUploadWorkers": 4,
  "capture.serverUploadRetryCount": 3,
  "capture.serverUploadRetryDelay": 2000,
  "capture.downloadWorkers": 4,
  "capture.downloadRetryCount": 3,
  "capture.downloadRetryDelay": 1000,
  "capture.saveTo": "folder", // "server", "folder", "file", "memory"
  "capture.saveFolder": "WebScrapBook/data",
  "capture.saveAs": "folder", // "folder", "zip", "maff", "singleHtml"
  "capture.saveFilename": "%id%",
  "capture.saveFilenameMaxLenUtf16": 120,
  "capture.saveFilenameMaxLenUtf8": 240,
  "capture.saveAsciiFilename": false,
  "capture.saveOverwrite": false,
  "capture.saveFileAsHtml": false,
  "capture.saveDataUriAsFile": true,
  "capture.saveDataUriAsSrcdoc": true,
  "capture.saveResourcesSequentially": false,
  "capture.resourceSizeLimit": null,
  "capture.image": "save", // "save", "save-current", "link", "blank", "remove"
  "capture.imageBackground": "save-used", // "save", "save-used", "link", "blank"
  "capture.favicon": "save", // "save", "link", "blank", "remove"
  "capture.faviconAttrs": "",
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
  "capture.contentSecurityPolicy": "remove", // "save", "remove"
  "capture.ping": "blank", // "link", "blank"
  "capture.preload": "remove", // "blank", "remove"
  "capture.prefetch": "remove", // "blank", "remove"
  "capture.base": "blank", // "save", "blank", "remove"
  "capture.formStatus": "keep", // "save-all", "save", "keep-all", "keep", "html-all", "html", "reset"
  "capture.shadowDom": "save", // "save", "remove"
  "capture.adoptedStyleSheet": "save", // "save", "remove"
  "capture.removeHidden": "none", // "none", "undisplayed"
  "capture.linkUnsavedUri": false,
  "capture.downLink.file.mode": "none", // "none", "url", "header"
  "capture.downLink.file.extFilter": "###image\n#bmp, gif, ico, jpg, jpeg, jpe, jp2, png, tif, tiff, svg\n###audio\n#aac, ape, flac, mid, midi, mp3, ogg, oga, ra, ram, rm, rmx, wav, wma\n###video\n#avc, avi, flv, mkv, mov, mpg, mpeg, mp4, wmv\n###archive\n#zip, rar, jar, bz2, gz, tar, rpm, 7z, 7zip, xz, jar, xpi, lzh, lha, lzma\n#/z[0-9]{2}|r[0-9]{2}/\n###document\n#pdf, doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, odg, odf, rtf, txt, csv\n###executable\n#exe, msi, dmg, bin, xpi, iso\n###any non-web-page\n#/(?!$|html?|xht(ml)?|php|py|pl|aspx?|cgi|jsp)(.*)/i",
  "capture.downLink.doc.depth": null,
  "capture.downLink.doc.delay": null,
  "capture.downLink.doc.mode": "source", // "tab", "source"
  "capture.downLink.doc.urlFilter": "",
  "capture.downLink.urlFilter": "###skip common logout URL\n/[/=]logout\\b/i",
  "capture.downLink.urlExtra": "",
  "capture.referrerPolicy": "", // "", "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"; prepend "+" to force
  "capture.referrerSpoofSource": false,
  "capture.recordDocumentMeta": true,
  "capture.recordRewrites": false,
  "capture.prettyPrint": false,
  "capture.insertInfoBar": false,
  "capture.helpersEnabled": false,
  "capture.helpers": "",
  "capture.remoteTabDelay": null,
  "capture.deleteErasedOnCapture": true,
  "capture.deleteErasedOnSave": false,
  "capture.backupForRecapture": true,
  "capture.zipCompressLevel": null,
  "autocapture.enabled": false,
  "autocapture.rules": "",
  "editor.autoInit": true,
  "editor.useNativeTags": false,
  "editor.lineMarker.style.1": "background: #FFFF00; background: linear-gradient(transparent 40%, rgba(255,255,0,0.9) 90%, transparent 100%);",
  "editor.lineMarker.style.2": "background: #00FF00; background: linear-gradient(transparent 40%, rgba(0,255,0,0.9) 90%, transparent 100%);",
  "editor.lineMarker.style.3": "background: #FF0000; background: linear-gradient(transparent 40%, rgba(255,0,0,0.9) 90%, transparent 100%);",
  "editor.lineMarker.style.4": "background: #0000FF; background: linear-gradient(transparent 40%, rgba(0,0,255,0.9) 90%, transparent 100%);",
  "editor.lineMarker.style.5": "border-bottom: medium solid #FFFF33;",
  "editor.lineMarker.style.6": "border-bottom: medium solid #33FF33;",
  "editor.lineMarker.style.7": "border-bottom: medium solid #FF3333;",
  "editor.lineMarker.style.8": "border-bottom: medium solid #3333FF;",
  "editor.lineMarker.style.9": "background-color: #FFFF99; color: #000000; border: thin dashed #FFCC00;",
  "editor.lineMarker.style.10": "background-color: #CCFFFF; color: #000000; border: thin solid #0099FF;",
  "editor.lineMarker.style.11": "background-color: #EE3311; color: #FFFFFF; font-weight: bold;",
  "editor.lineMarker.style.12": "border-bottom: 2px dotted #FF0000;",
  "editor.insertDateFormat": "%Y-%m-%d %H:%M:%S",
  "editor.insertDateFormatIsUtc": false,
  "viewer.viewHtz": true,
  "viewer.viewMaff": true,
  "viewer.viewAttachments": false,
  "indexer.createStaticSite": false,
  "indexer.fulltextCache": true,
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
  "scrapbook.itemPicker.recentItemsMax": 10,
  "scrapbook.sidebarOpenInNewTab": false,
  "scrapbook.sidebarSourceInNewTab": false,
  "scrapbook.sidebarViewTextInNewTab": false,
  "scrapbook.sidebarEditNoteInNewTab": false,
  "scrapbook.sidebarEditPostitInNewTab": false,
  "scrapbook.sidebarSearchInNewTab": true,
  "scrapbook.copyItemInfoFormatPlain": "%id%",
  "scrapbook.copyItemInfoFormatHtml": "",
  "scrapbook.export.recursive": true,
  "scrapbook.export.nonSingleton": true,
  "scrapbook.import.rebuildFolders": true,
  "scrapbook.import.resolveItemUsedNew": true,
  "scrapbook.transactionAutoBackup": true,
  "scrapbook.useBrowserSidebars": true,
  "scrapbook.autoRebuildSidebars": true,
  "scrapbook.defaultSearch": "-type:folder -type:separator",
  "scrapbook.searchCommentLength": 100,
  "scrapbook.searchContextLength": 120,
  "scrapbook.searchSourceLength": null,
  "scrapbook.searchSse": false,
  "scrapbook.fulltextCacheUpdateThreshold": 5 * 24 * 60 * 60 * 1000,
  "scrapbook.autoCache.fulltextCache": true,
  "scrapbook.autoCache.createStaticSite": false,
  "geolocation.enableHighAccuracy": true,
  "geolocation.timeout": 3000,
  "geolocation.maximumAge": 0,
  "geolocation.mapUrl": "https://maps.google.com/?q=%latitude%,%longitude%",
  "runtime.backgroundKeeperInterval": 19100,
};

const OPTION_PARSERS = {
  "capture.saveFolder": (source) => {
    return source.split(/[\\/]/).map(x => validateFilename(x)).join('/');
  },
  "capture.saveFilename": (source) => {
    return source.split(/[\\/]/).map(x => validateFilename(x)).join('/');
  },
  "capture.downLink.file.extFilter": (...args) => {
    const PREFIX_MIME = 'mime:';
    const REGEX_LINEFEED = /\n|\r\n?/;
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const REGEX_EXT_SEP = /[,;\s]+/;
    const fn = OPTION_PARSERS["capture.downLink.file.extFilter"] = (source) => {
      const rv = {ext: [], mime: []};
      const lines = source.split(REGEX_LINEFEED);
      for (let i = 0, I = lines.length; i < I; i++) {
        let line = lines[i];
        if (!line || line.startsWith("#")) { continue; }

        if (line.startsWith(PREFIX_MIME)) {
          line = line.slice(PREFIX_MIME.length);
          if (REGEX_PATTERN.test(line)) {
            try {
              rv.mime.push(new RegExp(`^(?:${RegExp.$1})$`, RegExp.$2));
            } catch (ex) {
              throw new Error(`Line ${i + 1}: ${ex.message}`);
            }
          } else {
            rv.mime.push(new RegExp(`^(?:${escapeRegExp(line)})$`, 'i'));
          }
          continue;
        }

        if (REGEX_PATTERN.test(line)) {
          try {
            rv.ext.push(new RegExp(`^(?:${RegExp.$1})$`, RegExp.$2));
          } catch (ex) {
            throw new Error(`Line ${i + 1}: ${ex.message}`);
          }
        } else {
          const regex = line.split(REGEX_EXT_SEP)
            .filter(x => !!x)
            .map(x => escapeRegExp(x))
            .join('|');
          rv.ext.push(new RegExp(`^(?:${regex})$`, 'i'));
        }
      }
      return rv;
    };
    return fn(...args);
  },
  "capture.downLink.doc.urlFilter": (...args) => {
    return OPTION_PARSERS["capture.downLink.urlFilter"](...args);
  },
  "capture.downLink.urlFilter": (...args) => {
    const REGEX_LINEFEED = /\n|\r\n?/;
    const REGEX_SPACES = /\s+/;
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/;
    const fn = OPTION_PARSERS["capture.downLink.urlFilter"] = (source) => {
      const rv = [];
      const lines = source.split(REGEX_LINEFEED);
      for (let i = 0, I = lines.length; i < I; i++) {
        const line = lines[i];
        if (!line || line.startsWith("#")) { continue; }

        let rule = line.split(REGEX_SPACES)[0];
        if (!rule) { continue; }

        if (REGEX_PATTERN.test(rule)) {
          try {
            rv.push(new RegExp(RegExp.$1, RegExp.$2));
          } catch (ex) {
            throw new Error(`Line ${i + 1}: ${ex.message}`);
          }
        } else {
          rule = splitUrlByAnchor(rule)[0];
          rv.push(rule);
        }
      }
      return rv;
    };
    return fn(...args);
  },
  "capture.downLink.urlExtra": (...args) => {
    const REGEX_LINEFEED = /\n|\r\n?/;
    const REGEX_SPACES = /\s+/;
    const fn = OPTION_PARSERS["capture.downLink.urlExtra"] = (source) => {
      const rv = [];
      const lines = source.split(REGEX_LINEFEED);
      for (let i = 0, I = lines.length; i < I; i++) {
        const line = lines[i];
        if (!line || line.startsWith("#")) { continue; }

        let rule = line.split(REGEX_SPACES)[0];
        if (!rule) { continue; }

        rule = splitUrlByAnchor(rule)[0];
        rv.push(rule);
      }
      return rv;
    };
    return fn(...args);
  },
  "capture.helpers": (source) => {
    if (!source) {
      return [];
    }

    const configs = JSON.parse(source);
    if (!Array.isArray(configs)) {
      throw new Error('Invalid array');
    }

    for (let i = 0, I = configs.length; i < I; i++) {
      try {
        const config = configs[i];
        if (typeof config !== 'object' || config === null || Array.isArray(config)) {
          throw new Error(`Invalid object`);
        }
        if (config.pattern) {
          if (typeof config.pattern !== 'string') {
            throw new Error(`Pattern must be a string`);
          }
          if (/^\/(.*)\/([a-z]*)$/.test(config.pattern)) {
            try {
              config.pattern = new RegExp(RegExp.$1, RegExp.$2);
            } catch (ex) {
              throw new Error(`Invalid pattern: ${ex.message}`);
            }
          } else {
            throw new Error(`Invalid pattern: Unsupported format.`);
          }
        }
      } catch (ex) {
        throw new Error(`Helpers[${i}]: ${ex.message}`);
      }
    }

    return configs;
  },
  "autocapture.rules": (source) => {
    if (!source) {
      return [];
    }

    const configs = JSON.parse(source);
    if (!Array.isArray(configs)) {
      throw new Error('Invalid array');
    }

    const patternParseRegex = /^\/(.*)\/([a-z]*)$/;
    for (let i = 0, I = configs.length; i < I; i++) {
      try {
        const config = configs[i];
        if (typeof config !== 'object' || config === null || Array.isArray(config)) {
          throw new Error(`Invalid object`);
        }
        if (config.pattern) {
          if (typeof config.pattern === 'string') {
            if (patternParseRegex.test(config.pattern)) {
              try {
                config.pattern = [new RegExp(RegExp.$1, RegExp.$2)];
              } catch (ex) {
                throw new Error(`Invalid pattern: ${ex.message}`);
              }
            } else {
              throw new Error(`Invalid pattern: Unsupported format.`);
            }
          } else if (Array.isArray(config.pattern)) {
            for (let j = 0, J = config.pattern.length; j < J; j++) {
              const subpattern = config.pattern[j];
              if (patternParseRegex.test(subpattern)) {
                try {
                  config.pattern[j] = new RegExp(RegExp.$1, RegExp.$2);
                } catch (ex) {
                  throw new Error(`Invalid pattern[${j}]: ${ex.message}`);
                }
              } else {
                throw new Error(`Invalid pattern[${j}]: Unsupported format.`);
              }
            }
          } else {
            throw new Error(`Pattern must be a string or an array of strings.`);
          }
        }
        if (config.exclude) {
          if (typeof config.exclude === 'string') {
            if (patternParseRegex.test(config.exclude)) {
              try {
                config.exclude = [new RegExp(RegExp.$1, RegExp.$2)];
              } catch (ex) {
                throw new Error(`Invalid exclude: ${ex.message}`);
              }
            } else {
              throw new Error(`Invalid exclude: Unsupported format.`);
            }
          } else if (Array.isArray(config.exclude)) {
            for (let j = 0, J = config.exclude.length; j < J; j++) {
              const subexclude = config.exclude[j];
              if (patternParseRegex.test(subexclude)) {
                try {
                  config.exclude[j] = new RegExp(RegExp.$1, RegExp.$2);
                } catch (ex) {
                  throw new Error(`Invalid exclude[${j}]: ${ex.message}`);
                }
              } else {
                throw new Error(`Invalid exclude[${j}]: Unsupported format.`);
              }
            }
          } else {
            throw new Error(`Exclude must be a string or an array of strings.`);
          }
        }
      } catch (ex) {
        throw new Error(`Configs[${i}]: ${ex.message}`);
      }
    }

    return configs;
  },
};

const CONTENT_SCRIPT_FILES = [
  "/lib/browser-polyfill.js",
  "/lib/polyfill.js",
  "/lib/webext-polyfill.js",
  "/lib/sha.js",
  "/content/index.js",
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

const DOMPARSER_SUPPORT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/xml', 'application/xml', 'image/svg+xml']);

const SCRAPBOOK_OBJECT_REMOVE_TYPE_REMOVE = new Set(["annotation", "freenote", "sticky", "block-comment", "custom"]);
const SCRAPBOOK_OBJECT_REMOVE_TYPE_UNWRAP = new Set(["linemarker", "inline", "link-url", "link-inner", "link-file", "custom-wrapper"]);
const SCRAPBOOK_OBJECT_REMOVE_TYPE_UNCOMMENT = new Set(["erased"]);

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
  z-index: 2147483647;
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
}
`;

const ASCII_WHITESPACE = String.raw`\t\n\f\r `;

// https://dom.spec.whatwg.org/#valid-shadow-host-name
const VALID_SHADOW_HOST_NAMES = new Set([
  "article", "aside", "blockquote", "body", "div", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "main", "nav", "p", "section", "span",
]);

/**
 * ref: source code of vAPI.webextFlavor of uBlock Origin
 */
const userAgent = (() => {
  const ua = navigator.userAgent;
  const manifest = (() => {
    try {
      return browser.runtime.getManifest();
    } catch (ex) {
      // dummy object to prevent an error
      return {};
    }
  })();

  const soup = new Set(['webext']);
  const flavor = {
    major: 0,
    soup: soup,
    is: (value) => soup.has(value),
  };

  // Whether this extension is a dev build.
  if (/^\d+\.\d+\.\d+\D/.test(manifest.version)) {
    soup.add('devbuild');
  }

  if (/\bMobile\b/.test(ua)) {
    soup.add('mobile');
  }

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
    if (/\bEdg\/([\d.]+)/.test(ua)) {
      // Chromium based Edge
      soup.add('microsoft').add('edge');
    }
  } else if ((match = /\bSafari\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('apple').add('safari');
  } else if ((match = /\bNode\.js\/(\d+)/.exec(ua)) !== null) {
    flavor.major = parseInt(match[1], 10) || 0;
    soup.add('node.js');
  }

  if (manifest.browser_specific_settings?.gecko) {
    soup.add('gecko');
  }

  return flavor;
})();

/****************************************************************************
 * Options
 ***************************************************************************/

let _options = null;

/**
 * Load all options and store in `_options` for sync retrieval.
 */
async function loadOptions() {
  _options = await getOptions();
  return _options;
}

/**
 * Register automatic options loading and return a singleton load result.
 */
const loadOptionsAuto = (() => {
  let p;
  const init = async () => {
    browser.storage.onChanged.addListener((changes, areaName) => {
      // Cache keys are stored in storage.local and are valid JSON format.
      // We only update when a config key is changed.
      if (areaName === "local") {
        try {
          for (const key in changes) { JSON.parse(key); }
          return;
        } catch (ex) {}

        for (const key in changes) {
          _options[key] = 'newValue' in changes[key] ? changes[key].newValue : DEFAULT_OPTIONS[key];
        }
      }
    });
    p = getOptions();
    return _options = await p;
  };
  return function loadOptionsAuto() {
    return p || init();
  };
})();

/**
 * @param {string} key
 * @param {Object} [options]
 * @return {*|Promise<*>}
 */
function getOption(key, options = _options) {
  if (options) {
    return options[key];
  }
  const args = {[key]: DEFAULT_OPTIONS[key]};
  return browser.storage.local.get(args).then((response) => {
    return response[key];
  });
}

/**
 * @param {string} key - The option name to parse
 * @param {*} [value] - An arbitarary value to feed to the parser. Read as
 *    `getOption` if not provided.
 * @return {*|Promise<*>}
 */
function parseOption(key, value) {
  const parser = OPTION_PARSERS[key] || (x => x);
  if (typeof value !== 'undefined') {
    return parser(value);
  }
  value = getOption(key);
  if (!isPromise(value)) {
    return parser(value);
  }
  return value.then((value) => {
    return parser(value);
  });
}

/**
 * @param {null|string|string[]|Object} [keys] - Fallback to DEFAULT_OPTIONS
 *   when passing non-object.
 * @param {Object} [options]
 * @return {Object|Promise<Object>}
 */
function getOptions(keys = DEFAULT_OPTIONS, options = _options) {
  if (typeof keys === "string") {
    const regex = new RegExp("^" + escapeRegExp(keys) + "(?:\\.|$)");
    keys = {};
    for (const key in DEFAULT_OPTIONS) {
      if (regex.test(key)) {
        keys[key] = DEFAULT_OPTIONS[key];
      }
    }
  } else if (Array.isArray(keys)) {
    keys = keys.reduce((rv, key) => {
      rv[key] = DEFAULT_OPTIONS[key];
      return rv;
    }, {});
  } else if (keys === null) {
    keys = DEFAULT_OPTIONS;
  }
  if (options) {
    const rv = {};
    for (const key in keys) {
      if (key in options) {
        rv[key] = options[key];
      }
    }
    return rv;
  }
  return browser.storage.local.get(keys);
}

/**
 * @param {Object} keys
 */
async function setOptions(keys) {
  return browser.storage.local.set(keys);
}

/**
 * @param {string[]} keys
 */
async function clearOptions(keys) {
  return await browser.storage.local.remove(keys);
}

function autoCacheOptions() {
  const fulltextCache = getOption("scrapbook.autoCache.fulltextCache");
  const createStaticSite = getOption("scrapbook.autoCache.createStaticSite");
  if (!(fulltextCache || createStaticSite)) {
    return null;
  }
  const rv = {};
  if (fulltextCache) { rv.fulltext = 1; }
  if (createStaticSite) { rv.static_site = 1; }
  return rv;
}


/****************************************************************************
 * Cache system
 *
 * - IndexedDB is powerful and performant but not available in content
 *   scripts, and stored data in normal and incognito windows aren't shared
 *   with each other. IndexedDB is not available in Firefox private windows
 *   and will automatically fallback to storage.
 * - Storage API does not support storing Blob, File, etc., in Chromium. A
 *   shim with byte-string based object is implemented, but it's not
 *   performant and should thus be avoided whenever possible.
 * - Use storage by default and use indexedDB when appropriate.
 ***************************************************************************/

/**
 * @typedef {Object} serializedBlob
 * @property {string} __type__
 * @property {string} type
 * @property {string[]} data
 */

/**
 * @typedef {serializedBlob} serializedFile
 * @property {string} __type__
 * @property {string} name
 * @property {string} type
 * @property {number} lastModified
 * @property {string[]} data
 */

/**
 * Serialize an object to be transmittable through messaging.
 *
 * If the serialization cannot be done synchronously, a Promise is returned.
 *
 * @param {*} obj
 * @return {*|serializedBlob|Promise<serializedBlob>}
 */
const serializeObject = (() => {
  // Max JavaScript string is 256MiB UTF-16 chars in an older Browser.
  const BYTE_STRING_MAX = 32 * 1024 * 1024;

  const readBlobAsByteStrings = async (blob) => {
    const rv = [];
    const u8ar = new Uint8Array(await readFileAsArrayBuffer(blob));
    for (let i = 0, I = u8ar.length; i < I; i += BYTE_STRING_MAX) {
      rv.push(arrayBufferToByteString(u8ar.subarray(i, i + BYTE_STRING_MAX)));
    }
    return rv;
  };

  return function serializeObject(obj) {
    if (obj instanceof File) {
      return (async () => ({
        __type__: 'File',
        name: obj.name,
        type: obj.type,
        lastModified: obj.lastModified,
        data: await readBlobAsByteStrings(obj),
      }))();
    } else if (obj instanceof Blob) {
      return (async () => ({
        __type__: 'Blob',
        type: obj.type,
        data: await readBlobAsByteStrings(obj),
      }))();
    }
    return obj;
  };
})();

/**
 * Deserialize a serializedBlob.
 *
 * If the deserialization cannot be done synchronously, a Promise is returned.
 *
 * @param {serializedBlob|*} obj
 * @return {*|Promise<*>}
 */
function deserializeObject(obj) {
  switch (obj?.__type__) {
    case "File": {
      const {data, name, type, lastModified} = obj;
      return new File(
        data.map(x => byteStringToArrayBuffer(x)),
        name,
        {type, lastModified},
      );
    }
    case "Blob": {
      const {data, type} = obj;
      return new Blob(
        data.map(x => byteStringToArrayBuffer(x)),
        {type},
      );
    }
  }
  return obj;
}

const cache = {
  _current: 'auto',

  get current() {
    if (this._current === 'auto') {
      this._current = 'storage';
    }
    return this._current;
  },

  set current(value) {
    this._current = value;
  },

  async _serializeObject(obj) {
    const map = {};
    const objStr = JSON.stringify(obj, (key, value) => {
      const valueNew = serializeObject(value);
      if (valueNew !== value) {
        const id = getUuid();
        map[id] = valueNew;
        return id;
      }
      return value;
    });
    if (!objStr) {
      // obj not JSON stringifiable, probably undefined
      return obj;
    }
    for (const key in map) {
      map[key] = await map[key];
    }
    return JSON.parse(objStr, (key, value) => {
      if (value in map) {
        return map[value];
      }
      return value;
    });
  },

  async _deserializeObject(obj) {
    const map = {};
    const objStr = JSON.stringify(obj, (key, value) => {
      const valueNew = deserializeObject(value);
      if (valueNew !== value) {
        const id = getUuid();
        map[id] = valueNew;
        return id;
      }
      return value;
    });
    if (!objStr) {
      // obj not JSON stringifiable, probably undefined
      return obj;
    }
    for (const key in map) {
      map[key] = await map[key];
    }
    return JSON.parse(objStr, (key, value) => {
      if (value in map) {
        return map[value];
      }
      return value;
    });
  },

  /**
   * @typedef {Object} cacheFilter
   * @property {Object<string, (string|string[]|Set<string>)>} [includes]
   * @property {Object<string, (string|string[]|Set<string>)>} [excludes]
   */

  /**
   * @param {string} key
   * @param {cacheFilter} [filter]
   */
  _applyFilter(key, filter) {
    let obj;
    try {
      obj = JSON.parse(key);
    } catch (ex) {
      // invalid JSON format => meaning not a cache
      return false;
    }

    filter = filter || {};

    if (filter.includes) {
      for (const key in filter.includes) {
        const value = filter.includes[key];
        if (value instanceof Set) {
          if (!value.has(obj[key])) {
            return false;
          }
        } else if (Array.isArray(value)) {
          if (!value.includes(obj[key])) {
            return false;
          }
        } else {
          if (obj[key] !== value) {
            return false;
          }
        }
      }
    }
    if (filter.excludes) {
      for (const key in filter.excludes) {
        const value = filter.excludes[key];
        if (value instanceof Set) {
          if (value.has(obj[key])) {
            return false;
          }
        } else if (Array.isArray(value)) {
          if (value.includes(obj[key])) {
            return false;
          }
        } else {
          if (obj[key] === value) {
            return false;
          }
        }
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
   * @param {cacheFilter} filter
   */
  async getAll(filter, cache = this.current) {
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
   * @param {string|Object} key
   */
  async remove(key, cache = this.current) {
    const keyStr = (typeof key === "string") ? key : JSON.stringify(key);
    return this[cache].remove(keyStr);
  },

  /**
   * @param {cacheFilter} filter
   */
  async removeAll(filter, cache = this.current) {
    return this[cache].removeAll(filter);
  },

  storage: {
    get _serializeObjectNeeded() {
      // In Chromium, a Blob cannot be stored in browser.storage,
      // fallback to an object containing byte string data.
      delete this._serializeObjectNeeded;
      return this._serializeObjectNeeded = userAgent.is('chromium');
    },

    async _serializeObject(obj) {
      if (this._serializeObjectNeeded) {
        return await cache._serializeObject(obj);
      }
      return obj;
    },

    async _deserializeObject(obj) {
      if (this._serializeObjectNeeded) {
        return await cache._deserializeObject(obj);
      }
      return obj;
    },

    async _getKeys(fallback = true) {
      // Chromium < 130 and Firefox < 143
      if (!browser.storage.local.getKeys) {
        if (fallback) {
          return Object.keys(await browser.storage.local.get());
        }

        return null;
      }

      return await browser.storage.local.getKeys();
    },

    async get(key) {
      const items = await browser.storage.local.get(key);
      return await this._deserializeObject(items[key]);
    },

    async getAll(filter) {
      const keys = await this._getKeys(false);

      // Chromium < 130 and Firefox < 143
      if (!keys) {
        const items = await browser.storage.local.get();
        for (const key in items) {
          if (!cache._applyFilter(key, filter)) {
            delete items[key];
          }
        }
        return await this._deserializeObject(items);
      }

      const items = await browser.storage.local.get(
        keys.filter(key => cache._applyFilter(key, filter)),
      );
      return await this._deserializeObject(items);
    },

    async set(key, value) {
      return await browser.storage.local.set({[key]: await this._serializeObject(value)});
    },

    async remove(key) {
      return await browser.storage.local.remove(key);
    },

    async removeAll(filter) {
      const keys = [];
      for (const key of (await this._getKeys())) {
        if (cache._applyFilter(key, filter)) {
          keys.push(key);
        }
      }
      return await browser.storage.local.remove(keys);
    },
  },

  indexedDB: {
    get _nosupport() {
      // Firefox: `indexedDB.open` throws `InvalidStateError` in an extension
      // tab in a private window.
      // ref: https://bugzilla.mozilla.org/show_bug.cgi?id=1841806
      const p = this._connect().then(
        (db) => (db.close(), false),
        (ex) => (ex.name === 'InvalidStateError'),
      );
      delete this._nosupport;
      return this._nosupport = p;
    },

    async _connect() {
      return await new Promise((resolve, reject) => {
        const request = indexedDB.open("scrapbook", 3);
        request.onupgradeneeded = (event) => {
          let db = event.target.result;
          if (event.oldVersion === 1) {
            db.deleteObjectStore("archiveZipFiles");
          } else if (event.oldVersion === 2) {
            db.deleteObjectStore("cache");
          }
          db.createObjectStore("cache");
        };
        request.onblocked = (event) => {
          reject(new Error("Upgrade of the indexedDB is blocked by another connection."));
        };
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    },

    async _transaction(callback, mode, options) {
      const db = await this._connect();
      try {
        const transaction = db.transaction("cache", mode, options);
        const objectStore = transaction.objectStore("cache");
        return await new Promise((resolve, reject) => {
          // transaction is available from objectStore.transaction
          const result = callback.call(this, objectStore);

          transaction.oncomplete = (event) => {
            resolve(result);
          };

          transaction.onerror = (event) => {
            // unhandled error for IDBRequest will bubble up to transaction error
            reject(event.target.error);
          };

          // abort the transaction if there's an unexpected error
          result.catch((ex) => {
            reject(ex);
            transaction.abort();
          });
        });
      } finally {
        db.close();
      }
    },

    async get(key) {
      if (await this._nosupport) {
        return cache.storage.get(key);
      }

      return await this._transaction(async (objectStore) => {
        return await new Promise((resolve, reject) => {
          objectStore.get(key).onsuccess = (event) => {
            resolve(event.target.result);
          };
        });
      }, "readonly");
    },

    async getAll(filter) {
      if (await this._nosupport) {
        return cache.storage.getAll(filter);
      }

      return await this._transaction(async (objectStore) => {
        const result = {};
        return await new Promise((resolve, reject) => {
          objectStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
              resolve(result);
              return;
            }
            if (cache._applyFilter(cursor.key, filter)) {
              result[cursor.key] = cursor.value;
            }
            cursor.continue();
          };
        });
      }, "readonly");
    },

    async set(key, value) {
      if (await this._nosupport) {
        return cache.storage.set(key, value);
      }

      return await this._transaction(async (objectStore) => {
        objectStore.put(value, key);
      }, "readwrite");
    },

    async remove(key) {
      if (await this._nosupport) {
        return cache.storage.remove(key);
      }

      return await this._transaction(async (objectStore) => {
        objectStore.delete(key);
      }, "readwrite");
    },

    async removeAll(filter) {
      if (await this._nosupport) {
        return cache.storage.removeAll(filter);
      }

      return await this._transaction(async (objectStore) => {
        return await new Promise((resolve, reject) => {
          objectStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
              resolve();
              return;
            }
            if (cache._applyFilter(cursor.key, filter)) {
              cursor.delete();
            }
            cursor.continue();
          };
        });
      }, "readwrite");
    },
  },

  sessionStorage: {
    async _serializeObject(obj) {
      return await cache._serializeObject(obj);
    },

    async _deserializeObject(obj) {
      return await cache._deserializeObject(obj);
    },

    async get(key) {
      // @TODO: direct string to object deserialization?
      return await this._deserializeObject(JSON.parse(sessionStorage.getItem(key)));
    },

    async getAll(filter) {
      const items = {};
      for (let i = 0, I = sessionStorage.length; i < I; i++) {
        const key = sessionStorage.key(i);
        if (cache._applyFilter(key, filter)) {
          items[key] = JSON.parse(sessionStorage.getItem(key));
        }
      }
      return await this._deserializeObject(items);
    },

    async set(key, value) {
      // @TODO: direct object to string serialization?
      return sessionStorage.setItem(key, JSON.stringify(await this._serializeObject(value)));
    },

    async remove(key) {
      return sessionStorage.removeItem(key);
    },

    async removeAll(filter) {
      // reverse the order to prevent an error due to index shift after removal
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (cache._applyFilter(key, filter)) {
          sessionStorage.removeItem(key);
        }
      }
    },
  },
};


/****************************************************************************
 * Lang
 ***************************************************************************/

const lang = (() => {
  const msgRegex = /__MSG_(.*?)__/g;
  const msgReplacer = (m, k) => lang(k);
  return function lang(key, args) {
    const msg = browser.i18n.getMessage(key, args);
    if (msg) {
      // recursively replace __MSG_key__
      return msg.replace(msgRegex, msgReplacer);
    }
    return `__MSG_${key}__`;
  };
})();

const loadLanguages = (() => {
  const msgRegex = /__MSG_(.*?)__/g;
  const msgReplacer = (m, k) => lang(k);
  return function loadLanguages(rootNode) {
    const doc = rootNode.ownerDocument || rootNode;
    const walker = doc.createNodeIterator(rootNode, 5 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT */);

    let node = walker.nextNode();
    while (node) {
      switch (node.nodeType) {
        case 1:
          for (const attr of node.attributes) {
            attr.nodeValue = attr.nodeValue.replace(msgRegex, msgReplacer);
          }
          break;
        case 3:
          node.nodeValue = node.nodeValue.replace(msgRegex, msgReplacer);
          break;
      }
      node = walker.nextNode();
    }
  };
})();


/****************************************************************************
 * ScrapBook messaging
 ***************************************************************************/

/**
 * An object passed through messaging to invoke a function.
 *
 * @typedef {Object} commandMessage
 * @property {string} [id]
 * @property {string} cmd
 * @property {*} [args]
 */

/**
 * The object automatically passed to the `runtime.onMessage()` listener by the
 * native WebExtension API.
 *
 * @typedef {browser.runtime.MessageSender} MessageSender
 * @property {string} [id]
 * @property {string} [tab]
 * @property {string} [frameId]
 */

/**
 * Add a message listener to receive commands.
 *
 * @param {Function} [filter]
 * @param {Function} [errorHandler]
 * @param {Object} [target] - The target object to run command on.
 * @return {Function}
 */
function addMessageListener(
  filter,
  errorHandler = ex => {
    console.error(ex);
    throw ex;
  },
  target = globalThis,
) {
  const listener = (message, sender) => {
    if (filter && !filter(message, sender)) { return; }

    const {cmd, args} = message;
    const senderInfo = '[' +
      (sender.tab ? sender.tab.id : -1) +
      (typeof sender.frameId !== 'undefined' ? ':' + sender.frameId : '') +
      ']';

    isDebug && console.debug(cmd, "receive", senderInfo, args);

    const parts = cmd.split('.');
    const subCmd = parts.pop();
    const object = parts.reduce((object, part) => {
      return object[part];
    }, target);

    // thrown Error don't show here but cause the sender to receive an error
    if (!object || !subCmd || typeof object[subCmd] !== 'function') {
      throw new Error(`Unable to invoke unknown command '${cmd}'.`);
    }

    return Promise.resolve()
      .then(() => {
        return object[subCmd](args, sender);
      })
      .catch(errorHandler);
  };
  browser.runtime.onMessage.addListener(listener);
  return listener;
}

/**
 * Init content scripts in the specified tab.
 *
 * @param {integer} tabId - The tab's ID to init content script.
 * @param {integer} [frameId] - The frame ID to init content script.
 * @return {Promise<Object>}
 */
async function initContentScripts(tabId, frameId) {
  // Simply run executeScript for allFrames by checking for nonexistence of
  // the content script in the main frame has a potential leak causing only
  // partial frames have the content script loaded. E.g. the user ran this
  // when some subframes haven't been exist. As a result, we have to check
  // existence of content script for every frame and inject on demand.
  const tasks = [];
  const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
  const frameIds = Number.isInteger(frameId) ?
      await browser.webNavigation.getFrame({tabId, frameId}).then(r => [Object.assign(r, {frameId})]) :
      await browser.webNavigation.getAllFrames({tabId});
  for (const {frameId, url} of frameIds) {
    if (!isContentPage(url, allowFileAccess)) { continue; }

    // Send a test message to check whether content script is loaded.
    // If no content script, we get an error saying connection cannot be established.
    tasks.push(
      browser.tabs.sendMessage(tabId, {cmd: "core.isScriptLoaded"}, {frameId})
        .catch(async (ex) => {
          isDebug && console.debug("inject content scripts", tabId, frameId, url);
          try {
            await browser.scripting.executeScript({
              target: {tabId, frameIds: [frameId]},
              injectImmediately: true,
              files: CONTENT_SCRIPT_FILES,
            });
            await browser.tabs.sendMessage(tabId, {cmd: "core.init", args: {frameId}}, {frameId});
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
            result.error = {message: response};
          }
          return result;
        }),
    );
  }
  return await Promise.all(tasks);
}

/**
 * A function that can be invoked through messaging.
 *
 * @typedef {Function} invokable
 * @property {Object} [params]
 */

/**
 * Invoke an invokable command in the extension script.
 *
 * @param {commandMessage} params
 * @return {Promise<*>}
 */
async function invokeExtensionScript({id, cmd, args}) {
  isDebug && console.debug(cmd, "send to extension page", args);
  const response = await browser.runtime.sendMessage({id, cmd, args});
  isDebug && console.debug(cmd, "response from extension page", response);
  return response;
}

/**
 * Invoke an invokable command in the content script.
 *
 * @param {commandMessage} params
 * @param {integer} params.tabId
 * @param {integer} params.frameId
 * @return {Promise<*>}
 */
async function invokeContentScript({tabId, frameId, cmd, args}) {
  isDebug && console.debug(cmd, "send to content script", `[${tabId}:${frameId}]`, args);
  const response = await browser.tabs.sendMessage(tabId, {cmd, args}, {frameId});
  isDebug && console.debug(cmd, "response from content script", `[${tabId}:${frameId}]`, response);
  return response;
}

/**
 * Invoke an invokable command in a frame.
 *
 * @param {commandMessage} params
 * @param {Window} params.frameWindow
 * @return {Promise<*>}
 */
async function invokeFrameScript({frameWindow, cmd, args}) {
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
    return await invokeExtensionScript({
      cmd: "background.invokeFrameScript",
      args: {frameId, cmd, args},
    });
  }
}

async function openModalWindow(options) {
  const doc = window.document;

  if (!doc) {
    throw new Error('Must run in a document.');
  }

  // create a modal dialog with mask
  const supportsDialog = typeof HTMLDialogElement !== 'undefined';

  // in case there is another existing prompt due to inproper trigger
  for (const elem of doc.documentElement.querySelectorAll('[data-scrapbook-elem="toolbar-prompt"]')) {
    elem.remove();
  }

  const host = doc.documentElement.appendChild(doc.createElement('scrapbook-toolbar-prompt'));
  host.setAttribute('data-scrapbook-elem', 'toolbar-prompt');

  const shadow = host.attachShadow({mode: 'closed'});

  const cssElem = shadow.appendChild(doc.createElement('style'));
  cssElem.textContent = `
:host {
  all: initial !important;
  position: absolute !important;
}
dialog {
  all: initial;
  position: fixed;
  inset: 0;
}
.mask {
  z-index: 2147483647;
  background: rgba(0, 0, 0, 0.4);
}
`;

  const dialog = shadow.appendChild(doc.createElement('dialog'));

  const {promise, resolve, reject} = Promise.withResolvers();

  const observer = new MutationObserver((mutations) => {
    if (!doc.documentElement.contains(host)) {
      reject(new Error('dialog host removed from DOM'));
    }
  });
  observer.observe(doc.documentElement, {childList: true});

  if (supportsDialog) {
    dialog.addEventListener('close', () => reject(new Error('dialog closed')));
    dialog.showModal();
  } else {
    dialog.classList.add('mask');
  }

  const id = getUuid();

  // launch modal window/tab
  invokeExtensionScript({
    cmd: 'background.openModalWindow',
    args: {...options, id},
  }).then(resolve, reject);

  try {
    return await promise;
  } catch (ex) {
    // close the dialog window/tab if interrupted
    invokeExtensionScript({
      cmd: 'background.openModalWindow.close',
      args: {id},
    }).catch(() => {});
    return null;
  } finally {
    observer.disconnect();
    host.remove();
  }
}


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
function escapeFilename(filename) {
  return filename.replace(/\\/g, '/').replace(/[ %#]+/g, m => encodeURIComponent(m));
}

/**
 * Escapes the given filename (may contain '/') string to be used in a canonical URI
 */
function quote(filename) {
  return filename.replace(/[^/]+/g, m => encodeURIComponent(m));
}

/**
 * Transliterates the given string to be a safe filename
 *
 * see also: escapeFileName
 *
 * @param {string} filename
 * @param {boolean} [forceAscii] - also escapes all non-ASCII chars
 */
function validateFilename(filename, forceAscii) {
  let fn = filename
      // common restrictions
      // - collapse document spaces
      .replace(/[\t\n\f\r]+/g, " ")
      // - control chars are bad for filename
      .replace(/[\x00-\x1F\x7F\x80-\x9F]+/g, "")
      // - bad chars on most OS
      .replace(/[:"?*\\/|<>]/g, "_")
      // downloads API restrictions
      .replace(/[\xAD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB\uFFFE\uFFFF\u{10FFFF}]+/gu, "")
      // "~": not allowed in Chromium
      // [\xA0\u2000-\u200A\u202F\u205F]: spaces, not allowed in Firefox
      .replace(/[~\xA0\u2000-\u200A\u202F\u205F]/g, "_")
      // Windows restrictions
      // - leading/trailing spaces and dots
      .replace(/^ +/, "").replace(/[. ]+$/, "").replace(/^\./, "_.")
      // - reserved filenames
      .replace(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)((?:\..+)?)$/i, "$1_$2");
  if (forceAscii) {
    fn = fn.replace(/[^\x00-\x7F]+/g, m => encodeURIComponent(m));
  }
  fn = fn || "_"; // prevent empty filename
  return fn;
}

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @param  {Date} [date] - Given day, or now if not provided.
 * @return {?string} The ScrapBook ID.
 */
function dateToId(date) {
  const dt = date || new Date();
  if (Number.isNaN(dt.valueOf())) { return null; }
  const year = dt.getUTCFullYear();
  if (year > 9999) { return '99991231235959999'; }
  if (year < 0) { return '00000101000000000'; }
  return year.toString().padStart(4, '0') +
      (dt.getUTCMonth() + 1).toString().padStart(2, '0') +
      dt.getUTCDate().toString().padStart(2, '0') +
      dt.getUTCHours().toString().padStart(2, '0') +
      dt.getUTCMinutes().toString().padStart(2, '0') +
      dt.getUTCSeconds().toString().padStart(2, '0') +
      dt.getUTCMilliseconds().toString().padStart(3, '0');
}

/**
 * @param {Date} id - Given ScrapBook ID
 * @return {?Date}
 */
const idToDate = (() => {
  const DT_MAX = new Date('9999-12-31T23:59:59.999Z').valueOf();
  const DT_MIN = new Date('0000-01-01T00:00:00.000Z').valueOf();
  return function idToDate(id) {
    const m = id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/);
    if (!m) { return null; }
    const dt = new Date();
    dt.setUTCFullYear(Math.max(parseInt(m[1], 10), 0));
    dt.setUTCMonth(Math.max(parseInt(m[2], 10) - 1, 0));
    dt.setUTCDate(Math.max(parseInt(m[3], 10), 1));
    dt.setUTCHours(parseInt(m[4], 10));
    dt.setUTCMinutes(parseInt(m[5], 10));
    dt.setUTCSeconds(parseInt(m[6], 10));
    dt.setUTCMilliseconds(parseInt(m[7], 10));
    if (dt.valueOf() > DT_MAX) { dt.setTime(DT_MAX); }
    else if (dt.valueOf() < DT_MIN) { dt.setTime(DT_MIN); }
    return dt;
  };
})();

/**
 * Returns the legacy ScrapBook ID from a given Date object
 *
 * @deprecated Used by legacy ScrapBook, with several issues:
 *   - inaccurate when used across timezones
 *   - items with same seconds issue
 * @param {Date} [date] - Given day, or now if not provided.
 * @return {?string} The ScrapBook ID.
 */
function dateToIdOld(date) {
  const dt = date || new Date();
  if (Number.isNaN(dt.valueOf())) { return null; }
  const year = dt.getFullYear();
  if (year > 9999) { return '99991231235959'; }
  if (year < 0) { return '00000101000000'; }
  return year.toString().padStart(4, '0') +
      (dt.getMonth() + 1).toString().padStart(2, '0') +
      dt.getDate().toString().padStart(2, '0') +
      dt.getHours().toString().padStart(2, '0') +
      dt.getMinutes().toString().padStart(2, '0') +
      dt.getSeconds().toString().padStart(2, '0');
}

/**
 * @deprecated See `dateToIdOld` for details.
 * @param {Date} id - Given ScrapBook ID
 * @return {?Date}
 */
const idToDateOld = (() => {
  const DT_MAX = (() => {
    const dt = new Date('9999-12-31T23:59:59.999Z');
    return dt.valueOf() + dt.getTimezoneOffset() * 60 * 1000;
  })();
  const DT_MIN = (() => {
    const dt = new Date('0000-01-01T00:00:00.000Z');
    return dt.valueOf() + dt.getTimezoneOffset() * 60 * 1000;
  })();
  return function idToDateOld(id) {
    const m = id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) { return null; }
    const dt = new Date();
    dt.setFullYear(Math.max(parseInt(m[1], 10), 0));
    dt.setMonth(Math.max(parseInt(m[2], 10) - 1, 0));
    dt.setDate(Math.max(parseInt(m[3], 10), 1));
    dt.setHours(parseInt(m[4], 10));
    dt.setMinutes(parseInt(m[5], 10));
    dt.setSeconds(parseInt(m[6], 10));
    dt.setMilliseconds(0);
    if (dt.valueOf() > DT_MAX) { dt.setTime(DT_MAX); }
    else if (dt.valueOf() < DT_MIN) { dt.setTime(DT_MIN); }
    return dt;
  };
})();

/**
 * @param {string} url
 * @param {boolean} [allowFileAccess] - Optional for better accuracy.
 * @return {string} Whether the page url is allowed for content scripts.
 */
const isContentPage = (() => {
  const FILTER = new RegExp(`^https?:`);
  const FILTER_FILE = new RegExp(`^(?:https?|file):`);
  return function isContentPage(url, allowFileAccess = !userAgent.is('gecko')) {
    return (allowFileAccess ? FILTER_FILE : FILTER).test(url);
  };
})();


/****************************************************************************
 * ScrapBook related DOM handling
 ***************************************************************************/

/**
 * - Markings
 *   linemarker (span) (since SB, SBX)
 *   inline (span) (for SB, SBX)
 *   annotation (span) (for 1.12.0a <= SBX <= 1.12.0a45)
 *   link-url (a) (since SBX)
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
 *   custom-elements-loader (since 1.14.4 <= WSB)
 *   infobar-loader (since 0.82.0 <= WSB)
 *   canvas-loader (for 0.51 <= WSB < 0.69)
 *   shadowroot-loader (for 0.51 <= WSB < 0.69)
 *   stylesheet (link, style) (for SB, SBX)
 *   stylesheet-temp (link, style) (for SBX)
 *
 *   custom-css (should not be altered by the editor) (since 0.70 <= WSB)
 *   custom-script (should not be altered by the editor) (since 0.70 <= WSB)
 *   custom-script-safe (known safe for page resaving) (since 0.70 <= WSB)
 *
 * @return {false|string} Scrapbook object type of the element; or false.
 */
function getScrapbookObjectType(node) {
  if (node.nodeType === 8) {
    const m = node.nodeValue.match(/^scrapbook-(.*?)(?:-\d+)?=/);
    if (m) {
      return m[1];
    }
    return false;
  }

  if (node.nodeType !== 1) { return false; }

  let type = node.getAttribute("data-scrapbook-elem");
  if (type) { return type; }

  return false;
}

/**
 * @return {integer} Scrapbook object remove type of the element.
 *   -1: not a scrapbook object
 *    0: not removable as a scrapbook object
 *    1: should remove
 *    2: should unwrap
 *    3: should uncomment
 */
function getScrapBookObjectRemoveType(node) {
  let type = getScrapbookObjectType(node);
  if (!type) { return -1; }
  if (SCRAPBOOK_OBJECT_REMOVE_TYPE_REMOVE.has(type)) { return 1; }
  if (SCRAPBOOK_OBJECT_REMOVE_TYPE_UNWRAP.has(type)) { return 2; }
  if (SCRAPBOOK_OBJECT_REMOVE_TYPE_UNCOMMENT.has(type)) { return 3; }
  return 0;
}

/**
 * @return {Element[]} Related elements having the shared ID; or the
 *   original element.
 */
function getScrapBookObjectElems(node) {
  let id = node.getAttribute("data-scrapbook-id");
  if (id) {
    return node.ownerDocument.querySelectorAll(`[data-scrapbook-id="${CSS.escape(id)}"]`);
  }

  return [node];
}

function getShadowRoot(elem) {
  if (elem.openOrClosedShadowRoot) {
    // Firefox >= 63
    // This API can return the native closed shadowRoot of an element like
    // audio or video. Add a check to exclude such cases.
    const nodeName = elem.nodeName.toLowerCase();
    if (VALID_SHADOW_HOST_NAMES.has(nodeName) || nodeName.includes('-')) {
      return elem.openOrClosedShadowRoot;
    }
  } else {
    try {
      // Chromium >= 88
      return browser.dom.openOrClosedShadowRoot(elem);
    } catch (ex) {}
  }
  return elem.shadowRoot;
}

function* getAdoptedStyleSheets(docOrShadowRoot) {
  try {
    yield* docOrShadowRoot.adoptedStyleSheets;
  } catch (ex) {
    // Firefox < 101.0b1: docOrShadowRoot.adoptedStyleSheets is undefined
    //
    // Firefox < 101.0b8: docOrShadowRoot.adoptedStyleSheets of a content
    // script throws an error when accessed.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1767819
    //
    // Firefox >= 101.0b8: docOrShadowRoot.adoptedStyleSheets of a content
    // script has all properties unreadable.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1770592
    //
    // Workaround with document.wrappedJSObject:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1817675
    if (!('adoptedStyleSheets' in docOrShadowRoot)) {
      return;
    }

    try {
      yield* docOrShadowRoot.wrappedJSObject.adoptedStyleSheets;
    } catch (ex) {
      // This shouldn't happen.
      // Catch the error in case of an unexpected implementation change.
      console.error(ex);
    }
  }
}

/**
 * Clone a document and generate relation mapping.
 *
 * @param {Document} doc
 * @param {Object} [options]
 * @param {Map|WeakMap} [options.origNodeMap]
 * @param {Map|WeakMap} [options.clonedNodeMap]
 * @return {Document} The cloned document.
 */
function cloneDocument(doc, {
  origNodeMap,
  clonedNodeMap,
} = {}) {
  const {contentType: mime, documentElement: docElemNode} = doc;
  const newDoc = (new DOMParser()).parseFromString(
    '<' + docElemNode.nodeName.toLowerCase() + '/>',
    DOMPARSER_SUPPORT_TYPES.has(mime) ? mime : 'text/html',
  );
  while (newDoc.firstChild) {
    newDoc.removeChild(newDoc.firstChild);
  }
  origNodeMap?.set(newDoc, doc);
  clonedNodeMap?.set(doc, newDoc);
  return newDoc;
}

/**
 * Clone a node and generate relation mapping.
 *
 * @param {Node} node
 * @param {boolean} [deep]
 * @param {Object} [options]
 * @param {Document} [options.newDoc]
 * @param {Map|WeakMap} [options.origNodeMap]
 * @param {Map|WeakMap} [options.clonedNodeMap]
 * @param {boolean} [options.includeShadowDom]
 * @return {Node} The cloned node.
 */
const cloneNode = (() => {
  const cloneShadowDom = (node, newNode, options = {}) => {
    const shadowRoot = getShadowRoot(node);
    if (!shadowRoot) { return; }
    const {origNodeMap, clonedNodeMap, includeShadowDom} = options;
    let newShadowRoot = getShadowRoot(newNode);
    if (newShadowRoot) {
      // shadowRoot already cloned (when shadowRoot.clonable = true)
      // map the shadowRoot and descendant nodes
      const walker1 = shadowRoot.ownerDocument.createNodeIterator(shadowRoot);
      const walker2 = newShadowRoot.ownerDocument.createNodeIterator(newShadowRoot);
      let node1 = walker1.nextNode();
      let node2 = walker2.nextNode();
      while (node1) {
        origNodeMap?.set(node2, node1);
        clonedNodeMap?.set(node1, node2);
        includeShadowDom && cloneShadowDom(node1, node2, options);
        node1 = walker1.nextNode();
        node2 = walker2.nextNode();
      }
    } else {
      newShadowRoot = newNode.attachShadow({
        mode: shadowRoot.mode,
        clonable: shadowRoot.clonable,
        delegatesFocus: shadowRoot.delegatesFocus,
        serializable: shadowRoot.serializable,
        slotAssignment: shadowRoot.slotAssignment,
      });
      origNodeMap?.set(newShadowRoot, shadowRoot);
      clonedNodeMap?.set(shadowRoot, newShadowRoot);
      for (const node of shadowRoot.childNodes) {
        newShadowRoot.appendChild(cloneNode(node, true, options));
      }
    }
  };

  return function cloneNode(node, deep = false, options = {}) {
    const {
      newDoc = node.ownerDocument,
      origNodeMap,
      clonedNodeMap,
      includeShadowDom,
    } = options;

    const newNode = newDoc.importNode(node, deep);

    if (deep) {
      const walker1 = node.ownerDocument.createNodeIterator(node);
      const walker2 = newDoc.createNodeIterator(newNode);
      let node1 = walker1.nextNode();
      let node2 = walker2.nextNode();
      while (node1) {
        origNodeMap?.set(node2, node1);
        clonedNodeMap?.set(node1, node2);
        includeShadowDom && cloneShadowDom(node1, node2, options);
        node1 = walker1.nextNode();
        node2 = walker2.nextNode();
      }
    } else {
      origNodeMap?.set(newNode, node);
      clonedNodeMap?.set(node, newNode);
      includeShadowDom && cloneShadowDom(node, newNode, options);
    }

    return newNode;
  };
})();

/**
 * Convert dynamic information into representable HTML attributes for an
 * element.
 */
function htmlifyElem(elem, options = {}) {
  // handle adoptedStyleSheet if supported by the browser
  // @TODO: merge shared constructed stylesheets among shadow roots
  if ('adoptedStyleSheets' in document && elem instanceof ShadowRoot) {
    const adoptedStyleSheetMap = new Map();

    const host = elem.host;
    host.removeAttribute("data-scrapbook-adoptedstylesheets");

    const ids = [];
    for (const css of getAdoptedStyleSheets(elem)) {
      let id = adoptedStyleSheetMap.get(css);
      if (typeof id === 'undefined') {
        id = adoptedStyleSheetMap.size;
        adoptedStyleSheetMap.set(css, id);
      }
      ids.push(id);
    }
    if (ids.length) {
      host.setAttribute("data-scrapbook-adoptedstylesheets", ids.join(','));
    }

    const regex = /^data-scrapbook-adoptedstylesheet-(\d+)$/;
    for (const {nodeName: attr} of host.attributes) {
      if (regex.test(attr)) {
        host.removeAttribute(attr);
      }
    }
    if (adoptedStyleSheetMap.size) {
      for (const [css, id] of adoptedStyleSheetMap) {
        const cssTexts = Array.prototype.map.call(
          css.cssRules,
          cssRule => cssRule.cssText,
        );
        host.setAttribute(`data-scrapbook-adoptedstylesheet-${id}`, cssTexts.join('\n\n'));
      }
    }
  }

  // handle manual slots if supported by the browser
  if (elem instanceof ShadowRoot && elem.slotAssignment === 'manual') {
    const slotMap = new Map();
    const root = elem;
    for (const elem of root.querySelectorAll('slot')) {
      const ids = [];
      for (const targetNode of elem.assignedNodes()) {
        let id = slotMap.get(targetNode);
        if (typeof id === 'undefined') {
          id = slotMap.size;
          slotMap.set(targetNode, id);
        }
        if (targetNode.nodeType === 1) {
          targetNode.setAttribute("data-scrapbook-slot-index", id);
        } else {
          targetNode.before(document.createComment(`scrapbook-slot-index=${id}`));
          targetNode.after(document.createComment(`/scrapbook-slot-index`));
        }
        ids.push(id);
      }
      if (ids.length) {
        elem.setAttribute("data-scrapbook-slot-assigned", ids.join(','));
      }
    }
  }

  if (elem.nodeType !== 1) { return; }

  switch (elem.nodeName.toLowerCase()) {
    case "canvas": {
      try {
        const data = elem.toDataURL();
        if (data !== getBlankCanvasData(elem)) {
          elem.setAttribute("data-scrapbook-canvas", data);
        }
      } catch (ex) {
        console.error(ex);
      }
      break;
    }

    case "input": {
      const type = elem.type;
      if (typeof type === 'undefined') { break; }
      switch (type.toLowerCase()) {
        case "image":
        case "password":
        case "file": {
          break;
        }
        case "checkbox": {
          const indeterminate = elem.indeterminate;
          if (indeterminate) {
            elem.setAttribute('data-scrapbook-input-indeterminate', '');
          }
        }
        // eslint-disable-next-line no-fallthrough
        case "radio": {
          const checked = elem.checked;
          if (checked !== elem.hasAttribute('checked')) {
            elem.setAttribute('data-scrapbook-input-checked', checked);
          }
          break;
        }
        default: {
          const value = elem.value;
          if (value !== elem.getAttribute('value')) {
            elem.setAttribute('data-scrapbook-input-value', value);
          }
          break;
        }
      }
      break;
    }

    case "textarea": {
      const value = elem.value;
      if (value !== elem.textContent) {
        elem.setAttribute('data-scrapbook-textarea-value', value);
      }
      break;
    }

    case "option": {
      const selected = elem.selected;
      if (selected !== elem.hasAttribute('selected')) {
        elem.setAttribute('data-scrapbook-option-selected', selected);
      }
      break;
    }
  }

  const shadowRoot = getShadowRoot(elem);
  if (shadowRoot) {
    htmlify(shadowRoot, options);
    elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
    if (shadowRoot.mode !== 'open') {
      elem.setAttribute("data-scrapbook-shadowdom-mode", shadowRoot.mode);
    }
    if (shadowRoot.clonable) {
      elem.setAttribute("data-scrapbook-shadowdom-clonable", "");
    }
    if (shadowRoot.delegatesFocus) {
      elem.setAttribute("data-scrapbook-shadowdom-delegates-focus", "");
    }
    if (shadowRoot.serializable) {
      elem.setAttribute("data-scrapbook-shadowdom-serializable", "");
    }
    if (shadowRoot.slotAssignment && shadowRoot.slotAssignment !== 'named') {
      elem.setAttribute("data-scrapbook-shadowdom-slot-assignment", shadowRoot.slotAssignment);
    }
  }
}

/**
 * Convert dynamic information into representable HTML attributes recursively.
 */
function htmlify(node, options = {}) {
  htmlifyElem(node, options);
  for (const elem of node.querySelectorAll('*')) {
    htmlifyElem(elem, options);
  }
}

/**
 * Reverse htmlify for an element.
 *
 * @param {boolean} [options.apply] - true to apply the recorded value to
 *   the element; otherwise remove the record only.
 * @param {boolean} [options.canvas] - true to handle canvas.
 * @param {boolean} [options.form] - true to handle form elements.
 * @param {boolean} [options.shadowDom] - true to handle shadowDom.
 */
function unhtmlifyElem(elem, options = {}) {
  const {
    apply = true,
    canvas = true,
    form = true,
    shadowDom = true,
  } = options;

  // handle adoptedStyleSheet
  if (shadowDom && elem instanceof ShadowRoot) {
    const regex = /^data-scrapbook-adoptedstylesheet-(\d+)$/;
    const host = elem.host;

    const cssIndexes = host.getAttribute('data-scrapbook-adoptedstylesheets');
    if (cssIndexes !== null && apply && 'adoptedStyleSheets' in document) {
      for (const idx of cssIndexes.split(',')) {
        const attr = `data-scrapbook-adoptedstylesheet-${parseInt(idx, 10)}`;
        const sel = `[${attr}]`;
        const refElem = host.getRootNode().querySelector(sel);
        if (!refElem) { continue; }
        const cssText = refElem.getAttribute(attr);
        if (cssText === null) { continue; }
        const css = new CSSStyleSheet();
        const cssTexts = cssText.split('\n\n');
        for (let i = cssTexts.length - 1; i >= 0; i--) {
          try {
            cssTexts[i] && css.insertRule(cssTexts[i]);
          } catch (ex) {
            console.error(ex);
          }
        }
        elem.adoptedStyleSheets.push(css);
      }
    }
    host.removeAttribute('data-scrapbook-adoptedstylesheets');
    for (const attr of Array.prototype.map.call(host.attributes, n => n.nodeName)) {
      if (regex.test(attr)) {
        host.removeAttribute(attr);
      }
    }
  }

  // handle manual slots
  if (shadowDom && elem instanceof ShadowRoot && elem.slotAssignment === 'manual') {
    const regex = /^scrapbook-slot-index=(\d+)$/;
    const host = elem.host;

    const slotSources = [];
    const children = host.childNodes;
    for (let i = children.length - 1; i >= 0; i--) {
      const node = children[i];
      switch (node.nodeType) {
        case Node.ELEMENT_NODE: {
          const slotIdx = node.getAttribute("data-scrapbook-slot-index");
          if (slotIdx !== null) {
            slotSources[parseInt(slotIdx, 10)] = node;
            node.removeAttribute("data-scrapbook-slot-index");
          }
          break;
        }
        case Node.COMMENT_NODE: {
          const value = node.nodeValue;
          const m = value.match(regex);
          if (m) {
            const next = node.nextSibling;
            if (next.nodeType === 3) {
              slotSources[parseInt(m[1], 10)] = next;
            }
            node.remove();
            break;
          } else if (value === '/scrapbook-slot-index') {
            node.remove();
            break;
          }
          break;
        }
      }
    }

    const rootNode = elem;
    for (const elem of rootNode.querySelectorAll("slot")) {
      const slotIdxes = elem.getAttribute("data-scrapbook-slot-assigned");
      if (slotIdxes !== null && apply) {
        const srcs = slotIdxes.split(',').map(i => slotSources[parseInt(i, 10)]);
        try {
          elem.assign.apply(elem, srcs);
        } catch (ex) {
          console.error(ex);
        }
      }
      elem.removeAttribute("data-scrapbook-slot-assigned");
    }
  }

  if (elem.nodeType !== 1) { return; }

  if (canvas && elem.matches('canvas')) {
    const canvasData = elem.getAttribute('data-scrapbook-canvas');
    if (canvasData) {
      if (apply) {
        const img = new Image();
        img.onload = () => { elem.getContext('2d').drawImage(img, 0, 0); };
        img.src = elem.getAttribute('data-scrapbook-canvas');
      }
      elem.removeAttribute('data-scrapbook-canvas');
    }
  }

  if (form && elem.matches('input[type="radio"], input[type="checkbox"]')) {
    const checked = elem.getAttribute('data-scrapbook-input-checked');
    if (checked !== null) {
      if (apply) {
        elem.checked = checked === 'true';
      }
      elem.removeAttribute('data-scrapbook-input-checked');
    }
  }

  if (form && elem.matches('input[type="checkbox"]')) {
    const indeterminate = elem.getAttribute('data-scrapbook-input-indeterminate');
    if (indeterminate !== null) {
      if (apply) {
        elem.indeterminate = true;
      }
      elem.removeAttribute('data-scrapbook-input-indeterminate');
    }
  }

  if (form && elem.matches('input')) {
    const value = elem.getAttribute('data-scrapbook-input-value');
    if (value !== null) {
      if (apply) {
        elem.value = value;
      }
      elem.removeAttribute('data-scrapbook-input-value');
    }
  }

  if (form && elem.matches('textarea')) {
    const value = elem.getAttribute('data-scrapbook-textarea-value');
    if (value !== null) {
      if (apply) {
        elem.value = value;
      }
      elem.removeAttribute('data-scrapbook-textarea-value');
    }
  }

  if (form && elem.matches('option')) {
    const selected = elem.getAttribute('data-scrapbook-option-selected');
    if (selected !== null) {
      if (apply) {
        elem.selected = selected === 'true';
      }
      elem.removeAttribute('data-scrapbook-option-selected');
    }
  }

  let shadowRoot = getShadowRoot(elem);
  if (shadowDom) {
    const html = elem.getAttribute('data-scrapbook-shadowdom');
    if (html !== null && apply && !shadowRoot) {
      try {
        let m;
        shadowRoot = elem.attachShadow({
          mode: (m = elem.getAttribute('data-scrapbook-shadowdom-mode')) !== null ? m : 'open',
          clonable: elem.hasAttribute('data-scrapbook-shadowdom-clonable'),
          delegatesFocus: elem.hasAttribute('data-scrapbook-shadowdom-delegates-focus'),
          serializable: elem.hasAttribute('data-scrapbook-shadowdom-serializable'),
          slotAssignment: (m = elem.getAttribute('data-scrapbook-shadowdom-slot-assignment')) !== null ? m : undefined,
        });
        shadowRoot.innerHTML = html;
      } catch (ex) {
        console.error(ex);
      }
    }
    elem.removeAttribute('data-scrapbook-shadowdom');
    elem.removeAttribute('data-scrapbook-shadowdom-mode');
    elem.removeAttribute('data-scrapbook-shadowdom-clonable');
    elem.removeAttribute('data-scrapbook-shadowdom-delegates-focus');
    elem.removeAttribute('data-scrapbook-shadowdom-serializable');
    elem.removeAttribute('data-scrapbook-shadowdom-slot-assignment');
  }
  if (shadowRoot) {
    unhtmlify(shadowRoot, options);
  }
}

/**
 * Reverse htmlify recursively.
 */
function unhtmlify(node, options = {}) {
  unhtmlifyElem(node, options);
  for (const elem of node.querySelectorAll('*')) {
    unhtmlifyElem(elem, options);
  }
}

/**
 * Replace nodes in the range with a serialized HTML comment.
 */
function eraseRange(range, {
  timeId = dateToId(),
  mapWrapperToComment,
  mapCommentToWrapper,
} = {}) {
  const doc = range.commonAncestorContainer.ownerDocument;
  const wrapper = doc.createElement('scrapbook-erased');
  range.surroundContents(wrapper);
  htmlify(wrapper);
  const comment = doc.createComment(`scrapbook-erased${timeId ? '-' + timeId : ''}=${escapeHtmlComment(wrapper.innerHTML)}`);
  if (mapWrapperToComment) {
    mapWrapperToComment.set(wrapper, comment);
  }
  if (mapCommentToWrapper) {
    mapCommentToWrapper.set(comment, wrapper);
  }
  wrapper.replaceWith(comment);
}

/**
 * Replace node with a serialized HTML comment.
 */
function eraseNode(node, options) {
  const range = node.ownerDocument.createRange();
  range.selectNode(node);
  return eraseRange(range, options);
}

/**
 * Replace a serialized HTML comment with the original nodes.
 *
 * @return {boolean} Whether the unerase is successful.
 */
function uneraseNode(node, {
  mapCommentToWrapper,
  normalize = true,
} = {}) {
  const parent = node.parentNode;
  if (!parent) { return false; }

  // if the associated source nodes exist, use them
  let wrapper = mapCommentToWrapper.get(node);
  if (wrapper) {
    const frag = node.ownerDocument.createDocumentFragment();
    let child;
    while (child = wrapper.firstChild) {
      frag.appendChild(child);
    }
    unhtmlify(frag, {apply: false});
    node.replaceWith(frag);
    if (normalize) {
      parent.normalize();
    }
    return true;
  }

  // otherwise, recover from recorded HTML
  const m = node.nodeValue.match(/^.+?=([\s\S]*)$/);
  if (m) {
    const doc = node.ownerDocument;
    const t = doc.createElement('template');
    t.innerHTML = unescapeHtmlComment(m[1]);
    const frag = doc.importNode(t.content, true);
    unhtmlify(frag);
    node.replaceWith(frag);
    if (normalize) {
      parent.normalize();
    }
    return true;
  }

  return false;
}


/****************************************************************************
 * String handling
 ***************************************************************************/

/**
 * Compare given 2 versions.
 *
 * @return {integer} 1: a > b; 0: a = b; -1: a < b
 */
function versionCompare(a, b) {
  // treat non-numerical characters as lower version
  // replacing them with a negative number based on charcode of each character
  function fix(s) {
    return "." + (s.toLowerCase().charCodeAt(0) - 2147483647) + ".";
  }

  a = ("" + a).replace(/[^0-9.]/g, fix).split('.');
  b = ("" + b).replace(/[^0-9.]/g, fix).split('.');
  const c = Math.max(a.length, b.length);
  for (let i = 0; i < c; i++) {
    // convert to integer with the most efficient way
    a[i] = ~~a[i];
    b[i] = ~~b[i];

    if (a[i] > b[i]) {
      return 1;
    } else if (a[i] < b[i]) {
      return -1;
    }
  }
  return 0;
}

/**
 * Crops the given string
 *
 * @param {integer} [charLimit] - UTF-16 chars limit, beyond which will be cropped. 0 means no crop.
 * @param {integer} [byteLimit] - UTF-8 bytes limit, beyond which will be cropped. 0 means no crop.
 * @param {string} [ellipsis] - string for ellipsis
 */
function crop(str, charLimit, byteLimit, ellipsis = '...') {
  if (charLimit) {
    if (str.length > charLimit) {
      let cutPos = charLimit - ellipsis.length;

      // prevent cutting between a valid surrogate pair
      {
        const high = str.charCodeAt(cutPos - 1);
        const low = str.charCodeAt(cutPos);
        if (0xD800 <= high && high <= 0xDBFF && 0xDC00 <= low && low <= 0xDFFF) {
          cutPos -= 1;
        }
      }

      str = str.substring(0, cutPos);
      str += ellipsis;
    }
  }
  if (byteLimit) {
    let bytes = unicodeToUtf8(str);
    if (bytes.length > byteLimit) {
      bytes = bytes.substring(0, byteLimit - unicodeToUtf8(ellipsis).length);
      while (true) {
        try {
          return utf8ToUnicode(bytes) + ellipsis;
        } catch (e) {
          // error if we cut a UTF-8 char sequence in the middle
        }
        bytes = bytes.substring(0, bytes.length - 1);
      }
    }
  }
  return str;
}

/**
 * Revised from Jeff Ward and folk's version.
 *
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 */
const getUuid = (() => {
  /* eslint-disable @stylistic/no-multi-spaces */
  const lut = Array(256).fill().map((_, i) => (i < 16 ? '0' : '') + (i).toString(16));
  const formatUuid = ([d0, d1, d2, d3]) =>
    lut[d0       & 0xff]        + lut[d0 >>  8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
    lut[d1       & 0xff]        + lut[d1 >>  8 & 0xff] + '-' +
    lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
    lut[d2       & 0x3f | 0x80] + lut[d2 >>  8 & 0xff] + '-' +
    lut[d2 >> 16 & 0xff]        + lut[d2 >> 24 & 0xff] +
    lut[d3       & 0xff]        + lut[d3 >>  8 & 0xff] +
    lut[d3 >> 16 & 0xff]        + lut[d3 >> 24 & 0xff];
  /* eslint-enable @stylistic/no-multi-spaces */

  const getRandomValuesFunc = crypto?.getRandomValues ?
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

  return function getUuid() {
    return formatUuid(getRandomValuesFunc());
  };
})();

const escapeHtml = (() => {
  const regex = /[&<>"']| (?= )/g;
  const func = m => map[m];
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  };
  return function escapeHtml(str, noDoubleQuotes, singleQuotes, spaces) {
    map['"'] = noDoubleQuotes ? '"' : "&quot;";
    map["'"] = singleQuotes ? "&#39;" : "'";
    map[" "] = spaces ? "&nbsp;" : " ";
    return str.replace(regex, func);
  };
})();

const unescapeHtml = (() => {
  const regex = /&(?:(?:amp|lt|gt|quot|apos|nbsp)|#(?:(\d+)|x([0-9A-Fa-f]+)));/g;
  const func = (entity, dec, hex) => {
    if (dec) { return String.fromCharCode(parseInt(dec, 10)); }
    if (hex) { return String.fromCharCode(parseInt(hex, 16)); }
    return map[entity];
  };
  const map = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&nbsp;": " ",
  };
  return function unescapeHtml(str) {
    return str.replace(regex, func);
  };
})();

const escapeRegExp = (() => {
  // Don't escape "-" as it causes an error for a RegExp with unicode flag.
  // Escaping "-" allows the result be embedded in a character class.
  // Escaping "/" allows the result be embedded in a JS regex literal.
  const regex = /[/\\^$*+?.|()[\]{}]/g;
  return function escapeRegExp(str) {
    return str.replace(regex, "\\$&");
  };
})();

/**
 * ref: https://developer.mozilla.org/docs/Web/HTML/Guides/Comments
 * ref: https://html.spec.whatwg.org/multipage/syntax.html#comments
 */
const escapeHtmlComment = (() => {
  const regex1 = /-([\u200B]*)(?=-)/g;
  const regex2 = /^([\u200B]*-?)>/;
  const regex3 = /<!([\u200B]*)-$/;
  return function escapeHtmlComment(str) {
    return str.replace(regex1, "-\u200B$1")
              .replace(regex2, "\u200B$1>")
              .replace(regex3, "<!\u200B$1-");
  };
})();

const unescapeHtmlComment = (() => {
  const regex1 = /-[\u200B]([\u200B]*)-/g;
  const regex2 = /^[\u200B]([\u200B]*-?)>/;
  const regex3 = /<![\u200B]([\u200B]*)-$/;
  return function unescapeHtmlComment(str) {
    return str.replace(regex1, "-$1-")
              .replace(regex2, "$1>")
              .replace(regex3, "<!$1-");
  };
})();

const escapeQuotes = (() => {
  const regex = /[\\"]/g;
  return function escapeQuotes(str) {
    return str.replace(regex, "\\$&");
  };
})();

const unescapeQuotes = (() => {
  const regex = /\\(.)/g;
  return function unescapeQuotes(str) {
    return str.replace(regex, "$1");
  };
})();

const escapeCssComment = (() => {
  const regex = /\*\//g;
  return function escapeCssComment(str) {
    return str.replace(regex, "*\u200B/");
  };
})();

/**
 * @param {string} str - The string to unescape.
 * @param {Object} [options]
 * @param {Object} [options.stripNewline] - Strip escaped newline.
 * @return {string} The unescaped CSS string.
 */
const unescapeCss = (() => {
  const replaceRegex = /\\(?:([0-9A-Fa-f]{1,6}) ?|((\r\n?|[\n\f])|[\s\S]))/gu;
  const replaceFunc = (m, u, c, nl) => {
    if (u) {
      const code = parseInt(u, 16);
      if (code === 0 || (code >= 0xD800 && code <= 0xDFFF) || (code > 0x10FFFF)) {
        return '\uFFFD';
      }
      return String.fromCodePoint(code);
    }
    if (nl && replaceOptions.stripNewline) { return ''; }
    return c;
  };
  let replaceOptions;
  return function unescapeCss(str, options = {}) {
    replaceOptions = options;
    return str.replace(replaceRegex, replaceFunc);
  };
})();

function quoteXPath(str) {
  const parts = str.split('"');
  return parts.length > 1 ?
      ('concat("' + parts.join(`",'"',"`) + '")') :
      `"${str}"`;
}

/**
 * A URL containing standalone "%"s, e.g. "http://example.com/50%",
 * causes a "Malformed URI sequence" error on decodeURIComponent.
 */
const decodeURIComponent2 = (() => {
  const regex = /(%[0-9A-F]{2})+/gi;
  const func = m => decodeURIComponent(m);
  return function decodeURIComponent2(uri) {
    return uri.replace(regex, func);
  };
})();

/**
 * This forces UTF-8 charset.
 *
 * Chars need encoding adopted from: https://github.com/nicktimko/svgenc
 * Also encodes control chars and " " for safety in srcset.
 */
const unicodeToDataUri = (() => {
  const regex = /[\x00-\x1F\x7F "'#%<>[\]^`{|}]+/g;
  const func = m => encodeURIComponent(m);
  return function unicodeToDataUri(str, mime) {
    return `data:${(mime || "")};charset=UTF-8,${str.replace(regex, func)}`;
  };
})();

function byteStringToDataUri(str, mime, charset) {
  return `data:${mime || ""}${charset ? ";charset=" + encodeURIComponent(charset) : ""},${escape(str)}`;
}

/**
 * Convert a JavaScript string (UTF-16BE) into a UTF-8 byte string.
 */
function unicodeToUtf8(str) {
  return unescape(encodeURIComponent(str));
}

/**
 * Convert a UTF-8 byte string into a JavaScript string (UTF-16BE).
 */
function utf8ToUnicode(bstr) {
  return decodeURIComponent(escape(bstr));
}

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
function byteStringToArrayBuffer(bstr) {
  let n = bstr.length, u8ar = new Uint8Array(n);
  while (n--) { u8ar[n] = bstr.charCodeAt(n); }
  return u8ar.buffer;
}

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
function arrayBufferToByteString(ab) {
  let u8ar = new Uint8Array(ab), bstr = "", CHUNK_SIZE = 65535;
  for (let i = 0, I = u8ar.length; i < I; i += CHUNK_SIZE) {
    bstr += String.fromCharCode.apply(null, u8ar.subarray(i, i + CHUNK_SIZE));
  }
  return bstr;
}


/****************************************************************************
 * String handling - URL and filename
 ***************************************************************************/

/**
 * Trim leading and trailing ASCII whitespaces.
 *
 * Usually used for HTML parsing.
 */
const trim = (() => {
  const regexLeading = new RegExp(`^[${ASCII_WHITESPACE}]+`);
  const regexTrailing = new RegExp(`[${ASCII_WHITESPACE}]+$`);
  return function trim(str) {
    return (str || '').replace(regexLeading, '').replace(regexTrailing, '');
  };
})();

/**
 * Split by ASCII whitespaces and discard empty components.
 *
 * Usually used for HTML parsing.
 */
const split = (() => {
  const regex = new RegExp(`[${ASCII_WHITESPACE}]+`);
  const filter = x => !!x;
  return function split(str) {
    return (str || '').split(regex).filter(filter);
  };
})();

/**
 * Ensure normalizeUrl(url1) === normalizeUrl(url2)
 *
 * - Encode chars that requires percent encoding with all upper case.
 * - Encode standalone "%"s, which can cause error for decodeURIComponent().
 * - Decode over-encoded chars, such as [0-9a-z:!()+,;=], in pathname.
 * - Decode unreserved chars [0-9A-Za-z\-_.~] in search and hash.
 * - e.g. normalizeUrl("http://abc/def:中!%") === normalizeUrl("http://ab%63/def%3A%E4%B8%AD%21%25")
 */
const normalizeUrl = (() => {
  // ref: https://url.spec.whatwg.org/#percent-encoded-bytes
  // reserved = :/?#[]@!$&'()*+,;=
  const percentEncodingRegex = /%(?:[0-9A-F]{2}(?:%[0-9A-F]{2})*)?/gi;
  const fixPathnameRegex = /[^:/[\]@!$&'()*+,;=]+/g;
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

  return function normalizeUrl(url) {
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
})();

const isUrlAbsolute = (() => {
  const regex = /^[a-z][a-z0-9+.-]*:/i;
  return function isUrlAbsolute(url) {
    return regex.test(url || "");
  };
})();

function getRelativeUrl(targetUrl, baseUrl) {
  let targetUrlObj;
  let baseUrlObj;
  if (isUrlAbsolute(targetUrl) && isUrlAbsolute(baseUrl)) {
    targetUrlObj = new URL(targetUrl);
    baseUrlObj = new URL(baseUrl);
  } else if (isUrlAbsolute(targetUrl)) {
    return new URL(targetUrl).href;
  } else if (isUrlAbsolute(baseUrl)) {
    // this should not happen
    throw new Error("Unable to get a relative URL from an absolute URL to a non-absolute URL");
  } else if (targetUrl.startsWith('//') && baseUrl.startsWith('//')) {
    // assume that both URLs are relative to the same protocol
    targetUrlObj = new URL('http:' + targetUrl);
    baseUrlObj = new URL('http:' + baseUrl);
  } else if (targetUrl.startsWith('//')) {
    targetUrlObj = new URL('http:' + targetUrl);
    return '//' + targetUrlObj.host + targetUrlObj.pathname + targetUrlObj.search + targetUrlObj.hash;
  } else if (baseUrl.startsWith('//')) {
    // this should not happen
    throw new Error("Unable to get a relative URL from a protocol-relative URL to a non-protocol-relative URL");
  } else if (targetUrl.startsWith('/') && baseUrl.startsWith('/')) {
    // assume that both URLs are relative to the same host
    targetUrlObj = new URL('file://' + targetUrl);
    baseUrlObj = new URL('file://' + baseUrl);
  } else if (targetUrl.startsWith('/')) {
    targetUrlObj = new URL('file://' + targetUrl);
    return targetUrlObj.pathname + targetUrlObj.search + targetUrlObj.hash;
  } else if (baseUrl.startsWith('/')) {
    // this should not happen
    throw new Error("Unable to get a relative URL from a root-relative URL to a non-root-relative URL");
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
}

function urlToFilename(url) {
  let name = filepathParts(new URL(url).pathname)[1];

  // decode %xx%xx%xx only if it's correctly UTF-8 encoded
  // @TODO: decode using a specified charset
  try {
    name = decodeURIComponent2(name);
  } catch (ex) {}
  return name;
}

function splitUrl(url) {
  let name = url, search = "", hash = "", pos;
  pos = name.indexOf("#");
  if (pos !== -1) { hash = name.slice(pos); name = name.slice(0, pos); }
  pos = name.indexOf("?");
  if (pos !== -1) { search = name.slice(pos); name = name.slice(0, pos); }
  return [name, search, hash];
}

function splitUrlByAnchor(url) {
  let [name, search, hash] = splitUrl(url);
  return [name + search, hash];
}

function filepathParts(filepath) {
  let pos = Math.max(filepath.lastIndexOf("/"), filepath.lastIndexOf("\\"));
  if (pos != -1) {
    return [filepath.slice(0, pos), filepath.slice(pos + 1, filepath.length)];
  }
  return ["", filepath];
}

function filenameParts(filename) {
  let pos = filename.lastIndexOf(".");
  if (pos != -1) {
    return [filename.substring(0, pos), filename.substring(pos + 1, filename.length)];
  }
  return [filename, ""];
}

function splitXmlAttribute(attr) {
  let ns = "", name = attr, pos;
  pos = name.indexOf(":");
  if (pos !== -1) { ns = name.slice(0, pos); name = name.slice(pos + 1); }
  return [ns, name];
}


/****************************************************************************
 * String handling - HTML Header parsing
 ***************************************************************************/

/**
 * Parse Content-Type string from the HTTP Header
 *
 * ref: https://tools.ietf.org/html/rfc7231#section-3.1.1.1
 *
 * @memberof scrapbook
 * @return {{type: string, parameters: {}}}
 */
const parseHeaderContentType = (() => {
  const pOWS = "[\\t ]*";
  const pToken = "[!#$%&'*+.0-9A-Z^_`a-z|~-]+";
  const pQuotedString = '(?:"[^"]*(?:\\.[^"]*)*")';

  const regexContentType = new RegExp(`^(${pToken}/${pToken})`);
  const regexParameter = new RegExp(`^${pOWS};${pOWS}(${pToken})=([^\t ;"]*(?:${pQuotedString}[^\t ;"]*)*)`);

  return function parseHeaderContentType(string) {
    const result = {type: "", parameters: {}};

    if (typeof string !== 'string') {
      return result;
    }

    let match;
    if (match = regexContentType.exec(string)) {
      string = string.slice(match.index + match[0].length);
      result.type = match[1].toLowerCase();

      while (match = regexParameter.exec(string)) {
        string = string.slice(match.index + match[0].length);
        let field = match[1].toLowerCase();
        let value = match[2];

        // duplicated parameter is invalid, ignore it
        if (field in result.parameters) {
          continue;
        }

        if (value.startsWith('"')) {
          // any valid value with leading '"' must be ".*"
          value = unescapeQuotes(value.slice(1, -1));
        }

        result.parameters[field] = value;
      }
    }

    return result;
  };
})();

/**
 * Parse Content-Disposition string from the HTTP Header
 *
 * ref: https://github.com/jshttp/content-disposition/blob/master/index.js
 *      https://tools.ietf.org/html/rfc5987#section-3.2
 *
 * @memberof scrapbook
 * @param {string} string - The string to parse, not including "Content-Disposition: "
 * @return {{type: string, parameters: {}}}
 */
const parseHeaderContentDisposition = (() => {
  const pOWS = "[\\t ]*";
  const pToken = "[!#$%&'*+.0-9A-Z^_`a-z|~-]+";
  const pQuotedString = '(?:"[^"]*(?:\\.[^"]*)*")';

  const regexContentDisposition = new RegExp(`^(${pToken})`);
  const regexDispExtParam = new RegExp(`^${pOWS};${pOWS}(?:(${pToken})${pOWS}=${pOWS}([^\\t ;"]*(?:${pQuotedString}[^\\t ;"]*)*))`);
  const regexExtValue = /^([^']*)'([^']*)'([^']*)$/;

  return function parseHeaderContentDisposition(string) {
    const result = {type: "inline", parameters: {}};

    if (typeof string !== 'string') {
      return result;
    }

    let match;
    if (match = regexContentDisposition.exec(string)) {
      string = string.slice(match.index + match[0].length);
      result.type = match[1].toLowerCase();

      while (match = regexDispExtParam.exec(string)) {
        string = string.slice(match.index + match[0].length);
        let field = match[1].toLowerCase();
        let value = match[2];

        // duplicated parameter is invalid, ignore it
        if (field in result.parameters) {
          continue;
        }

        try {
          if (field.endsWith('*')) {
            // ext-value
            if (match = regexExtValue.exec(value)) {
              let charset = match[1], lang = match[2], valueEncoded = match[3];
              switch (charset.toLowerCase()) {
                case 'iso-8859-1':
                  value = unescape(valueEncoded);
                  break;
                case 'utf-8':
                  value = decodeURIComponent(valueEncoded);
                  break;
                default:
                  throw new Error(`Ignored unsupported charset for content-disposition: ${field}=${value}`);
              }
            } else {
              throw new Error(`Ignored malformed value for content-disposition: ${field}=${value}`);
            }
          } else {
            if (value.startsWith('"')) {
              // any valid value with leading '"' must be ".*"
              value = unescapeQuotes(value.slice(1, -1));
            }
          }

          result.parameters[field] = value;
        } catch (ex) {
          // skip and log possible error of decodeURIComponent
          console.error(ex);
        }
      }
    }

    // overwrite field with field*
    for (const field in result.parameters) {
      if (!field.endsWith('*')) { continue; }
      result.parameters[field.slice(0, -1)] = result.parameters[field];
      delete result.parameters[field];
    }

    return result;
  };
})();

/**
 * Parse Refresh string from the HTTP Header
 *
 * ref: https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-refresh
 *
 * @memberof scrapbook
 * @return {{time: (integer|undefined), url: (string|undefined)}}
 */
const parseHeaderRefresh = (() => {
  const regex = new RegExp([
    '^',
    String.raw`[${ASCII_WHITESPACE}]*`,
    String.raw`(\d+|(?=\.))`,  // capture 1
    String.raw`[\d.]*`,
    '(?:',
      String.raw`(?=[${ASCII_WHITESPACE};,])`,
      String.raw`[${ASCII_WHITESPACE}]*[;,]?[${ASCII_WHITESPACE}]*`,
      String.raw`(?:url[${ASCII_WHITESPACE}]*=[${ASCII_WHITESPACE}]*)?`,
      String.raw`(?:"([^"]*)(?="|$)|'([^']*)(?='|$)|(.*)$)`,  // capture 2, 3, 4
    ')?',
  ].join(''), 'i');
  return function parseHeaderRefresh(string) {
    const result = {time: undefined, url: undefined};

    if (typeof string !== 'string') {
      return result;
    }

    const m = string.match(regex);
    if (m) {
      result.time = parseInt(m[1] || 0, 10);
      result.url = trim(m[2] || m[3] || m[4] || "");
    }

    return result;
  };
})();


/****************************************************************************
 * String handling - Misc. utilities
 ***************************************************************************/

/**
 * A simple tool to compress code (CSS or JavaScript)
 */
const compressCode = (() => {
  const regex = new RegExp(`[${ASCII_WHITESPACE}]+`, "g");
  return function compressCode(code) {
    return code.toString().replace(regex, " ");
  };
})();

/**
 * A shortcut to compress javascript code
 */
function compressJsFunc(func) {
  return compressCode(func.toString());
}


/****************************************************************************
 * File/Blob utilities
 ***************************************************************************/

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @return {Promise<ArrayBuffer>}
 */
async function readFileAsArrayBuffer(blob) {
  const event = await new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
  return event.target.result;
}

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @return {Promise<string>}
 */
async function readFileAsDataURL(blob) {
  const event = await new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return event.target.result;
}

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @param {string|false} [charset] - Read as UTF-8 if undefined and as byte string if falsy.
 * @return {Promise<string>}
 */
async function readFileAsText(blob, charset = "UTF-8") {
  if (charset) {
    const event = await new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = resolve;
      reader.onerror = reject;
      reader.readAsText(blob, charset);
    });
    return event.target.result;
  }
  const ab = await readFileAsArrayBuffer(blob);
  return arrayBufferToByteString(ab);
}

/**
 * @param {Blob} blob - The Blob of File object to be read.
 * @return {Promise<Document>}
 */
async function readFileAsDocument(blob) {
  const {response} = await xhr({
    url: URL.createObjectURL(blob),
    responseType: "document",
  });
  return response;
}

/**
 * Assume non-text for undefined types.
 */
const mimeIsText = (() => {
  const map = new Set([
    "application/ecmascript",
    "application/javascript",
    "application/json",
    "application/xml",
    "application/sql",
  ]);
  return function mimeIsText(mime) {
    if (mime.startsWith("text/") || mime.endsWith("+xml") || mime.endsWith("+json")) {
      return true;
    } else if (mime.endsWith("+zip")) {
      return false;
    }
    return map.has(mime);
  };
})();


/****************************************************************************
 * HTML DOM related utilities
 ***************************************************************************/

function documentToString(doc, pretty = false) {
  if (!doc) { return ""; }
  let afterHtml = false;
  return Array.prototype.reduce.call(doc.childNodes, (str, node) => {
    switch (node.nodeType) {
      // element
      case 1: {
        str += node.outerHTML;
        afterHtml = true;
        break;
      }
      // comment
      case 8: {
        str += `<!--${node.nodeValue}-->`;
        break;
      }
      // doctype
      case 10: {
        str += '<!DOCTYPE ' + node.name +
          (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '') +
          (node.systemId ? ' "' + node.systemId + '"' : '') +
          '>';
        break;
      }
    }

    // Add a linefeed for pretty output.
    // Don't do this for a node after <html> as it will be intepreted as
    // inside <body>.
    // ref: https://html.spec.whatwg.org/
    if (pretty && !afterHtml) {
      str += '\n';
    }

    return str;
  }, '');
}

/**
 * Read charset and text of a CSS file.
 *
 * According to the spec, the encoding of the CSS is determined by:
 * 1. Unicode BOM in the CSS file
 * 2. charset parameter of the Content-Type HTTP header
 * 3. @charset rule in the CSS file
 * 4. encoding of the referring HTML document
 * 5. assume it's utf-8
 *
 * ref: https://www.w3.org/TR/css-syntax-3/#input-byte-stream
 *
 * Note:
 * - We save the CSS file as UTF-8 for better compatibility.
 * - Case 2 and 4 are provided by the arguments.
 * - For case 3, UTF-8 BOM is prepended to inactivate the @charset rule.
 * - For case 5, we read the CSS file as byte string instead, so that the
 *   user has a chance to correct the encoding manually afterwards.
 *   This is safe for UTF-8 but gets a bad irrecoverable result when an
 *   ASCII-conflicting code point is being rewritten for a multi-byte ANSI
 *   encoding (e.g. the "許功蓋" issue for Big5), or for UTF-16.
 *
 * @param {Blob} data - The CSS file blob.
 * @param {?string} [headerCharset]
 * @param {?string} [envCharset]
 * @return {{text: string, charset: ?string}}
 */
const parseCssFile = (() => {
  // @charset must be exactly this pattern according to the spec:
  // https://developer.mozilla.org/en-US/docs/Web/CSS/@charset#examples
  // https://drafts.csswg.org/css2/#charset%E2%91%A0
  const regexAtCharset = new RegExp(`^@charset "([\x00-\x21\x23-\x7F]*)";`);

  return async function parseCssFile(data, headerCharset, envCharset) {
    let charset = null;

    let bom = await readFileAsText(data.slice(0, 3), false);
    if (bom.startsWith("\xEF\xBB\xBF")) {
      charset = "UTF-8";
    } else if (bom.startsWith("\xFE\xFF")) {
      charset = "UTF-16BE";
      bom = bom.slice(0, 2);
    } else if (bom.startsWith("\xFF\xFE")) {
      charset = "UTF-16LE";
      bom = bom.slice(0, 2);
    } else {
      bom = '';
    }

    if (!charset && headerCharset) {
      charset = headerCharset;
    }

    let bytes;
    if (!charset) {
      bytes = await readFileAsText(data.slice(0, 1024), false);
      const m = regexAtCharset.exec(bytes);
      if (m) {
        let _charset = m[1];

        // replace UTF-16 with UTF-8 according to the spec
        if (['utf-16be', 'utf-16le'].includes(_charset.toLowerCase())) {
          _charset = 'utf-8';
        }

        charset = _charset;
      }
    }

    if (!charset && envCharset) {
      charset = envCharset;
    }

    if (charset) {
      if (bom) { data = data.slice(bom.length); }
      let text = await readFileAsText(data, charset);

      // Add a BOM to inactivate the @charset rule
      if (regexAtCharset.test(text)) {
        text = "\ufeff" + text;
      }

      return {text, charset};
    }

    if (bom) { bytes = bytes.slice(bom.length); }
    bytes += await readFileAsText(data.slice(1024), false);
    return {text: bytes, charset: null};
  };
})();

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
async function rewriteCssFile(data, charset, rewriter) {
  const {text: cssText, charset: cssCharset} = await parseCssFile(data, charset);

  const rewrittenText = await rewriter(cssText);

  let blob;
  if (cssCharset) {
    blob = new Blob([rewrittenText], {type: "text/css;charset=UTF-8"});
  } else {
    let ab = byteStringToArrayBuffer(rewrittenText);
    blob = new Blob([ab], {type: "text/css"});
  }
  return blob;
}

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
const rewriteCssText = (() => {
  const r = String.raw;
  const NL = r`\r\n\f`;  // newline

  const pCm = r`(?:/\*[\s\S]*?(?:\*/|$))`; // comment
  const pSp = r`(?:[${ASCII_WHITESPACE}]*)`; // ASCII whitespaces
  const pCmSp = r`(?:(?:${pCm}|${pSp})*)`; // comment or space
  const pCmSp2 = r`(?:(?:${pCm}|${pSp})+)`; // comment or space, at least one
  const pEscaped = r`\\(?:[0-9A-Fa-f]{1,6} ?|[\s\S])`; // an escaped char sequence
  const pChar = r`(?:${pEscaped}|[^\\"'])`; // a non-quote char or an escaped char sequence
  const pStr = r`(?:${pChar}*?)`; // string
  const pSStr = r`(?:${pCmSp}${pStr}${pCmSp})`; // comment-or-space enclosed string
  const pDQStr = r`(?:"[^\\"]*(?:\\[\s\S][^\\"]*)*")`; // double quoted string
  const pSQStr = r`(?:'[^\\']*(?:\\[\s\S][^\\']*)*')`; // single quoted string
  const pES = r`(?:(?:${pCm}|${pDQStr}|${pSQStr}|${pChar})*?)`; // embeded string
  const pUrl = r`(?:\burl\(${pSp}(?:${pDQStr}|${pSQStr}|(?!['"${ASCII_WHITESPACE}])(?:${pEscaped}|[^)])*?)${pSp}\))`; // URL
  const pUrl2 = r`(\burl\(${pSp})(${pDQStr}|${pSQStr}|(?!['"${ASCII_WHITESPACE}])(?:${pEscaped}|[^)])*?)(${pSp}\))`; // URL; catch 3
  const pRImport = r`(@import${pCmSp})(${pUrl}|${pDQStr}|${pSQStr})`; // @import; catch 2
  const pRFontFace = r`(@font-face${pCmSp}{${pES}})`; // @font-face; catch 1
  const pRNamespace = r`(@namespace${pCmSp}(?:${pStr}${pCmSp2})?${pUrl})`; // @namespace; catch 1

  const KEY_PREFIX = "urn:scrapbook:str:";
  const REGEX_UUID = new RegExp(r`${KEY_PREFIX}([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})`, 'g');
  const REGEX_RESOURCE_MAP = /^(.+?-)\d+$/;
  const REGEX_REWRITE_CSS = new RegExp(r`${pEscaped}|${pDQStr}|${pSQStr}|${pCm}|${pRImport}|${pRFontFace}|${pRNamespace}|(${pUrl})`, "gi");
  const REGEX_PARSE_URL = new RegExp(pUrl2, "gi");
  const REGEX_URL_TOKEN = new RegExp(r`^(?:\\[^${NL}]|[^${ASCII_WHITESPACE}"'(])*$`);

  const REGEX_ESCAPE_CSS_STRING = /([\\"])|[\x00-\x1F\x7F]/g;
  const FUNC_ESCAPE_CSS_STRING = (m, chr) => {
    if (chr) { return '\\' + chr; }
    return '\\' + m.codePointAt(0).toString(16) + ' ';
  };

  const escapeCssString = (str) => {
    return str.replace(REGEX_ESCAPE_CSS_STRING, FUNC_ESCAPE_CSS_STRING);
  };

  return function rewriteCssText(cssText, options = {}) {
    let mapUrlPromise;

    const handleRewrittenData = function (data, prefix, postfix, noResMap) {
      const {url, recordUrl} = data;
      let record;
      if (!recordUrl || url === recordUrl) {
        record = "";
      } else {
        record = '/*scrapbook-orig-url="' + escapeCssComment(recordUrl) + '"*/';
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

      return record + prefix + '"' + escapeCssString(url) + '"' + postfix;
    };

    const handleRewritten = function (data, prefix, postfix, noResMap) {
      if (isPromise(data)) {
        if (!mapUrlPromise) { mapUrlPromise = new Map(); }
        const key = getUuid();
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
          const u = unescapeCss(url.slice(1, -1), {stripNewline: true});
          rewritten = callback(u);
        } else if (url.startsWith("'") && url.endsWith("'")) {
          const u = unescapeCss(url.slice(1, -1), {stripNewline: true});
          rewritten = callback(u);
        } else {
          if (!REGEX_URL_TOKEN.test(url)) { return m; }
          const u = unescapeCss(url);
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
            const u = unescapeCss(im2.slice(1, -1), {stripNewline: true});
            rewritten = handleRewritten(rewriteImportUrl(u), '', '', true);
          } else if (im2.startsWith("'") && im2.endsWith("'")) {
            const u = unescapeCss(im2.slice(1, -1), {stripNewline: true});
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
})();

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
const rewriteSrcset = (() => {
  const KEY_PREFIX = "urn:scrapbook:str:";
  const REGEX_SRCSET = new RegExp(
    [
      String.raw`([${ASCII_WHITESPACE}]*)`,
      String.raw`([^${ASCII_WHITESPACE},][^${ASCII_WHITESPACE}]*[^${ASCII_WHITESPACE},])`,
      String.raw`([${ASCII_WHITESPACE}]*(?:[^${ASCII_WHITESPACE},]+[${ASCII_WHITESPACE}]*)?(?:,|$))`,
    ].join(''),
    'g',
  );
  const REGEX_UUID = new RegExp(KEY_PREFIX + "([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})", 'g');

  return function rewriteSrcset(srcset, rewriter) {
    let mapUrlPromise;
    const response = srcset.replace(REGEX_SRCSET, (m, m1, m2, m3) => {
      let replacement = rewriter(m2);
      if (isPromise(replacement)) {
        if (!mapUrlPromise) { mapUrlPromise = new Map(); }
        const key = getUuid();
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
})();

/**
 * The function that rewrites each URL into a new URL.
 *
 * @callback rewriteUrlsRewriter
 * @param {string} url
 * @return {string|Promise<string>} The rewritten URL.
 */

/**
 * Rewrite a space separated URLs.
 *
 * @param {string} urls
 * @param {rewriteUrlsRewriter} rewriter
 * @return {string|Promise<string>} The rewritten URL.
 */
const rewriteUrls = (() => {
  const KEY_PREFIX = "urn:scrapbook:str:";
  const REGEX_UUID = new RegExp(KEY_PREFIX + "([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})", 'g');

  return function rewriteUrls(urls, rewriter) {
    let mapUrlPromise;
    const response = split(urls).map(url => {
      let replacement = rewriter(url);
      if (isPromise(replacement)) {
        if (!mapUrlPromise) { mapUrlPromise = new Map(); }
        const key = getUuid();
        mapUrlPromise.set(key, replacement.then(r => {
          mapUrlPromise.set(key, r);
        }));
        replacement = KEY_PREFIX + key;
      }
      return replacement;
    }).join(' ');

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
})();

/**
 * Get all accessible descendant frames.
 */
function flattenFrames(doc) {
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
    result = result.concat(flattenFrames(doc));
  }
  return result;
}


/**
 * Get dimentions of the viewport (main window)
 *
 * @return {{width: integer, height: integer, scrollX: integer, scrollY: integer}}
 */
function getViewport(win) {
  const doc = win.document;
  const isQuirkMode = doc.compatMode == "BackCompat";
  return {
    scrollX: win.scrollX,
    scrollY: win.scrollY,
    width: (isQuirkMode ? doc.body : doc.documentElement).clientWidth,
    height: (isQuirkMode ? doc.body : doc.documentElement).clientHeight,
  };
}

/**
 * Get appropriate offset for absolute positioning.
 *
 * @return {{left: integer, top: integer}}
 */
function getAnchoredPosition(elem, {clientX, clientY}, viewport) {
  const win = elem.ownerDocument.defaultView;

  // The innermost ancestor element that is relatively positioned.
  let relativeAncestor = null;
  let ancestor = elem.parentElement;
  while (ancestor?.nodeType === 1) {
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
    viewport = viewport || getViewport(win);
    deltaX = -viewport.scrollX;
    deltaY = -viewport.scrollY;
  }

  return {
    left: clientX - deltaX,
    top: clientY - deltaY,
  };
}

/**
 * Get primary meta refresh target URL.
 *
 * For a document with multiple meta refresh, Firefox and Chromium both take
 * the last one of those with least refresh time.
 *
 * @param {Document} doc
 * @param {string} [baseUrl] - An arbitarary reference URL. Use document.URL if not set.
 * @param {boolean} [includeDelayedRefresh] - Also consider meta refresh with non-0 refresh time.
 * @param {boolean} [includeNoscript] - Also consider meta refresh in <noscript>.
 * @return {string|undefined} Absolute URL of the meta refresh target.
 */
function getMetaRefreshTarget(doc, baseUrl = doc.URL,
  includeDelayedRefresh = false, includeNoscript = false,
) {
  let lastMetaRefreshTime = Infinity;
  let lastMetaRefreshUrl;
  let seenBaseElem = false;
  for (const elem of doc.querySelectorAll('base[href], meta[http-equiv="refresh"][content]')) {
    // update baseUrl when seeing the first base[href]
    if (elem.matches('base') && !elem.closest('svg, math') && !seenBaseElem) {
      baseUrl = new URL(elem.getAttribute('href'), baseUrl).href;
      seenBaseElem = true;
      continue;
    }

    const metaRefresh = parseHeaderRefresh(elem.getAttribute("content"));
    if (typeof metaRefresh.time === 'undefined') {
      continue;
    }
    if (!(includeDelayedRefresh || metaRefresh.time === 0)) {
      continue;
    }
    if (!(includeNoscript || !elem.closest('noscript'))) {
      continue;
    }
    if (metaRefresh.time > lastMetaRefreshTime) {
      continue;
    }
    lastMetaRefreshTime = metaRefresh.time;
    lastMetaRefreshUrl = new URL(metaRefresh.url, baseUrl).href;
  }
  return lastMetaRefreshUrl;
}

/**
 * Cross-platform way to get an appropriate selection.
 *
 * - Chromium:
 *   - shadowRoot.getSelection is supported and gets the selection in the
 *     shadowRoot.
 *   - If a selection is made inside a shadowRoot, each selection in its
 *     ancestor document/shadowRoot is collapsed before the shadow host.
 *   - If a selection is made across a shadowRoot, only the selection of the
 *     outermost root node is ranged, and selections of descendant
 *     shadowRoots are of "None" type.
 *   - A shadow root related selection inaccurately has .isCollapsed = true,
 *     check with .type !== 'Range' instead.
 * - Firefox:
 *   - document.getSelection gets a selection with ranges, each of which is
 *     either in the owner document or its descendant shadowRoot.
 *   - shadowRoot.getSelection is undefined.
 *   - A selection across a shadowRoot is not allowed and will at last be
 *     reduced to reside only in a root node.
 */
function getSelection(rootNode = document) {
  let sel = rootNode.getSelection();

  getDeepSelection: {
    if (!sel) {
      break getDeepSelection;
    }
    if (!userAgent.is('chromium')) {
      break getDeepSelection;
    }
    if (!sel.isCollapsed || sel.type === 'None') {
      break getDeepSelection;
    }
    const host = sel.focusNode.childNodes[sel.focusOffset];
    if (!host) {
      break getDeepSelection;
    }
    const shadowRoot = getShadowRoot(host);
    if (!shadowRoot) {
      break getDeepSelection;
    }
    const selDeep = getSelection(shadowRoot);
    if (selDeep?.type !== 'None') {
      sel = selDeep;
    }
  }

  return sel;
}

/**
 * Get nodes in the selected range(s).
 *
 * @param {Object} params
 * @param {Document|ShadowRoot|Range|Range[]} [params.query] - The query to find nodes.
 * @param {integer} [params.whatToShow] - Filter for allowed node types.
 * @param {Function} [params.nodeFilter] - A function to filter allowed nodes.
 * @param {boolean} [params.fuzzy] - Include partially selected nodes.
 * @return {Node[]} Nodes in the selected range(s).
 */
function getSelectedNodes({query = document, whatToShow = -1, nodeFilter, fuzzy = false}) {
  const ranges = query.nodeType ? getSelectionRanges(query) :
      Array.isArray(query) ? query : [query];
  const result = new Set();
  for (let range of ranges) {
    if (range.collapsed) {
      continue;
    }

    const doc = range.commonAncestorContainer.ownerDocument;

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
      },
    );
    let node;
    while (node = walker.nextNode()) {
      result.add(node);
    }
  }
  return Array.from(result);
}

/**
 * @param {Document|ShadowRoot|Selection} [query]
 * @return {Range[]} The selected ranges.
 */
function getSelectionRanges(query = document) {
  const sel = query.nodeType ? getSelection(query) : query;
  const result = [];
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      result.push(sel.getRangeAt(i));
    }
  }
  return result;
}

/**
 * See `getSafeRanges()` for details.
 */
function getSafeSelectionRanges(query) {
  const CHUNK_SIZE = 32767;
  return getSelectionRanges(query).reduce((result, range) => {
    const ranges = getSafeRanges(range);
    for (let i = 0, I = ranges.length; i < I; i += CHUNK_SIZE) {
      result.push.apply(result, ranges.slice(i, i + CHUNK_SIZE));
    }
    return result;
  }, []);
}

/**
 * Get splitted selection range parts which do not cross an element boundary.
 *
 * Revised from:
 * https://stackoverflow.com/a/12823606/1667884
 */
function getSafeRanges(dangerous) {
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
        xs.setStartAfter(s[i - 1]);
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
        xe.setEndBefore(e[i - 1]);
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
}

/**
 * Remove the node while keeping all children.
 */
function unwrapNode(node, normalize = true) {
  const parent = node.parentNode;
  if (!parent) { return; }
  const frag = node.ownerDocument.createDocumentFragment();
  let child;
  while (child = node.firstChild) {
    frag.appendChild(child);
  }
  node.replaceWith(frag);
  if (normalize) {
    parent.normalize();
  }
}

/**
 * Get data URL of a blank canvas.
 */
function getBlankCanvasData(canvas) {
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  return blank.toDataURL();
}

function getOffsetInSource(root, node, offset) {
  let pos = 0;
  let tmpParent = node.parentNode;
  let tmpSibling = node.previousSibling;

  switch (node.nodeName) {
    case "#text":
      pos += textToHtmlOffset(node, offset);
      break;
    case "#comment":
      pos += ("<!--").length + offset;
      break;
    case "#cdata-section":
      pos += ("<![CDATA[").length + offset;
      break;
    default:
      tmpParent = node;
      tmpSibling = node.childNodes[offset - 1];
      break;
  }

  while (tmpParent) {
    while (tmpSibling) {
      switch (tmpSibling.nodeName) {
        case "#text":
          pos += textToHtmlOffset(tmpSibling);
          break;
        case "#comment":
          pos += ("<!--" + tmpSibling.textContent + "-->").length;
          break;
        case "#cdata-section":
          pos += ("<![CDATA[" + tmpSibling.textContent + "]]>").length;
          break;
        default:
          pos += tmpSibling.outerHTML.length;
          break;
      }
      tmpSibling = tmpSibling.previousSibling;
    }

    pos += tmpParent.outerHTML.lastIndexOf(tmpParent.innerHTML, tmpParent.outerHTML.lastIndexOf('<'));

    if (tmpParent === root) { break; }

    tmpSibling = tmpParent.previousSibling;
    tmpParent = tmpParent.parentNode;
  }

  return pos;

  function textToHtmlOffset(node, offset) {
    const content = (typeof offset === "undefined") ? node.textContent : node.textContent.substring(0, offset);
    const span = node.ownerDocument.createElement("span");
    span.textContent = content;
    return span.innerHTML.length;
  }
}


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
async function xhr(params = {}) {
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

    if (params.responseType) { xhr.responseType = params.responseType; }

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
}

/**
 * Check for whether a server backend is set
 *
 * @param {Object} [options]
 * @return {boolean|Promise<boolean>}
 */
const hasServer = (() => {
  const reHttp = /^https?:/;
  return function hasServer(options = _options) {
    if (options) {
      return reHttp.test(options["server.url"]);
    }
    return getOption("server.url").then((option) => {
      return reHttp.test(option);
    });
  };
})();


/****************************************************************************
 * Promise utilities
 ***************************************************************************/

async function delay(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

function isPromise(object) {
  return object && typeof object.then === 'function';
}


/****************************************************************************
 * Miscellaneous utilities
 ***************************************************************************/

async function getScreenBounds(refWindow, {
  defaultLeft = getOption("ui.screen.left"),
  defaultTop = getOption("ui.screen.top"),
  defaultWidth = getOption("ui.screen.width"),
  defaultHeight = getOption("ui.screen.height"),
} = {}) {
  // supported by Chromium
  if (browser.system?.display) {
    const screens = await browser.system.display.getInfo();

    if (screens) {
      let mainScreen;
      if (refWindow) {
        let maxOverlapArea = 0;
        for (const screen of screens) {
          const workArea = screen.workArea;
          const overlapLeft = Math.max(refWindow.left, workArea.left);
          const overlapTop = Math.max(refWindow.top, workArea.top);
          const overlapRight = Math.min(refWindow.left + refWindow.width, workArea.left + workArea.width);
          const overlapBottom = Math.min(refWindow.top + refWindow.height, workArea.top + workArea.height);

          if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
            const overlapWidth = overlapRight - overlapLeft;
            const overlapHeight = overlapBottom - overlapTop;
            const overlapArea = overlapWidth * overlapHeight;
            if (overlapArea > maxOverlapArea) {
              maxOverlapArea = overlapArea;
              mainScreen = screen;
            }
          }
        }
      } else {
        // take the main screen
        mainScreen = screens.find((screen) => screen.isPrimary);
      }
      return mainScreen.workArea;
    }
  }

  if (typeof window !== 'undefined') {
    return {
      width: window.screen.availWidth,
      height: window.screen.availHeight,
      top: 0,
      left: 0,
    };
  }

  return {
    width: defaultWidth,
    height: defaultHeight,
    top: defaultTop,
    left: defaultLeft,
  };
}

/**
 * A simple modal window prompt for multi-line input.
 */
async function promptWindow(message = '', defaultValue = '') {
  const result = await openModalWindow({
    url: browser.runtime.getURL('core/prompt.html'),
    args: {message, defaultValue},
  });
  return result?.input;
}

async function getGeoLocation(options) {
  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, Object.assign({
      timeout: getOption("geolocation.timeout"),
      maximumAge: getOption("geolocation.maximumAge"),
      enableHighAccuracy: getOption("geolocation.enableHighAccuracy"),
    }, options));
  }).then(r => validateGeoLocation(r.coords));
}

function validateGeoLocation(obj) {
  if (!(typeof obj === 'object' && !Array.isArray(obj) && obj !== null)) {
    throw new Error('Must be a JSON object.');
  }
  if (!Number.isFinite(obj.latitude)) {
    throw new Error('Invalid latitude property.');
  }
  if (!Number.isFinite(obj.longitude)) {
    throw new Error('Invalid longitude property.');
  }
  return [
    'latitude',
    'longitude',
    'accuracy',
    'altitude',
    'altitudeAccuracy',
    'heading',
    'speed',
  ].reduce((result, key) => {
    if (Number.isFinite(obj[key])) {
      result[key] = obj[key];
    }
    return result;
  }, {});
}

function debounce(func, {
  delay = 300,
  withFlusher = false,
  withCancler = false,
} = {}) {
  let timer;
  const fn = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
  if (withFlusher) {
    fn.flush = (...args) => {
      clearTimeout(timer);
      func(...args);
    };
  }
  if (withCancler) {
    fn.cancel = () => {
      clearTimeout(timer);
    };
  }
  return fn;
}


export {
  BACKEND_MIN_VERSION,
  DEFAULT_OPTIONS,
  ANNOTATION_CSS,
  userAgent,
  loadOptions,
  loadOptionsAuto,
  getOption,
  parseOption,
  getOptions,
  setOptions,
  clearOptions,
  autoCacheOptions,
  serializeObject,
  deserializeObject,
  cache,
  lang,
  loadLanguages,
  addMessageListener,
  initContentScripts,
  invokeExtensionScript,
  invokeContentScript,
  invokeFrameScript,
  openModalWindow,
  escapeFilename,
  quote,
  validateFilename,
  dateToId,
  idToDate,
  dateToIdOld,
  idToDateOld,
  isContentPage,
  getScrapbookObjectType,
  getScrapBookObjectRemoveType,
  getScrapBookObjectElems,
  getShadowRoot,
  getAdoptedStyleSheets,
  cloneDocument,
  cloneNode,
  htmlifyElem,
  htmlify,
  unhtmlifyElem,
  unhtmlify,
  eraseRange,
  eraseNode,
  uneraseNode,
  versionCompare,
  crop,
  getUuid,
  escapeHtml,
  unescapeHtml,
  escapeRegExp,
  escapeHtmlComment,
  unescapeHtmlComment,
  escapeQuotes,
  unescapeQuotes,
  escapeCssComment,
  unescapeCss,
  quoteXPath,
  decodeURIComponent2 as decodeURIComponent,
  unicodeToDataUri,
  byteStringToDataUri,
  unicodeToUtf8,
  utf8ToUnicode,
  byteStringToArrayBuffer,
  arrayBufferToByteString,
  trim,
  split,
  normalizeUrl,
  isUrlAbsolute,
  getRelativeUrl,
  urlToFilename,
  splitUrl,
  splitUrlByAnchor,
  filepathParts,
  filenameParts,
  splitXmlAttribute,
  parseHeaderContentType,
  parseHeaderContentDisposition,
  parseHeaderRefresh,
  compressCode,
  compressJsFunc,
  readFileAsArrayBuffer,
  readFileAsDataURL,
  readFileAsText,
  readFileAsDocument,
  mimeIsText,
  documentToString,
  parseCssFile,
  rewriteCssFile,
  rewriteCssText,
  rewriteSrcset,
  rewriteUrls,
  flattenFrames,
  getViewport,
  getAnchoredPosition,
  getMetaRefreshTarget,
  getSelection,
  getSelectedNodes,
  getSelectionRanges,
  getSafeSelectionRanges,
  getSafeRanges,
  unwrapNode,
  getBlankCanvasData,
  getOffsetInSource,
  xhr,
  hasServer,
  delay,
  isPromise,
  getScreenBounds,
  promptWindow as prompt,
  getGeoLocation,
  validateGeoLocation,
  debounce,
};
