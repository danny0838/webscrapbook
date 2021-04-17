/******************************************************************************
 *
 * The background script for the main (auto-generated) background page.
 *
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.background = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  /**
   * @type {Map<integer~windowId, integer~timestamp>}
   */
  const focusedWindows = new Map();

  /**
   * @type {Map<string~url, integer~count>}
   */
  const capturedUrls = new Map();

  const background = {
    commands: {
      async openScrapBook() {
        return await scrapbook.openScrapBook({});
      },

      async openOptions() {
        return await scrapbook.visitLink({
          url: browser.runtime.getURL("core/options.html"),
          newTab: true,
          singleton: true,
        });
      },

      async openViewer() {
        return await scrapbook.visitLink({
          url: browser.runtime.getURL("viewer/load.html"),
          newTab: true,
        });
      },

      async openSearch() {
        return await scrapbook.visitLink({
          url: browser.runtime.getURL("scrapbook/search.html"),
          newTab: true,
        });
      },

      async searchCaptures() {
        const tabs = await scrapbook.getHighlightedTabs();
        return scrapbook.searchCaptures({
          tabs,
          newTab: true,
        });
      },

      async captureTab() {
        return await scrapbook.invokeCapture(
          (await scrapbook.getHighlightedTabs()).map(tab => ({
            tabId: tab.id,
          }))
        );
      },

      async captureTabSource() {
        return await scrapbook.invokeCapture(
          (await scrapbook.getHighlightedTabs()).map(tab => ({
            tabId: tab.id,
            mode: "source",
          }))
        );
      },

      async captureTabBookmark() {
        return await scrapbook.invokeCapture(
          (await scrapbook.getHighlightedTabs()).map(tab => ({
            tabId: tab.id,
            mode: "bookmark",
          }))
        );
      },

      async captureTabAs() {
        const tabs = await scrapbook.getHighlightedTabs();
        return await scrapbook.invokeCaptureAs({
          tasks: tabs.map(tab => ({
            tabId: tab.id,
            title: tab.title,
          })),
        });
      },

      async editTab() {
        const tab = (await browser.tabs.query({active: true, currentWindow: true}))[0];
        return await scrapbook.editTab({
          tabId: tab.id,
          force: true,
        });
      },
    },
  };

  /**
   * Get real last focused window.
   *
   * Native window.getLastFocusedWindow gets the last created window (the
   * window "on top"), rather than the window the user last activates a tab
   * within.
   *
   * @kind invokable
   * @param {Object} params
   * @param {boolean} [params.populate]
   * @param {WindowType[]} [params.windowTypes]
   */
  background.getLastFocusedWindow = async function ({
    populate = false,
    windowTypes = ['normal', 'popup'],
  } = {}) {
    const wins = (await browser.windows.getAll({populate}))
      // Firefox does not support windowTypes for windows.getAll,
      // so use filter instead.
      .filter(win => windowTypes.includes(win.type))
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
   * @kind invokable
   */
  background.invokeFrameScript = async function ({frameId, cmd, args}, sender) {
    const tabId = sender.tab.id;
    return await scrapbook.invokeContentScript({
      tabId, frameId, cmd, args,
    });
  };

  /**
   * @kind invokable
   */
  background.findBookIdFromUrl = async function ({url}, sender) {
    await server.init(true);
    return await server.findBookIdFromUrl(url);
  };

  /**
   * Attempt to locate an item in the sidebar.
   *
   * @kind invokable
   * @return {Object|null|false} - The located item.
   *     - Object: the located item
   *     - null: no item located
   *     - false: no sidebar opened
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
      return await scrapbook.invokeExtensionScript({id: (await browser.windows.getCurrent()).id, cmd, args});
    } else if (browser.windows) {
      const sidebarWindow = (await browser.windows.getAll({
        windowTypes: ['popup'],
        populate: true,
      })).filter(w => scrapbook.splitUrl(w.tabs[0].url)[0] === sidebarUrl)[0];

      if (!sidebarWindow) {
        return false;
      }

      const tabId = sidebarWindow.tabs[0].id;
      const result = await scrapbook.invokeContentScript({tabId, frameId: 0, cmd, args});

      if (result) {
        await browser.windows.update(sidebarWindow.id, {drawAttention: true});
      }

      return result;
    } else {
      // Firefox Android does not support windows
      const sidebarTab = (await browser.tabs.query({}))
          .filter(t => scrapbook.splitUrl(t.url)[0] === sidebarUrl)[0];

      if (!sidebarTab) {
        return false;
      }

      const tabId = sidebarTab.id;
      const result = await scrapbook.invokeContentScript({tabId, frameId: 0, cmd, args});

      if (result) {
        await browser.tabs.update(tabId, {active: true});
      }

      return result;
    }
  };

  /**
   * @kind invokable
   */
  background.captureCurrentTab = async function (params = {}, sender) {
    const task = Object.assign({tabId: sender.tab.id}, params);
    return await scrapbook.invokeCapture([task]);
  };

  /**
   * @kind invokable
   * @param {string[]} urls
   * @return {Object<string~url, integer~count>}
   */
  background.getCapturedUrls = function ({urls} = {}, sender) {
    const rv = {};
    for (const url of urls) {
      rv[url] = capturedUrls.get(url) || 0;
    }
    return rv;
  };

  /**
   * @kind invokable
   * @param {string[]} urls
   */
  background.setCapturedUrls = function ({urls} = {}, sender) {
    for (const url of urls) {
      capturedUrls.set(url, (capturedUrls.get(url) || 0) + 1);
    }
  };

  /**
   * @kind invokable
   */
  background.createSubPage = async function ({url, title}, sender) {
    await server.init(true);

    // reject if file exists
    const fileInfo = await server.request({
      url: url + '?a=info',
      method: "GET",
      format: 'json',
    }).then(r => r.json());
    if (fileInfo.data.type !== null) {
      throw new Error(`File already exists at "${url}".`);
    }

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

    // generate content and upload
    const content = await book.renderTemplate(url, item, 'html', title);
    const file = new File([content], scrapbook.urlToFilename(url), {type: 'text/html'});
    await server.request({
      url: url + '?a=save',
      method: "POST",
      format: 'json',
      csrfToken: true,
      body: {
        upload: file,
      },
    });
  };

  /**
   * @kind invokable
   */
  background.invokeEditorCommand = async function ({code, cmd, args, frameId = -1, frameIdExcept = -1}, sender) {
    const tabId = sender.tab.id;
    if (frameId !== -1) {
      const response = code ? 
        await browser.tabs.executeScript(tabId, {
          frameId,
          code,
          runAt: "document_start",
        }) : 
        await scrapbook.invokeContentScript({
          tabId, frameId, cmd, args,
        });
      await browser.tabs.executeScript(tabId, {
        frameId,
        code: `window.focus();`,
        runAt: "document_start"
      });
      return response;
    } else if (frameIdExcept !== -1) {
      const tasks = Array.prototype.map.call(
        await scrapbook.initContentScripts(tabId),
        async ({tabId, frameId, error, injected}) => {
          if (error) { return undefined; }
          if (frameId === frameIdExcept) { return undefined; }
          return code ? 
            await browser.tabs.executeScript(tabId, {
              frameId,
              code,
              runAt: "document_start",
            }) : 
            await scrapbook.invokeContentScript({
              tabId, frameId, cmd, args,
            });
        });
      return Promise.all(tasks);
    } else {
      const tasks = Array.prototype.map.call(
        await scrapbook.initContentScripts(tabId),
        async ({tabId, frameId, error, injected}) => {
          if (error) { return undefined; }
          return code ? 
            await browser.tabs.executeScript(tabId, {
              frameId,
              code,
              runAt: "document_start",
            }) : 
            await scrapbook.invokeContentScript({
              tabId, frameId, cmd, args,
            });
        });
      return Promise.all(tasks);
    }
  };

  /**
   * @kind invokable
   */
  background.updateBadgeForAllTabs = async function (params = {}, sender) {
    return await capturer.updateBadgeForAllTabs();
  };

  function initStorageChangeListener() {
    // Run this after optionsAuto to make sure that scrapbook.options is
    // up-to-date when the listener is called.
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (("ui.showContextMenu" in changes) || ("server.url" in changes)) {
        updateContextMenu(); // async
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

  function initBrowserAction() {
    /* browser action button and fallback */
    if (!browser.browserAction) {
      // Firefox Android < 55: no browserAction
      // Fallback to pageAction.
      // Firefox Android ignores the tabId parameter and
      // shows the pageAction for all tabs
      browser.pageAction.show(0);
      return;
    }

    if (!browser.browserAction.getPopup) {
      // Firefox Android < 57: only browserAction onClick
      // Fallback by opening browserAction page
      browser.browserAction.onClicked.addListener((tab) => {
        const url = browser.runtime.getURL("core/browserAction.html");
        browser.tabs.create({url, active: true});
      });
      return;
    }
  }

  async function updateContextMenu() {
    if (!browser.contextMenus) { return; }

    await browser.contextMenus.removeAll();

    const willShow = scrapbook.getOption("ui.showContextMenu");
    if (!willShow) { return; }

    const hasServer = scrapbook.hasServer();
    const urlMatch = await scrapbook.getContentPagePattern();

    // Available in Chromium and Firefox >= 53.
    if (browser.contextMenus.ContextType.BROWSER_ACTION) {
      browser.contextMenus.create({
        title: scrapbook.lang("CaptureTabAs") + '...',
        contexts: ["browser_action"],
        documentUrlPatterns: urlMatch,
        onclick: async (info, tab) => {
          const tabs = await scrapbook.getHighlightedTabs();
          return await scrapbook.invokeCaptureAs({
            tasks: tabs.map(tab => ({
              tabId: tab.id,
              title: tab.title,
            })),
          });
        },
      });

      browser.contextMenus.create({
        title: scrapbook.lang("EditTab"),
        contexts: ["browser_action"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return scrapbook.editTab({
            tabId: tab.id,
            force: true,
          });
        },
      });

      browser.contextMenus.create({
        title: scrapbook.lang("searchCaptures"),
        contexts: ["browser_action"],
        documentUrlPatterns: urlMatch,
        onclick: async (info, tab) => {
          const tabs = await scrapbook.getHighlightedTabs();
          return scrapbook.searchCaptures({
            tabs,
            newTab: true,
          });
        },
        enabled: hasServer,
      });

      browser.contextMenus.create({
        title: scrapbook.lang("openScrapBook"),
        contexts: ["browser_action"],
        documentUrlPatterns: urlMatch,
        onclick: async (info, tab) => {
          return await scrapbook.openScrapBook({});
        },
        enabled: hasServer,
      });

      browser.contextMenus.create({
        title: scrapbook.lang("openViewer") + '...',
        contexts: ["browser_action"],
        documentUrlPatterns: urlMatch,
        onclick: async (info, tab) => {
          return await scrapbook.visitLink({
            url: browser.runtime.getURL("viewer/load.html"),
            newTab: true,
          });
        },
      });
    }

    // Available only in Firefox >= 53.
    if (browser.contextMenus.ContextType.TAB) {
      browser.contextMenus.create({
        title: scrapbook.lang("CaptureTab"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return scrapbook.invokeCapture([{
            tabId: tab.id,
          }]);
        },
      });

      browser.contextMenus.create({
        title: scrapbook.lang("CaptureTabSource"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return scrapbook.invokeCapture([{
            tabId: tab.id,
            mode: "source",
          }]);
        },
      });

      browser.contextMenus.create({
        title: scrapbook.lang("CaptureTabBookmark"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return scrapbook.invokeCapture([{
            tabId: tab.id,
            mode: "bookmark",
          }]);
        },
      });

      browser.contextMenus.create({
        title: scrapbook.lang("CaptureTabAs") + '...',
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: async (info, tab) => {
          return await scrapbook.invokeCaptureAs({
            tasks: [{
              tabId: tab.id,
              title: tab.title,
            }],
          });
        },
      });

      browser.contextMenus.create({
        title: scrapbook.lang("EditTab"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return scrapbook.editTab({
            tabId: tab.id,
            force: true,
          });
        },
      });
    }

    browser.contextMenus.create({
      title: scrapbook.lang("CapturePage"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          fullPage: true,
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CapturePageSource"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          mode: "source",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CapturePageBookmark"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          mode: "bookmark",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CapturePageAs") + '...',
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: async (info, tab) => {
        return await scrapbook.invokeCaptureAs({
          tasks: [{
            tabId: tab.id,
            fullPage: true,
            title: tab.title,
          }],
        });
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("EditPage"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.editTab({
          tabId: tab.id,
          force: true,
        });
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureFrame"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          frameId: info.frameId,
          fullPage: true,
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureFrameSource"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          url: info.frameUrl,
          mode: "source",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureFrameBookmark"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          url: info.frameUrl,
          mode: "bookmark",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureFrameAs") + '...',
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: async (info, tab) => {
        return await scrapbook.invokeCaptureAs({
          tasks: [{
            tabId: tab.id,
            frameId: info.frameId,
            fullPage: true,
            title: tab.title,
          }],
        });
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureSelection"),
      contexts: ["selection"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          frameId: info.frameId,
          fullPage: false,
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureSelectionAs") + '...',
      contexts: ["selection"],
      documentUrlPatterns: urlMatch,
      onclick: async (info, tab) => {
        return await scrapbook.invokeCaptureAs({
          tasks: [{
            tabId: tab.id,
            frameId: info.frameId,
            title: tab.title,
          }],
        });
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("BatchCaptureLinks") + '...',
      contexts: ["selection"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.initContentScripts(tab.id)
          .then(() => {
            return scrapbook.invokeContentScript({
              tabId: tab.id,
              frameId: info.frameId,
              cmd: "capturer.retrieveSelectedLinks",
            });
          })
          .then((tasks) => {
            return scrapbook.invokeBatchCapture({taskInfo: {tasks}});
          });
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureLink"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          url: info.linkUrl,
          mode: "tab",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureLinkSource"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          url: info.linkUrl,
          mode: "source",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureLinkBookmark"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          url: info.linkUrl,
          mode: "bookmark",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureLinkAs") + '...',
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: async (info, tab) => {
        return await scrapbook.invokeCaptureAs({
          tasks: [{
            url: info.linkUrl,
          }],
        });
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureMedia"),
      contexts: ["image", "audio", "video"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          url: info.srcUrl,
          refUrl: info.pageUrl,
          mode: "source",
        }]);
      },
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureMediaAs") + '...',
      contexts: ["image", "audio", "video"],
      targetUrlPatterns: urlMatch,
      onclick: async (info, tab) => {
        return await scrapbook.invokeCaptureAs({
          tasks: [{
            url: info.srcUrl,
            refUrl: info.pageUrl,
          }],
        });
      },
    });
  }

  function initCommands() {
    if (!browser.commands) { return; }

    browser.commands.onCommand.addListener((cmd) => {
      return background.commands[cmd]();
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
    const extraInfoSpec = ["blocking", "requestHeaders"];
    if (browser.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty('EXTRA_HEADERS')) {
      extraInfoSpec.push('extraHeaders');
    }
    browser.webRequest.onBeforeSendHeaders.addListener((details) => {
      // Some headers (e.g. "referer") are not allowed to be set via
      // XMLHttpRequest.setRequestHeader directly.  Use a prefix and
      // modify it here to workaround.
      for (const header of details.requestHeaders) {
        if (header.name.slice(0, 15) === "X-WebScrapBook-") {
          header.name = header.name.slice(15);
        }
      }
      return {requestHeaders: details.requestHeaders};
    }, {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, extraInfoSpec);
  }

  function initMessageListener() {
    scrapbook.addMessageListener((message, sender) => {
      if (!message.cmd.startsWith("background.")) { return false; }
      return true;
    });
  }

  function initExternalMessageListener() {
    if (!browser.runtime.onMessageExternal) { return; }

    // Available for Firefox >= 54.
    browser.runtime.onMessageExternal.addListener((message, sender) => {
      const {cmd, args} = message;

      let result;
      switch (cmd) {
        case "invokeCapture": {
          result = scrapbook.invokeCapture(args);
          break;
        }
        case "invokeCaptureEx": {
          result = scrapbook.invokeCaptureEx(args);
          break;
        }
        default: {
          // thrown Error don't show here but cause the sender to receive an error
          throw new Error(`Unable to invoke unknown command '${cmd}'.`);
        }
      }

      return Promise.resolve(result)
        .catch((ex) => {
          console.error(ex);
          throw ex;
        });
    });
  }

  async function init() {
    initStorageChangeListener();
    initBrowserAction();
    initCommands();
    initLastFocusedWindowListener();
    initBeforeSendHeadersListener();
    initMessageListener();
    initExternalMessageListener();

    await scrapbook.loadOptionsAuto;
    updateContextMenu();
  }

  init();

  return background;

}));
