/********************************************************************
 *
 * The background script for viewer functionality
 *
 *******************************************************************/

// This event won't fire when visiting a file URL if
// isAllowedFileSchemeAccess is set to false
chrome.webRequest.onBeforeRequest.addListener(function (details) {
  if (details.frameId !== 0) { return; }

  var url = new URL(details.url);
  // use a random hash to avoid recursive redirect
  if (!url.searchParams.has(scrapbook.options["viewer.redirectKey"])) {
    if (scrapbook.options["viewer.viewHtz"] && url.pathname.toLowerCase().endsWith(".htz")) {
      // redirect
    } else if (scrapbook.options["viewer.viewMaff"] && url.pathname.toLowerCase().endsWith(".maff")) {
      // redirect
    } else {
      return; // no redirect
    }
  } else {
    return; // no redirect
  }

  var newUrl = new URL(chrome.runtime.getURL("viewer/viewer.html"));
  newUrl.hash = url.hash;
  url.hash = "";
  newUrl.search = "?src=" + encodeURIComponent(url.href);
  newUrl = newUrl.href;

  // return {redirectUrl: newUrl}; // this doesn't work
  chrome.tabs.update(details.tabId, {url: newUrl}, () => {});
  return {cancel: true};
}, {urls: ["<all_urls>"]}, ["blocking"]);
