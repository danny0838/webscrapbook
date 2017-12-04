/********************************************************************
 * Loader script for view.html
 *******************************************************************/

(function (window, undefined) {
  const loadScripts = (urls) => {
    const tasks = urls.map((url) => {
      return fetch(url, {credentials: 'include'}).then((response) => {
        if (!response.ok) { throw new Error("response not ok"); }
        return response.text();
      });
    });
    return Promise.all(tasks);
  };

  loadScripts([
    chrome.runtime.getURL('core/polyfill.js'),
    chrome.runtime.getURL('core/common.js'),
    chrome.runtime.getURL('viewer/view.js'),
  ]).then((scripts) => {
    scripts = `
(function (
  window,
  browser,
  chrome,
  indexedDB,
  localStorage,
  sessionStorage,
  XMLHttpRequest,
  fetch,
) {
${scripts.join('\n')}
})(
  window,
  typeof browser !== "undefined" && browser || undefined,
  chrome,
  indexedDB,
  localStorage,
  sessionStorage,
  XMLHttpRequest,
  fetch,
);`;
    const elem = document.createElement('script');
    const blob = new File([scripts], {type: 'application/javascript'});
    const url = URL.createObjectURL(blob);
    document.body.appendChild(elem);
    elem.src = url;
  });
})(window, undefined);
