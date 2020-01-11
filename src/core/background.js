/******************************************************************************
 *
 * The background script for the main (auto-generated) background page.
 *
 *****************************************************************************/

((window, document, browser) => {

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

    async captureTab() {
      return await scrapbook.invokeCapture({
        target: await scrapbook.getHighlightedTabs(),
      });
    },

    async captureTabSource() {
      return await scrapbook.invokeCapture({
        target: await scrapbook.getHighlightedTabs(),
        mode: "source",
      });
    },

    async captureTabBookmark() {
      return await scrapbook.invokeCapture({
        target: await scrapbook.getHighlightedTabs(),
        mode: "bookmark",
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

/* browser action button and fallback */
if (!browser.browserAction) {
  // Firefox Android < 55: no browserAction
  // Fallback to pageAction.
  // Firefox Android ignores the tabId parameter and
  // shows the pageAction for all tabs
  browser.pageAction.show(0);
} else if (!browser.browserAction.getPopup) {
  // Firefox Android >= 55: only browserAction onClick
  // Open the browserAction page
  browser.browserAction.onClicked.addListener((tab) => {
    const url = browser.runtime.getURL("core/browserAction.html");
    browser.tabs.create({url, active: true});
  });
}

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
 * Attempt to locate an item in the sidebar.
 *
 * @kind invokable
 * @return {Object|null|false} - The located item.
 *     - Object: the located item
 *     - null: no item located
 *     - false: no sidebar opened
 */
background.locateCurrentTab = async function (params, sender) {
  const cmd = 'scrapbookUi.locate';
  const args = {
    url: sender.url,
  };
  const sidebarUrl = browser.runtime.getURL("scrapbook/sidebar.html");

  if (browser.sidebarAction) {
    // Unfortunately we cannot force open the sidebar from a user gesture
    // in a content page if it's closed.
    if (!await browser.sidebarAction.isOpen({})) {
      return false;
    }

    return await scrapbook.invokeExtensionScript({cmd, args});
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
background.saveCurrentTab = async function (params, sender) {
  const target = sender.tab.id;
  const mode = 'save';
  return await scrapbook.invokeCapture({target, mode});
};

/**
 * @kind invokable
 */
background.captureCurrentTab = async function (params, sender) {
  const target = sender.tab.id;
  return await scrapbook.invokeCapture({target});
};

/**
 * @kind invokable
 */
background.getFocusedFrameId = async function ({}, sender) {
  const tabId = sender.tab.id;
  const tasks = Array.prototype.map.call(
    await scrapbook.initContentScripts(tabId),
    async ({tabId, frameId, injected}) => {
      const time = await scrapbook.invokeContentScript({
        tabId, frameId,
        cmd: 'editor.getFocusInfo',
        args: {},
      });
      return {frameId, time};
    });
  const {frameId} = (await Promise.all(tasks)).reduce((acc, cur) => {
    if (cur.time > acc.time) {
      return cur;
    }
    return acc;
  });
  return frameId;
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
      async ({tabId, frameId, injected}) => {
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
      async ({tabId, frameId, injected}) => {
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

/* commands */
if (browser.commands) {
  browser.commands.onCommand.addListener((cmd) => {
    return background.commands[cmd]();
  });
}

if (browser.history) {
  browser.history.onVisited.addListener((result) => {
    // suppress extension pages from generating a history entry
    if (result.url.startsWith(browser.runtime.getURL(""))) {
      browser.history.deleteUrl({url: result.url});
    }
  });
}

{
  const extraInfoSpec = ["blocking", "requestHeaders"];
  if (browser.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty('EXTRA_HEADERS')) {
    extraInfoSpec.push('extraHeaders');
  }
  browser.webRequest.onBeforeSendHeaders.addListener((details) => {
    // Some headers (e.g. "referer") are not allowed to be set via
    // XMLHttpRequest.setRequestHeader directly.  Use a prefix and
    // modify it here to workaround.
    details.requestHeaders.forEach((header) => {
      if (header.name.slice(0, 15) === "X-WebScrapBook-") {
        header.name = header.name.slice(15);
      }
    });
    return {requestHeaders: details.requestHeaders};
  }, {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, extraInfoSpec);
}

scrapbook.addMessageListener((message, sender) => {
  if (!message.cmd.startsWith("background.")) { return false; }
  return true;
});

if (browser.runtime.onMessageExternal) {
  // Available in Firefox >= 54.
  browser.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
    try {
      const {cmd, args} = message;
      let result;
      switch (cmd) {
        case "getBaseUrl": {
          result = {
            url: browser.runtime.getURL(""),
          };
          break;
        }
      }

      if (result.error) { throw result.error; }
      return result;
    } catch (ex) {
      return {error: {message: ex.message}};
    }
  });
}


window.background = background;

})(this, this.document, this.browser);
