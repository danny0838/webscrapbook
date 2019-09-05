/******************************************************************************
 *
 * Background script for capturer functionality.
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(async (window, document, browser) => {

if (browser.contextMenus) {
  const urlMatch = await scrapbook.getContentPagePattern();

  try {
    browser.contextMenus.create({
      title: scrapbook.lang("CaptureTab"),
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({target: tab.id});
      }
    });
    browser.contextMenus.create({
      title: scrapbook.lang("CaptureTabSource"),
      contexts: ["tab"],
      documentUrlPatterns: urlMatch,
      onclick: (info, tab) => {
        return capturer.invokeCapture({target: tab.id, mode: "source"});
      }
    });
    browser.contextMenus.create({
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

  browser.contextMenus.create({
    title: scrapbook.lang("CapturePage"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({target: `${tab.id}:0`, full: true});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CapturePageSource"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.pageUrl, mode: "source"});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CapturePageBookmark"),
    contexts: ["page"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.pageUrl, mode: "bookmark"});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureFrame"),
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({target: `${tab.id}:${info.frameId}`, full: true});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureFrameSource"),
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.frameUrl, mode: "source"});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureFrameBookmark"),
    contexts: ["frame"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.frameUrl, mode: "bookmark"});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureSelection"),
    contexts: ["selection"],
    documentUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({target: `${tab.id}:${info.frameId}`, full: false});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureLinkSource"),
    contexts: ["link"],
    targetUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.linkUrl, mode: "source"});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureLinkBookmark"),
    contexts: ["link"],
    targetUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.linkUrl, mode: "bookmark"});
    }
  });

  browser.contextMenus.create({
    title: scrapbook.lang("CaptureMedia"),
    contexts: ["image", "audio", "video"],
    targetUrlPatterns: urlMatch,
    onclick: (info, tab) => {
      return capturer.invokeCapture({url: info.srcUrl, refUrl: info.pageUrl, mode: "source"});
    }
  });
}

})(this, this.document, this.browser);
