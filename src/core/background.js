/******************************************************************************
 * Script for the background page.
 *****************************************************************************/

import {DEFAULT_OPTIONS} from "../utils/extension.mjs";
import * as utils from "../utils/extension.mjs";
import {server} from "../scrapbook/server.mjs";
import * as capturer from "../capturer/background.mjs";
import * as editor from "../editor/background.mjs";
import * as viewer from "../viewer/background.mjs";

utils.loadOptionsAuto(); // async

/**
 * @type {Map<integer~windowId, integer~timestamp>}
 */
const focusedWindows = new Map();

/**
 * @type {Map<string~url, integer~count>}
 */
const capturedUrls = new Map();

const commands = {
  async openScrapBook() {
    return await utils.openScrapBook();
  },

  async openOptions() {
    return await browser.runtime.openOptionsPage();
  },

  async openViewer() {
    return await utils.visitLink({
      url: browser.runtime.getURL("viewer/load.html"),
      newTab: true,
    });
  },

  async openSearch() {
    return await utils.visitLink({
      url: browser.runtime.getURL("scrapbook/search.html"),
      newTab: true,
    });
  },

  async searchCaptures() {
    const tabs = await utils.getHighlightedTabs();
    return utils.searchCaptures({
      tabs,
      newTab: true,
    });
  },

  async captureTab() {
    const tabs = await utils.getHighlightedTabs();
    return await utils.invokeCapture(
      tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      })),
    );
  },

  async captureTabSource() {
    const tabs = await utils.getHighlightedTabs();
    return await utils.invokeCapture(
      tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        mode: "source",
      })),
    );
  },

  async captureTabBookmark() {
    const tabs = await utils.getHighlightedTabs();
    return await utils.invokeCapture(
      tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        mode: "bookmark",
      })),
    );
  },

  async captureTabAs() {
    const tabs = await utils.getHighlightedTabs();
    return await utils.invokeCaptureAs({
      tasks: tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      })),
    });
  },

  async batchCapture() {
    const tabs = await utils.getContentTabs();
    return await utils.invokeCaptureBatch({
      tasks: tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      })),
    });
  },

  async batchCaptureLinks() {
    const tabs = await utils.getHighlightedTabs();
    return await utils.invokeCaptureBatchLinks({
      tasks: tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      })),
    });
  },

  async editTab() {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    return await utils.editTab({
      tabId: tab.id,
      force: true,
    });
  },
};

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

function initInstallListener() {
  browser.runtime.onInstalled.addListener(async (details) => {
    const {reason, previousVersion} = details;

    if (reason === "update" && utils.versionCompare(previousVersion, "2.17") === -1) {
      console.warn("Migrating options from `storage.sync` to `storage.local` for < 2.17");
      try {
        let options = await browser.storage.sync.get();
        options = utils.getOptions(null, options);
        await browser.storage.local.set(options);
        const keys = Object.keys(options).filter(k => options[k] !== undefined);
        await browser.storage.sync.remove(keys);
        console.warn("Migrated successfully.");
      } catch (ex) {
        console.error("Migration failed: %o", ex);
      }
    }

    if (!browser.runtime.getManifest().background.persistent) {
      await utils.loadOptionsAuto();
      updateAction();
      updateMenus();
    }
  });
}

function initStorageChangeListener() {
  const toolbarOptions = Object.keys(DEFAULT_OPTIONS).filter(x => x.startsWith('ui.toolbar.'));

  // Run this after optionsAuto to make sure that utils.options is
  // up-to-date when the listener is called.
  browser.storage.onChanged.addListener((changes, areaName) => {
    if ("runtime.backgroundKeeperInterval" in changes) {
      updateBackgroundKeeper();
    }
    if (toolbarOptions.some(x => x in changes)) {
      updateAction(); // async
    }
    if (("ui.showContextMenu" in changes) || ("server.url" in changes)) {
      updateMenus(); // async
    }
    if ("ui.notifyPageCaptured" in changes) {
      capturer.toggleNotifyPageCaptured(); // async
    }
    if ("autocapture.rules" in changes) {
      capturer.configAutoCapture(); // async
    }
    if ("autocapture.enabled" in changes) {
      capturer.toggleAutoCapture(); // async
    }
    if (("editor.autoInit" in changes) || ("server.url" in changes)) {
      editor.toggleAutoEdit(); // async
    }
    if (("viewer.viewHtz" in changes) || ("viewer.viewMaff" in changes)) {
      viewer.toggleViewerListeners(); // async
    }
  });
}

function updateAction(...args) {
  const actions = {
    showCaptureTab: commands.captureTab,
    showCaptureTabSource: commands.captureTabSource,
    showCaptureTabBookmark: commands.captureTabBookmark,
    showCaptureTabAs: commands.captureTabAs,
    showBatchCapture: commands.batchCapture,
    showBatchCaptureLinks: commands.batchCaptureLinks,
    showEditTab: commands.editTab,
    showSearchCaptures: commands.searchCaptures,
    showOpenScrapBook: commands.openScrapBook,
    showOpenViewer: commands.openViewer,
    showOpenOptions: commands.openOptions,
  };
  let action;

  // eslint-disable-next-line no-func-assign
  const fn = updateAction = () => {
    // clear current listener and popup
    browser.action.setPopup({popup: ""});
    if (action) {
      browser.action.onClicked.removeListener(action);
    }

    const buttons = utils.getOptions("ui.toolbar");
    const activeButtons = Object.entries(buttons).filter(x => x[1]);
    if (activeButtons.length === 0) {
      // if no button is activated, fallback to open option
      action = actions.showOpenOptions;
      browser.action.onClicked.addListener(action);
      return;
    } else if (activeButtons.length === 1) {
      // if a supported button is activated, make it the toolbar button click action
      action = actions[activeButtons[0][0].slice(11)];
      if (action) {
        browser.action.onClicked.addListener(action);
        return;
      }
    }
    browser.action.setPopup({popup: "core/action.html"});
  };

  return fn(...args);
}

async function updateMenus() {
  if (!browser.contextMenus) { return; }

  await browser.contextMenus.removeAll();

  const willShow = utils.getOption("ui.showContextMenu");
  if (!willShow) { return; }

  const hasServer = utils.hasServer();
  const urlMatch = await utils.getContentPagePattern();

  action: {
    browser.contextMenus.create({
      id: "captureTabAsOnAction",
      title: utils.lang("CaptureTabAs") + '...',
      contexts: [browser.contextMenus.ContextType.ACTION],
      documentUrlPatterns: urlMatch,
    });

    browser.contextMenus.create({
      id: "editTabOnAction",
      title: utils.lang("EditTab"),
      contexts: [browser.contextMenus.ContextType.ACTION],
      documentUrlPatterns: urlMatch,
    });

    browser.contextMenus.create({
      id: "searchCaptures",
      title: utils.lang("searchCaptures"),
      contexts: [browser.contextMenus.ContextType.ACTION],
      documentUrlPatterns: urlMatch,
      enabled: hasServer,
    });

    browser.contextMenus.create({
      id: "openScrapBook",
      title: utils.lang("openScrapBook"),
      contexts: [browser.contextMenus.ContextType.ACTION],
      documentUrlPatterns: urlMatch,
      enabled: hasServer,
    });

    browser.contextMenus.create({
      id: "openViewer",
      title: utils.lang("openViewer") + '...',
      contexts: [browser.contextMenus.ContextType.ACTION],
      documentUrlPatterns: urlMatch,
    });
  }

  // Available only in Firefox >= 53.
  if (browser.contextMenus.ContextType.TAB) {
    browser.contextMenus.create({
      id: "captureTab",
      title: utils.lang("CaptureTab"),
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
    });

    browser.contextMenus.create({
      id: "captureTabSource",
      title: utils.lang("CaptureTabSource"),
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
    });

    browser.contextMenus.create({
      id: "captureTabBookmark",
      title: utils.lang("CaptureTabBookmark"),
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
    });

    browser.contextMenus.create({
      id: "captureTabAs",
      title: utils.lang("CaptureTabAs") + '...',
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
    });

    browser.contextMenus.create({
      id: "editTab",
      title: utils.lang("EditTab"),
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
    });
  }

  browser.contextMenus.create({
    id: "capturePage",
    title: utils.lang("CapturePage"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "capturePageSource",
    title: utils.lang("CapturePageSource"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "capturePageBookmark",
    title: utils.lang("CapturePageBookmark"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "capturePageAs",
    title: utils.lang("CapturePageAs") + '...',
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "editPage",
    title: utils.lang("EditPage"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureFrame",
    title: utils.lang("CaptureFrame"),
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureFrameSource",
    title: utils.lang("CaptureFrameSource"),
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureFrameBookmark",
    title: utils.lang("CaptureFrameBookmark"),
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureFrameAs",
    title: utils.lang("CaptureFrameAs") + '...',
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureSelection",
    title: utils.lang("CaptureSelection"),
    contexts: ["selection"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureSelectionAs",
    title: utils.lang("CaptureSelectionAs") + '...',
    contexts: ["selection"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "batchCaptureLinks",
    title: utils.lang("BatchCaptureLinks") + '...',
    contexts: ["selection"],
    documentUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureLink",
    title: utils.lang("CaptureLink"),
    contexts: ["link"],
    targetUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureLinkSource",
    title: utils.lang("CaptureLinkSource"),
    contexts: ["link"],
    targetUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureLinkBookmark",
    title: utils.lang("CaptureLinkBookmark"),
    contexts: ["link"],
    targetUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureLinkAs",
    title: utils.lang("CaptureLinkAs") + '...',
    contexts: ["link"],
    targetUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureMedia",
    title: utils.lang("CaptureMedia"),
    contexts: ["image", "audio", "video"],
    targetUrlPatterns: urlMatch,
  });

  browser.contextMenus.create({
    id: "captureMediaAs",
    title: utils.lang("CaptureMediaAs") + '...',
    contexts: ["image", "audio", "video"],
    targetUrlPatterns: urlMatch,
  });
}

function initMenusListener() {
  if (!browser.contextMenus) { return; }

  const handlers = {
    captureTabAsOnAction(info, tab) {
      return this.captureTabAs(info, tab);
    },

    editTabOnAction(info, tab) {
      return this.editTab(info, tab);
    },

    searchCaptures(info, tab) {
      return commands.searchCaptures();
    },

    openScrapBook(info, tab) {
      return commands.openScrapBook();
    },

    openViewer(info, tab) {
      return commands.openViewer();
    },

    captureTab(info, tab) {
      return commands.captureTab();
    },

    captureTabSource(info, tab) {
      return commands.captureTabSource();
    },

    captureTabBookmark(info, tab) {
      return commands.captureTabBookmark();
    },

    captureTabAs(info, tab) {
      return commands.captureTabAs();
    },

    editTab(info, tab) {
      return utils.editTab({
        tabId: tab.id,
        force: true,
      });
    },

    capturePage(info, tab) {
      return utils.invokeCapture([{
        tabId: tab.id,
        fullPage: true,
      }]);
    },

    capturePageSource(info, tab) {
      return utils.invokeCapture([{
        tabId: tab.id,
        mode: "source",
      }]);
    },

    capturePageBookmark(info, tab) {
      return utils.invokeCapture([{
        tabId: tab.id,
        mode: "bookmark",
      }]);
    },

    capturePageAs(info, tab) {
      return utils.invokeCaptureAs({
        tasks: [{
          tabId: tab.id,
          fullPage: true,
          url: tab.url,
          title: tab.title,
        }],
      });
    },

    editPage(info, tab) {
      return this.editTab(info, tab);
    },

    captureFrame(info, tab) {
      return utils.invokeCapture([{
        tabId: tab.id,
        frameId: info.frameId,
        fullPage: true,
      }]);
    },

    captureFrameSource(info, tab) {
      return utils.invokeCapture([{
        url: info.frameUrl,
        mode: "source",
      }]);
    },

    captureFrameBookmark(info, tab) {
      return utils.invokeCapture([{
        url: info.frameUrl,
        mode: "bookmark",
      }]);
    },

    captureFrameAs(info, tab) {
      return utils.invokeCaptureAs({
        tasks: [{
          tabId: tab.id,
          frameId: info.frameId,
          fullPage: true,
          url: info.frameUrl,
          title: tab.title,
        }],
      }, {ignoreTitle: true});
    },

    captureSelection(info, tab) {
      return utils.invokeCapture([{
        tabId: tab.id,
        frameId: info.frameId,
        fullPage: false,
      }]);
    },

    captureSelectionAs(info, tab) {
      return utils.invokeCaptureAs({
        tasks: [{
          tabId: tab.id,
          frameId: info.frameId,
          url: info.frameUrl || tab.url,
          title: tab.title,
        }],
      }, {ignoreTitle: true});
    },

    batchCaptureLinks(info, tab) {
      return utils.invokeCaptureBatchLinks({
        tasks: [{
          tabId: tab.id,
          frameId: info.frameId,
        }],
      });
    },

    captureLink(info, tab) {
      return utils.invokeCapture([{
        url: info.linkUrl,
        mode: "tab",
      }]);
    },

    captureLinkSource(info, tab) {
      return utils.invokeCapture([{
        url: info.linkUrl,
        mode: "source",
      }]);
    },

    captureLinkBookmark(info, tab) {
      return utils.invokeCapture([{
        url: info.linkUrl,
        mode: "bookmark",
      }]);
    },

    captureLinkAs(info, tab) {
      return utils.invokeCaptureAs({
        tasks: [{
          url: info.linkUrl,
          title: info.linkText,
        }],
      }, {ignoreTitle: true});
    },

    captureMedia(info, tab) {
      return utils.invokeCapture([{
        url: info.srcUrl,
        refUrl: info.pageUrl,
        mode: "source",
      }]);
    },

    captureMediaAs(info, tab) {
      return utils.invokeCaptureAs({
        tasks: [{
          url: info.srcUrl,
          refUrl: info.pageUrl,
        }],
      });
    },
  };

  browser.contextMenus.onClicked.addListener((info, tab) => {
    return handlers[info.menuItemId](info, tab);
  });
}

function initCommandsListener() {
  if (!browser.commands) { return; }

  browser.commands.onCommand.addListener((cmd) => {
    return commands[cmd]();
  });
}

function initLastFocusedWindowListener() {
  if (!browser.windows) { return; }

  function onFocusChanged(windowId) {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      return;
    }

    focusedWindows.set(windowId, Date.now());
  }

  function onRemoved(windowId) {
    focusedWindows.delete(windowId);
  }

  browser.windows.onFocusChanged.addListener(onFocusChanged);
  browser.windows.onRemoved.addListener(onRemoved);

  browser.windows.getAll().then(wins => {
    for (const win of wins) {
      if (!win.focused) {
        return;
      }

      focusedWindows.set(win.id, Date.now());
    }
  });
}

function initBeforeSendHeadersListener() {
  browser.webRequest.onBeforeSendHeaders.addListener((details) => {
    // rewrite only the requests sent by this extension
    // Chromium: support details.initiator only
    // Firefox: support details.originUrl only
    if (!(details.initiator || details.originUrl).startsWith(location.origin)) {
      return;
    }

    // Some headers (e.g. "referer") are not allowed to be set via
    // XMLHttpRequest.setRequestHeader directly.  Use a prefix and
    // modify it here to workaround.
    let rewritten = false;
    for (const header of details.requestHeaders) {
      if (header.name.slice(0, 15) === "X-WebScrapBook-") {
        header.name = header.name.slice(15);
        rewritten = true;
      }
    }

    if (!rewritten) {
      return;
    }

    return {requestHeaders: details.requestHeaders};
  }, {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, [
    "blocking", "requestHeaders",
    ...(browser.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS ? ["extraHeaders"] : []),
  ]);
}

function initMessageListener() {
  utils.addMessageListener((message, sender) => {
    if (!message.cmd.startsWith("background.")) { return false; }
    return true;
  });
}

function initExternalMessageListener() {
  browser.runtime.onMessageExternal.addListener((message, sender) => {
    const {cmd, args} = message;

    let result;
    switch (cmd) {
      case "ping": {
        result = true;
        break;
      }
      case "invokeCapture": {
        result = utils.invokeCapture(args);
        break;
      }
      case "invokeCaptureEx": {
        result = utils.invokeCaptureEx(args);
        break;
      }
      default: {
        result = Promise.reject(new Error(`Unable to invoke unknown command '${cmd}'.`));
      }
    }

    return Promise.resolve(result)
      .then((result) => {
        return {result};
      })
      .catch((ex) => {
        console.error(ex);
        return {error: {message: ex.message}};
      });
  });
}

function updateBackgroundKeeper(...args) {
  if (browser.runtime.getManifest().background.persistent) {
    return;
  }

  let timer;

  // eslint-disable-next-line no-func-assign
  const fn = updateBackgroundKeeper = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    const interval = utils.getOption("runtime.backgroundKeeperInterval");
    if (interval > 0) {
      // Keep the service worker alive to prevent memory cache reset,
      // especially `capturedUrls`, which bounds to a "browser session".
      //
      // The service worker shuts down on 30 seconds of inactivity, and
      // prevented by calling an API.
      // ref: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
      timer = setInterval(browser.runtime.getPlatformInfo, interval);
    }
  };

  return fn(...args);
}

async function init() {
  initStorageChangeListener();
  initCommandsListener();
  initLastFocusedWindowListener();
  initBeforeSendHeadersListener();
  initMessageListener();
  initExternalMessageListener();
  initMenusListener();
  initInstallListener();

  await utils.loadOptionsAuto();
  updateBackgroundKeeper();

  if (browser.runtime.getManifest().background.persistent) {
    updateAction();
    updateMenus();
  }
}

init();

/** @global */
globalThis.utils = utils;

/** @global */
globalThis.background = background;
