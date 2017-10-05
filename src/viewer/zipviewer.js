/********************************************************************
 *
 * Script for the generated viewer page
 *
 * @require {Object} scrapbook
 *******************************************************************/

(function (window, undefined) {

const viewerData = JSON.parse(document.currentScript.textContent);

// Overwrite core/common.js to avoid error for Chrome,
// whose blob URL cannot call chrome APIs
delete(scrapbook.isGecko);
scrapbook.isGecko = viewerData.isGecko;

document.addEventListener("DOMContentLoaded", function () {
  /**
   * common helper functions
   */
  const inZipPathToUrl = function (inZipPath) {
    return virtualBase + (inZipPath || "").split("/").map(x => encodeURIComponent(x)).join("/");
  };

  const parseUrl = function (url, refUrl) {
    let absoluteUrl;
    try {
      absoluteUrl = new URL(url, refUrl || undefined);
    } catch (ex) {
      // url cannot be resolved, return original (invalid)
      return {url: url, inZip: false};
    }

    if (absoluteUrl.href.startsWith(virtualBase)) {
      let search = absoluteUrl.search;
      let hash = absoluteUrl.hash;
      absoluteUrl.search = "";
      absoluteUrl.hash = "";
      let inZipPath = absoluteUrl.href.slice(virtualBase.length);
      inZipPath = inZipPath.split("/").map(x => scrapbook.decodeURIComponent(x)).join("/");
      let f = inZipFiles[inZipPath];
      if (f) {
        // url targets a file in zip, return its blob URL
        return {
          url: f.url + hash, // blob URL with a search is invalid
          virtualUrl: absoluteUrl.href + hash,
          inZip: true,
          inZipPath: inZipPath,
          mime: f.file.type,
          search: search,
          hash: hash
        };
      } else {
        // url targets a non-exist file in zip, return original (invalid)
        return {url: url, inZip: false};
      }
    }
    // url target not in zip, return absolute URL
    return {url: absoluteUrl.href, inZip: false};
  };

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
  const fetchFile = function (params) {
    return Promise.resolve().then(() => {
      const {inZipPath, rewriteFunc, recurseChain} = params;

      let f = inZipFiles[inZipPath];
      if (f) {
        if (rewriteFunc) {
          return rewriteFunc({
            data: f.file,
            charset: null,
            url: inZipPathToUrl(inZipPath),
            recurseChain: recurseChain
          }).then((rewrittenFile) => {
            return URL.createObjectURL(rewrittenFile);
          });
        }
        return f.url;
      }
      return null;
    });
  };

  /**
   * @param {Object} params
   *     - {string} params.inZipPath
   *     - {string} params.url
   *     - {Array} params.recurseChain
   * @return {Promise}
   */
  const fetchPage = function (params) {
    return Promise.resolve().then(() => {
      const {inZipPath, url, recurseChain} = params;

      let searchAndHash = "";
      if (url) {
        let [base, search, hash] = scrapbook.splitUrl(url);
        searchAndHash = hash; // blob URL with a search is invalid
      }
      return fetchFile({
        inZipPath: inZipPath,
        rewriteFunc: (params) => {
          return Promise.resolve().then(() => {
            const {data, charset, recurseChain} = params;
            if (["text/html", "application/xhtml+xml"].indexOf(data.type) !== -1) {
              return scrapbook.readFileAsDocument(data).then((doc) => {
                if (!doc) { throw new Error("document cannot be loaded"); }
                return parseDocument({
                  doc: doc,
                  inZipPath: inZipPath,
                  recurseChain: recurseChain
                });
              }).catch((ex) => {
                return data;
              });
            }
            return data;
          });
        },
        recurseChain: recurseChain
      }).then((fetchedUrl) => {
        return fetchedUrl ? fetchedUrl + searchAndHash : fetchedUrl;
      });
    });
  };

  /**
   * @param {Object} params
   *     - {Document} params.doc
   *     - {string} params.inZipPath
   *     - {Array} params.recurseChain
   * @return {Promise}
   */
  const parseDocument = function (params) {
    return Promise.resolve().then(() => {
      const {doc, inZipPath, recurseChain} = params;

      let refUrl = inZipPathToUrl(inZipPath);
      let tasks = [];

      const rewriteUrl = function (url, refUrlOverwrite) {
        return parseUrl(url, refUrlOverwrite || refUrl).url;
      };

      // modify URLs
      Array.prototype.forEach.call(doc.querySelectorAll("*"), (elem) => {
        // skip elements that are already removed from the DOM tree
        if (!elem.parentNode) { return; }

        switch (elem.nodeName.toLowerCase()) {
          case "meta": {
            if (elem.hasAttribute("http-equiv") && elem.hasAttribute("content") &&
                elem.getAttribute("http-equiv").toLowerCase() == "refresh") {
              let metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
              if (metaRefresh.url) {
                let info = parseUrl(metaRefresh.url, refUrl);
                let [sourcePage] = scrapbook.splitUrlByAnchor(refUrl);
                let [targetPage, targetPageHash] = scrapbook.splitUrlByAnchor(info.virtualUrl || info.url);
                if (targetPage !== sourcePage) {
                  if (recurseChain.indexOf(targetPage) !== -1) {
                    // console.warn("Resource '" + sourcePage + "' has a circular reference to '" + targetPage + "'.");
                    elem.setAttribute("content", metaRefresh.time + ";url=about:blank");
                    break;
                  }
                  if (info.inZip) {
                    let metaRecurseChain = JSON.parse(JSON.stringify(recurseChain));
                    metaRecurseChain.push(refUrl);
                    tasks[tasks.length] = 
                    fetchPage({
                      inZipPath: info.inZipPath,
                      url: info.url,
                      recurseChain: metaRecurseChain
                    }).then((fetchedUrl) => {
                      let url = fetchedUrl || info.url;
                      elem.setAttribute("content", metaRefresh.time + ";url=" + url);
                      return url;
                    });
                  } else {
                    let content = `<!DOCTYPE html>
<html ${metaRefreshIdentifier}="1">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
</head>
<body>
Redirecting to: <a href="${scrapbook.escapeHtml(info.url)}">${scrapbook.escapeHtml(info.url, true)}</a>
</body>
</html>
`;
                    let url = URL.createObjectURL(new Blob([content], {type: "text/html"})) + targetPageHash;
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
              let rels = elem.rel.toLowerCase().split(/[ \t\r\n\v\f]+/);
              if (rels.indexOf("stylesheet") >= 0) {
                let info = parseUrl(elem.getAttribute("href"), refUrl);
                tasks[tasks.length] = 
                fetchFile({
                  inZipPath: info.inZipPath,
                  rewriteFunc: processCssFile,
                  recurseChain: [refUrl]
                }).then((fetchedUrl) => {
                  let url = fetchedUrl || info.url;
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
            processCssText(elem.textContent, refUrl, recurseChain).then((response) => {
              elem.textContent = response;
              return response;
            });
            break;
          }

          case "script": {
            if (elem.hasAttribute("src")) {
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            } else if (viewerData.isGecko) {
              // In Firefox, the blob URL page generated by addon is restricted by CSP
              // and inline scripts are not allowed.  Convert them into blob URLs.
              let text = elem.textContent;
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
              let frameRecurseChain = JSON.parse(JSON.stringify(recurseChain));
              frameRecurseChain.push(refUrl);
              let info = parseUrl(elem.getAttribute("src"), refUrl);
              if (info.inZip) {
                let targetUrl = inZipPathToUrl(info.inZipPath);
                if (frameRecurseChain.indexOf(targetUrl) !== -1) {
                  // console.warn("Resource '" + refUrl + "' has a circular reference to '" + targetUrl + "'.");
                  elem.setAttribute("src", "about:blank");
                  break;
                }
              }

              tasks[tasks.length] = 
              fetchPage({
                inZipPath: info.inZipPath,
                url: info.url,
                recurseChain: frameRecurseChain
              }).then((fetchedUrl) => {
                let url = fetchedUrl || info.url;
                elem.setAttribute("src", url);
                return url;
              });
            }
            break;
          }

          case "a":
          case "area": {
            if (elem.hasAttribute("href")) {
              let info = parseUrl(elem.getAttribute("href"), refUrl);
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
              elem.setAttribute("src", rewriteUrl(elem.getAttribute("src"), refUrl));
            }
            break;
          }

          case "object": {
            if (elem.hasAttribute("data")) {
              elem.setAttribute("data", rewriteUrl(elem.getAttribute("data"), refUrl));
            }
            break;
          }

          case "applet": {
            if (elem.hasAttribute("archive")) {
              elem.setAttribute("archive", rewriteUrl(elem.getAttribute("archive"), refUrl));
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
          processCssText(elem.getAttribute("style"), refUrl, recurseChain).then((response) => {
            elem.setAttribute("style", response);
            return response;
          });
        }
      });

      return Promise.all(tasks).then((results) => {
        let content = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;
        return new Blob([content], {type: doc.contentType});
      });
    });
  };

  /**
   * @return {Promise}
   */
  const processCssFile = function (params) {
    return Promise.resolve().then(() => {
      const {data, charset, url: refUrl, recurseChain} = params;

      return scrapbook.parseCssFile(data, charset, (text) => {
        return processCssText(text, refUrl, recurseChain);
      });
    });
  };

  /**
   * @return {Promise}
   */
  const processCssText = function (cssText, refUrl, recurseChain) {
    const fetcher = new ComplexUrlFetcher(refUrl, recurseChain);

    let rewritten = scrapbook.parseCssText(cssText, {
      rewriteImportUrl: function (url) {
        return fetcher.getUrlHash(url, processCssFile);
      },
      rewriteFontFaceUrl: function (url) {
        return fetcher.getUrlHash(url);
      },
      rewriteBackgroundUrl: function (url) {
        return fetcher.getUrlHash(url);
      }
    });

    return fetcher.startFetches().then((result) => {
      return fetcher.finalRewrite(rewritten);
    });
  };

  const ComplexUrlFetcher = class ComplexUrlFetcher {
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
        rewriteFunc: rewriteFunc
      };
      return "urn:scrapbook:url:" + key;
    }

    /**
     * @return {Promise}
     */
    startFetches() {
      return Promise.resolve().then(() => {
        let tasks = Object.keys(this.urlHash).map((key) => {
          return Promise.resolve().then(() => {
            let sourceUrl = this.recurseChain[this.recurseChain.length - 1];
            let info = parseUrl(this.urlHash[key].url, sourceUrl);

            if (info.inZip) {
              let targetUrl = inZipPathToUrl(info.inZipPath);
              if (this.recurseChain.indexOf(scrapbook.splitUrlByAnchor(targetUrl)[0]) !== -1) {
                // console.warn("Resource '" + sourceUrl + "' has a circular reference to '" + targetUrl + "'.");
                return "about:blank";
              }
            }

            return new Promise((resolve, reject) => {
              fetchFile({
                inZipPath: info.inZipPath,
                rewriteFunc: this.urlHash[key].rewriteFunc,
                url: inZipPathToUrl(info.inZipPath),
                recurseChain: this.recurseChain
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

  /**
   * main
   */
  const virtualBase = viewerData.virtualBase;
  const defaultTitle = document.querySelector('title').textContent;
  const metaRefreshIdentifier = "data-sb-meta-refresh-" + scrapbook.dateToId();

  const viewer = document.getElementById('viewer');

  const inZipFiles = {};
  const blobUrlToInZipPath = {};

  let urlSearch = "";
  let urlHash = location.hash;

  const frameRegisterLinkLoader = function (frame) {
    const frameOnLoad = function (frame) {
      let frameDoc;
      try {
        frameDoc = frame.contentDocument;
        if (!frameDoc) { throw new Error("content document not accessible"); }
      } catch (ex) {
        if (frame === viewer) {
          document.title = defaultTitle;
        }
        return;
      }

      if (frameDoc.documentElement.hasAttribute(metaRefreshIdentifier)) {
        let anchor = frameDoc.querySelector("a");
        let url = anchor.href;
        (frame === viewer ? document : frameDoc).location.replace(url);
        return;
      }

      if (frame === viewer) {
        document.title = frameDoc.title;
      }

      frameDoc.documentElement.addEventListener("click", (e) => {
        let elem = e.target;
        switch (elem.nodeName.toLowerCase()) {
          case "a": case "area":
            try {
              let url = elem.href;
              let inZipPath = blobUrlToInZipPath[scrapbook.splitUrl(url)[0]];
              if (inZipPath) {
                let f = inZipFiles[inZipPath];
                if (["text/html", "application/xhtml+xml"].indexOf(f.file.type) !== -1) {
                  e.preventDefault();
                  e.stopPropagation();
                  fetchPage({
                    inZipPath: inZipPath,
                    url: url,
                    recurseChain: []
                  }).then((fetchedUrl) => {
                    elem.href = fetchedUrl || "about:blank";
                    elem.click();
                  });
                }
              } else if (!url.startsWith("blob:") && frame === viewer) {
                e.preventDefault();
                e.stopPropagation();
                location.href = url;
              }
            } catch (ex) {}
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

  frameRegisterLinkLoader(viewer);

  return Promise.resolve(viewerData.zipId).then((uuid) => {
    const key = {table: "viewerCache", id: uuid};
    return scrapbook.getCache(key).then((file) => {
      return scrapbook.removeCache(key).then(() => {
        return file;
      });
    });
  }).then((file) => {
    return new JSZip().loadAsync(file).then((zip) => {
      let tasks = [];
      zip.forEach((inZipPath, zipObj) => {
        if (zipObj.dir) { return; }
        tasks[tasks.length] = zipObj.async("arraybuffer").then((ab) => {
          let mime = Mime.prototype.lookup(inZipPath);
          let f = new File([ab], inZipPath.replace(/.*\//, ""), {type: mime});
          let u = URL.createObjectURL(f);
          inZipFiles[inZipPath] = {file: f, url: u};
          blobUrlToInZipPath[u] = inZipPath;
        });
      });
      return Promise.all(tasks);
    });
  }).then((results) => {
    fetchPage({
      inZipPath: viewerData.indexFile || "index.html",
      url: urlSearch + urlHash,
      recurseChain: []
    }).then((fetchedUrl) => {
      // remove viewer temporarily to avoid generating a history entry
      let p = viewer.parentNode, n = viewer.nextSibling;
      viewer.remove();
      viewer.src = fetchedUrl || "about:blank";
      p.insertBefore(viewer, n);
    });
  }).catch((ex) => {
    console.error(ex);
    alert("Unable to view data: " + ex.message);
  });
});

})(window, undefined);
