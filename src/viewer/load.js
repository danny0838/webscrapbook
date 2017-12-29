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

/**
 * We usually get:
 *
 * onDragEnter html
 * onDragEnter .dropmask
 * onDragLeave html
 * onDragOver .dropmask
 * onDragOver .dropmask
 * ...
 * onDragLeave .dropmask[1]
 *  or
 * onDrop   .dropmask (in this case onDragLeave doesn't fire)
 *
 * [1]: In Firefox, we get document (e10s) or XULDocument (non-e10s).
 *      https://bugzilla.mozilla.org/show_bug.cgi?id=1420590
 */
function onDragEnter(e) {
  viewer.dropmask.style.display = '';
  viewer.lastDropTarget = e.target;
};

function onDragOver(e) {
  e.preventDefault(); // required to allow drop
  e.dataTransfer.dropEffect = "copy";
};

function onDragLeave(e) {
  let shouldUnMask = false;
  try {
    if (e.target === viewer.lastDropTarget || 
        e.target === document || 
        e.target.nodeName === "#document"/* XULDocument */) {
      shouldUnMask = true;
    }
  } catch (ex) {
    // access to XULDocument may throw
    shouldUnMask = true;
  }
  if (shouldUnMask) {
    viewer.dropmask.style.display = 'none';
  }
};

function onDrop(e) {
  e.preventDefault();
  viewer.dropmask.style.display = 'none';

  const entries = Array.prototype.map.call(
    e.dataTransfer.items,
    x => x.webkitGetAsEntry && x.webkitGetAsEntry()
  );

  const files = [];
  return Promise.resolve().then(() => {
    let p = Promise.resolve(false);
    entries.forEach((entry) => {
      if (!entry.isFile) { return; }

      p = p.then(() => {
        return new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        }).then((file) => {
          files.push(file);
        });
      }).catch((ex) => {
        // this should never happen
        console.error(ex);
      });
    });
    return p;
  }).then(() => {
    return viewer.loadFiles(files);
  });
};

function onChangeFiles(e) {
  e.preventDefault();
  const files = Array.from(e.target.files);
  if (!(files && files.length)) { return; }

  return viewer.loadFiles(files);
};

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
  pageList: [],
  autoLoading: false,

  initEvents() {
    window.addEventListener("dragenter", onDragEnter, false);
    window.addEventListener("dragover", onDragOver, false);
    window.addEventListener("dragleave", onDragLeave, false);
    window.addEventListener("drop", onDrop, false);
    this.filesSelector.addEventListener("change", onChangeFiles, false);
  },

  uninitEvents() {
    window.removeEventListener("dragenter", onDragEnter, false);
    window.removeEventListener("dragover", onDragOver, false);
    window.removeEventListener("dragleave", onDragLeave, false);
    window.removeEventListener("drop", onDrop, false);
    this.filesSelector.removeEventListener("change", onChangeFiles, false);
  },

  log(msg) {
    logger.appendChild(document.createTextNode(msg + '\n'));
  },

  error(msg) {
    const span = document.createElement('span');
    span.className = 'error';
    span.appendChild(document.createTextNode(msg + '\n'));
    logger.appendChild(span);
  },

  openUrl(url, inNewTab = false) {
    return Promise.resolve().then(() => {
      if (inNewTab) {
        // In Firefox, a window.open popup is blocked by default, and the 
        // user has to manually add an exception to the popup blocker.
        // Morever, a bug causes the notification not shown for the
        // blocked popup.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1396745
        //
        // browser.tabs.create fails silently in Firefox private window.
        //
        // browser.tabs is undefined in a Firefox addon page in a frame.
        if (scrapbook.isGecko) {
          return Promise.resolve().then(() => {
            return browser.tabs.getCurrent().then((tab) => {
              if (tab.incognito) { throw new Error('private window'); }
              return browser.tabs.create({url, active: false});
            });
          }).catch((ex) => {
            window.open(url);
          });
        }

        window.open(url);
        return;
      }

      if (this.autoLoading) {
        window.location.replace(url);
      } else {
        window.location.assign(url);
      }
    });
  },

  openUrls(urls) {
    // move main index file to the last
    urls.push(urls.shift());

    let p = Promise.resolve();
    urls.forEach((url, i) => {
      p = p.then(() => {
        return viewer.openUrl(url, i !== urls.length - 1);
      });
    });
    return p;
  },

  start() {
    return Promise.resolve().then(() => {
      /* check and read filesystem API */

      if (!scrapbook.getOption("viewer.useFileSystemApi")) { return; }

      // In Firefox < 58, browser.tabs is undefined when redirected to load.html
      return browser.tabs && browser.tabs.getCurrent().then((tab) => {
        // filesystem scheme never works in an incognito window,
        // but sometimes the requestFileSystem call doesn't throw, 
        // and an error occurs afterwards instead. Add a check
        // to prevent such error.
        if (tab.incognito) { return; }

        return new Promise((resolve, reject) => {
          window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
          // @TODO: Request a 5GB filesystem currently. Do we need larger space or make it configurable?
          window.requestFileSystem(window.TEMPORARY, 5*1024*1024*1024, resolve, reject);
        }).then((fs) => {
          viewer.filesystem = fs;
        });
      }).catch((ex) => {
        // error for filesystem API
        // console.error(ex);
      });
    }).then(() => {
      /* process URL params */

      const zipSourceUrl = viewer.mainUrl.searchParams.get("src");
      if (!zipSourceUrl) { return []; }

      const zipSourceUrlObj = new URL(zipSourceUrl);
      viewer.urlSearch = zipSourceUrlObj.search;
      viewer.urlHash = viewer.mainUrl.hash;
      let filename = scrapbook.urlToFilename(zipSourceUrl);

      return scrapbook.xhr({
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

        const file = new File([xhr.response], filename, {type: Mime.lookup(filename)});
        this.autoLoading = true;
        return [file];
      }).catch((ex) => {
        this.error(`Unable to fetch specified ZIP file '${zipSourceUrl}'`);
        return [];
      });
    }).then((files) => {
      return this.loadFiles(files);
    }).catch((ex) => {
      console.error(ex);
      this.error(`Unexpected error: ${ex.message}`);
    });
  },

  /**
   * @return {Promise}
   */
  loadFiles(files) {
    return Promise.resolve().then(() => {
      this.pageList = [];
      this.uninitEvents();
      this.filesSelector.disabled = true;
      this.loadmask.style.display = '';
      this.logger.textContent = '';
    }).then(() => {
      let p = Promise.resolve();
      files.sort((a, b) => {
        if (a.name > b.name) { return 1; }
        if (a.name < b.name) { return -1; }
        return 0;
      }).forEach((file) => {
        p = p.then(() => {
          return viewer.processZipFile(file);
        }).catch((ex) => {
          // this should never happen
          console.error(ex);
        });
      });
      return p;
    }).then(() => {
      if (this.pageList.length) {
        this.log('Done.');
        this.log('');
        return this.openUrls(this.pageList);
      } else {
        this.autoLoading = false;
        this.initEvents();
        this.filesSelector.disabled = false;
        this.filesSelector.value = null;
        this.loadmask.style.display = 'none';
      }
    });
  },

  /**
   * @return {Promise}
   */
  processZipFile(zipFile) {
    return Promise.resolve().then(() => {
      this.log(`Loading: '${zipFile.name}'...`);
    }).then(() => {
      const uuid = scrapbook.getUuid();
      const type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();
      const zipData = {
        name: zipFile.name,
        files: {},
      };

      // @TODO: JSZip.loadAsync cannot load a large zip file
      //     (around 2GB, tested in Chrome)
      return new JSZip().loadAsync(zipFile).then((zip) => {
        let p = Promise.resolve();
        zip.forEach((inZipPath, zipObj) => {
          p = p.then(() => {
            if (zipObj.dir) {
              zipData.files[inZipPath] = {dir: true};
              return;
            }

            // @TODO: reading a large file (about 400~500 MB) once into an
            //     arraybuffer could consume too much memory and cause the
            //     extension to shutdown.  Loading in chunks avoids this but
            //     is very slow and unuseful.  We currently use the faster
            //     method.
            return zipObj.async("arraybuffer").then((ab) => {
              const mime = Mime.lookup(inZipPath);

              zipData.files[inZipPath] = {
                dir: false,
                type: mime,
              };

              let data;
              // In Firefox < 56 and Chromium,
              // Blob cannot be stored in chrome.storage,
              // fallback to byte string.
              if (scrapbook.cache.current === 'storage' &&
                  !viewer.filesystem &&
                  (_isFxBelow56 || !scrapbook.isGecko)) {
                data = scrapbook.arrayBufferToByteString(ab);
              } else {
                data = new Blob([ab], {type: mime});
              }

              /* Filesystem API view */
              if (viewer.filesystem) {
                return fileSystemHandler.createFile(viewer.filesystem.root, uuid + "/" + inZipPath, data);
              }

              /* In-memory view */
              const key = {table: "viewerCache", id: uuid, path: inZipPath};
              return scrapbook.cache.set(key, data);
            });
          });
        });
        return p.then(() => {
          /* Filesystem API view */
          if (viewer.filesystem) {
            // do nothing
            return;
          }

          /* In-memory view */
          const key = {table: "viewerCache", id: uuid};
          return scrapbook.cache.set(key, zipData.files);
        }).then(() => {
          return zip;
        });
      }).then((zip) => {
        switch (type) {
          case "maff": {
            return scrapbook.getMaffIndexFiles(zip).catch((ex) => {
              this.error(ex.message);
              return [];
            });
          }
          case "htz":
          default: {
            if (!zip.files["index.html"]) { return []; }

            return ["index.html"];
          }
        }
      }, (ex) => {
        throw new Error(`ZIP file invalid or unsupported.`);
      }).then((indexFiles) => {
        if (!indexFiles.length) {
          throw new Error(`No available page found.`);
        }

        /* Filesystem API view */
        if (viewer.filesystem) {
          const root = viewer.filesystem.root;
          let p = Promise.resolve();
          indexFiles.forEach((indexFile, i) => {
            p = p.then(() => {
              return fileSystemHandler.getFile(root, uuid + "/" + indexFile);
            }).then((fileEntry) => {
              const url = new URL(fileEntry.toURL());
              url.search = viewer.urlSearch;
              url.hash = viewer.urlHash;
              this.pageList.push(url.href);
            });
          });
          return p;
        }

        /* In-memory view */
        const url = new URL(chrome.runtime.getURL("viewer/view.html"));
        const s = url.searchParams;
        s.set("id", uuid);
        url.hash = viewer.urlHash;

        let p = Promise.resolve();
        indexFiles.forEach((indexFile, i) => {
          p = p.then(() => {
            const pos = indexFile.lastIndexOf('/');

            // set dir filter
            if (pos !== -1) {
              s.set("d", indexFile.slice(0, pos));
            } else {
              s.delete("d");
            }

            s.set("p", indexFile);
            this.pageList.push(url.href);
          });
        });
        return p;
      });
    }).catch((ex) => {
      console.error(ex);
      this.error(`Unable to open archive: ${ex.message}`);
    }).then(() => {
      this.log('');
    });
  },
};

document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);

  // init common elements and events
  viewer.dropmask = document.getElementById('dropmask');
  viewer.loadmask = document.getElementById('loadmask');
  viewer.filesSelector = document.getElementById('files-selector');
  viewer.logger = document.getElementById('logger');

  scrapbook.loadOptions().then(() => {
    viewer.start();
  });
});
