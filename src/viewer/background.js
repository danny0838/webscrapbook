/********************************************************************
 *
 * The background script for viewer functionality
 *
 * @require {Object} scrapbook
 *******************************************************************/

(function (window, undefined) {

let _isFxBelow56;
Promise.resolve().then(() => {
  return browser.runtime.getBrowserInfo();
}).then((info) => {
  _isFxBelow56 =
      (info.name === 'Firefox' || info.name === 'Fennec') &&
      parseInt(info.version.match(/^(\d+)\./)[1], 10) < 56;
}).catch((ex) => {
  _isFxBelow56 = false;
});

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

  let newUrl = new URL(chrome.runtime.getURL("viewer/viewer.html"));
  newUrl.hash = url.hash;
  url.hash = "";
  newUrl.search = "?src=" + encodeURIComponent(url.href);
  newUrl = newUrl.href;

  if (type === "main_frame") {
    // Firefox < 56 does not allow redirecting a page to an extension page,
    // even if whom is listed in web_accessible_resources.  The redirect
    // fails silently without throwing.
    //
    // Using data URI with meta or javascript refresh works but generates
    // an extra history entry.
    if (_isFxBelow56) {
      chrome.tabs.update(tabId, {url: newUrl});
      return {cancel: true};
    }

    return {redirectUrl: newUrl};
  } else {
    // In Chromium, an extension frame page whose top frame page is not an
    // extension page cannot redirect itself to a blob page it has generated.
    // The redirect fails silently without throwing. (Issue 761341)
    //
    // Firefox < 56 does not allow redirecting a page to an extension page,
    // even if whom is listed in web_accessible_resources.  The redirect
    // fails silently without throwing.
    if (!scrapbook.isGecko || _isFxBelow56) {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
a {
  background: left/1em url("${scrapbook.escapeHtml(chrome.runtime.getURL("core/scrapbook_128.png"))}") no-repeat;
  padding-left: 1em;
}
</style>
</head>
<body>
<a href="${scrapbook.escapeHtml(newUrl, false)}" target="_blank">View HTML archive</a>
</body>
</html>
`;
      const dataUrl = scrapbook.stringToDataUri(html, "text/html", "UTF-8");
      return {redirectUrl: dataUrl};
    }

    return {redirectUrl: newUrl};
  }
}

chrome.extension.isAllowedFileSchemeAccess((isAllowedAccess) => {
  if (!isAllowedAccess) { return; }

  // This event won't fire when visiting a file URL if
  // isAllowedFileSchemeAccess is false
  chrome.webRequest.onBeforeRequest.addListener(function (details) {
    return redirectUrl(details.tabId, details.type, new URL(details.url));
  }, {urls: ["file://*"], types: ["main_frame", "sub_frame"]}, ["blocking"]);
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
