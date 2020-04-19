/******************************************************************************
 *
 * Shared utilities for extension scripts.
 *
 * @public {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, root, window, console) {

  'use strict';

  /****************************************************************************
   * ScrapBook messaging
   ***************************************************************************/

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

      const parts = cmd.split(".");
      let subCmd = parts.pop();
      let object = root;
      while (parts.length) {
        object = object[parts.shift()];
      }

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
  };


  /****************************************************************************
   * ScrapBook utilities
   ***************************************************************************/

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
    return tabs.filter(t => (
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
    ));
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
   * Simplified API to invoke a capture with an array of tasks.
   *
   * @param {Array} tasks
   * @return {Promise<(Window|Tab)>}
   */
  scrapbook.invokeCapture = async function (tasks) {
    return await scrapbook.invokeCaptureEx({tasks, waitForResponse: false});
  };

  /**
   * Advanced API to invoke a capture.
   *
   * @param {Object} params
   * @param {Array} params.tasks
   * @param {Object} params.windowCreateData
   * @param {boolean} params.waitForResponse
   * @return {Promise<(Object|Window|Tab)>}
   */
  scrapbook.invokeCaptureEx = async function ({
    tasks,
    windowCreateData,
    waitForResponse = true,
  }) {
    const missionId = scrapbook.getUuid();
    const key = {table: "captureMissionCache", id: missionId};
    await scrapbook.cache.set(key, tasks);
    const url = browser.runtime.getURL("capturer/capturer.html") + `?mid=${missionId}`;

    // launch capturer
    let tab;
    if (browser.windows) {
      const win = await browser.windows.getCurrent();
      const captureWinow = await browser.windows.create(Object.assign({
        url,
        type: 'popup',
        width: 400,
        height: 400,
        incognito: win.incognito,
      }, windowCreateData));

      if (!waitForResponse) {
        return captureWinow;
      }

      tab = captureWinow.tabs[0];
    } else {
      const captureTab = await browser.tabs.create({
        url,
      });

      if (!waitForResponse) {
        return captureTab;
      }

      tab = captureTab;
    }

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

    // retrieve capture results
    const results = await scrapbook.invokeExtensionScript({
      id: missionId,
      cmd: 'capturer.getMissionResult',
      args: {},
    });

    return {
      tab,
      results,
    };
  };

  /**
   * Invoke batch capture with preset params.
   *
   * @param {Object} params
   * @param {Array} params.tasks
   * @param {boolean} params.useJson
   * @param {boolean} params.customTitle
   * @return {Promise<Tab>}
   */
  scrapbook.invokeBatchCapture = async function (params) {
    const missionId = scrapbook.getUuid();
    const key = {table: "batchCaptureMissionCache", id: missionId};
    await scrapbook.cache.set(key, params);
    const url = browser.runtime.getURL("capturer/batch.html") + `?mid=${missionId}`;
    const tab = await browser.tabs.create({url});
    return tab;
  };

  /**
   * @param {boolean} newTab - Whether to open in a new tab.
   * @return {undefined|Window|Tab}
   */
  scrapbook.openScrapBook = async function ({newTab = true}) {
    const url = browser.runtime.getURL("scrapbook/sidebar.html");

    if (browser.sidebarAction) {
      // This can only be called in a user action handler.
      // https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/User_actions
      return await browser.sidebarAction.open();
    } else if (browser.windows) {
      const currentWindow = await browser.windows.getCurrent({windowTypes: ['normal']});

      let sideWindow = (await browser.windows.getAll({
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
        sideWindow = await browser.windows.update(sideWindow.id, {
          left,
          top,
          width,
          height,
          drawAttention: true,
        });
      } else {
        sideWindow = await browser.windows.create({
          url,
          left,
          top,
          width,
          height,
          type: 'popup',
        });

        // Fix a bug for Firefox that positioning not work for windows.create
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1271047
        // @FIXME: this occasionally doesn't work.
        if (scrapbook.userAgent.is('gecko')) {
          await browser.windows.update(sideWindow.id, {
            left,
            top,
          });
        }
      }

      const axis = {};
      if (mainLeft !== currentWindow.left) { axis.left = mainLeft; }
      if (mainTop !== currentWindow.top) { axis.top = mainTop; }
      if (mainWidth !== currentWindow.width) { axis.width = mainWidth; }
      if (mainHeight !== currentWindow.height) { axis.height = mainHeight; }

      await browser.windows.update(currentWindow.id, axis);
      return sideWindow;
    } else {
      // Firefox Android does not support windows
      return await scrapbook.visitLink({url, newTab});
    }
  };

  scrapbook.editTab = async function ({tabId, frameId = 0, willOpen, force}) {
    await scrapbook.initContentScripts(tabId);
    return await scrapbook.invokeContentScript({
      tabId,
      frameId,
      cmd: "editor.init",
      args: {willOpen, force},
    });
  };

}));
