/********************************************************************
 * Loader script for view.html
 *******************************************************************/

(function (window, undefined) {
  const scripts = [
    chrome.runtime.getURL('core/polyfill.js'),
    chrome.runtime.getURL('core/common.js'),
    chrome.runtime.getURL('viewer/view.js'),
  ];

  let m = chrome.runtime.getManifest();
  if (!(m.applications && m.applications.gecko)) {
    // if script-src blob: is allowed in CSP
    const loadScripts = (urls) => {
      const tasks = urls.map((url) => {
        return fetch(url, {credentials: 'include'}).then((response) => {
          if (!response.ok) { throw new Error("response not ok"); }
          return response.text();
        });
      });
      return Promise.all(tasks);
    };

    loadScripts(scripts).then((scripts) => {
      // Privileged APIs will be removed by view.js before the page
      // contents are served in the iframes. Wrap them in the local
      // scope so that the extension scripts don't break.
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
  } else {
    // script-src blob: is now allowed in CSP,
    // load them directly using <script>.
    // We don't need sandboxing in this case.
    const loadScripts = (urls) => {
      let p = Promise.resolve();
      urls.forEach((url) => {
        p = p.then(() => {
          return new Promise((resolve, reject) => {
            const elem = document.createElement('script');
            document.body.appendChild(elem);
            elem.onload = resolve;
            elem.onerror = reject;
            elem.src = url;
          });
        });
      });
      return p;
    };

    loadScripts(scripts);
  }
})(window, undefined);
