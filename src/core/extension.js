/******************************************************************************
 *
 * Shared utilities for extension scripts.
 *
 * @public {Object} scrapbook
 *****************************************************************************/

((window, document, browser) => {

/******************************************************************************
 * ScrapBook messaging
 *****************************************************************************/

/**
 * Add a message listener, with optional filter and errorHandler.
 *
 * @param {Function} filter
 * @param {Function} errorHandler
 * @return {Function}
 */
scrapbook.addMessageListener = function (filter, errorHandler = ex => {
  console.error(ex);
  return {error: {message: ex.message}};
}) {
  const listener = (message, sender) => {
    if (filter && !filter(message, sender)) { return; }

    const {cmd, args} = message;
    isDebug && console.debug(cmd, "receive", `[${sender.tab ? sender.tab.id : -1}]`, args);

    const [mainCmd, subCmd] = cmd.split(".");

    const object = window[mainCmd];
    if (!object || !object[subCmd]) { return; }

    let response;
    try {
      response = object[subCmd](args, sender);
      if (scrapbook.isPromise(response)) {
        if (errorHandler) { response = response.catch(errorHandler); }
      }
    } catch (ex) {
      if (errorHandler) { return errorHandler(ex); }
    }
    return response;
  };
  browser.runtime.onMessage.addListener(listener);
  return listener;
};


/******************************************************************************
 * ScrapBook utilities
 *****************************************************************************/

/**
 * @return {Promise<Array>} The URL match patterns for content pages.
 */
scrapbook.getContentPagePattern = async function () {
  const p = (async () => {
    const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
    const urlMatch = ["http://*/*", "https://*/*"];
    if (allowFileAccess) { urlMatch.push("file:///*"); }
    return urlMatch;
  })();
  scrapbook.getContentPagePattern = () => p;
  return p;
};

})(this, this.document, this.browser);
