/******************************************************************************
 * Shared utilities for extension page/background scripts.
 *****************************************************************************/

import {
  userAgent,
  getUuid,
  normalizeUrl,
  splitUrl,
  getOption,
  getOptions,
  invokeMethod,
  invokeExtensionScript,
  initContentScripts,
  invokeContentScript,
  getScreenBounds,
} from "./common.mjs";
import {Cache} from "./cache.mjs";


/****************************************************************************
 * ScrapBook messaging
 ***************************************************************************/

/**
 * Invoke a function in the background script.
 *
 * @param {commandMessage} params
 * @param {string} params.cmd - without prefix "background."
 * @return {*}
 */
function invokeBackgroundScript({cmd, args}) {
  // if this is the background page
  if (globalThis.background) {
    return invokeMethod(globalThis.background, cmd, args);
  }

  return invokeExtensionScript({cmd: `background.${cmd}`, args});
}

/**
 * Wait for a tab to load completely.
 */
async function waitTabLoading(tab) {
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
}


/****************************************************************************
 * ScrapBook utilities
 ***************************************************************************/

async function checkPermissions() {
  return {
    "webRequestBlocking": await browser.permissions.contains({permissions: ["webRequestBlocking"]}),
    "host": await browser.permissions.contains({origins: ["http://*/", "https://*/"]}),
  };
}

/**
 * @return {Promise<Array>} The URL match patterns for content pages.
 */
const getContentPagePattern = (() => {
  let p;
  const init = () => {
    return p = (async () => [
      "http://*/*",
      "https://*/*",
      ...(await browser.extension.isAllowedFileSchemeAccess() ? ["file:///*"] : []),
    ])();
  };
  return function getContentPagePattern() {
    return p || init();
  };
})();

/**
 * @return {Promise<Array>}
 */
async function getContentTabs(filter = {currentWindow: true}) {
  filter = Object.assign({}, filter, {url: await getContentPagePattern()});
  const tabs = await browser.tabs.query(filter);

  // Note that tab.hidden is only supported in Firefox >= 61. For other
  // browsers it's undefined.
  return tabs.filter(tab => !tab.hidden);
}

/**
 * Query for highlighted ("selected") tabs
 */
async function getHighlightedTabs(filter = {currentWindow: true}) {
  // In Chromium mobile (e.g. Kiwi browser 98), all tabs.Tab have
  // .highlighted = true and sometimes all tabs.Tab have .active = false
  // (e.g. when at browser action page).
  // Query with {active: true} to get the real active tabs instead.
  if (userAgent.is('chromium') && userAgent.is('mobile')) {
    filter = Object.assign({}, filter, {active: true});
  } else {
    filter = Object.assign({}, filter, {highlighted: true});
  }

  return await browser.tabs.query(Object.assign(filter, {
    url: await getContentPagePattern(),
  }));
}

/**
 * @param {string} url
 * @param {boolean} [newTab] - Truthy to always open in a new tab.
 * @param {boolean} [inNormalWindow] - Open in a normal window only.
 * @return {Promise<Tab>}
 */
async function visitLink({
  url,
  newTab = false,
  inNormalWindow = false,
}) {
  // If inNormalWindow, create/update a tab in the last focused window.
  if (inNormalWindow && browser.windows) {
    const win = await invokeBackgroundScript({
      cmd: "getLastFocusedWindow",
      args: [{windowTypes: ['normal'], populate: !newTab}],
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
}

/**
 * Wrapped browser.windows.create() with automatic compatibility handling.
 */
async function createWindow(createData) {
  createData = Object.assign({}, createData);
  const updateDatas = [];

  if (userAgent.is('gecko')) {
    let updateData = {};

    // Firefox < 86: `focused` in `createData` causes an error.
    // Firefox >= 86: ignores `focused: false` in `createData`.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1213484
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create#browser_compatibility
    if (typeof createData.focused !== 'undefined') {
      updateData.focused = createData.focused;
      if (userAgent.major < 86) {
        delete createData.focused;
      }
    }

    // Firefox < 109: ignores `left` and `top` in `createData` for popups.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1271047
    if (userAgent.major < 109 && createData.type === 'popup') {
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
}

/**
 * Simplified API to invoke a capture with an array of tasks.
 *
 * @param {Array} tasks
 * @return {Promise<(Window|Tab)>}
 */
async function invokeCapture(tasks) {
  return await invokeCaptureEx({taskInfo: {tasks}, waitForResponse: false});
}

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
async function invokeCaptureEx({
  taskInfo,
  dialog = null,
  uniquify,
  ignoreTitle = true,
  windowCreateData,
  tabCreateData,
  waitForResponse = true,
}) {
  if (dialog) {
    const missionId = getUuid();
    const key = {table: "batchCaptureMissionCache", id: missionId};
    await Cache.set(key, {
      taskInfo,
      uniquify,
      ignoreTitle,
    });
    const url = browser.runtime.getURL(`capturer/${dialog}.html`) + `?mid=${missionId}`;
    return visitLink({url, newTab: true, inNormalWindow: true});
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
            const normalizedUrl = normalizeUrl(url);
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

  const missionId = getUuid();
  const key = {table: "captureMissionCache", id: missionId};
  await Cache.set(key, taskInfo);
  const url = browser.runtime.getURL("capturer/capturer.html") + `?mid=${missionId}`;

  // launch capturer
  let tab;
  if (browser.windows) {
    const win = await browser.windows.getCurrent();
    ({tabs: [tab]} = await createWindow(Object.assign({
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
  await waitTabLoading(tab);

  // retrieve capture results
  const results = await invokeExtensionScript({
    id: missionId,
    cmd: 'capturer.getMissionResult',
  });

  return {
    tab,
    results,
  };
}

/**
 * Shortcut for invoking a general "capture as".
 */
async function invokeCaptureAs(taskInfo, {
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
  taskInfo.options = Object.assign(await getOptions("capture", null), taskInfo.options);
  return await invokeCaptureEx({
    dialog: 'details',
    taskInfo,
    ignoreTitle,
    uniquify,
  });
}

/**
 * Shortcut for invoking a general "batch capture as".
 */
async function invokeCaptureBatch(taskInfo) {
  return await invokeCaptureEx({
    dialog: 'batch',
    taskInfo,
    ignoreTitle: true,
    uniquify: true,
  });
}

/**
 * Shortcut for invoking a general "batch capture links as".
 */
async function invokeCaptureBatchLinks(taskInfo) {
  const subTasks = taskInfo.tasks.map(({tabId, frameId = 0, fullPage}) => {
    return initContentScripts(tabId, frameId)
      .then(() => {
        return invokeContentScript({
          tabId,
          frameId,
          cmd: "capturer.retrieveSelectedLinks",
          args: [{
            select: fullPage ? 'all' : undefined,
          }],
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
  return await invokeCaptureBatch(Object.assign({}, taskInfo, {tasks}));
}

/**
 * @param {boolean} [newTab] - Whether to open in a new tab.
 * @return {undefined|Tab}
 */
async function openScrapBook({newTab = true} = {}) {
  if (browser.sidebarAction && await getOption("scrapbook.useBrowserSidebars")) {
    // This can only be called in a user action handler.
    // https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/User_actions
    return await browser.sidebarAction.open();
  }

  // Mobile browser (e.g. Kiwi) crashes when opening the side panel
  if (browser.sidePanel && !userAgent.is('mobile') && await getOption("scrapbook.useBrowserSidebars")) {
    const {id: windowId} = await browser.windows.getCurrent({windowTypes: ['normal']});
    // This may only be called in response to a user action.
    // https://developer.chrome.com/docs/extensions/reference/api/sidePanel#method-open
    return await browser.sidePanel.open({windowId});
  }

  const url = browser.runtime.getURL("scrapbook/sidebar.html");

  let sidebarTab = (await browser.tabs.query({}))
      .filter(t => splitUrl(t.url)[0] === url)[0];

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
    } = await getScreenBounds(currentWindow);
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
      sidebarWindow = await createWindow({
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

  return await visitLink({url, newTab});
}

async function editTab({tabId, frameId = 0, willActive, force}) {
  await initContentScripts(tabId);
  return await invokeContentScript({
    tabId,
    frameId,
    cmd: "editor.init",
    args: [{willActive, force}],
  });
}

async function searchCaptures({tabs, newTab = true}) {
  const url = new URL(browser.runtime.getURL(`scrapbook/search-captures.html`));
  for (const tab of tabs) {
    url.searchParams.append('q', tab.url);
  }
  return await visitLink({
    url: url.href,
    newTab,
  });
}

export * from "./common.mjs";
export {
  invokeBackgroundScript,
  waitTabLoading,
  checkPermissions,
  getContentPagePattern,
  getContentTabs,
  getHighlightedTabs,
  visitLink,
  createWindow,
  invokeCapture,
  invokeCaptureEx,
  invokeCaptureAs,
  invokeCaptureBatch,
  invokeCaptureBatchLinks,
  openScrapBook,
  editTab,
  searchCaptures,
};
