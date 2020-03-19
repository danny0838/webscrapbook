/******************************************************************************
 *
 * Background script for capturer functionality.
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    console,
  );
}(this, async function (isDebug, browser, scrapbook, console) {

  'use strict';

  if (browser.contextMenus) {
    const urlMatch = await scrapbook.getContentPagePattern();

    try {
      browser.contextMenus.create({
        title: scrapbook.lang("CaptureTab"),
        contexts: ["tab"],
        documentUrlPatterns: urlMatch,
        onclick: (info, tab) => {
          return scrapbook.invokeCapture([{
            tabId: tab.id,
          }]);
        }
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
        }
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
        }
      });
    } catch (ex) {
      // Available only in Firefox >= 53. Otherwise ignore the error.
    }

    browser.contextMenus.create({
      title: scrapbook.lang("CapturePage"),
      contexts: ["page"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          full: true,
        }]);
      }
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
      }
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
      }
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureFrame"),
      contexts: ["frame"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          frameId: info.frameId,
          full: true,
        }]);
      }
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
      }
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
      }
    });

    browser.contextMenus.create({
      title: scrapbook.lang("CaptureSelection"),
      contexts: ["selection"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return scrapbook.invokeCapture([{
          tabId: tab.id,
          frameId: info.frameId,
          full: false,
        }]);
      }
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
      }
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
      }
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
      }
    });
  }

}));
