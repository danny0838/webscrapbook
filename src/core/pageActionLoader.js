/********************************************************************
 *
 * Loads the page action for which browser action is not supported
 * (for older versions of firefox Android)
 *
 *******************************************************************/

if (!chrome.browserAction) {
  // Firefox Android ignores the tabId parameter and
  // shows the pageAction for all tabs
  chrome.pageAction.show(0);
}
