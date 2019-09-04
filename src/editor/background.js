/******************************************************************************
 *
 * The background script for editor functionality
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(async (window, document, browser) => {

const urlMatch = await scrapbook.getContentPagePattern();

browser.webNavigation.onDOMContentLoaded.addListener((details) => {
  if (details.frameId !== 0) { return; }

  const {url, tabId} = details;

  if (!url.startsWith(scrapbook.getOption("server.url"))) {
    return;
  }

  // skip directory listing
  if (scrapbook.splitUrl(url)[0].endsWith('/')) {
    return;
  }

  return scrapbook.editTab({
    tabId,
    toggle: true,
  });
}, {url: [{schemes: ["http", "https"]}]});

})(this, this.document, this.browser);
