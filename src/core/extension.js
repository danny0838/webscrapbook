/******************************************************************************
 * Shared utilities for extension page/background scripts.
 *
 * @requires scrapbook
 * @modifies scrapbook
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

/****************************************************************************
 * ScrapBook messaging
 ***************************************************************************/

/**
 * Invoke an invokable command in the background script.
 *
 * @param {Object} params
 * @param {string} params.cmd
 * @param {Object} [params.args]
 * @return {*}
 */
scrapbook.invokeBackgroundScript = function ({cmd, args}) {
  // if this is the background page
  if (globalThis.background) {
    return globalThis.background[cmd](args);
  }

  return scrapbook.invokeExtensionScript({cmd: `background.${cmd}`, args});
};

/**
 * Wait for a tab to load completely.
 */
scrapbook.waitTabLoading = async function (tab) {
  const {promise, resolve, reject} = Promise.withResolvers();
  const listener = (tabId, changeInfo, t) => {
    if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
    resolve(t);
  };
  const listener2 = (tabId, removeInfo) => {
    if (!(tabId === tab.id)) { return; }
    reject(new Error('Tab removed before loading complete.'));
  };
  try {
    browser.tabs.onUpdated.addListener(listener);
    browser.tabs.onRemoved.addListener(listener2);
    await promise;
  } finally {
    browser.tabs.onUpdated.removeListener(listener);
    browser.tabs.onRemoved.removeListener(listener2);
  }
};


/****************************************************************************
 * ScrapBook utilities
 ***************************************************************************/

scrapbook.checkPermissions = async function () {
  return {
    "webRequestBlocking": await browser.permissions.contains({permissions: ["webRequestBlocking"]}),
    "host": await browser.permissions.contains({origins: ["http://*/", "https://*/"]}),
  };
};

/**
 * @return {Promise<Array>} The URL match patterns for content pages.
 */
scrapbook.getContentPagePattern = async function () {
  const p = (async () => [
    "http://*/*",
    "https://*/*",
    ...(await browser.extension.isAllowedFileSchemeAccess() ? ["file:///*"] : []),
  ])();
  scrapbook.getContentPagePattern = () => p;
  return p;
};

/**
 * @return {Promise<Array>}
 */
scrapbook.getContentTabs = async function (filter = {currentWindow: true}) {
  filter = Object.assign({}, filter, {url: await scrapbook.getContentPagePattern()});
  const tabs = await browser.tabs.query(filter);

  // Note that tab.hidden is only supported in Firefox >= 61. For other
  // browsers it's undefined.
  return tabs.filter(tab => !tab.hidden);
};

/**
 * Query for highlighted ("selected") tabs
 */
scrapbook.getHighlightedTabs = async function (filter = {currentWindow: true}) {
  // In Chromium mobile (e.g. Kiwi browser 98), all tabs.Tab have
  // .highlighted = true and sometimes all tabs.Tab have .active = false
  // (e.g. when at browser action page).
  // Query with {active: true} to get the real active tabs instead.
  if (scrapbook.userAgent.is('chromium') && scrapbook.userAgent.is('mobile')) {
    filter = Object.assign({}, filter, {active: true});
  } else {
    filter = Object.assign({}, filter, {highlighted: true});
  }

  return await browser.tabs.query(Object.assign(filter, {
    url: await scrapbook.getContentPagePattern(),
  }));
};

/**
 * @param {string} url
 * @param {boolean} [newTab] - Truthy to always open in a new tab.
 * @param {boolean} [inNormalWindow] - Open in a normal window only.
 * @return {Promise<Tab>}
 */
scrapbook.visitLink = async function ({
  url,
  newTab = false,
  inNormalWindow = false,
}) {
  // If inNormalWindow, create/update a tab in the last focused window.
  if (inNormalWindow && browser.windows) {
    const win = await scrapbook.invokeBackgroundScript({
      cmd: "getLastFocusedWindow",
      args: {windowTypes: ['normal'], populate: !newTab},
    });

    if (!win) {
      const {tabs: [tab]} = await browser.windows.create({url});
      return tab;
    }

    if (!newTab) {
      const [targetTab] = win.tabs.filter(x => x.active);
      if (targetTab) {
        return await browser.tabs.update(targetTab.id, {url});
      }
    }

    return await browser.tabs.create({url, windowId: win.id});
  }

  if (!newTab) {
    const targetTab = await browser.tabs.getCurrent();
    if (targetTab) {
      return await browser.tabs.update(targetTab.id, {url, active: true});
    }
  }

  // create/update a tab in the current window (or an auto-picked "last
  // focused window" when e.g. creating the second tab in a popup window in
  // Chromium).
  return await browser.tabs.create({url});
};

/**
 * Wrapped browser.windows.create() with automatic compatibility handling.
 */
scrapbook.createWindow = async function (createData) {
  createData = Object.assign({}, createData);
  const updateDatas = [];

  if (scrapbook.userAgent.is('gecko')) {
    let updateData = {};

    // Firefox < 86: `focused` in `createData` causes an error.
    // Firefox >= 86: ignores `focused: false` in `createData`.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1213484
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create#browser_compatibility
    if (typeof createData.focused !== 'undefined') {
      updateData.focused = createData.focused;
      if (scrapbook.userAgent.major < 86) {
        delete createData.focused;
      }
    }

    // Firefox < 109: ignores `left` and `top` in `createData` for popups.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1271047
    if (scrapbook.userAgent.major < 109 && createData.type === 'popup') {
      if (typeof createData.left !== 'undefined') {
        updateData.left = createData.left;
        delete createData.left;
      }
      if (typeof createData.top !== 'undefined') {
        updateData.top = createData.top;
        delete createData.top;
      }
    }

    if (Object.keys(updateData).length) {
      updateDatas.push(updateData);
    }
  }

  if (['minimized', 'maximized', 'fullscreen'].includes(createData.state)) {
    // `left`, `top`, `width`, `height`, and `focused: false` cannot be used
    // with these states.
    // Change state after window creation instead.
    if (typeof createData.focused !== 'undefined'
      || typeof createData.top !== 'undefined'
      || typeof createData.left !== 'undefined'
      || typeof createData.width !== 'undefined'
      || typeof createData.height !== 'undefined'
    ) {
      updateDatas.push({state: createData.state});
      delete createData.state;
    }
  }

  const winNew = await browser.windows.create(createData);
  for (const updateData of updateDatas) {
    await browser.windows.update(winNew.id, updateData);
  }

  return winNew;
};

/**
 * Simplified API to invoke a capture with an array of tasks.
 *
 * @param {Array} tasks
 * @return {Promise<(Window|Tab)>}
 */
scrapbook.invokeCapture = async function (tasks) {
  return await scrapbook.invokeCaptureEx({taskInfo: {tasks}, waitForResponse: false});
};

/**
 * Advanced API to invoke a capture.
 *
 * @param {Object} params
 * @param {Object} params.taskInfo
 * @param {?string} [params.dialog]
 * @param {boolean} [params.uniquify]
 * @param {boolean} [params.ignoreTitle]
 * @param {Object} [params.windowCreateData]
 * @param {Object} [params.tabCreateData]
 * @param {boolean} [params.waitForResponse]
 * @return {Promise<(Object|Window|Tab)>}
 */
scrapbook.invokeCaptureEx = async function ({
  taskInfo,
  dialog = null,
  uniquify,
  ignoreTitle = true,
  windowCreateData,
  tabCreateData,
  waitForResponse = true,
}) {
  if (dialog) {
    const missionId = scrapbook.getUuid();
    const key = {table: "batchCaptureMissionCache", id: missionId};
    await scrapbook.cache.set(key, {
      taskInfo,
      uniquify,
      ignoreTitle,
    });
    const url = browser.runtime.getURL(`capturer/${dialog}.html`) + `?mid=${missionId}`;
    return scrapbook.visitLink({url, newTab: true, inNormalWindow: true});
  }

  if (uniquify || ignoreTitle) {
    // make a deep clone
    taskInfo = JSON.parse(JSON.stringify(taskInfo));

    // remove duplicates
    if (uniquify) {
      const tabs = new Set();
      const urls = new Set();
      taskInfo.tasks = taskInfo.tasks.filter(({tabId, url}) => {
        if (Number.isInteger(tabId)) {
          if (tabs.has(tabId)) {
            return false;
          }
          tabs.add(tabId);
        } else if (url) {
          try {
            const normalizedUrl = scrapbook.normalizeUrl(url);
            if (urls.has(normalizedUrl)) {
              return false;
            }
            urls.add(normalizedUrl);
          } catch (ex) {
            throw Error(`Failed to uniquify invalid URL: ${url}`);
          }
        }
        return true;
      });
    }

    // remove title if ignoreTitle is set
    if (ignoreTitle) {
      for (const task of taskInfo.tasks) {
        delete task.title;
      }
    }
  }

  const missionId = scrapbook.getUuid();
  const key = {table: "captureMissionCache", id: missionId};
  await scrapbook.cache.set(key, taskInfo);
  const url = browser.runtime.getURL("capturer/capturer.html") + `?mid=${missionId}`;

  // launch capturer
  let tab;
  if (browser.windows) {
    const win = await browser.windows.getCurrent();
    ({tabs: [tab]} = await scrapbook.createWindow(Object.assign({
      url,
      type: 'popup',
      width: 400,
      height: 400,
      incognito: win.incognito,
    }, windowCreateData)));

    if (!waitForResponse) {
      return tab;
    }
  } else {
    tab = await browser.tabs.create(Object.assign({
      url,
    }, tabCreateData));

    if (!waitForResponse) {
      return tab;
    }
  }

  // wait until tab loading complete
  await scrapbook.waitTabLoading(tab);

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
 * Shortcut for invoking a general "capture as".
 */
scrapbook.invokeCaptureAs = async function (taskInfo, {
  ignoreTitle = false,
  uniquify = false,
} = {}) {
  taskInfo = Object.assign({
    tasks: [],
    mode: "",
    bookId: null,
    parentId: "root",
    index: null,
    delay: null,
    options: null,
  }, taskInfo);
  taskInfo.options = Object.assign(await scrapbook.getOptions("capture", null), taskInfo.options);
  return await scrapbook.invokeCaptureEx({
    dialog: 'details',
    taskInfo,
    ignoreTitle,
    uniquify,
  });
};

/**
 * Shortcut for invoking a general "batch capture as".
 */
scrapbook.invokeCaptureBatch = async function (taskInfo) {
  return await scrapbook.invokeCaptureEx({
    dialog: 'batch',
    taskInfo,
    ignoreTitle: true,
    uniquify: true,
  });
};

/**
 * Shortcut for invoking a general "batch capture links as".
 */
scrapbook.invokeCaptureBatchLinks = async function (taskInfo) {
  const subTasks = taskInfo.tasks.map(({tabId, frameId = 0, fullPage}) => {
    return scrapbook.initContentScripts(tabId, frameId)
      .then(() => {
        return scrapbook.invokeContentScript({
          tabId,
          frameId,
          cmd: "capturer.retrieveSelectedLinks",
          args: {
            select: fullPage ? 'all' : undefined,
          },
        });
      })
      .catch((ex) => {
        console.error(ex);
        return [];
      });
  });
  let tasks = [];
  for (const subTaskList of await Promise.all(subTasks)) {
    tasks = tasks.concat(subTaskList);
  }
  return await scrapbook.invokeCaptureBatch(Object.assign({}, taskInfo, {tasks}));
};

/**
 * @param {boolean} [newTab] - Whether to open in a new tab.
 * @return {undefined|Tab}
 */
scrapbook.openScrapBook = async function ({newTab = true} = {}) {
  if (browser.sidebarAction && await scrapbook.getOption("scrapbook.useBrowserSidebars")) {
    // This can only be called in a user action handler.
    // https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/User_actions
    return await browser.sidebarAction.open();
  }

  // Mobile browser (e.g. Kiwi) crashes when opening the side panel
  if (browser.sidePanel && !scrapbook.userAgent.is('mobile') && await scrapbook.getOption("scrapbook.useBrowserSidebars")) {
    const {id: windowId} = await browser.windows.getCurrent({windowTypes: ['normal']});
    // This may only be called in response to a user action.
    // https://developer.chrome.com/docs/extensions/reference/api/sidePanel#method-open
    return await browser.sidePanel.open({windowId});
  }

  const url = browser.runtime.getURL("scrapbook/sidebar.html");

  let sidebarTab = (await browser.tabs.query({}))
      .filter(t => scrapbook.splitUrl(t.url)[0] === url)[0];

  openInSidebarWindow: {
    // Firefox Android does not support windows
    if (!browser.windows) {
      break openInSidebarWindow;
    }

    let sidebarWindow;
    if (sidebarTab) {
      sidebarWindow = await browser.windows.get(sidebarTab.windowId);

      // Treat as if browser.windows not supported if the sidebar is opened
      // in a non-popup window.
      if (sidebarWindow.type !== 'popup') {
        break openInSidebarWindow;
      }
    }

    // get the current window before further async tasks
    // browser.windows.getCurrent throws if the current window doesn't exist
    const currentWindow = await browser.windows.getCurrent({windowTypes: ['normal']}).catch(ex => null);

    // calculate the desired position of the sidebar window
    const {
      width: screenWidth,
      height: screenHeight,
      left: screenLeft,
      top: screenTop,
    } = await scrapbook.getScreenBounds(currentWindow);
    const left = screenLeft;
    const top = screenTop;
    const width = Math.max(Math.floor(screenWidth / 5 - 1), 200);
    const height = screenHeight - 1;

    // create or update the sidebar window
    if (sidebarWindow) {
      sidebarWindow = await browser.windows.update(sidebarWindow.id, {
        left,
        top,
        width,
        height,
        drawAttention: true,
      });
    } else {
      sidebarWindow = await scrapbook.createWindow({
        url,
        left,
        top,
        width,
        height,
        type: 'popup',
      });
      sidebarTab = sidebarWindow.tabs[0];
    }

    // update the current window if it exists
    if (currentWindow) {
      // calculate the desired position of the main window
      const mainLeft = Math.max(left + width + 1, currentWindow.left);
      const mainTop = Math.max(top, currentWindow.top);
      const mainWidth = Math.min(screenWidth - width - 1, currentWindow.width);
      const mainHeight = Math.min(screenHeight - 1, currentWindow.height);

      const axis = {
        state: 'normal',
        left: mainLeft,
        top: mainTop,
        width: mainWidth,
        height: mainHeight,
      };

      await browser.windows.update(currentWindow.id, axis);
    }

    return sidebarTab;
  }

  // update the sidebar tab if it exists
  if (sidebarTab) {
    return await browser.tabs.update(sidebarTab.id, {active: true});
  }

  return await scrapbook.visitLink({url, newTab});
};

scrapbook.editTab = async function ({tabId, frameId = 0, willActive, force}) {
  await scrapbook.initContentScripts(tabId);
  return await scrapbook.invokeContentScript({
    tabId,
    frameId,
    cmd: "editor.init",
    args: {willActive, force},
  });
};

scrapbook.searchCaptures = async function ({tabs, newTab = true}) {
  const url = new URL(browser.runtime.getURL(`scrapbook/search-captures.html`));
  for (const tab of tabs) {
    url.searchParams.append('q', tab.url);
  }
  return await scrapbook.visitLink({
    url: url.href,
    newTab,
  });
};

}));
