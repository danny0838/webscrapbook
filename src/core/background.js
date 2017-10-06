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
    chrome.tabs.create({url: url, active: true}, () => {});
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
          return capturer.captureTab({tab});
        }
      });
      chrome.contextMenus.create({
        title: scrapbook.lang("CaptureTabSource"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return capturer.captureTab({tab, mode: "source"});
        }
      });
      chrome.contextMenus.create({
        title: scrapbook.lang("CaptureTabBookmark"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return capturer.captureTab({tab, mode: "bookmark"});
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
        return capturer.captureTab({tab, saveBeyondSelection: true});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CapturePageSource"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.pageUrl, mode: "source"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CapturePageBookmark"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.pageUrl, mode: "bookmark"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureFrame"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureTab({tab, frameId: info.frameId, saveBeyondSelection: true});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureFrameSource"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.frameUrl, mode: "source"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureFrameBookmark"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.frameUrl, mode: "bookmark"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureSelection"),
      contexts: ["selection"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureTab({tab, frameId: info.frameId, saveBeyondSelection: false});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureLinkSource"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.linkUrl});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureLinkBookmark"),
      contexts: ["link"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.linkUrl, mode: "bookmark"});
      }
    });
    chrome.contextMenus.create({
      title: scrapbook.lang("CaptureMedia"),
      contexts: ["image", "audio", "video"],
      targetUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.captureHeadless({url: info.srcUrl});
      }
    });
  });
}
