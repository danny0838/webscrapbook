/********************************************************************
 *
 * General background initialization
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
    const url = chrome.runtime.getURL("core/browserAction.html");
    chrome.tabs.create({url: url, active: true}, () => {});
  });
} else if (chrome.browserAction.setBadgeBackgroundColor) {
  chrome.browserAction.setBadgeBackgroundColor({color: [255, 51, 51, 204]});
}
