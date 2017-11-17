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
 * onDragLeave .dropmask (document in Firefox, which is weird?)
 *  or
 * onDrop   .dropmask (in this case onDragLeave doesn't fire)
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
  if (e.target === viewer.lastDropTarget || e.target === document) {
    viewer.dropmask.style.display = 'none';
  }
};

function onDrop(e) {
  e.preventDefault();
  viewer.dropmask.style.display = 'none';
  viewer.loadDrop(e.dataTransfer.items);
};

function onChangeFiles(e) {
  e.preventDefault();
  const files = e.target.files;
  if (!(files && files.length)) { return; }

  viewer.loadInputFiles(files);
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

  // @TODO: process multiple directory and files
  loadDrop(items) {
    Array.prototype.forEach.call(items, (item) => {
      const entry = item.webkitGetAsEntry();
      if (entry.isFile) {
        entry.file((file) => {
          viewer.processZipFile(file);
        });
      }
    });
  },

  // @TODO: process multiple input files
  loadInputFiles(files) {
    viewer.processZipFile(files[0]);
  },

  warn(msg) {
    console.warn(msg);
    alert(msg);
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

      window.location.replace(url);
    });
  },

  start() {
    return Promise.resolve().then(() => {
      /* check and read filesystem API */

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
      }).catch((ex) => {
        // error for filesystem API
        // console.error(ex);
      });
    }).then(() => {
      /* process URL params */

      const zipSourceUrl = viewer.mainUrl.searchParams.get("src");
      if (!zipSourceUrl) { return false; }

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

        const file = new File([xhr.response], filename, {type: Mime.prototype.lookup(filename)});
        return viewer.processZipFile(file);
      }, (ex) => {
        alert("Unable to load the specified zip file '" + zipSourceUrl + "'");
        return false;
      });
    }).then((loaded) => {
      if (!loaded) {
        viewer.initEvents();
        document.getElementById('files-selector-label').style.display = '';
      }
    });
  },

  /**
   * @return {Promise} resolves to boolean: whether the file is successfully loaded 
   */
  processZipFile(zipFile) {
    return Promise.resolve().then(() => {
      this.uninitEvents();
    }).then(() => {
      const uuid = scrapbook.getUuid();
      const type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();
      const zipData = {
        name: zipFile.name,
        files: {},
        blobs: {},
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
              const mime = Mime.prototype.lookup(inZipPath);

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

              // store blob data for special files that could be used later
              if (type === 'maff' && /^[^/]+[/]index.rdf$/.test(inZipPath)) {
                zipData.blobs[inZipPath] = new Blob([ab], {type: mime});
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
        });
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

                const file = zipData.blobs[topdir + 'index.rdf'];
                return scrapbook.readFileAsDocument(file).then((doc) => {
                  const meta = scrapbook.parseMaffRdfDocument(doc);
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

        // move main index file to the last
        indexFiles.push(indexFiles.shift());

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
              return viewer.openUrl(url.href, i !== indexFiles.length - 1);
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
            return viewer.openUrl(url.href, i !== indexFiles.length - 1);
          });
        });
        return p;
      });
    }).then(() => {
      return true;
    }).catch((ex) => {
      console.error(ex);
      alert("Unable to open web page archive: " + ex.message);

      this.initEvents();
      this.filesSelector.value = null;
      return false;
    });
  },
};

document.addEventListener("DOMContentLoaded", function () {
  scrapbook.loadLanguages(document);

  // init common elements and events
  viewer.dropmask = document.getElementById('dropmask');
  viewer.filesSelector = document.getElementById('files-selector');

  scrapbook.loadOptions().then(() => {
    viewer.start();
  });
});
