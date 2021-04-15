/******************************************************************************
 *
 * The background script for scrapbook functionality
 *
 * @require {Object} scrapbook
 * @public {Object} scrapbooks
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('scrapbooks')) { return; }
  root.scrapbooks = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    console,
  );
}(this, function (isDebug, browser, scrapbook, console) {

  'use strict';

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

  async function onNavigation(details) {
    if (details.frameId !== 0) { return; }

    // prepare regex checkers
    const u = new URL(scrapbook.normalizeUrl(details.url));
    u.hash = '';
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
    };

    await server.init(true);
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
      let cache = bookCaches.get(bookId);
      if (refresh || !cache) {
        cache = new Map();
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

      const domainSources = cache.get(u.hostname);
      if (!domainSources) {
        return;
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
    }));

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
    } else {
      color = '#3366C0';
      count = matchTypeAndCount.similar;
    }

    browser.browserAction.setBadgeText({
      tabId: details.tabId,
      text: count.toString(),
    });

    // For a set with tabId, badge color will be reset when the tab is navigated
    browser.browserAction.setBadgeBackgroundColor({
      tabId: details.tabId,
      color,
    });
  }

  function toggleNotifyPageCaptured() {
    // Firefox Android < 55: no browserAction
    // Firefox Android < 79 does not support setBadgeText
    if (!browser.browserAction || !browser.browserAction.setBadgeText) {
      return;
    }

    browser.webNavigation.onCommitted.removeListener(onNavigation);
    if (scrapbook.getOption("scrapbook.notifyPageCaptured") && scrapbook.hasServer()) {
      browser.webNavigation.onCommitted.addListener(onNavigation, LISTENER_FILTER);
    }
  }

  async function init() {
    await scrapbook.loadOptionsAuto;
    toggleNotifyPageCaptured();
  }

  init();

  return {
    toggleNotifyPageCaptured,
  };

}));
