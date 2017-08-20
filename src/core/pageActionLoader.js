/********************************************************************
 *
 * Loads the page action for which browser action is not supported
 * (for older versions of firefox Android)
 *
 *******************************************************************/

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
    var url = chrome.runtime.getURL("core/browserAction.html");
    chrome.tabs.create({url: url, active: true}, () => {});
  });
}
