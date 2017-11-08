/********************************************************************
 *
 * Script for load.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

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

const fileSystemHandler = {
  /**
   * @return {Promise}
   */
  getDir(dirEntry, path) {
    return new Promise((resolve, reject) => {
      dirEntry.getDirectory(path, {}, resolve, reject);
    });
  },

  /**
   * @return {Promise}
   */
  getFile(dirEntry, path) {
    return new Promise((resolve, reject) => {
      dirEntry.getFile(path, {}, resolve, reject);
    });
  },

  /**
   * @return {Promise}
   */
  readDir(dirEntry) {
    return new Promise((resolve, reject) => {
      dirEntry.createReader().readEntries(resolve);
    });
  },

  /**
   * @return {Promise}
   */
  createDir(dirEntry, path) {
    return Promise.resolve().then(() => {
      let folders = Array.isArray(path) ? path : path.split("/");
      // Throw out './' or '/' and move on to prevent something like '/foo/.//bar'.
      folders = folders.filter(x => x && x !== '.');

      return fileSystemHandler.getDir(folders.join("/")).catch((ex) => {
        const createDirInternal = function (dirEntry, folders) {
          return new Promise((resolve, reject) => {
            dirEntry.getDirectory(folders[0], {create: true}, resolve, reject);
          }).then((dirEntry) => {
            // Recursively add the new subfolder (if we still have another to create).
            if (folders.length) {
              return createDirInternal(dirEntry, folders.slice(1));
            }
            return dirEntry;
          });
        };
        return createDirInternal(dirEntry, folders);
      });
    });
  },

  /**
   * @return {Promise}
   */
  createFile(dirEntry, path, fileBlob) {
    return this.createDir(dirEntry, path.split("/").slice(0, -1)).then(() => {
      return new Promise((resolve, reject) => {
        dirEntry.getFile(path, {create: true}, resolve, reject);
      });
    }).then((fileEntry) => {
      return new Promise((resolve, reject) => {
        fileEntry.createWriter(resolve, reject);
      });
    }).then((fileWriter) => {
      return new Promise((resolve, reject) => {
        fileWriter.onwriteend = resolve;
        fileWriter.onerror = reject;
        fileWriter.write(fileBlob);
      });
    });
  }
};

const viewer = {
  mainUrl: new URL(document.URL),
  filesystem: null,
  urlSearch: "",
  urlHash: "",

  warn(msg) {
    console.warn(msg);
    alert(msg);
  },

  openUrl(url, inNewTab = false) {
    return Promise.resolve().then(() => {
      if (inNewTab) {
        // In Firefox, a window.open popup is blocked by default, and the 
        // user has to manually add an exception to the popup blocker.
        // However, there's a bug causing notification now shown when
        // a popup is blocked (Bug 1396745).
        //
        // browser.tabs.create fails silently in Firefox private window.
        //
        // browser.tabs is undefined in a Firefox addon page in a frame.
        if (scrapbook.isGecko) {
          return Promise.resolve().then(() => {
            return browser.tabs.getCurrent().then((tab) => {
              if (tab.incognito) { throw new Error('private window'); }
              return browser.tabs.create({url: url, active: false});
            });
          }).catch((ex) => {
            window.open(url);
          });
        }

        window.open(url);
        return;
      }

      window.location.replace(url);
    });
  },

  start() {
    return Promise.resolve().then(() => {
      if (!scrapbook.getOption("viewer.useFileSystemApi")) { return; }

      // filesystem scheme never works in an incognito window,
      // but sometimes the requestFileSystem call doesn't throw, 
      // and an error occurs afterwards instead. Add a chesk
      // to prevent such error.
      return browser.tabs.getCurrent().then((tab) => {
        if (tab.incognito) { return; }

        return new Promise((resolve, reject) => {
          window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
          // @TODO: Request a 5GB filesystem currently. Do we need larger space or make it configurable?
          window.requestFileSystem(window.TEMPORARY, 5*1024*1024*1024, resolve, reject);
        }).then((fs) => {
          viewer.filesystem = fs;
        });
      });
    }).catch((ex) => {
      // console.error(ex);
    }).then(() => {
      viewer.processUrlParams();
    });
  },

  processUrlParams() {
    const zipSourceUrl = viewer.mainUrl.searchParams.get("src");
    if (!zipSourceUrl) { return; }

    const zipSourceUrlObj = new URL(zipSourceUrl);
    viewer.urlSearch = zipSourceUrlObj.search;
    viewer.urlHash = viewer.mainUrl.hash;
    let filename = scrapbook.urlToFilename(zipSourceUrl);

    scrapbook.xhr({
      url: zipSourceUrl,
      responseType: "blob",
    }).then((xhr) => {
      // if header Content-Disposition is defined, use it
      // local request (status = 0) has no response header
      if (xhr.status !== 0) {
        try {
          const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
          const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
          filename = contentDisposition.parameters.filename || filename;
        } catch (ex) {}
      }

      const file = new File([xhr.response], filename, {type: Mime.prototype.lookup(filename)});
      return viewer.processZipFile(file);        
    }, (ex) => {
      alert("Unable to load the specified zip file '" + zipSourceUrl + "'");
    });
  },

  /**
   * @return {Promise}
   */
  processZipFile(zipFile) {
    return Promise.resolve().then(() => {
      if (viewer.filesystem) {
        return viewer.viewZipInFileSystem(zipFile);
      } else {
        return viewer.viewZipInMemory(zipFile);
      }
    }).catch((ex) => {
      console.error(ex);
      alert("Unable to open web page archive: " + ex.message);
    });
  },

  parseRdfDocument(doc) {
    const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    const MAF = "http://maf.mozdev.org/metadata/rdf#";
    const result = {};

    const elems = doc.getElementsByTagNameNS(MAF, "indexfilename");
    const elem = elems[0];
    if (elem) { result.indexfilename = elem.getAttributeNS(RDF, "resource"); }

    return result;
  },

  /**
   * @return {Promise}
   */
  viewZipInFileSystem(zipFile) {
    return Promise.resolve().then(() => {
      const root = viewer.filesystem.root;
      const ns = scrapbook.getUuid();
      const type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();

      // @TODO: JSZip.loadAsync cannot load a large zip file
      //     (around 2GB, tested in Chrome)
      return new JSZip().loadAsync(zipFile).then((zip) => {
        return fileSystemHandler.createDir(root, ns).then((dirEntry) => {
          let p = Promise.resolve();
          zip.forEach((inZipPath, zipObj) => {
            if (zipObj.dir) { return; }
            p = p.then(() => {
              // @TODO: reading a large file (about 400~500 MB) once into an
              //     arraybuffer could consume too much memory and cause the
              //     extension to shutdown.  Loading in chunks avoids this but
              //     is very slow and unuseful.  We currently use the faster
              //     method.
              return zipObj.async("arraybuffer");
            }).then((ab) => {
              return fileSystemHandler.createFile(root, ns + "/" + inZipPath, new Blob([ab]));
            });
          });
          return p;
        });
      }).then(() => {
        switch (type) {
          case "maff": {
            return fileSystemHandler.getDir(root, ns).then((dirEntry) => {
              return fileSystemHandler.readDir(dirEntry);
            }).then((entries) => {
              const tasks = entries.filter(e => e.isDirectory).map((entry) => {
                return fileSystemHandler.getFile(entry, "index.rdf").then((fileEntry) => {
                  return new Promise((resolve, reject) => {
                    fileEntry.file(resolve, reject);
                  }).then((file) => {
                    return scrapbook.readFileAsDocument(file);
                  }).then((doc) => {
                    const meta = viewer.parseRdfDocument(doc);
                    return fileSystemHandler.getFile(entry, meta.indexfilename);
                  });
                }, (ex) => {
                  return fileSystemHandler.readDir(entry).then((entries) => {
                    for (let i = 0, I = entries.length; i < I; ++i) {
                      const entry = entries[i];
                      if (entry.isFile && entry.name.startsWith("index.")) {
                        return entry;
                      }
                    }
                    throw new Error("no index.* in the directory");
                  });
                }).catch((ex) => {
                  viewer.warn("Unable to get index file in directory: '" + entry.fullPath + "'");
                });
              });
              return Promise.all(tasks);
            });
          }
          case "htz":
          default: {
            return fileSystemHandler.getFile(root, ns + "/" + "index.html").then((fileEntry) => {
              return [fileEntry];
            });
          }
        }
      }).then((indexFileEntries) => {
        indexFileEntries = indexFileEntries.filter(x => !!x);
        if (!indexFileEntries.length) {
          return viewer.warn("No available data can be loaded from this archive file.");
        }

        let p = Promise.resolve();
        const mainFileEntry = indexFileEntries.shift();
        indexFileEntries.forEach((indexFileEntry) => {
          p = p.then(() => {
            const url = indexFileEntry.toURL() + viewer.urlSearch + viewer.urlHash;
            return viewer.openUrl(url, true);
          });
        });
        p = p.then(() => {
          const url = mainFileEntry.toURL() + viewer.urlSearch + viewer.urlHash;
          return viewer.openUrl(url, false);
        });
      });
    });
  },

  /**
   * @return {Promise}
   */
  viewZipInMemory(zipFile) {
    const uuid = scrapbook.getUuid();
    const type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();
    const zipData = {
      name: zipFile.name,
      files: {},
    };

    return new JSZip().loadAsync(zipFile).then((zip) => {
      let p = Promise.resolve();
      zip.forEach((inZipPath, zipObj) => {
        p = p.then(() => {
          if (zipObj.dir) {
            zipData.files[inZipPath] = {dir: true};
            return;
          }

          return zipObj.async("arraybuffer").then((ab) => {
            const mime = Mime.prototype.lookup(inZipPath);

            let data;
            // In Firefox < 56, Blob cannot be stored in chrome.storage,
            // fallback to byte string.
            if (_isFxBelow56) {
              data = scrapbook.arrayBufferToByteString(ab);
            } else {
              data = new Blob([ab], {type: mime});
            }

            zipData.files[inZipPath] = {
              dir: false,
              type: mime,
              value: data,
            };
          });
        });
      });
      return p;
    }).then(() => {
      const key = {table: "viewerCache", id: uuid};
      return scrapbook.setCache(key, zipData);
    }).then(() => {
      switch (type) {
        case "maff": {
          // get the list of top-folders
          const topdirs = new Set();
          for (let inZipPath in zipData.files) {
            const depth = Array.prototype.filter.call(inZipPath, x => x == "/").length;
            if (depth === 1) {
              const dirname = inZipPath.replace(/\/.*$/, "");
              topdirs.add(dirname + '/');
            }
          }

          // get index files in each topdir
          const indexFiles = [];
          let p = Promise.resolve();
          topdirs.forEach((topdir) => {
            p = p.then(() => {
              const indexRdfData = zipData.files[topdir + 'index.rdf'];
              if (!indexRdfData) { throw new Error("no index.rdf"); }

              const file = new File([indexRdfData.value], 'index.rdf', {type: indexRdfData.type});
              return scrapbook.readFileAsDocument(file).then((doc) => {
                const meta = viewer.parseRdfDocument(doc);
                const indexFile = topdir + meta.indexfilename;
                if (zipData.files[indexFile]) {
                  return indexFile;
                }
              });
            }).catch((ex) => {
              let indexFilename;
              for (let inZipPath in zipData.files) {
                if (!inZipPath.startsWith(topdir)) { continue; }

                const filename = inZipPath.slice(inZipPath.lastIndexOf("/") + 1);
                if (filename.startsWith("index.")) {
                  indexFilename = inZipPath;
                  break;
                }
              }
              return indexFilename;
            }).then((indexFilename) => {
              if (!indexFilename) { throw new Error("no available index file"); }

              indexFiles.push(indexFilename);
            }).catch((ex) => {
              viewer.warn("Unable to get index file in the directory: '" + topdir + "'");
            });
          });
          return p.then(() => {
            return indexFiles;
          });
        }
        case "htz":
        default: {
          return ["index.html"];
        }
      }
    }).then((indexFiles) => {
      if (!indexFiles.length) {
        return viewer.warn("No available data can be loaded from this archive file.");
      }

      const url = new URL(chrome.runtime.getURL("viewer/view.html"));
      const s = url.searchParams;
      s.set("id", uuid);
      url.hash = viewer.urlHash;

      let p = Promise.resolve();
      const mainIndexFile = indexFiles.shift();
      indexFiles.forEach((indexFile) => {
        p = p.then(() => {
          const pos = indexFile.lastIndexOf('/');
          if (pos !== -1) { s.set("dir", indexFile.slice(0, pos)); }
          else { s.delete("dir"); }

          s.set("index", indexFile);
          return viewer.openUrl(url.href, true);
        });
      });
      p = p.then(() => {
        const pos = mainIndexFile.lastIndexOf('/');
        if (pos !== -1) { s.set("dir", mainIndexFile.slice(0, pos)); }
        else { s.delete("dir"); }

        s.set("index", mainIndexFile);
        return viewer.openUrl(url.href, false);
      });
    });
  }
};

document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);
  scrapbook.loadOptions().then(() => {
    // init common elements and events
    const fileSelector = document.getElementById('file-selector');
    const fileSelectorInput = document.getElementById('file-selector-input');

    fileSelector.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      e.target.classList.add("dragover");
    }, false);

    fileSelector.addEventListener("drop", (e) => {
      e.preventDefault();
      e.target.classList.remove("dragover");
      Array.prototype.forEach.call(e.dataTransfer.items, (item) => {
        const entry = item.webkitGetAsEntry();
        if (entry.isFile) {
          entry.file((file) => {
            viewer.processZipFile(file);
          });
        }
      });
    }, false);

    fileSelector.addEventListener("dragleave", (e) => {
      e.target.classList.remove("dragover");
    }, false);

    fileSelector.addEventListener("click", (e) => {
      e.preventDefault();
      fileSelectorInput.click();
    }, false);

    fileSelectorInput.addEventListener("change", (e) => {
      e.preventDefault();
      const file = e.target.files[0];
      viewer.processZipFile(file);
    }, false);

    viewer.start();
  });
});
