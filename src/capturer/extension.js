/********************************************************************
 *
 * Shared extension page script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @public {Object} capturer
 *******************************************************************/

((window, document, browser) => {

const capturer = {};

/**
 * @return {Promise<Array>}
 */
capturer.getContentTabs = async function () {
  // scrapbook.getContentPagePattern() resolves to [] on Firefox Android 57
  // due to a bug of browser.tabs.query:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1418737
  const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
  const tabs = await browser.tabs.query({currentWindow: true, url: "<all_urls>"});
  return tabs.filter((tab) => (scrapbook.isContentPage(tab.url, allowFileAccess)));
};

/**
 * @param {string} target - a list of tabId and frameId
 * @param {string} url - a list of URL and title
 * @return {Promise<(Window|Tab)>}
 */
capturer.invokeCapture = async function (params) {
  const {
    target, full,
    url, title, refUrl, favIconUrl,
    mode,
  } = params;

  const urlObj = new URL(browser.runtime.getURL("capturer/capturer.html"));
  if (target) {
    urlObj.searchParams.set('t', target);
    if (full) { urlObj.searchParams.set('f', 1); }
  } else if (url) {
    urlObj.searchParams.set('u', url);
    if (title) { urlObj.searchParams.set('t', title); }
    if (refUrl) { urlObj.searchParams.set('r', refUrl); }
    if (favIconUrl) { urlObj.searchParams.set('f', favIconUrl); }
  }
  if (mode) { urlObj.searchParams.set('m', mode); }

  if (browser.windows) {
    const win = await browser.windows.getCurrent();
    return await browser.windows.create({
      url: urlObj.href,
      type: 'popup',
      width: 400,
      height: 400,
      incognito: win.incognito,
    });
  } else {
    return await browser.tabs.create({
      url: urlObj.href,
    });
  }
};

window.capturer = capturer;

})(this, this.document, this.browser);
