/********************************************************************
 *
 * The background script for viewer functionality
 *
 * @require {Object} scrapbook
 *******************************************************************/

(function (window, undefined) {

function redirectUrl(tabId, type, url, filename, mime) {
  if (mime === "application/html+zip" && scrapbook.getOption("viewer.viewHtz")) {
    // redirect
  } else if (mime === "application/x-maff" && scrapbook.getOption("viewer.viewMaff")) {
    // redirect
  } else {
    let pathname = (filename || url.pathname).toLowerCase();
    if (pathname.endsWith(".htz") && scrapbook.getOption("viewer.viewHtz")) {
      // redirect
    } else if (pathname.endsWith(".maff") && scrapbook.getOption("viewer.viewMaff")) {
      // redirect
    } else {
      return; // no redirect
    }
  }

  var newUrl = new URL(chrome.runtime.getURL("viewer/viewer.html"));
  newUrl.hash = url.hash;
  url.hash = "";
  newUrl.search = "?src=" + encodeURIComponent(url.href);
  newUrl = newUrl.href;

  // return {redirectUrl: newUrl}; // this doesn't work
  if (type === "main_frame") {
    chrome.tabs.update(tabId, {url: newUrl}, () => {});
  } else {
    chrome.tabs.create({url: newUrl}, () => {});
    let html = '<a href="' + scrapbook.escapeHtml(newUrl, false) + '" target="_blank">View HTML archive</a>';
    let dataUrl = scrapbook.stringToDataUri(html, "text/html", "UTF-8");
    return {redirectUrl: dataUrl};
  }
  return {cancel: true};
}

chrome.extension.isAllowedFileSchemeAccess((isAllowedAccess) => {
  if (!isAllowedAccess) { return; }

  // This event won't fire when visiting a file URL if
  // isAllowedFileSchemeAccess is false
  chrome.webRequest.onBeforeRequest.addListener(function (details) {
    return redirectUrl(details.tabId, details.type, new URL(details.url));
  }, {urls: ["file://*", "ftp://*/*"], types: ["main_frame", "sub_frame"]}, ["blocking"]);
});

chrome.webRequest.onHeadersReceived.addListener(function (details) {
  let headers = details.responseHeaders;
  for (let i in headers) {
    switch (headers[i].name.toLowerCase()) {
      case "content-type": {
        let contentType = scrapbook.parseHeaderContentType(headers[i].value);
        let mime = contentType.type;
        return redirectUrl(details.tabId, details.type, new URL(details.url), null, mime);
      }
      case "content-disposition": {
        let contentDisposition = scrapbook.parseHeaderContentDisposition(headers[i].value);
        let filename = contentDisposition.parameters.filename;
        return redirectUrl(details.tabId, details.type, new URL(details.url), filename);
      }
    }
  }

  return redirectUrl(details.tabId, details.type, new URL(details.url));
}, {urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame"]}, ["blocking", "responseHeaders"]);

})(window, undefined);
