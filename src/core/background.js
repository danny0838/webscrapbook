/******************************************************************************
 *
 * General background initialization
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
