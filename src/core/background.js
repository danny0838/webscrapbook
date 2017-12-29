/********************************************************************
 *
 * General background initialization
 *
 *******************************************************************/

/* browser action button and fallback */
if (!chrome.browserAction) {
  // Firefox Android < 55: no browserAction
  // Fallback to pageAction.
  // Firefox Android ignores the tabId parameter and
  // shows the pageAction for all tabs
  chrome.pageAction.show(0);
} else if (!chrome.browserAction.getPopup) {
  // Firefox Android >= 55: only browserAction onClick
  // Open the browserAction page
  chrome.browserAction.onClicked.addListener((tab) => {
    const url = chrome.runtime.getURL("core/browserAction.html");
    chrome.tabs.create({url, active: true}, () => {});
  });
} else if (chrome.browserAction.setBadgeBackgroundColor) {
  chrome.browserAction.setBadgeBackgroundColor({color: [255, 51, 51, 204]});
}

/* context menus */
if (chrome.contextMenus) {
  scrapbook.getContentPagePattern().then((urlMatch) => {
    try {
      chrome.contextMenus.create({
        title: scrapbook.lang("CaptureTab"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return capturer.invokeCapture({target: tab.id});
        }
      });
      chrome.contextMenus.create({
        title: scrapbook.lang("CaptureTabSource"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return capturer.invokeCapture({target: tab.id, mode: "source"});
        }
      });
      chrome.contextMenus.create({
        title: scrapbook.lang("CaptureTabBookmark"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return capturer.invokeCapture({target: tab.id, mode: "bookmark"});
        }
      });
    } catch (ex) {
      // Available only in Firefox >= 53. Otherwise ignore the error.
    }
    chrome.contextMenus.create({
      title: scrapbook.lang("CapturePage"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({target: `${tab.id}:0`, full: true});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CapturePageSource"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.pageUrl, mode: "source"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CapturePageBookmark"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.pageUrl, mode: "bookmark"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureFrame"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({target: `${tab.id}:${info.frameId}`, full: true});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureFrameSource"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.frameUrl, mode: "source"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureFrameBookmark"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.frameUrl, mode: "bookmark"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureSelection"),
      contexts: ["selection"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({target: `${tab.id}:${info.frameId}`, full: false});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureLinkSource"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.linkUrl});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureLinkBookmark"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.linkUrl, mode: "bookmark"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureMedia"),
      contexts: ["image", "audio", "video"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({url: info.srcUrl});
      }
    });
  });
}

if (chrome.history) {
  chrome.history.onVisited.addListener((result) => {
    // suppress extension pages from generating a history entry
    if (result.url.startsWith(chrome.runtime.getURL(""))) {
      chrome.history.deleteUrl({url: result.url});
    }
  });
}

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  // Some headers (e.g. "referer") are not allowed to be set via
  // XMLHttpRequest.setRequestHeader directly.  Use a prefix and
  // modify it here to workaround.
  details.requestHeaders.forEach((header) => {
    if (header.name.slice(0, 15) === "X-WebScrapBook-") {
      header.name = header.name.slice(15);
    }
  });
  return {requestHeaders: details.requestHeaders};
}, {urls: ["<all_urls>"], types: ["xmlhttprequest"]}, ["blocking", "requestHeaders"]);

chrome.runtime.onConnectExternal.addListener((port) => {
  port.onMessage.addListener((message, port) => {
    return Promise.resolve().then(() => {
      const {cmd, args} = message;
      const openTab = (createProperties) => {
        return browser.tabs.create(createProperties).then((tab) => {
          return new Promise((resolve, reject) => {
            const listener = (tabId, changeInfo, t) => {
              if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
              chrome.tabs.onUpdated.removeListener(listener);
              chrome.tabs.onRemoved.removeListener(listener2);
              resolve(t);
            };
            const listener2 = (tabId, removeInfo) => {
              if (!(tabId === tab.id)) { return; }
              chrome.tabs.onUpdated.removeListener(listener);
              chrome.tabs.onRemoved.removeListener(listener2);
              reject({message: `Tab removed before loading complete.`});
            };
            chrome.tabs.onUpdated.addListener(listener);
            chrome.tabs.onRemoved.addListener(listener2);
          });
        });
      };

      const missionId = scrapbook.getUuid();
      const capturerUrl = chrome.runtime.getURL(`capturer/capturer.html?mid=${missionId}`);

      switch (cmd) {
        case "capture": {
          return Promise.all([
            openTab({
              url: args.url,
              active: false,
              windowId: port.sender.tab.windowId,
            }),
            openTab({
              url: capturerUrl,
              active: false,
              windowId: port.sender.tab.windowId,
            }),
          ]).then(([pageTab, capturerTab]) => {
            // wait for the capturer init to complete
            // so that the message can be received
            return scrapbook.delay(50).then(() => {
              return browser.runtime.sendMessage({
                cmd: "capturer.captureTab",
                args: Object.assign({tab: pageTab, settings: {missionId}}, args),
              });
            }).then((result) => {
              return Promise.all([
                browser.tabs.remove(pageTab.id),
                browser.tabs.remove(capturerTab.id),
              ]).then(() => {
                return result;
              });
            });
          });
        }
        case "captureHeadless": {
          return openTab({
            url: capturerUrl,
            active: false,
            windowId: port.sender.tab.windowId,
          }).then((capturerTab) => {
            // wait for the capturer init to complete
            // so that the message can be received
            return scrapbook.delay(50).then(() => {
              return browser.runtime.sendMessage({
                cmd: "capturer.captureHeadless",
                args: Object.assign({settings: {missionId}}, args),
              });
            }).then((result) => {
              return browser.tabs.remove(capturerTab.id).then(() => {
                return result;
              });
            });
          });
        }
      }
    }).then((result) => {
      if (result.error) { throw result.error; }
      port.postMessage({id: message.id, response: result});
    }).catch((ex) => {
      port.postMessage({id: message.id, error: {message: ex.message}});
    });
  });
});
