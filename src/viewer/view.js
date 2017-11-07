/********************************************************************
 *
 * Script for view.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

(function (window, undefined) {

const urlObj = new URL(document.URL);

const viewerData = {
  virtualBase: chrome.runtime.getURL("viewer/!/"),
  zipId: urlObj.searchParams.get('id'),
  indexFile: urlObj.searchParams.get('index'),
};

const viewer = {
  metaRefreshIdentifier: "data-scrapbook-meta-refresh-" + scrapbook.dateToId(),
  inZipFiles: new Map(),
  blobUrlToInZipPath: new Map(),
  
  inZipPathToUrl(inZipPath) {
    return viewerData.virtualBase + (inZipPath || "").split("/").map(x => encodeURIComponent(x)).join("/");
  },

  parseUrl(url, refUrl) {
    let absoluteUrl;
    try {
      absoluteUrl = new URL(url, refUrl || undefined);
    } catch (ex) {
      // url cannot be resolved, return original (invalid)
      return {url: url, inZip: false};
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
          inZipPath: inZipPath,
          mime: f.file.type,
          search: search,
          hash: hash,
        };
      } else {
        // url targets a non-exist file in zip, return original (invalid)
        return {url: url, inZip: false};
      }
    }
    // url target not in zip, return absolute URL
    return {url: absoluteUrl.href, inZip: false};
  },

  /**
   * @callback fetchFileRewriteFunc
   * @param {Object} params
   *     - {Blob} params.data
   *     - {string} params.charset
   *     - {string} params.url
   * @return {Promise}
   */

  /**
   * @param {Object} params
   *     - {string} params.inZipPath
   *     - {fetchFileRewriteFunc} params.rewriteFunc
   *     - {Array} params.recurseChain
   * @return {Promise}
   */
  fetchFile(params) {
    return Promise.resolve().then(() => {
      const {inZipPath, rewriteFunc, recurseChain} = params;

      const f = viewer.inZipFiles.get(inZipPath);
      if (f) {
        if (rewriteFunc) {
          return rewriteFunc({
            data: f.file,
            charset: null,
            url: viewer.inZipPathToUrl(inZipPath),
            recurseChain: recurseChain,
          }).then((rewrittenFile) => {
            return URL.createObjectURL(rewrittenFile);
          });
        }
        return f.url;
      }
      return null;
    });
  },

  /**
   * @param {Object} params
   *     - {string} params.inZipPath
   *     - {string} params.url
   *     - {Array} params.recurseChain
   * @return {Promise}
   */
  fetchPage(params) {
    return Promise.resolve().then(() => {
      const {inZipPath, url, recurseChain} = params;

      let searchAndHash = "";
      if (url) {
        const [base, search, hash] = scrapbook.splitUrl(url);
        searchAndHash = hash; // blob URL with a search is invalid
      }
      return viewer.fetchFile({
        inZipPath: inZipPath,
        rewriteFunc: (params) => {
          return Promise.resolve().then(() => {
            const {data, charset, recurseChain} = params;
            if (["text/html", "application/xhtml+xml"].indexOf(data.type) !== -1) {
              return scrapbook.readFileAsDocument(data).then((doc) => {
                if (!doc) { throw new Error("document cannot be loaded"); }
                return viewer.parseDocument({
                  doc: doc,
                  inZipPath: inZipPath,
                  recurseChain: recurseChain,
                });
              }).catch((ex) => {
                return data;
              });
            }
            return data;
          });
        },
        recurseChain: recurseChain,
      }).then((fetchedUrl) => {
        return fetchedUrl ? fetchedUrl + searchAndHash : fetchedUrl;
      });
    });
  },

  /**
   * @param {Object} params
   *     - {Document} params.doc
   *     - {string} params.inZipPath
   *     - {Array} params.recurseChain
   * @return {Promise}
   */
  parseDocument(params) {
    return Promise.resolve().then(() => {
      const {doc, inZipPath, recurseChain} = params;

      const refUrl = viewer.inZipPathToUrl(inZipPath);
      const tasks = [];

      const rewriteUrl = function (url, refUrlOverwrite) {
        return viewer.parseUrl(url, refUrlOverwrite || refUrl).url;
      };

      // modify URLs
      Array.prototype.forEach.call(doc.querySelectorAll("*"), (elem) => {
        // skip elements that are already removed from the DOM tree
        if (!elem.parentNode) { return; }

        switch (elem.nodeName.toLowerCase()) {
          case "meta": {
            if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content") &&
                elem.getAttribute("http-equiv").toLowerCase() == "refresh") {
              const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
              if (metaRefresh.url) {
                const info = viewer.parseUrl(metaRefresh.url, refUrl);
                const [sourcePage] = scrapbook.splitUrlByAnchor(refUrl);
                const [targetPage, targetPageHash] = scrapbook.splitUrlByAnchor(info.virtualUrl || info.url);
                if (targetPage !== sourcePage) {
                  if (recurseChain.indexOf(targetPage) !== -1) {
                    // console.warn("Resource '" + sourcePage + "' has a circular reference to '" + targetPage + "'.");
                    elem.setAttribute("content", metaRefresh.time + ";url=about:blank");
                    break;
                  }
                  if (info.inZip) {
                    const metaRecurseChain = JSON.parse(JSON.stringify(recurseChain));
                    metaRecurseChain.push(refUrl);
                    tasks[tasks.length] = 
                    viewer.fetchPage({
                      inZipPath: info.inZipPath,
                      url: info.url,
                      recurseChain: metaRecurseChain,
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
<meta name="viewport" content="width=device-width">
</head>
<body>
Redirecting to: <a href="${scrapbook.escapeHtml(info.url)}">${scrapbook.escapeHtml(info.url, true)}</a>
</body>
</html>
`;
                    const url = URL.createObjectURL(new Blob([content], {type: "text/html"})) + targetPageHash;
                    elem.setAttribute("content", metaRefresh.time + ";url=" + url);
                  }
                } else {
                  elem.setAttribute("content", metaRefresh.time + (targetPageHash ? ";url=" + targetPageHash : ""));
                }
              }
            } else if (elem.hasAttribute("property") && elem.hasAttribute("content")) {
              switch (elem.getAttribute("property").toLowerCase()) {
                case "og:image":
                case "og:image:url":
                case "og:image:secure_url":
                case "og:audio":
                case "og:audio:url":
                case "og:audio:secure_url":
                case "og:video":
                case "og:video:url":
                case "og:video:secure_url":
                case "og:url":
                  elem.setAttribute("content", rewriteUrl(elem.getAttribute("content"), refUrl));
                  break;
              }
            }
            break;
          }

          case "link": {
            if (elem.hasAttribute("href")) {
              // elem.rel == "" if "rel" attribute not defined
              const rels = elem.rel.toLowerCase().split(/[ \t\r\n\v\f]+/);
              if (rels.indexOf("stylesheet") >= 0) {
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
            } else {
              // Inline scripts are not allowed by extension CSP, convert them into
              // blob URLs as a shim.
              const text = elem.textContent;
              if (text) {
                elem.src = URL.createObjectURL(new Blob([text], {type: "application/javascript"}));
                elem.textContent = "";
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
              const frameRecurseChain = JSON.parse(JSON.stringify(recurseChain));
              frameRecurseChain.push(refUrl);
              const info = viewer.parseUrl(elem.getAttribute("src"), refUrl);
              if (info.inZip) {
                const targetUrl = viewer.inZipPathToUrl(info.inZipPath);
                if (frameRecurseChain.indexOf(targetUrl) !== -1) {
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
                scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                  return rewriteUrl(url, refUrl);
                })
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
                scrapbook.parseSrcset(elem.getAttribute("srcset"), (url) => {
                  return rewriteUrl(url, refUrl);
                })
              );
            }
            break;
          }

          case "embed": {
            if (elem.hasAttribute("src")) {
              try {
                elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
              } catch (ex) {
                // In Firefox < 53, an error could be thrown here.
                // The modification still take effect, though.
              }
            }
            break;
          }

          case "object": {
            if (elem.hasAttribute("data")) {
              try {
                elem.setAttribute("data", rewriteUrl(elem.getAttribute("data"), refUrl));
              } catch (ex) {
                // In Firefox < 53, an error could be thrown here.
                // The modification still take effect, though.
              }
            }
            break;
          }

          case "applet": {
            if (elem.hasAttribute("archive")) {
              try {
                elem.setAttribute("archive", rewriteUrl(elem.getAttribute("archive"), refUrl));
              } catch (ex) {
                // In Firefox < 53, an error could be thrown here.
                // The modification still take effect, though.
              }
            }
            break;
          }

          case "form": {
            if ( elem.hasAttribute("action") ) {
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
      });

      return Promise.all(tasks).then((results) => {
        const content = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;
        return new Blob([content], {type: doc.contentType});
      });
    });
  },

  /**
   * @return {Promise}
   */
  processCssFile(params) {
    return Promise.resolve().then(() => {
      const {data, charset, url: refUrl, recurseChain} = params;

      return scrapbook.parseCssFile(data, charset, (text) => {
        return viewer.processCssText(text, refUrl, recurseChain);
      });
    });
  },

  /**
   * @return {Promise}
   */
  processCssText(cssText, refUrl, recurseChain) {
    const fetcher = new ComplexUrlFetcher(refUrl, recurseChain);

    const rewritten = scrapbook.parseCssText(cssText, {
      rewriteImportUrl(url) {
        return {url: fetcher.getUrlHash(url, viewer.processCssFile)};
      },
      rewriteFontFaceUrl(url) {
        return {url: fetcher.getUrlHash(url)};
      },
      rewriteBackgroundUrl(url) {
        return {url: fetcher.getUrlHash(url)};
      }
    });

    return fetcher.startFetches().then((result) => {
      return fetcher.finalRewrite(rewritten);
    });
  },
};

class ComplexUrlFetcher {
  constructor(refUrl, recurseChain) {
    this.urlHash = {};
    this.urlRewrittenCount = 0;
    this.recurseChain = JSON.parse(JSON.stringify(recurseChain || []));
    if (refUrl) {
      // if a refUrl is specified, record the recurse chain
      // for future check of circular referencing
      this.recurseChain.push(scrapbook.splitUrlByAnchor(refUrl)[0]);
    }
  }

  getUrlHash(url, rewriteFunc) {
    const key = scrapbook.getUuid();
    this.urlHash[key] = {
      url: url,
      newUrl: null,
      rewriteFunc: rewriteFunc,
    };
    return "urn:scrapbook:url:" + key;
  }

  /**
   * @return {Promise}
   */
  startFetches() {
    return Promise.resolve().then(() => {
      const tasks = Object.keys(this.urlHash).map((key) => {
        return Promise.resolve().then(() => {
          const sourceUrl = this.recurseChain[this.recurseChain.length - 1];
          const info = viewer.parseUrl(this.urlHash[key].url, sourceUrl);

          if (info.inZip) {
            const targetUrl = viewer.inZipPathToUrl(info.inZipPath);
            if (this.recurseChain.indexOf(scrapbook.splitUrlByAnchor(targetUrl)[0]) !== -1) {
              // console.warn("Resource '" + sourceUrl + "' has a circular reference to '" + targetUrl + "'.");
              return "about:blank";
            }
          }

          return new Promise((resolve, reject) => {
            viewer.fetchFile({
              inZipPath: info.inZipPath,
              rewriteFunc: this.urlHash[key].rewriteFunc,
              url: viewer.inZipPathToUrl(info.inZipPath),
              recurseChain: this.recurseChain,
            }).then((fetchedUrl) => {
              resolve(fetchedUrl || info.url);
            });
          });
        }).then((response) => {
          this.urlHash[key].newUrl = response;
          return response;
        });
      });
      return Promise.all(tasks);
    });
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
};

document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);

  const defaultTitle = document.querySelector('title').textContent;
  const iframe = document.getElementById('viewer');

  const urlSearch = "";
  const urlHash = location.hash;

  const frameRegisterLinkLoader = function (frame) {
    const frameOnLoad = function (frame) {
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
      }

      frame.contentWindow.addEventListener("click", (e) => {
        // e.target won't work if clicking on a descendant node of an anchor
        const elem = e.target.closest('a[href], area[href]');
        if (!elem) { return; }

        try {
          const url = elem.href;
          const inZipPath = viewer.blobUrlToInZipPath.get(scrapbook.splitUrl(url)[0]);
          if (inZipPath) {
            const f = viewer.inZipFiles.get(inZipPath);
            if (["text/html", "application/xhtml+xml"].indexOf(f.file.type) !== -1) {
              e.preventDefault();
              e.stopPropagation();
              viewer.fetchPage({
                inZipPath: inZipPath,
                url: url,
                recurseChain: [],
              }).then((fetchedUrl) => {
                elem.href = fetchedUrl || "about:blank";
                elem.click();
              });
            }
          } else if (!url.startsWith("blob:") && frame === iframe) {
            e.preventDefault();
            e.stopPropagation();
            location.href = url;
          }
        } catch (ex) {
          console.error(ex);
        }
      }, false);

      Array.prototype.forEach.call(frameDoc.querySelectorAll('frame, iframe'), (elem) => {
        frameRegisterLinkLoader(elem);
      });
    };

    frame.addEventListener("load", (e) => {
      frameOnLoad(e.target);
    });

    frameOnLoad(frame);
  };

  frameRegisterLinkLoader(iframe);

  return Promise.resolve(viewerData.zipId).then((uuid) => {
    const key = {table: "viewerCache", id: uuid};

    return scrapbook.getCache(key).then((data) => {
      if (data && !(data instanceof File)) {
        return new File([scrapbook.byteStringToArrayBuffer(data.value)], data.name, {type: data.type});
      }
      return data;
    }).then((file) => {
      return scrapbook.removeCache(key).then(() => {
        return file;
      });
    });
  }).then((file) => {
    return new JSZip().loadAsync(file).then((zip) => {
      const tasks = [];
      zip.forEach((inZipPath, zipObj) => {
        if (zipObj.dir) { return; }
        tasks[tasks.length] = zipObj.async("arraybuffer").then((ab) => {
          const mime = Mime.prototype.lookup(inZipPath);
          const f = new File([ab], inZipPath.replace(/.*\//, ""), {type: mime});
          const u = URL.createObjectURL(f);
          viewer.inZipFiles.set(inZipPath, {file: f, url: u});
          viewer.blobUrlToInZipPath.set(u, inZipPath);
        });
      });
      return Promise.all(tasks);
    });
  }).then((results) => {
    viewer.fetchPage({
      inZipPath: viewerData.indexFile || "index.html",
      url: urlSearch + urlHash,
      recurseChain: [],
    }).then((fetchedUrl) => {
      // remove viewer temporarily to avoid generating a history entry
      const p = iframe.parentNode, n = iframe.nextSibling;
      iframe.remove();
      iframe.src = fetchedUrl || "about:blank";
      p.insertBefore(iframe, n);
    });
  }).catch((ex) => {
    console.error(ex);
    alert("Unable to view data: " + ex.message);
  });
});

})(window, undefined);
