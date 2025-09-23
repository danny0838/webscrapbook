/******************************************************************************
 * Script for view.html
 *
 * @requires scrapbook
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

scrapbook.loadLanguages(document);

const urlObj = new URL(document.URL);

const viewerData = {
  virtualBase: browser.runtime.getURL("viewer/!/"),
  id: urlObj.searchParams.get('id'),
  dir: urlObj.searchParams.get('d'),
  indexFile: urlObj.searchParams.get('p'),
};

const viewer = {
  metaRefreshIdentifier: "data-scrapbook-meta-refresh-" + scrapbook.dateToId(),

  inZipFiles: new Map(),
  blobUrlToInZipPath: new Map(),
  rewrittenBlobUrl: new Set(),

  inZipPathToUrl(inZipPath) {
    return viewerData.virtualBase + (inZipPath || "").split("/").map(x => encodeURIComponent(x)).join("/");
  },

  parseUrl(url, refUrl) {
    let absoluteUrl;
    try {
      absoluteUrl = new URL(url, refUrl || undefined);
    } catch (ex) {
      // url cannot be resolved, return original (invalid)
      return {url, inZip: false};
    }

    if (absoluteUrl.href.startsWith(viewerData.virtualBase)) {
      const search = absoluteUrl.search;
      const hash = absoluteUrl.hash;
      absoluteUrl.search = "";
      absoluteUrl.hash = "";

      let inZipPath = absoluteUrl.href.slice(viewerData.virtualBase.length);
      inZipPath = inZipPath.split("/").map(x => scrapbook.decodeURIComponent(x)).join("/");

      const f = viewer.inZipFiles.get(inZipPath);
      if (f) {
        // url targets a file in zip, return its blob URL
        return {
          url: f.url + hash, // blob URL with a search is invalid
          virtualUrl: absoluteUrl.href + hash,
          inZip: true,
          inZipPath,
          mime: f.file.type,
          search,
          hash,
        };
      } else {
        // url targets a non-exist file in zip, return original (invalid)
        return {url, inZip: false};
      }
    }
    // url target not in zip, return absolute URL
    return {url: absoluteUrl.href, inZip: false};
  },

  /**
   * @callback fetchFileRewriteFunc
   * @param {Object} params
   * @param {Blob} params.data
   * @param {string} params.charset
   * @param {string} params.url
   * @return {Promise<Object>}
   */

  /**
   * @param {Object} params
   * @param {string} params.inZipPath
   * @param {fetchFileRewriteFunc} [params.rewriteFunc]
   * @param {Array} params.recurseChain
   * @return {Promise<string>} The object URL of the file.
   */
  async fetchFile({inZipPath, rewriteFunc, recurseChain}) {
    const f = viewer.inZipFiles.get(inZipPath);
    if (f) {
      if (rewriteFunc) {
        const rewrittenFile = await rewriteFunc({
          data: f.file,
          charset: null,
          url: viewer.inZipPathToUrl(inZipPath),
          recurseChain,
        });
        const u = URL.createObjectURL(rewrittenFile);
        viewer.blobUrlToInZipPath.set(u, inZipPath);
        viewer.rewrittenBlobUrl.add(u);
        return u;
      }
      return f.url;
    }
    return null;
  },

  /**
   * @param {Object} params
   * @param {string} params.inZipPath
   * @param {string} params.url
   * @param {Array} params.recurseChain
   * @return {Promise<string>} The URL of the page.
   */
  async fetchPage({inZipPath, url, recurseChain}) {
    let searchAndHash = "";
    if (url) {
      const [base, search, hash] = scrapbook.splitUrl(url);
      searchAndHash = hash; // blob URL with a search is invalid
    }
    const fetchedUrl = await viewer.fetchFile({
      inZipPath: inZipPath,
      rewriteFunc: async ({data, charset, recurseChain}) => {
        if (["text/html", "application/xhtml+xml", "image/svg+xml"].includes(data.type)) {
          try {
            const doc = await scrapbook.readFileAsDocument(data);
            if (!doc) { throw new Error("document cannot be loaded"); }
            return await viewer.parseDocument({
              doc,
              inZipPath,
              recurseChain,
            });
          } catch (ex) {
            return data;
          }
        }
        return data;
      },
      recurseChain,
    });
    return fetchedUrl ? fetchedUrl + searchAndHash : fetchedUrl;
  },

  /**
   * @param {Object} params
   * @param {Document} params.doc
   * @param {string} params.inZipPath
   * @param {Array} params.recurseChain
   * @return {Promise<Blob>}
   */
  async parseDocument({doc, inZipPath, recurseChain}) {
    const rewriteUrl = function (url, refUrlOverwrite) {
      return viewer.parseUrl(url, refUrlOverwrite || refUrl).url;
    };

    // the callback should return a falsy value if the elem is removed from DOM
    const rewriteRecursively = (elem, rootName, callback) => {
      const nodeName = elem.nodeName.toLowerCase();

      // switch rootName for certain embedded "document"
      if (["svg", "math"].includes(nodeName)) {
        rootName = nodeName;
      }

      const result = callback.call(this, elem, rootName);

      // skip processing children if elem is removed from DOM
      if (result) {
        let child = elem.firstElementChild, next;
        while (child) {
          // record next child in prior so that we don't get a problem if child
          // is removed in this run
          next = child.nextElementSibling;

          rewriteRecursively(child, rootName, callback);

          child = next;
        }
      }
      return result;
    };

    const rewriteNode = (elem, rootName) => {
      if (rootName === "svg") {
        // href and xlink:href in SVG elements
        if (elem.hasAttribute("href")) {
          const info = viewer.parseUrl(elem.getAttribute("href"), refUrl);
          if (info.inZip) {
            if (info.inZipPath !== inZipPath) {
              elem.setAttribute("href", info.url);
            } else {
              // link to self
              elem.setAttribute("href", info.hash || "#");
            }
          } else {
            // link target is not in the zip
            elem.setAttribute("href", info.url);
          }
        }
        if (elem.hasAttribute("xlink:href")) {
          const info = viewer.parseUrl(elem.getAttribute("xlink:href"), refUrl);
          if (info.inZip) {
            if (info.inZipPath !== inZipPath) {
              elem.setAttribute("xlink:href", info.url);
            } else {
              // link to self
              elem.setAttribute("xlink:href", info.hash || "#");
            }
          } else {
            // link target is not in the zip
            elem.setAttribute("xlink:href", info.url);
          }
        }
      } else if (rootName === "math") {
        if (elem.hasAttribute("href")) {
          const info = viewer.parseUrl(elem.getAttribute("href"), refUrl);
          if (info.inZip) {
            if (info.inZipPath !== inZipPath) {
              elem.setAttribute("href", info.url);
            } else {
              // link to self
              elem.setAttribute("href", info.hash || "#");
            }
          } else {
            // link target is not in the zip
            elem.setAttribute("href", info.url);
          }
        }
      } else {
        switch (elem.nodeName.toLowerCase()) {
          case "meta": {
            if (elem.matches('meta[http-equiv="refresh"][content]')) {
              const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
              if (metaRefresh.url) {
                const info = viewer.parseUrl(metaRefresh.url, refUrl);
                const [sourcePage] = scrapbook.splitUrlByAnchor(refUrl);
                const [targetPage, targetPageHash] = scrapbook.splitUrlByAnchor(info.virtualUrl || info.url);
                if (targetPage !== sourcePage) {
                  if (recurseChain.includes(targetPage)) {
                    // console.warn("Resource '" + sourcePage + "' has a circular reference to '" + targetPage + "'.");
                    elem.setAttribute("content", metaRefresh.time + "; url=about:blank");
                    break;
                  }
                  if (info.inZip) {
                    tasks[tasks.length] =
                    viewer.fetchPage({
                      inZipPath: info.inZipPath,
                      url: info.url,
                      recurseChain: [...recurseChain, refUrl],
                    }).then((fetchedUrl) => {
                      const url = fetchedUrl || info.url;
                      elem.setAttribute("content", metaRefresh.time + ";url=" + url);
                      return url;
                    });
                  } else {
                    const content = `<!DOCTYPE html>
<html ${viewer.metaRefreshIdentifier}="1">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body>
Redirecting to: <a href="${scrapbook.escapeHtml(info.url)}">${scrapbook.escapeHtml(info.url, true)}</a>
</body>
</html>
`;
                    const url = URL.createObjectURL(new Blob([content], {type: "text/html"})) + targetPageHash;
                    elem.setAttribute("content", metaRefresh.time + "; url=" + url);
                  }
                } else {
                  elem.setAttribute("content", metaRefresh.time + (targetPageHash ? "; url=" + targetPageHash : ""));
                }
              }
            }
            // An open graph URL does not acknowledge <base> and should always use an absolute URL,
            // and thus we simply skip meta[property="og:*"].
            break;
          }

          case "link": {
            if (elem.hasAttribute("href")) {
              if (elem.matches('[rel~="stylesheet"]')) {
                const info = viewer.parseUrl(elem.getAttribute("href"), refUrl);
                tasks[tasks.length] =
                viewer.fetchFile({
                  inZipPath: info.inZipPath,
                  rewriteFunc: viewer.processCssFile,
                  recurseChain: [refUrl],
                }).then((fetchedUrl) => {
                  const url = fetchedUrl || info.url;
                  elem.setAttribute("href", url);
                  return url;
                });
              } else {
                elem.setAttribute("href", rewriteUrl(elem.getAttribute("href")));
              }
            }
            break;
          }

          case "style": {
            tasks[tasks.length] =
            viewer.processCssText(elem.textContent, refUrl, recurseChain).then((response) => {
              elem.textContent = response;
              return response;
            });
            break;
          }

          case "script": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));

              // In Chromium, "blob:" is still allowed even if it's not set in the
              // content_security_policy, and thus offensive scripts could run.
              // Replace the src with a dummy URL so that scripts are never loaded.
              if (elem.src.startsWith('blob:')) {
                elem.setAttribute("src", "blob:");
              }
            }
            break;
          }

          case "body":
          case "table":
          case "tr":
          case "th":
          case "td": {
            // deprecated: background attribute (deprecated since HTML5)
            if (elem.hasAttribute("background")) {
              elem.setAttribute("background", rewriteUrl(elem.getAttribute("background"), refUrl));
            }
            break;
          }

          case "frame":
          case "iframe": {
            if (elem.hasAttribute("src")) {
              const frameRecurseChain = [...recurseChain, refUrl];
              const info = viewer.parseUrl(elem.getAttribute("src"), refUrl);
              if (info.inZip) {
                const targetUrl = viewer.inZipPathToUrl(info.inZipPath);
                if (frameRecurseChain.includes(targetUrl)) {
                  // console.warn("Resource '" + refUrl + "' has a circular reference to '" + targetUrl + "'.");
                  elem.setAttribute("src", "about:blank");
                  break;
                }
              }

              tasks[tasks.length] =
              viewer.fetchPage({
                inZipPath: info.inZipPath,
                url: info.url,
                recurseChain: frameRecurseChain,
              }).then((fetchedUrl) => {
                const url = fetchedUrl || info.url;
                elem.setAttribute("src", url);
                return url;
              });
            }
            break;
          }

          case "a":
          case "area": {
            if (elem.hasAttribute("href")) {
              const info = viewer.parseUrl(elem.getAttribute("href"), refUrl);
              if (info.inZip) {
                if (info.inZipPath !== inZipPath) {
                  elem.setAttribute("href", info.url);
                } else {
                  // link to self
                  elem.setAttribute("href", info.hash || "#");
                }
              } else {
                // link target is not in the zip
                elem.setAttribute("href", info.url);
              }
            }
            break;
          }

          case "img": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            }
            if (elem.hasAttribute("srcset")) {
              elem.setAttribute("srcset",
                scrapbook.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
                  return rewriteUrl(url, refUrl);
                }),
              );
            }
            break;
          }

          case "audio": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            }
            break;
          }

          case "video": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            }
            if (elem.hasAttribute("poster")) {
              elem.setAttribute("poster", rewriteUrl(elem.getAttribute("poster"), refUrl));
            }
            break;
          }

          case "source": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            }
            if (elem.hasAttribute("srcset")) {
              elem.setAttribute("srcset",
                scrapbook.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
                  return rewriteUrl(url, refUrl);
                }),
              );
            }
            break;
          }

          case "track": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            }
            break;
          }

          case "embed": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));

              // In Chromium, "blob:" is still allowed even if it's not set in the
              // content_security_policy, and thus offensive scripts could run.
              // Replace the src with a dummy URL so that scripts are never loaded.
              if (elem.src.startsWith('blob:')) {
                elem.setAttribute("src", "blob:");
              }
            }
            break;
          }

          case "object": {
            if (elem.hasAttribute("data")) {
              elem.setAttribute("data", rewriteUrl(elem.getAttribute("data"), refUrl));

              // In Chromium, "blob:" is still allowed even if it's not set in the
              // content_security_policy, and thus offensive scripts could run.
              // Replace the src with a dummy URL so that scripts are never loaded.
              if (elem.data.startsWith('blob:')) {
                elem.setAttribute("data", "blob:");
              }
            }
            break;
          }

          case "applet": {
            if (elem.hasAttribute("code")) {
              elem.setAttribute("code", rewriteUrl(elem.getAttribute("code"), refUrl));

              // In Chromium, "blob:" is still allowed even if it's not set in the
              // content_security_policy, and thus offensive scripts could run.
              // Replace the src with a dummy URL so that scripts are never loaded.
              if (elem.getAttribute("code").startsWith('blob:')) {
                elem.setAttribute("code", "blob:");
              }
            }

            if (elem.hasAttribute("archive")) {
              elem.setAttribute("archive", rewriteUrl(elem.getAttribute("archive"), refUrl));

              // In Chromium, "blob:" is still allowed even if it's not set in the
              // content_security_policy, and thus offensive scripts could run.
              // Replace the src with a dummy URL so that scripts are never loaded.
              if (elem.getAttribute("archive").startsWith('blob:')) {
                elem.setAttribute("archive", "blob:");
              }
            }
            break;
          }

          case "form": {
            if (elem.hasAttribute("action")) {
              elem.setAttribute("action", rewriteUrl(elem.getAttribute("action"), refUrl));
            }
            break;
          }

          case "input": {
            switch (elem.type.toLowerCase()) {
              // images: input
              case "image":
                if (elem.hasAttribute("src")) {
                  elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
                }
                break;
            }
            break;
          }
        }

        // styles: style attribute
        if (elem.hasAttribute("style")) {
          tasks[tasks.length] =
          viewer.processCssText(elem.getAttribute("style"), refUrl, recurseChain).then((response) => {
            elem.setAttribute("style", response);
            return response;
          });
        }
      }

      return elem;
    };

    const refUrl = doc.baseURI.startsWith('blob:' + browser.runtime.getURL('')) ?
        viewer.inZipPathToUrl(inZipPath) :
        doc.baseURI;
    const tasks = [];

    // rewrite URLs
    const root = doc.documentElement;
    rewriteRecursively(root, root.nodeName.toLowerCase(), rewriteNode);

    if (["text/html", "application/xhtml+xml"].includes(doc.contentType)) {
      const head = doc.querySelector("head");

      // Reset CSS for Chromium
      const elem = doc.createElement("link");
      elem.rel = "stylesheet";
      elem.href = browser.runtime.getURL("core/reset.css");
      head.insertBefore(elem, head.firstChild);

      // Force UTF-8
      const metaElem = doc.createElement("meta");
      metaElem.setAttribute("charset", "UTF-8");
      head.insertBefore(metaElem, head.firstChild);
    }

    await Promise.all(tasks);

    const content = scrapbook.documentToString(doc);
    return new Blob([content], {type: doc.contentType});
  },

  async processCssFile({data, charset, url: refUrl, recurseChain}) {
    return await scrapbook.rewriteCssFile(data, charset, async (text) => {
      return await viewer.processCssText(text, refUrl, recurseChain);
    });
  },

  async processCssText(cssText, refUrl, recurseChain) {
    const fetcher = new ComplexUrlFetcher(refUrl, recurseChain);

    const rewritten = scrapbook.rewriteCssText(cssText, {
      rewriteImportUrl(url) {
        return {url: fetcher.getUrlHash(url, viewer.processCssFile)};
      },
      rewriteFontFaceUrl(url) {
        return {url: fetcher.getUrlHash(url)};
      },
      rewriteBackgroundUrl(url) {
        return {url: fetcher.getUrlHash(url)};
      },
    });

    await fetcher.startFetches();
    return fetcher.finalRewrite(rewritten);
  },
};

class ComplexUrlFetcher {
  constructor(refUrl, recurseChain = []) {
    this.urlHash = {};
    this.urlRewrittenCount = 0;
    this.recurseChain = [...recurseChain];
    if (refUrl) {
      // if a refUrl is specified, record the recurse chain
      // for future check of circular referencing
      this.recurseChain.push(scrapbook.splitUrlByAnchor(refUrl)[0]);
    }
  }

  getUrlHash(url, rewriteFunc) {
    const key = scrapbook.getUuid();
    this.urlHash[key] = {
      url,
      newUrl: null,
      rewriteFunc,
    };
    return "urn:scrapbook:url:" + key;
  }

  async startFetches() {
    const tasks = Object.keys(this.urlHash).map(async (key) => {
      const sourceUrl = this.recurseChain[this.recurseChain.length - 1];
      const info = viewer.parseUrl(this.urlHash[key].url, sourceUrl);

      if (info.inZip) {
        const targetUrl = viewer.inZipPathToUrl(info.inZipPath);
        if (this.recurseChain.includes(scrapbook.splitUrlByAnchor(targetUrl)[0])) {
          // console.warn("Resource '" + sourceUrl + "' has a circular reference to '" + targetUrl + "'.");
          return "about:blank";
        }
      }

      const response = (await viewer.fetchFile({
        inZipPath: info.inZipPath,
        rewriteFunc: this.urlHash[key].rewriteFunc,
        url: viewer.inZipPathToUrl(info.inZipPath),
        recurseChain: this.recurseChain,
      })) || info.url;

      this.urlHash[key].newUrl = response;
      return response;
    });
    return Promise.all(tasks);
  }

  finalRewrite(text) {
    return text.replace(/urn:scrapbook:url:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/g, (match, key) => {
      if (this.urlHash[key]) { return this.urlHash[key].newUrl; }
      // This could happen when a web page really contains a content text in our format.
      // We return the original text for keys not defineded in the map to prevent a bad replace
      // since it's nearly impossible for them to hit on the hash keys we are using.
      return match;
    });
  }
}

async function init() {
  await scrapbook.loadOptions();

  const defaultTitle = document.querySelector('title').textContent;
  const iframe = document.getElementById('viewer');
  const faviconElem = document.getElementById('favicon');

  const urlSearch = "";
  const urlHash = location.hash;

  const frameRegisterLinkLoader = function (frame) {
    // a[target], area[target], or first base[target]
    const getTarget = (elem) => {
      let target = elem.target;
      if (!target) {
        const baseElem = elem.ownerDocument.querySelector('base[target]');
        if (baseElem) {
          target = baseElem.target;
        }
      }
      if (!target || target === '_self') {
        target = elem.ownerDocument.defaultView;
      } else if (target === '_parent') {
        target = elem.ownerDocument.defaultView.frames.parent;
      } else if (target === '_top') {
        target = elem.ownerDocument.defaultView.frames.top;
      } else if (target === '_blank') {
        target = '';
      } else {
        target = elem.ownerDocument.defaultView.frames[target] || target;
      }
      if (target === window) {
        target = iframe.contentWindow;
      }
      return target;
    };

    const frameOnLoad = (frame) => {
      let frameDoc;
      try {
        frameDoc = frame.contentDocument;
        if (!frameDoc) { throw new Error("content document not accessible"); }
      } catch (ex) {
        if (frame === iframe) {
          document.title = defaultTitle;
        }
        return;
      }

      if (frameDoc.documentElement.hasAttribute(viewer.metaRefreshIdentifier)) {
        const anchor = frameDoc.querySelector("a");
        const url = anchor.href;
        (frame === iframe ? document : frameDoc).location.replace(url);
        return;
      }

      if (frame === iframe) {
        document.title = frameDoc.title;

        // "rel" is matched case-insensitively
        // The "~=" selector checks for "icon" separated by space,
        // not including "-icon" or "_icon".
        const elem = frameDoc.querySelector('link[rel~="icon"][href]');
        if (elem) {
          faviconElem.href = elem.href;
        } else {
          faviconElem.removeAttribute('href');
        }
      }

      frame.contentWindow.addEventListener("click", async (e) => {
        // ignore non-left click
        if (e.button !== 0) { return; }

        // ignore click with modifier
        if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) { return; }

        // e.target won't work if clicking on a descendant node of an anchor
        const elem = e.target.closest('a[href], area[href]');
        if (!elem) { return; }

        if (elem.hasAttribute('download')) { return; }

        const target = getTarget(elem);
        const url = elem.href;
        if (target === iframe.contentWindow) {
          if (url.startsWith("blob:")) {
            // in-zip file link
            const [main, search, hash] = scrapbook.splitUrl(url);
            const inZipPath = viewer.blobUrlToInZipPath.get(main);
            if (!inZipPath) { return; }

            e.preventDefault();
            e.stopPropagation();

            const urlObj = new URL(document.URL);
            if (inZipPath !== urlObj.searchParams.get('p')) {
              urlObj.searchParams.set('p', inZipPath);
              urlObj.hash = hash;
              document.location.assign(urlObj.href);
            } else {
              frameDoc.location.assign(url);
              urlObj.hash = hash;
              history.replaceState({}, null, urlObj.href);
            }
          } else if (scrapbook.isUrlAbsolute(url)) {
            // external link
            e.preventDefault();
            e.stopPropagation();
            document.location.assign(url);
          } else {
            // a relative link targeting a non-existed file in the zip, e.g. 'nonexist.html'
            // in Chromium, url.href is ''
            // in Firefox, url.href is raw 'nonexist.html'
            e.preventDefault();
            e.stopPropagation();
            document.location.assign('about:blank');
          }
        } else if (typeof target !== 'string') {
          const [main, search, hash] = scrapbook.splitUrl(url);
          const inZipPath = viewer.blobUrlToInZipPath.get(main);
          if (!inZipPath) { return; }
          if (viewer.rewrittenBlobUrl.has(main)) { return; }

          e.preventDefault();
          e.stopPropagation();

          const f = viewer.inZipFiles.get(inZipPath);
          if (["text/html", "application/xhtml+xml"].includes(f.file.type)) {
            const fetchedUrl = await viewer.fetchPage({
              inZipPath,
              url,
              recurseChain: [],
            });

            const rewrittenUrl = fetchedUrl || "about:blank";
            elem.href = rewrittenUrl;
            target.location = rewrittenUrl;
          }
        }
      }, false);

      for (const elem of frameDoc.querySelectorAll('frame, iframe')) {
        frameRegisterLinkLoader(elem);
      }
    };

    frame.addEventListener("load", (e) => {
      frameOnLoad(e.target);
    });

    frameOnLoad(frame);
  };

  frameRegisterLinkLoader(iframe);

  try {
    const id = viewerData.id;
    const key = {table: "pageCache", id};
    const dir = viewerData.dir;
    const indexFile = viewerData.indexFile || "index.html";

    /* load zip content from previous cache */
    const entries = Object.entries(await scrapbook.cache.getAll({includes: key}, 'indexedDB'));

    if (!entries.length) {
      throw new Error(`Archive '${id}' does not exist or has been cleared.`);
    }

    for (const [info, file] of entries) {
      const path = JSON.parse(info).path;

      // exclude directories
      if (file.type === "inode/directory") { continue; }

      // filter by directory prefix
      if (dir && !path.startsWith(dir + '/')) { continue; }

      const url = URL.createObjectURL(file);
      viewer.inZipFiles.set(path, {file, url});
      viewer.blobUrlToInZipPath.set(url, path);
    }

    /* show the page */
    const fetchedUrl = await viewer.fetchPage({
      inZipPath: indexFile,
      url: urlSearch + urlHash,
      recurseChain: [],
    });

    if (!fetchedUrl) {
      throw new Error(`Specified file '${indexFile}' not found.`);
    }

    // remove iframe temporarily to avoid generating a history entry
    {
      const p = iframe.parentNode, n = iframe.nextSibling;
      iframe.remove();
      iframe.src = fetchedUrl;
      p.insertBefore(iframe, n);
    }
  } catch (ex) {
    console.error(ex);
    alert(`Unable to view: ${ex.message}`);
  }
}

init();

}));
