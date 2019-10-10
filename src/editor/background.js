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

  // skip as configured
  if (!scrapbook.getOption("editor.autoInit")) {
    return;
  }

  // skip if backend server is not set
  if (!scrapbook.getOption("server.url")) {
    return;
  }

  const {url, tabId} = details;
  const [urlMain, urlSearch, urlHash] = scrapbook.splitUrl(url);

  // skip URLs not in the backend server
  if (!urlMain.startsWith(scrapbook.getOption("server.url"))) {
    return;
  }

  // skip directory listing
  if (urlMain.endsWith('/')) {
    return;
  }

  // skip URLs with query as it could be some server command
  if (urlSearch) {
    return;
  }

  return scrapbook.editTab({
    tabId,
    willOpen: true,
  });
}, {url: [{schemes: ["http", "https"]}]});

})(this, this.document, this.browser);
