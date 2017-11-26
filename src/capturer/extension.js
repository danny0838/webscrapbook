/********************************************************************
 *
 * Shared extension page script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 *******************************************************************/

const capturer = {};

/**
 * @return {Promise}
 */
capturer.getContentTabs = function () {
  // scrapbook.getContentPagePattern() resolves to [] on Firefox Android 57
  // due to a bug of browser.tabs.query:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1418737
  return browser.tabs.query({currentWindow: true, url: "<all_urls>"}).then((tabs) => {
    return tabs.filter((tab) => (scrapbook.isContentPage(tab.url)));
  });
};

/**
 * @param {string} target - a list of tabId and frameId
 * @param {string} url - a list of URL and title
 * @return {Promise}
 */
capturer.invokeCapture = function (params) {
  return Promise.resolve().then(() => {
    const {target, url, mode, full} = params;

    const urlObj = new URL(chrome.runtime.getURL("capturer/capturer.html"));
    if (target) { urlObj.searchParams.set('t', target); }
    if (url) { urlObj.searchParams.set('u', url); }
    if (mode) { urlObj.searchParams.set('m', mode); }
    if (!!full) { urlObj.searchParams.set('f', 1); }

    if (chrome.windows) {
      return browser.windows.getCurrent().then((win) => {
        return browser.windows.create({
          url: urlObj.href,
          type: 'popup',
          width: 400,
          height: 400,
          incognito: win.incognito,
        });
      });
    } else {
      return browser.tabs.create({
        url: urlObj.href,
      });
    }
  });
};
