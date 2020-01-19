/******************************************************************************
 *
 * Script for load.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.JSZip,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, JSZip, window, document, console) {

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
    viewer.dropmask.hidden = false;
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
      viewer.dropmask.hidden = true;
    }
  };

  async function onDrop(e) {
    e.preventDefault();
    viewer.dropmask.hidden = true;

    const entries = Array.prototype.map.call(
      e.dataTransfer.items,
      x => x.webkitGetAsEntry && x.webkitGetAsEntry()
    );

    const files = [];
    for (const entry of entries) {
      if (!entry.isFile) { continue; }

      try {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });    
        files.push(file);
      } catch (ex) {
        // this should never happen
        console.error(ex);
      }
    }

    return await viewer.loadFiles(files);
  };

  function onChangeFiles(e) {
    e.preventDefault();
    const files = Array.from(e.target.files);
    if (!(files && files.length)) { return; }

    return viewer.loadFiles(files);
  };

  const fileSystemHandler = {
    /**
     * Request from Filesystem API if available
     *
     * @TODO:
     * Request a 5GB filesystem currently.
     * Do we need larger space or make it configurable?
     */
    async requestFileSystem(size = 5*1024*1024*1024 /* 5GB */) {
      // In Chromium >= 68, top-frame navigation to filesystem URLs is blocked,
      // making filesystem view useless.
      // https://bugs.chromium.org/p/chromium/issues/detail?id=811558
      if (scrapbook.userAgent.is('chromium') && scrapbook.userAgent.major >= 68) {
        return null;
      }

      // filesystem scheme never works in an incognito window,
      // but sometimes the requestFileSystem call doesn't throw, 
      // and an error occurs afterwards instead. Add a check
      // to prevent such error.
      if (browser.tabs && (await browser.tabs.getCurrent()).incognito) {
        return null;
      }

      try {
        return await new Promise((resolve, reject) => {
          window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
          
          window.requestFileSystem(window.TEMPORARY, size, resolve, reject);
        });
      } catch (ex) {
        // error for filesystem API
        // console.error(ex);
      }
      return null;
    },

    async getDir(dirEntry, path) {
      return new Promise((resolve, reject) => {
        dirEntry.getDirectory(path, {}, resolve, reject);
      });
    },

    async getFile(dirEntry, path) {
      return new Promise((resolve, reject) => {
        dirEntry.getFile(path, {}, resolve, reject);
      });
    },

    async createDir(dirEntry, path) {
      let dirParts = Array.isArray(path) ? path : path.split("/");
      // Throw out './' or '/' and move on to prevent something like '/foo/.//bar'.
      dirParts = dirParts.filter(x => x && x !== '.');

      try {
        return await fileSystemHandler.getDir(dirParts.join("/"));
      } catch (ex) {
        const createDirInternal = async function (dirEntry, dirParts) {
          dirEntry = await new Promise((resolve, reject) => {
            dirEntry.getDirectory(dirParts[0], {create: true}, resolve, reject);
          });

          // Recursively add the new subfolder (if we still have another to create).
          if (dirParts.length) {
            return await createDirInternal(dirEntry, dirParts.slice(1));
          }
          return dirEntry;
        };
        return createDirInternal(dirEntry, dirParts);
      }
    },

    async createFile(dirEntry, path, fileBlob) {
      await this.createDir(dirEntry, path.split("/").slice(0, -1));
      const fileEntry = await new Promise((resolve, reject) => {
        dirEntry.getFile(path, {create: true}, resolve, reject);
      });
      const fileWriter = await new Promise((resolve, reject) => {
        fileEntry.createWriter(resolve, reject);
      });
      return await new Promise((resolve, reject) => {
        fileWriter.onwriteend = resolve;
        fileWriter.onerror = reject;
        fileWriter.write(fileBlob);
      });
    },
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

    async openUrl(url, inNewTab = false) {
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
        if (scrapbook.userAgent.is('gecko')) {
          try {
            const tab = await browser.tabs.getCurrent();
            if (tab.incognito) { throw new Error('private window'); }
            return await browser.tabs.create({url, active: false});
          } catch (ex) {
            // pass
          }
        }

        return window.open(url);
      }

      if (this.autoLoading) {
        return window.location.replace(url);
      }

      return window.location.assign(url);
    },

    async openUrls(urls) {
      // move main index file to the last
      urls.push(urls.shift());

      let result;
      for (let i = 0, I = urls.length; i < I; i++) {
        result = await viewer.openUrl(urls[i], i !== urls.length - 1);
      }
      return result;
    },

    async start() {
      try {
        /* request Filesystem API by config */
        if (scrapbook.getOption("viewer.useFileSystemApi")) {
          viewer.filesystem = await fileSystemHandler.requestFileSystem();
        }

        /* process URL params */
        const files = [];
        const zipSourceUrl = viewer.mainUrl.searchParams.get("src");
        if (zipSourceUrl) {
          this.autoLoading = true;
          const zipSourceUrlObj = new URL(zipSourceUrl);
          viewer.urlSearch = zipSourceUrlObj.search;
          viewer.urlHash = viewer.mainUrl.hash;
          let filename = scrapbook.urlToFilename(zipSourceUrl);

          try {
            const xhr = await scrapbook.xhr({
              url: zipSourceUrl,
              responseType: "blob",
            });

            // if header Content-Disposition is defined, use it
            // local request (status = 0) has no response header
            if (xhr.status !== 0) {
              try {
                const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
                const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
                filename = contentDisposition.parameters.filename || filename;
              } catch (ex) {
                // error when parsing header
              }
            }

            const file = new File([xhr.response], filename, {type: Mime.lookup(filename)});
            files.push(file);
          } catch (ex) {
            this.error(`Unable to fetch specified ZIP file '${zipSourceUrl}'`);
          }
        }
        return await this.loadFiles(files);
      } catch (ex) {
        console.error(ex);
        this.error(`Unexpected error: ${ex.message}`);
      }
    },

    async loadFiles(files) {
      this.pageList = [];
      this.uninitEvents();
      this.filesSelector.disabled = true;
      this.loadmask.hidden = false;
      this.logger.textContent = '';

      files = files.sort((a, b) => {
        if (a.name > b.name) { return 1; }
        if (a.name < b.name) { return -1; }
        return 0;
      });

      for (const file of files) {
        try {
          await viewer.processZipFile(file);
        } catch (ex) {
          // this should never happen
          console.error(ex);
        }
      }

      if (this.pageList.length) {
        this.log('Done.');
        this.log('');
        return await this.openUrls(this.pageList);
      } else {
        this.autoLoading = false;
        this.initEvents();
        this.filesSelector.disabled = false;
        this.filesSelector.value = null;
        this.loadmask.hidden = true;
      }
    },

    async processZipFile(zipFile) {
      this.log(`Loading: '${zipFile.name}'...`);
      try {
        const uuid = scrapbook.getUuid();
        const type = scrapbook.filenameParts(zipFile.name)[1].toLowerCase();

        /* retrieve and store zip entries */
        const zip = await (async () => {
          try {
            return await (new JSZip().loadAsync(zipFile));
          } catch (ex) {
            throw new Error(`ZIP file invalid or unsupported.`);
          }
        })();

        for (const [inZipPath, zipObj] of Object.entries(zip.files)) {
          const data = new File([zipObj.dir ? "" : await zipObj.async("blob")], inZipPath.match(/([^\/]+)\/?$/)[1], {
            type: zipObj.dir ? "inode/directory" : Mime.lookup(inZipPath),
            lastModified: scrapbook.zipFixModifiedTime(zipObj.date),
          });

          if (viewer.filesystem) {
            /* Filesystem API view */
            if (zipObj.dir) { continue; }
            await fileSystemHandler.createFile(viewer.filesystem.root, uuid + "/" + inZipPath, data);
          } else {
            /* In-memory view */
            const key = {table: "pageCache", id: uuid, path: inZipPath};
            await scrapbook.cache.set(key, data);
          }
        }

        /* Retrieve indexFiles */
        let indexFiles = [];
        switch (type) {
          case "maff": {
            try {
              indexFiles = await scrapbook.getMaffIndexFiles(zip);
            } catch (ex) {
              this.error(ex.message);
            }
          }
          case "htz":
          default: {
            if (zip.files["index.html"]) {
              indexFiles = ["index.html"];
            }
          }
        }

        if (!indexFiles.length) {
          throw new Error(`No available page found.`);
        }

        /* convert indexFiles to this.pageList */
        if (viewer.filesystem) {
          /* Filesystem API view */
          const root = viewer.filesystem.root;
          for (const indexFile of indexFiles) {
            const fileEntry = await fileSystemHandler.getFile(root, uuid + "/" + indexFile);
            const url = new URL(fileEntry.toURL());
            url.search = viewer.urlSearch;
            url.hash = viewer.urlHash;
            this.pageList.push(url.href);
          }
        } else {
          /* In-memory view */
          const url = new URL(browser.runtime.getURL("viewer/view.html"));
          const s = url.searchParams;
          s.set("id", uuid);
          url.hash = viewer.urlHash;

          for (const indexFile of indexFiles) {
            const pos = indexFile.lastIndexOf('/');

            // set dir filter
            if (pos !== -1) {
              s.set("d", indexFile.slice(0, pos));
            } else {
              s.delete("d");
            }

            s.set("p", indexFile);
            this.pageList.push(url.href);
          }
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Unable to open archive: ${ex.message}`);
      }
      this.log('');
    },
  };

  document.addEventListener("DOMContentLoaded", async function () {
    scrapbook.loadLanguages(document);

    // init common elements and events
    viewer.dropmask = document.getElementById('dropmask');
    viewer.loadmask = document.getElementById('loadmask');
    viewer.filesSelector = document.getElementById('files-selector');
    viewer.logger = document.getElementById('logger');

    await scrapbook.loadOptions();
    await viewer.start();
  });

}));
