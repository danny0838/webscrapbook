/******************************************************************************
 * Background script for capturer functionality.
 *
 * @requires scrapbook
 * @requires server
 * @module capturer
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  if (global.hasOwnProperty('capturer')) { return; }
  global.capturer = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
  );
}(this, function (isDebug, scrapbook, server) {

'use strict';

async function clearCapturerCaches() {
  const filter = {
    includes: {
      table: new Set(["captureMissionCache", "batchCaptureMissionCache", "fetchCache", "blobCache"]),
    },
  };
  await scrapbook.cache.removeAll(filter, 'indexedDB');
  await scrapbook.cache.removeAll(filter, 'storage');
}


/****************************************************************************
 * Notify captured pages
 ***************************************************************************/

const ALLOWED_SCHEMES = ['http:', 'https:'];
const LISTENER_FILTER = {url: [{schemes: ["http", "https"]}]};
const REGEX_IPv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const bookCaches = new Map();

function cacheAddDomainSource(cache, domains, source) {
  let map = cache.get(domains[0]);
  if (!map) {
    map = new Map();
    for (const domain of domains) {
      cache.set(domain, map);
    }
  }
  map.set(source, (map.get(source) || 0) + 1);
}

/**
 * @return {string[]} bookIds - id of books with a valid cache
 */
async function updateBookCaches() {
  if (scrapbook.hasServer()) {
    try {
      await server.init(true);
      const bookIds = [];
      await Promise.all(Object.keys(server.books).map(async (bookId) => {
        const book = server.books[bookId];
        if (book.config.no_tree) { return; }

        const refresh = !await book.validateTree();
        try {
          await book.loadMeta(refresh);
          await book.loadToc(refresh);
        } catch (ex) {
          // skip book with tree loading error
          console.error(ex);
          return;
        }

        // build cache for faster retrieval
        // Check treeLastModified explicitly as `book.validateTree` may have
        // been called otherwhere.
        let cache = bookCaches.get(bookId);
        if (cache?.treeLastModified !== book.treeLastModified) {
          cache = new Map();
          cache.treeLastModified = book.treeLastModified;
          bookCaches.set(bookId, cache);

          for (const id of book.getReachableItems('root')) {
            const meta = book.meta[id];
            if (!meta) { continue; }

            const source = meta.source;
            if (!source) { continue; }

            let u;
            try {
              u = new URL(source);
            } catch (ex) {
              continue;
            }

            if (!ALLOWED_SCHEMES.includes(u.protocol)) {
              continue;
            }

            const hostname = u.hostname;
            if (hostname.startsWith('[') && hostname.endsWith(']')) {
              // IPv6
              cacheAddDomainSource(cache, [hostname], source);
            } else if (REGEX_IPv4.test(hostname)) {
              // IPv4
              cacheAddDomainSource(cache, [hostname], source);
            } else {
              const hostname1 = hostname.replace(/^www\./, '');
              const hostname2 = `www.${hostname1}`;
              cacheAddDomainSource(cache, [hostname1, hostname2], source);
            }
          }
        }

        bookIds.push(bookId);
      }));
      return bookIds;
    } catch (ex) {
      console.error(ex);
    }
  }
  return [];
}

/**
 * @param {Tab[]} tabs
 */
async function updateBadgeForTabs(tabs) {
  const bookIds = await updateBookCaches();

  for (const {id: tabId, url} of tabs) {
    // prepare regex checkers
    const u = new URL(scrapbook.normalizeUrl(url));
    u.hash = '';
    const urlCheck = u.href;
    const urlCheckFull = new RegExp(`^${scrapbook.escapeRegExp(u.href)}(?:#|$)`);
    u.search = '';
    const urlCheckPath = new RegExp(`^${scrapbook.escapeRegExp(u.href)}(?:\\?.*)?(?:#|$)`);
    const urlCheckOrigin = new RegExp(`^${scrapbook.escapeRegExp(u.origin)}(?:[/?#]|$)`);

    // calculate match type and count
    const matchTypeAndCount = {
      full: 0,
      path: 0,
      origin: 0,
      similar: 0,
      session: 0,
    };

    // check from session
    matchTypeAndCount.session += scrapbook.invokeBackgroundScript({
      cmd: "getCapturedUrls",
      args: {urls: [urlCheck]},
    })[urlCheck];

    // check from backend
    for (const bookId of bookIds) {
      const cache = bookCaches.get(bookId);

      const domainSources = cache.get(u.hostname);
      if (!domainSources) {
        continue;
      }

      for (const [source, count] of domainSources) {
        if (urlCheckFull.test(source)) {
          matchTypeAndCount.full += count;
          continue;
        }

        // early return to reduce RegExp test
        if (matchTypeAndCount.full) {
          continue;
        }

        if (urlCheckPath.test(source)) {
          matchTypeAndCount.path += count;
          continue;
        }

        // early return to reduce RegExp test
        if (matchTypeAndCount.path) {
          continue;
        }

        if (urlCheckOrigin.test(source)) {
          matchTypeAndCount.origin += count;
          continue;
        }

        matchTypeAndCount.similar += count;
      }
    }

    // determine color and count by most significant match type
    let color;
    let count;
    if (matchTypeAndCount.full) {
      color = '#800000';
      count = matchTypeAndCount.full;
    } else if (matchTypeAndCount.path) {
      color = '#9C8855';
      count = matchTypeAndCount.path;
    } else if (matchTypeAndCount.origin) {
      color = '#008000';
      count = matchTypeAndCount.origin;
    } else if (matchTypeAndCount.similar) {
      color = '#3366C0';
      count = matchTypeAndCount.similar;
    } else {
      color = '#AAAAAA';
      count = matchTypeAndCount.session;
    }

    browser.action.setBadgeText({
      tabId,
      text: count.toString(),
    });

    // For a set with tabId, badge color will be reset when the tab is navigated
    browser.action.setBadgeBackgroundColor({
      tabId,
      color,
    });
  }
}

async function updateBadgeForAllTabs() {
  if (!scrapbook.getOption("ui.notifyPageCaptured")) {
    return;
  }

  const tabs = await scrapbook.getContentTabs({});
  return await updateBadgeForTabs(tabs);
}

async function onNavigation(details) {
  if (details.frameId !== 0) { return; }

  await updateBadgeForTabs([{id: details.tabId, url: details.url}]);
}

function toggleNotifyPageCaptured() {
  browser.webNavigation.onCommitted.removeListener(onNavigation);
  if (scrapbook.getOption("ui.notifyPageCaptured")) {
    browser.webNavigation.onCommitted.addListener(onNavigation, LISTENER_FILTER);
  }
}


/****************************************************************************
 * Auto-capture
 ***************************************************************************/

const REGEX_STRING_PATTERN = /^\/(.*)\/([a-z]*)$/i;

let allowFileAccess;

/**
 * @typedef {Object} autoCaptureConfig
 * @property {string} [name]
 * @property {string} [description]
 * @property {boolean} [disabled]
 * @property {boolean} [debug]
 * @property {integer} [tabId]
 * @property {string} [pattern]
 * @property {number} [delay]
 * @property {number} [repeat]
 * @property {boolean} [allowDuplicate]
 * @property {Object} [taskInfo]
 * @property {Object} [eachTaskInfo]
 */

/**
 * @type {autoCaptureConfig[]}
 */
let autoCaptureConfigs = [];

/**
 * @typedef {Object} autoCaptureInfo
 * @property {timeout[]} delay
 * @property {interval[]} repeat
 */

/**
 * @type {Map<integer~tabId, autoCaptureInfo>}
 */
const autoCaptureInfos = new Map();

/**
 * @type {Map<string~bookId, Set<string~sourceUrl>>}
 */
const autoCaptureBookCaches = new Map();

async function autoCaptureTab(tabInfo) {
  // normalize and remove hash from URL
  tabInfo.url = scrapbook.normalizeUrl(scrapbook.splitUrlByAnchor(tabInfo.url)[0]);

  // skip URLs that are not content page
  if (!scrapbook.isContentPage(tabInfo.url, allowFileAccess)) {
    return;
  }

  // skip URLs in the backend server
  const serverUrl = scrapbook.getOption("server.url");
  if (serverUrl && tabInfo.url.startsWith(serverUrl)) {
    return;
  }

  // update book caches from backend
  const bookIds = await updateAutoCaptureBookCaches();

  // check config
  for (let i = 0, I = autoCaptureConfigs.length; i < I; ++i) {
    const config = autoCaptureConfigs[i];

    try {
      // skip disabled config
      if (config.disabled) {
        continue;
      }

      // check tabId
      if (Number.isInteger(config.tabId) && tabInfo.id !== config.tabId) {
        continue;
      }

      // check pattern and exclude
      if (config.pattern) {
        let match = false;
        for (const pattern of config.pattern) {
          pattern.lastIndex = 0;
          if (pattern.test(tabInfo.url)) {
            match = true;
            break;
          }
        }
        if (!match) { continue; }
      }
      if (config.exclude) {
        let match = false;
        for (const exclude of config.exclude) {
          exclude.lastIndex = 0;
          if (exclude.test(tabInfo.url)) {
            match = true;
            break;
          }
        }
        if (match) { continue; }
      }

      // skip if duplicated
      const isDuplicate = checkDuplicate(tabInfo.url, bookIds);
      if (!config.allowDuplicate && isDuplicate) {
        continue;
      }

      // set info
      let info = autoCaptureInfos.get(tabInfo.id);
      if (!info) {
        info = {};
        autoCaptureInfos.set(tabInfo.id, info);
      }

      // setup capture task
      if (config.delay > 0) {
        if (!info.delay) {
          info.delay = [];
        }
        const t = setTimeout(() => {
          invokeCapture(tabInfo, config, false);
        }, config.delay);
        info.delay.push(t);
      } else {
        invokeCapture(tabInfo, config, false, true);
      }
    } catch (ex) {
      const nameStr = config?.name ? ` (${config.name})` : '';
      console.error(`Failed to run auto-capture config[${i}]${nameStr} for tab[${tabInfo.id}] (${tabInfo.url}): ${ex.message}`);
    }
  }
}

/**
 * @return {integer[]} ID of books with a valid cache
 */
async function updateAutoCaptureBookCaches() {
  if (scrapbook.hasServer()) {
    try {
      await server.init(true);
      const bookIds = [];
      await Promise.all(Object.keys(server.books).map(async (bookId) => {
        const book = server.books[bookId];
        if (book.config.no_tree) { return; }

        const refresh = !await book.validateTree();
        try {
          await book.loadMeta(refresh);
          await book.loadToc(refresh);
        } catch (ex) {
          // skip book with tree loading error
          console.error(ex);
          return;
        }

        // build cache for faster retrieval
        // Check treeLastModified explicitly as `book.validateTree` may have
        // been called otherwhere.
        let cache = autoCaptureBookCaches.get(bookId);
        if (cache?.treeLastModified !== book.treeLastModified) {
          cache = new Set();
          cache.treeLastModified = book.treeLastModified;
          autoCaptureBookCaches.set(bookId, cache);

          for (const id of book.getReachableItems('root')) {
            const meta = book.meta[id];
            if (!meta) { continue; }

            const source = meta.source;
            if (!source) { continue; }

            let u;
            try {
              u = new URL(source);
              u.hash = '';
            } catch (ex) {
              continue;
            }

            cache.add(u.href);
          }
        }

        bookIds.push(bookId);
      }));
      return bookIds;
    } catch (ex) {
      console.error(ex);
    }
  }
  return [];
}

/**
 * @param {string[]} [bookIds] - ID of books with a valid cache
 */
function checkDuplicate(url, bookIds) {
  if (scrapbook.invokeBackgroundScript({
    cmd: "getCapturedUrls",
    args: {urls: [url]},
  })[url]) {
    return true;
  }

  if (bookIds) {
    for (const bookId of bookIds) {
      const cache = autoCaptureBookCaches.get(bookId);
      if (cache.has(url)) {
        return true;
      }
    }
  }

  return false;
}

async function invokeCapture(tabInfo, config, isRepeat, skipCheck) {
  if (!skipCheck) {
    // check if the tab is still valid
    // autoCaptureInfo will be cleared if the tab is removed, discarded, etc.
    if (!autoCaptureInfos.has(tabInfo.id)) {
      return;
    }

    // skip duplicate for a first autocapture
    if (!isRepeat) {
      // Skip checking server books, which have been checked when setting up
      // the timer.
      if (!config.allowDuplicate && checkDuplicate(tabInfo.url)) {
        return;
      }
    }
  }

  const taskInfo = Object.assign({
    autoClose: "always",
    tasks: [Object.assign({
      tabId: tabInfo.id,
    }, config.eachTaskInfo)],
  }, config.taskInfo);

  const args = {
    taskInfo,
    windowCreateData: {
      focused: false,
      state: 'minimized',
    },
    tabCreateData: {
      active: false,
    },
    waitForResponse: false,
  };

  await scrapbook.invokeCaptureEx(args);

  if (isRepeat) {
    return;
  }

  if (config.repeat > 0) {
    let info = autoCaptureInfos.get(tabInfo.id);
    if (!info) {
      info = {};
      autoCaptureInfos.set(tabInfo.id, info);
    }
    if (!info.repeat) {
      info.repeat = [];
    }
    const t = setInterval(() => {
      invokeCapture(tabInfo, config, true);
    }, config.repeat);
    info.repeat.push(t);
  }
}

function purgeInfoAll() {
  for (const [tabId, info] of autoCaptureInfos) {
    purgeInfo(tabId, info);
  }
}

function purgeInfo(tabId, info) {
  info = info || autoCaptureInfos.get(tabId);
  if (!info) { return; }

  let t;
  if (info.delay) {
    for (const t of info.delay) {
      clearTimeout(t);
    }
  }
  if (info.repeat) {
    for (const t of info.repeat) {
      clearInterval(t);
    }
  }
  autoCaptureInfos.delete(tabId);
}

function parseRegexStr(str) {
  const m = str.match(REGEX_STRING_PATTERN);
  if (m) {
    return new RegExp(m[1], m[2]);
  }
  return null;
}

function onUpdated(tabId, changeInfo, tabInfo) {
  // reset timer if tab closed
  if (changeInfo.status === 'loading' || changeInfo.discarded) {
    // note that tab id is changed when a tab is discarded in Chromium
    purgeInfo(tabInfo.id);
    return;
  }

  // skip if not loading event
  if (changeInfo.status !== 'complete') {
    return;
  }

  return autoCaptureTab(tabInfo); // async
}

function onRemoved(tabId, removeInfo) {
  purgeInfo(tabId);
}

function toggleAutoCapture() {
  purgeInfoAll();
  browser.tabs.onUpdated.removeListener(onUpdated);
  browser.tabs.onRemoved.removeListener(onRemoved);
  if (scrapbook.getOption("autocapture.enabled")) {
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
  }
}

function configAutoCapture() {
  try {
    autoCaptureConfigs = scrapbook.parseOption("autocapture.rules", scrapbook.getOption("autocapture.rules"));
  } catch (ex) {
    console.error(`Ignored invalid auto-capture config: ${ex.message}`);
    autoCaptureConfigs = [];
  }
}


/****************************************************************************
 * Init
 ***************************************************************************/

async function init() {
  clearCapturerCaches(); // async

  allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
  await scrapbook.loadOptionsAuto;
  toggleNotifyPageCaptured();
  configAutoCapture();
  toggleAutoCapture();
}

init();

return {
  toggleNotifyPageCaptured,
  updateBadgeForAllTabs,
  configAutoCapture,
  toggleAutoCapture,
};

}));
