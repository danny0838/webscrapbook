/******************************************************************************
 * Script for the background page.
 *****************************************************************************/

import {DEFAULT_OPTIONS} from "../utils/extension.mjs";
import * as utils from "../utils/extension.mjs";
import {background, focusedWindows} from "./background.mjs";
import * as capturer from "../capturer/background.mjs";
import * as editor from "../editor/background.mjs";
import * as viewer from "../viewer/background.mjs";

utils.loadOptionsAuto(); // async

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
      // especially `background.capturedUrls`, which bounds to a
      // "browser session".
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
