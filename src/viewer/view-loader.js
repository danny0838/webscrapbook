/********************************************************************
 * Loader script for view.html
 *******************************************************************/

(function (window, undefined) {
  const scripts = [
    chrome.runtime.getURL('core/polyfill.js'),
    chrome.runtime.getURL('core/common.js'),
    chrome.runtime.getURL('viewer/view.js'),
  ];

  const parseContentSecurityPolicy = function (policy) {
    return policy.split(';').reduce((result, directive) => {
      const trimmed = directive.trim();
      if (!trimmed) { return result; }

      const split = trimmed.split(/\s+/g);
      const key = split.shift();

      if (!result.hasOwnProperty(key)) {
        result[key] = split;
      }

      return result;
    }, {});
  };

  const csp = parseContentSecurityPolicy(chrome.runtime.getManifest()['content_security_policy'] || '');

  if (csp['script-src'] && csp['script-src'].includes('blob:')) {
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
  URL,
) {
${scripts.join('\n')}

/* sets the method in viewer/view.js */
viewer.hasCsp = true;
viewer.deApiScript = function () {
  [
    [window, "browser"],
    [window, "chrome"],
    [window, "indexedDB"],
    [window, "localStorage"],
    [window, "sessionStorage"],
    [window, "XMLHttpRequest"],
    [window, "fetch"],
    [window.URL, "createObjectURL"],
  ].forEach(([object, property]) => {
    if (typeof object[property] !== "undefined") {
      object[property] = undefined;
      delete(object[property]);
    }
  });
};
})(
  window,
  typeof browser !== "undefined" && browser || undefined,
  chrome,
  indexedDB,
  localStorage,
  sessionStorage,
  XMLHttpRequest,
  fetch,
  (() => {
    const _createObjectURL = URL.createObjectURL;
    return class f extends URL {
      static createObjectURL() {
        return _createObjectURL.apply(this, arguments);
      }
    };
  })(),
);`;
      const elem = document.createElement('script');
      const blob = new File([scripts], {type: 'application/javascript'});
      const url = URL.createObjectURL(blob);
      document.body.appendChild(elem);
      elem.src = url;
    });
  } else {
    // script-src blob: is not allowed in CSP,
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
