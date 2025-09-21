/******************************************************************************
 * Main background module to receive command from messages.
 *****************************************************************************/

import * as utils from "../utils/extension.mjs";
import {server} from "../scrapbook/server.mjs";
import * as capturer from "../capturer/background.mjs";
import * as editor from "../editor/background.mjs";

/**
 * @type {Map<integer~windowId, integer~timestamp>}
 */
const focusedWindows = new Map();

/**
 * @type {Map<string~url, integer~count>}
 */
const capturedUrls = new Map();

const background = {};

/**
 * Get the real last focused window.
 *
 * Native browser.windows.getLastFocused() gets the last created window
 * (the window "on top"), rather than the window the user last activates a
 * tab within.
 *
 * @type invokable
 * @param {Object} params
 * @param {boolean} [params.populate]
 * @param {WindowType[]} [params.windowTypes]
 */
background.getLastFocusedWindow = async function ({
  populate = false,
  windowTypes = ['normal', 'popup'],
} = {}) {
  const wins = (await browser.windows.getAll({windowTypes, populate}))
    .sort((a, b) => {
      const va = focusedWindows.get(a.id) || -Infinity;
      const vb = focusedWindows.get(b.id) || -Infinity;
      if (va > vb) { return 1; }
      if (vb > va) { return -1; }
      if (a.id > b.id) { return 1; }
      if (b.id > a.id) { return -1; }
      return 0;
    });

  return wins.pop();
};

/**
 * @type invokable
 * @param {commandMessage} params
 * @param {integer} params.frameId
 * @param {MessageSender} sender
 */
background.invokeFrameScript = async function ({frameId, cmd, args}, sender) {
  const tabId = sender.tab.id;
  return await utils.invokeContentScript({
    tabId, frameId, cmd, args,
  });
};

/**
 * @type invokable
 */
background.findBookIdFromUrl = async function ({url}, sender) {
  await server.init(true);
  return await server.findBookIdFromUrl(url);
};

/**
 * Attempt to locate an item in the sidebar.
 *
 * @type invokable
 * @return {Object|null|false} The located item.
 *   - Object: the located item
 *   - null: no item located
 *   - false: no sidebar opened
 */
background.locateItem = async function (params, sender) {
  const cmd = 'sidebar.locate';
  const args = params;
  const sidebarUrl = browser.runtime.getURL("scrapbook/sidebar.html");

  if (browser.sidebarAction) {
    // Unfortunately we cannot force open the sidebar from a user gesture
    // in a content page if it's closed.
    if (!await browser.sidebarAction.isOpen({})) {
      return false;
    }

    // pass windowId to restrict response to the current window sidebar
    return await utils.invokeExtensionScript({id: (await browser.windows.getCurrent()).id, cmd, args});
  }

  if (browser.sidePanel && !utils.userAgent.is('mobile')) {
    // pass windowId to restrict response to the current window sidebar
    try {
      return await utils.invokeExtensionScript({id: (await browser.windows.getCurrent()).id, cmd, args});
    } catch (ex) {
      console.error('Unable to locate item: %o', ex);
      return false;
    }
  }

  const sidebarTab = (await browser.tabs.query({}))
      .filter(t => utils.splitUrl(t.url)[0] === sidebarUrl)[0];

  if (!sidebarTab) {
    return false;
  }

  const tabId = sidebarTab.id;
  const result = await utils.invokeContentScript({tabId, frameId: 0, cmd, args});

  if (result) {
    if (browser.windows && sidebarTab.windowId) {
      // In Chromium for Android (e.g. Kiwi Browser):
      // - windowId of any tab is 1, which refers a non-existent window.
      // - browser.windows.update() for a non-existent window does nothing
      //   rather than throw.
      await browser.windows.update(sidebarTab.windowId, {drawAttention: true});
    }

    await browser.tabs.update(tabId, {active: true});
  }

  return result;
};

/**
 * @type invokable
 * @param {Object} [params]
 * @param {MessageSender} sender
 */
background.captureCurrentTab = async function (params = {}, sender) {
  const task = Object.assign({tabId: sender.tab.id}, params);
  return await utils.invokeCapture([task]);
};

/**
 * @type invokable
 * @param {Object} [params]
 * @param {string[]} [params.urls]
 * @return {Object<string~url, integer~count>}
 */
background.getCapturedUrls = function ({urls = []} = {}) {
  const rv = {};
  for (const url of urls) {
    rv[url] = capturedUrls.get(url) || 0;
  }
  return rv;
};

/**
 * @type invokable
 * @param {Object} [params]
 * @param {string[]} [params.urls]
 */
background.setCapturedUrls = function ({urls = []} = {}) {
  for (const url of urls) {
    capturedUrls.set(url, (capturedUrls.get(url) || 0) + 1);
  }
};

/**
 * @type invokable
 */
background.createSubPage = async function ({url, title}, sender) {
  await server.init(true);

  // search for bookId and item
  // reject if not found
  const bookId = await server.findBookIdFromUrl(url);
  if (typeof bookId !== 'string') {
    throw new Error(`Unable to find a valid book.`);
  }
  const book = server.books[bookId];

  const item = await book.findItemFromUrl(url);
  if (!item) {
    throw new Error(`Unable to find a valid item.`);
  }

  if (!item.index.endsWith('/index.html')) {
    throw new Error(`Index page is not "*/index.html".`);
  }

  // generate subpage
  const base = utils.getRelativeUrl(url, book.dataUrl);
  await server.request({
    query: {
      a: 'query',
      lock: '',
    },
    body: {
      q: JSON.stringify({
        book: book.id,
        cmd: 'add_item_subpage',
        kwargs: {
          item_id: item.id,
          title,
          base,
        },
      }),
    },
    method: 'POST',
    format: 'json',
    csrfToken: true,
  });
};

/**
 * @type invokable
 * @param {Object} [params]
 * @param {MessageSender} sender
 */
background.registerActiveEditorTab = async function ({willEnable = true} = {}, sender) {
  return editor.registerActiveEditorTab(sender.tab.id, willEnable);
};

/**
 * @type invokable
 * @param {Object} params
 * @param {MessageSender} sender
 */
background.invokeEditorCommand = async function ({cmd, args, frameId = -1, frameIdExcept = -1}, sender) {
  const tabId = sender.tab.id;
  if (frameId !== -1) {
    const response = await utils.invokeContentScript({
      tabId, frameId, cmd, args,
    });
    await browser.scripting.executeScript({
      target: {tabId, frameIds: [frameId]},
      injectImmediately: true,
      func: () => {
        window.focus();
      },
    });
    return response;
  } else if (frameIdExcept !== -1) {
    const tasks = Array.prototype.map.call(
      await utils.initContentScripts(tabId),
      async ({tabId, frameId, error, injected}) => {
        if (error) { return undefined; }
        if (frameId === frameIdExcept) { return undefined; }
        return await utils.invokeContentScript({
          tabId, frameId, cmd, args,
        });
      });
    return Promise.all(tasks);
  } else {
    const tasks = Array.prototype.map.call(
      await utils.initContentScripts(tabId),
      async ({tabId, frameId, error, injected}) => {
        if (error) { return undefined; }
        return await utils.invokeContentScript({
          tabId, frameId, cmd, args,
        });
      });
    return Promise.all(tasks);
  }
};

/**
 * @type invokable
 * @param {Object} params
 * @param {string} params.id
 * @param {string|URL} params.url
 * @param {Array<*>} [params.args]
 * @param {Object} [params.windowCreateData]
 * @param {Object} [params.tabCreateData]
 * @param {string|string[]} [senderProp]
 * @param {MessageSender} sender
 */
background.openModalWindow = async function ({
  id,
  url,
  args,
  windowCreateData,
  tabCreateData,
  senderProp,
}, sender) {
  const {promise, resolve, reject} = Promise.withResolvers();

  background.openModalWindow.map.set(id, resolve);

  let tab;

  (async () => {
    if (browser.windows) {
      const win = await browser.windows.getCurrent();
      ({tabs: [tab]} = await utils.createWindow({
        url,
        type: 'popup',
        width: 600,
        height: 240,
        incognito: win.incognito,
        ...windowCreateData,
      }));
    } else {
      tab = await browser.tabs.create({
        url,
        ...tabCreateData,
      });
    }

    try {
      await utils.waitTabLoading(tab);
    } catch (ex) {
      console.error(ex);
      resolve(null);
      return;
    }

    if (senderProp) {
      args[senderProp] = sender;
    }

    try {
      const result = await utils.invokeContentScript({
        tabId: tab.id,
        frameId: 0,
        cmd: 'dialog.init',
        args,
      });
      resolve(result);
    } catch (ex) {
      console.error(ex);
      resolve(null);
    }
  })();

  try {
    return await promise;
  } finally {
    background.openModalWindow.map.delete(id);
    try {
      await browser.tabs.remove(tab.id);
    } catch {}
  }
};

Object.assign(background.openModalWindow, {
  map: new Map(),
  close({id}) {
    const resolve = background.openModalWindow.map.get(id);
    resolve && resolve(null);
  },
});

/**
 * @type invokable
 */
background.onServerTreeChange = async function (params = {}, sender) {
  const tasks = [];

  const errorHandler = (ex) => {
    console.error(ex);
  };

  // update badge
  tasks.push(capturer.updateBadgeForAllTabs().catch(errorHandler));

  // notify sidebars about server tree change
  const sidebarUrls = [
    browser.runtime.getURL("scrapbook/sidebar.html"),
    browser.runtime.getURL("scrapbook/manage.html"),
  ];
  const cmd = 'sidebar.onServerTreeChange';
  const args = {};

  if (browser.sidebarAction || browser.sidePanel) {
    tasks.push(utils.invokeExtensionScript({cmd, args}).catch(errorHandler));
  }

  const sidebarTabs = (await browser.tabs.query({}))
      .filter(t => sidebarUrls.includes(utils.splitUrl(t.url)[0]));

  for (const tab of sidebarTabs) {
    tasks.push(utils.invokeContentScript({tabId: tab.id, frameId: 0, cmd, args}).catch(errorHandler));
  }

  return await Promise.all(tasks);
};

/**
 * @type invokable
 * @param {Object} [params]
 */
background.onCaptureEnd = async function (params, sender) {
  background.setCapturedUrls(params);
  await background.onServerTreeChange(params, sender);
};

/**
 * @type invokable
 * @param {Object} [options]
 */
background.getGeoLocation = async function (options) {
  return utils.getGeoLocation(options);
};

export {
  focusedWindows,
  capturedUrls,
  background,
};
