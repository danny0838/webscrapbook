/******************************************************************************
 *
 * Shared utilities for extension scripts.
 *
 * @public {Object} scrapbook
 *****************************************************************************/

((window, document, browser) => {

/******************************************************************************
 * ScrapBook messaging
 *****************************************************************************/

/**
 * Add a message listener, with optional filter and errorHandler.
 *
 * @param {Function} filter
 * @param {Function} errorHandler
 * @return {Function}
 */
scrapbook.addMessageListener = function (filter, errorHandler = ex => {
  console.error(ex);
  return {error: {message: ex.message}};
}) {
  const listener = (message, sender) => {
    if (filter && !filter(message, sender)) { return; }

    const {cmd, args} = message;
    isDebug && console.debug(cmd, "receive", `[${sender.tab ? sender.tab.id : -1}]`, args);

    const [mainCmd, subCmd] = cmd.split(".");

    const object = window[mainCmd];
    if (!object || !object[subCmd]) { return; }

    let response;
    try {
      response = object[subCmd](args, sender);
      if (scrapbook.isPromise(response)) {
        if (errorHandler) { response = response.catch(errorHandler); }
      }
    } catch (ex) {
      if (errorHandler) { return errorHandler(ex); }
    }
    return response;
  };
  browser.runtime.onMessage.addListener(listener);
  return listener;
};


/******************************************************************************
 * ScrapBook utilities
 *****************************************************************************/

/**
 * @return {Promise<Array>} The URL match patterns for content pages.
 */
scrapbook.getContentPagePattern = async function () {
  const p = (async () => {
    const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
    const urlMatch = ["http://*/*", "https://*/*"];
    if (allowFileAccess) { urlMatch.push("file:///*"); }
    return urlMatch;
  })();
  scrapbook.getContentPagePattern = () => p;
  return p;
};

/**
 * @return {Promise<Array>}
 */
scrapbook.getContentTabs = async function () {
  // scrapbook.getContentPagePattern() resolves to [] on Firefox Android 57
  // due to a bug of browser.tabs.query:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1418737
  const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
  const tabs = await browser.tabs.query({currentWindow: true, url: "<all_urls>"});
  return tabs.filter((tab) => (scrapbook.isContentPage(tab.url, allowFileAccess)));
};

/**
 * Query for highlighted ("selected") tabs
 */
scrapbook.getHighlightedTabs = async function () {
  const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
  // Querying for {highlighted:true} doesn't get highlighted tabs in some
  // Firefox version (e.g. 55), so we query for all tabs and filter them
  // afterwards.
  const tabs = await browser.tabs.query({
    currentWindow: true,
  });
  const target = tabs
    .filter(t => (
      scrapbook.isContentPage(t.url, allowFileAccess) &&
      // Select active and highlighted tabs.
      //
      // Normally active tabs are always highlighted, but in some browsers
      // (e.g. Opera 58) Tab.highlighted = false, so check for active tabs
      // explictly as a fallback.
      //
      // Firefox for Android < 54 does not support Tab.highlighted. Treat
      // undefined as true.
      (t.active || t.highlighted !== false)
    ))
    .map(t => t.id)
    .join(',');
  return target;
};

/**
 * @param {string} url
 * @param {boolean} newTab
 * @param {string|array|boolean} singleton - URL match pattern for singleton;
 *     true: match url with any query; false: not singleton
 */
scrapbook.visitLink = async function ({url, newTab = false, singleton = false}) {
  if (singleton) {
    if (singleton === true) {
      singleton = [url, url + "?*"];
    }

    const existedTab = (await browser.tabs.query({url: singleton}))[0];

    if (existedTab) {
      return await browser.tabs.update(existedTab.id, {active: true});
    }
  }

  if (newTab) {
    return await browser.tabs.create({url});
  }

  return await browser.tabs.update({url, active: true});
};

/**
 * @param {string} target - a list of tabId and frameId
 * @param {string} url - a list of URL and title
 * @param {string} mode
 * @return {Promise<(Window|Tab)>}
 */
scrapbook.invokeCapture = async function (params) {
  const {
    target, full,
    url, title, refUrl, favIconUrl,
    mode,
  } = params;

  const urlObj = new URL(browser.runtime.getURL("capturer/capturer.html"));
  if (target) {
    urlObj.searchParams.set('t', target);
    if (full) { urlObj.searchParams.set('f', 1); }
  } else if (url) {
    urlObj.searchParams.set('u', url);
    if (title) { urlObj.searchParams.set('t', title); }
    if (refUrl) { urlObj.searchParams.set('r', refUrl); }
    if (favIconUrl) { urlObj.searchParams.set('f', favIconUrl); }
  }
  if (mode) { urlObj.searchParams.set('m', mode); }

  if (browser.windows) {
    const win = await browser.windows.getCurrent();
    return await browser.windows.create({
      url: urlObj.href,
      type: 'popup',
      width: 400,
      height: 400,
      incognito: win.incognito,
    });
  } else {
    return await browser.tabs.create({
      url: urlObj.href,
    });
  }
};

/**
 * @param {boolean} newTab
 */
scrapbook.openScrapBook = async function ({newTab = true}) {
  const url = browser.runtime.getURL("scrapbook/sidebar.html");

  if (browser.sidebarAction) {
    // This can only be called in a user action handler.
    // https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/User_actions
    return await browser.sidebarAction.open();
  } else if (browser.windows) {
    const currentWindow = await browser.windows.getCurrent({windowTypes: ['normal']});

    const sideWindow = (await browser.windows.getAll({
      windowTypes: ['popup'],
      populate: true,
    })).filter(w => w.tabs[0].url.startsWith(url))[0];

    // calculate the desired position of the main and sidebar windows
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const left = 0;
    const top = 0;
    const width = Math.max(Math.floor(screenWidth / 5 - 1), 200);
    const height = screenHeight - 1;
    const mainLeft = Math.max(width + 1, currentWindow.left);
    const mainTop = Math.max(0, currentWindow.top);
    const mainWidth = Math.min(screenWidth - width - 1, currentWindow.width);
    const mainHeight = Math.min(screenHeight - 1, currentWindow.height);

    if (sideWindow) {
      await browser.windows.update(sideWindow.id, {
        left,
        top,
        width,
        height,
        drawAttention: true,
      });
    } else {
      await browser.windows.create({
        url,
        left,
        top,
        width,
        height,
        type: 'popup',
      });
    }

    const axis = {};
    if (mainLeft !== currentWindow.left) { axis.left = mainLeft; }
    if (mainTop !== currentWindow.top) { axis.top = mainTop; }
    if (mainWidth !== currentWindow.width) { axis.width = mainWidth; }
    if (mainHeight !== currentWindow.height) { axis.height = mainHeight; }

    return await browser.windows.update(currentWindow.id, axis);
  } else {
    // Firefox Android does not support windows
    return await scrapbook.visitLink({url, newTab});
  }
};

scrapbook.editTab = async function ({tabId, frameId = 0, toggle, force}) {
  await scrapbook.initContentScripts(tabId);
  return await scrapbook.invokeContentScript({
    tabId,
    frameId,
    cmd: "editor.init",
    args: {toggle, force},
  });
};

})(this, this.document, this.browser);
