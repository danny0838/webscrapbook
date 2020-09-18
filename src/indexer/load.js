/******************************************************************************
 *
 * Script for load.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.indexer = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.JSZip,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, JSZip, window, document, console) {

  'use strict';

  const SPECIAL_ITEM_ID = new Set(['root', 'hidden', 'recycle']);

  const FULLTEXT_NO_INDEX_SELECTOR = `
head,
style, script,
frame, iframe,
embed, object, applet,
audio, video,
canvas,
noframes, noscript, noembed,
parsererror,
svg, math`;

  const FULLTEXT_NO_META_REFRESH_SELECTOR = `
style, script,
frame, iframe,
embed, object, applet,
audio, video,
canvas,
noframes, noscript, noembed,
parsererror,
svg, math`;

  class RemoteFile {
    constructor(url, name, options = {}) {
      const {size = 0, lastModified = Date.now()} = options;
      this.url = url;
      this.name = name;
      this.size = size;
      this.lastModified = lastModified;
    }

    async load() {
      const response = await server.request({
        url: this.url,
        method: 'GET',
      });
      const filename = this.name;
      const lm = response.headers.get('last-modified');
      const lastModified = lm ? new Date(lm).valueOf() : Date.now();
      return new File([await response.blob()], filename, {
        type: Mime.lookup(filename),
        lastModified,
      });
    }
  }

  class FileMapper extends Map {
    async getFile(filename) {
      let file = this.get(filename);
      if (file instanceof RemoteFile) {
        file = await file.load();
        this.set(filename, file);
      }
      return file;
    }
  }

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
    indexer.dropmask.hidden = false;
    indexer.lastDropTarget = e.target;
  }

  function onDragOver(e) {
    e.preventDefault(); // required to allow drop
  }

  function onDragLeave(e) {
    let shouldUnMask = false;
    try {
      if (e.target === indexer.lastDropTarget || 
          e.target === document || 
          e.target.nodeName === "#document"/* XULDocument */) {
        shouldUnMask = true;
      }
    } catch (ex) {
      // access to XULDocument may throw
      shouldUnMask = true;
    }
    if (shouldUnMask) {
      indexer.dropmask.hidden = true;
    }
  }

  function onDrop(e) {
    e.preventDefault();
    indexer.dropmask.hidden = true;
    const entries = Array.prototype.map.call(
      e.dataTransfer.items,
      x => x.webkitGetAsEntry && x.webkitGetAsEntry()
    );
    indexer.loadDrop(entries);
  }

  function onChangeDir(e) {
    e.preventDefault();
    const files = e.target.files;
    if (!(files && files.length)) { return; }

    indexer.loadInputDir(files);
  }

  function onChangeFiles(e) {
    e.preventDefault();
    const files = e.target.files;
    if (!(files && files.length)) { return; }

    indexer.loadInputFiles(files);
  }

  function onClickLoadServer(e) {
    e.preventDefault();
    indexer.loadServerFiles();
  }

  const indexer = {
    /**
     * UI related methods
     */
    log(msg) {
      logger.appendChild(document.createTextNode(msg + '\n'));
    },

    error(msg) {
      const span = document.createElement('span');
      span.className = 'error';
      span.appendChild(document.createTextNode(msg + '\n'));
      logger.appendChild(span);
    },

    isSpecialItem(id) {
      return SPECIAL_ITEM_ID.has(id);
    },

    enableUi() {
      window.addEventListener("dragenter", onDragEnter, false);
      window.addEventListener("dragover", onDragOver, false);
      window.addEventListener("dragleave", onDragLeave, false);
      window.addEventListener("drop", onDrop, false);
      this.dirSelector.addEventListener("change", onChangeDir, false);
      this.filesSelector.addEventListener("change", onChangeFiles, false);
      this.loadServerLabel.addEventListener("click", onClickLoadServer, false);

      this.panel.disabled = false;
    },

    disableUi() {
      window.removeEventListener("dragenter", onDragEnter, false);
      window.removeEventListener("dragover", onDragOver, false);
      window.removeEventListener("dragleave", onDragLeave, false);
      window.removeEventListener("drop", onDrop, false);
      this.dirSelector.removeEventListener("change", onChangeDir, false);
      this.filesSelector.removeEventListener("change", onChangeFiles, false);
      this.loadServerLabel.removeEventListener("click", onClickLoadServer, false);

      this.panel.disabled = true;
    },

    start() {
      this.disableUi();
      this.logger.textContent = '';
      this.logger.className = '';
      this.options = Object.assign({}, scrapbook.options);
      this.wsbDir = null;
      this.dataDir = 'data/';
      this.treeDir = 'tree/';
      this.treeBakDir = 'tree.bak/';
      this.faviconDir = this.treeDir + 'favicon/';
      this.cacheDir = this.treeDir + 'cache/';
      this.indexPage = 'map.html';
      this.serverData = {};
      this.startTime = Date.now();
    },

    end() {
      let t = ((Date.now() - this.startTime) / 1000).toFixed(3);
      this.log(`Time spent: ${t} seconds.`);
      this.log('');

      this.dirSelector.value = null;
      this.filesSelector.value = null;
      this.enableUi();
    },

    async loadZipFile(file) {
      this.log(`Got file '${file.name}'.`);
      this.log(`Extracting zip content...`);

      try {
        const zipObj = await new JSZip().loadAsync(file);

        const inputData = {
          name: file.name.replace(/[.][^.]+$/, ''),
          files: [],
        };
        let cut = 0;

        const topDirName = inputData.name + '/';
        if (zipObj.files[topDirName]) {
          let onlyTopDir = true;
          for (const path in zipObj.files) {
            if (!path.startsWith(topDirName)) {
              onlyTopDir = false;
              break;
            }
          }
          if (onlyTopDir) {
            this.error(`Stripped root directory path '${topDirName}' for all entries.`);
            cut = topDirName.length;
          }
        }

        let hasDataDir = false;
        for (const [inZipPath, zipEntryObj] of Object.entries(zipObj.files)) {
          if (zipEntryObj.dir) { continue; }

          // async('blob') has type = '' and has no lastModified
          const ab = await zipEntryObj.async('arraybuffer');
          const path = inZipPath.slice(cut);
          const filename = inZipPath.replace(/^.*[/]/, '');
          if (path.startsWith(this.dataDir)) { hasDataDir = true; }
          inputData.files.push({
            path,
            file: new File([ab], filename, {
              type: Mime.lookup(filename),
              lastModified: scrapbook.zipFixModifiedTime(zipEntryObj.date),
            }),
          });
        }

        if (hasDataDir) {
          this.log(`Found ${inputData.files.length} files.`);
          await indexer.import(inputData);
        } else {
          // not a valid ScrapBook folder
          this.error(`Skipped invalid zip of ScrapBook folder.`);
          this.log('');
        }
      } catch (ex) {
        // not a valid zip file
        this.error(`Skipped invalid zip file '${file.name}'.`);
        this.log('');
      }
    },

    async loadInputFiles(files) {
      try {
        await this.start();

        for (const file of files) {
          await this.loadZipFile(file);
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Unexpected error: ${ex.message}`);
      }

      await this.end();
    },

    async loadInputDir(files) {
      try {
        await this.start();

        const p = files[0].webkitRelativePath;
        const cut = p.indexOf('/') + 1;
        const inputData = {
          name: p.slice(0, cut - 1),
          files: [],
        };

        this.log(`Got directory '${inputData.name}'.`);

        let hasDataDir = false;
        for (const file of files) {
          let path = file.webkitRelativePath;
          path = path.slice(cut);
          if (path.startsWith(this.dataDir)) { hasDataDir = true; }
          inputData.files.push({
            path,
            file,
          });
        }

        if (hasDataDir) {
          this.log(`Found ${inputData.files.length} files.`);
          await this.import(inputData);
        } else {
          // not a valid ScrapBook folder
          this.error(`Skipped invalid zip of ScrapBook folder.`);
          this.log('');
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Unexpected error: ${ex.message}`);
      }

      await this.end();
    },

    async loadDrop(entries) {
      try {
        await this.start();

        let hasValidEntry = false;
        for (const entry of entries) {
          if (!entry) { return; }

          hasValidEntry = true;

          if (entry.isDirectory) {
            try {
              const cut = entry.fullPath.length + 1;
              const inputData = {
                name: entry.name,
                files: [],
              };

              this.log(`Got directory '${inputData.name}'.`);
              this.log(`Inspecting files...`);

              let hasDataDir = false;
              const scanFiles = async (dirEntry) => {
                // load all entries in dirEntry
                let entries = [];
                {
                  const reader = dirEntry.createReader();
                  let subentries;
                  do {
                    subentries = await new Promise((resolve, reject) => {
                      reader.readEntries(resolve, reject);
                    });
                    entries = entries.concat(subentries);
                  } while (subentries.length)
                }

                // handle loaded entries
                for (const entry of entries) {
                  if (entry.isDirectory) {
                    await scanFiles(entry);
                    continue;
                  }

                  let file = await new Promise((resolve, reject) => {
                    entry.file(resolve, reject);
                  });

                  const path = entry.fullPath.slice(cut);
                  if (path.startsWith(this.dataDir)) { hasDataDir = true; }

                  // Fix a Firefox bug that the returned File type is always ""
                  // when a FileSystemFileEntry read from a FileSystemDirectoryEntry
                  // calls file().
                  // https://bugzilla.mozilla.org/show_bug.cgi?id=1424689
                  if (scrapbook.userAgent.is('gecko')) {
                    file = new File([file], file.name, {
                      type: Mime.lookup(file.name),
                      lastModified: file.lastModified,
                    });
                  }

                  inputData.files.push({
                    path,
                    file,
                  });
                }
              };

              await scanFiles(entry);

              if (hasDataDir) {
                this.log(`Found ${inputData.files.length} files.`);
                await indexer.import(inputData);
              } else {
                // not a valid ScrapBook folder
                this.error(`Skipped invalid ScrapBook folder.`);
                this.log('');
              }
            } catch (ex) {
              console.error(ex);
              this.error(`Unexpected error: ${ex.message}`);
            }
          } else {
            try {
              const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
              });
              await this.loadZipFile(file);
            } catch (ex) {
              console.error(ex);
              this.error(`Unexpected error: ${ex.message}`);
            }
          }
        }

        if (!hasValidEntry) {
          throw new Error(`At least one directory or zip file must be provided.`);
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Unexpected error: ${ex.message}`);
      }

      await this.end();
    },

    async loadServerFiles(bookIds) {
      try {
        await this.start();

        if (!scrapbook.hasServer()) {
          this.error(`Backend server is not configured.`);
          return;
        }

        this.serverData.isIndexingServer = true;
        await server.init();

        const loadEntry = async (book, inputData) => {
          const target = book.topUrl;
          // TODO drop "f=sse" since new backend obtains format from Accept header
          const evtSource = new EventSource(target + '?a=list&f=sse&recursive=1');

          return await new Promise((resolve, reject) => {
            evtSource.addEventListener('complete', (event) => {
              evtSource.close();
              resolve();
            });

            evtSource.addEventListener('error', (event) => {
              evtSource.close();
              reject(new Error('Disconnected when downloading file list.'));
            });

            evtSource.addEventListener('message', (event) => {
              try {
                const entry = JSON.parse(event.data);
                if (entry.type !== 'file') { return; }

                const {name: path, size, last_modified} = entry;
                const lastModified = parseInt(last_modified * 1000);
                const target = book.topUrl + scrapbook.escapeFilename(path);

                const file = new RemoteFile(
                  target + '?a=source',
                  scrapbook.filepathParts(path)[1],
                  {size, lastModified},
                );

                inputData.files.push({
                  path,
                  file,
                });
              } catch (ex) {
                evtSource.close();
                reject(ex);
              }
            });
          });
        };

        bookIds = bookIds && bookIds.length ? bookIds : Object.keys(server.books).sort();
        for (const bookId of bookIds) {
          const book = server.books[bookId];
          if (!book) {
            this.error(`Skipped invalid bookId '${bookId}'.`);
            this.log('');
            continue;
          }

          if (!!book.config.no_tree) {
            this.log(`Skip no-tree book '${book.name}' at '${book.topUrl}'.`);
            this.log('');
            continue;
          }

          // load tree for reference
          // To prevent too easy deadlock when the user interrupts indexing,
          // we don't lock the tree during whole indexing process. Instead,
          // load tree data in prior and check afterwards.
          await book.lockTree();
          try {
            await book.loadTreeFiles(true);
          } finally {
            await book.unlockTree();
          }

          const inputData = {
            name: book.name,
            base: book.topUrl,
            files: [],
          };

          this.serverData.book = book;
          this.wsbDir = (server.config.WSB_DIR + '/').replace(/^\/+/, '');
          this.dataDir = (book.config.data_dir + '/').replace(/^\/+/, '');
          this.treeDir = (book.config.tree_dir + '/').replace(/^\/+/, '');
          this.treeBakDir = this.treeDir.replace(/\/+$/, '') + '.bak/';
          this.faviconDir = this.treeDir + 'favicon/';
          this.cacheDir = this.treeDir + 'cache/';
          this.indexPage = book.config.index;

          this.log(`Got book '${book.name}' at '${book.topUrl}'.`);
          this.log(`Inspecting files...`);

          try {
            await loadEntry(book, inputData);
          } catch (ex) {
            console.error(ex);
            this.error(`Skipped due to error: ${ex.message}`);
            this.log('');
            continue;
          }

          this.log(`Found ${inputData.files.length} files.`);
          await this.import(inputData);
        }
      } catch (ex) {
        console.error(ex);
        this.error(`Unexpected error: ${ex.message}`);
      }

      await this.end();
    },

    /**
     * Main index generating process of an individual directory or ZIP file
     *
     * @param {Object} inputData - processed structured files
     */
    async import(inputData) {
      try {
        const scrapbookData = {
          title: inputData.name,
          base: this.options["indexer.createRssFeedBase"] || inputData.base,
          meta: {},
          toc: {
            root: [],
          },
          fulltext: {},
        };

        const zip = new JSZip();

        // collect files meaningful for ScrapBook
        const dataDirIds = new Set();
        const dataFiles = new FileMapper();
        const treeFiles = new FileMapper();
        const otherFiles = new FileMapper();

        for (const {path, file} of inputData.files) {
          if (path.startsWith(this.treeDir)) {
            treeFiles.set(path, file);
          } else if (path.startsWith(this.dataDir) && (this.wsbDir === null || !path.startsWith(this.wsbDir))) {
            const subpath = path.slice(this.dataDir.length);
            dataFiles.set(subpath, file);
          } else {
            otherFiles.set(path, file);
          }
        }

        // add ID from files
        const excludeDirs = new Set();
        const excludePrefixes = new Set();
        const excludePrefix = (path) => {
          for (const prefix of excludePrefixes) {
            if (path.startsWith(prefix)) { return true; }
          }
          return false;
        };
        for (const subpath of dataFiles.keys()) {
          if (excludePrefix(subpath)) { continue; }

          const [dir, basename] = scrapbook.filepathParts(subpath);

          // handle directory
          if (dir && !excludeDirs.has(dir)) {
            excludeDirs.add(dir);

            // <dir>.files, <dir>_files
            if (dir.endsWith('.files') || dir.endsWith('_files')) {
              const id = dir.slice(0, -6);

              // a corresponding *.html|*.htm exists
              // treat this as a supporting folder and skip entries under it
              if (dataFiles.has(`${id}.html`) || dataFiles.has(`${id}.htm`)) {
                dataDirIds.add(id);
                excludePrefixes.add(`${id}.`);
                excludePrefixes.add(`${id}/`);
                // excludePrefixes.add(`${id}.files/`);
                excludePrefixes.add(`${id}_files/`);
                continue;
              }
            }

            // <dir>/index.html, <dir>/index.md
            if (dataFiles.has(`${dir}/index.html`) || dataFiles.has(`${dir}/index.md`)) {
              dataDirIds.add(dir);
              excludePrefixes.add(`${dir}.`);
              excludePrefixes.add(`${dir}/`);
              // excludePrefixes.add(`${dir}/index.files/`);
              // excludePrefixes.add(`${dir}/index_files/`);
              continue;
            }
          }

          // <dir>/*.*
          const [id, ext] = scrapbook.filenameParts(subpath);
          if (['html', 'htm', 'xhtml', 'xht', 'md', 'maff', 'htz'].includes(ext)) {
            dataDirIds.add(id);
            excludeDirs.add(id);
            excludePrefixes.add(`${id}.`);
            excludePrefixes.add(`${id}/`);
            if (dataFiles.has(`${id}.html`) || dataFiles.has(`${id}.htm`)) {
              // excludePrefixes.add(`${id}.files/`);
              excludePrefixes.add(`${id}_files/`);
            }
            continue;
          }
        }

        await this.importLegacyRdf({scrapbookData, dataFiles, otherFiles});
        await this.importMetaJs({scrapbookData, treeFiles});
        await this.importTocJs({scrapbookData, treeFiles});
        await this.importDataDir({scrapbookData, dataFiles, dataDirIds});
        await this.fixMetaToc({scrapbookData, dataFiles});
        await this.cacheFavicons({scrapbookData, dataFiles, treeFiles, zip});
        await this.handleBadFavicons({scrapbookData, treeFiles, zip});
        await this.generateFiles({scrapbookData, treeFiles, zip});

        if (this.options["indexer.fulltextCache"]) {
          await this.generateFulltextCache({scrapbookData, dataFiles, treeFiles, zip});
        }

        if (this.options["indexer.createRssFeed"]) {
          await this.generateRssFeed({scrapbookData, zip});
        }

        await this.checkSameAndBackup({scrapbookData, treeFiles, zip});
        await this.makeZipAndDownload({scrapbookData, zip});

        /* We are done! */
        this.log(`Done.`);
      } catch (ex) {
        console.error(ex);
        this.error(`Unexpected error: ${ex.message}`);
      }
      this.log(``);
    },

    /* Import legacy ScrapBook RDF (metadata and toc) */
    async importLegacyRdf({scrapbookData, dataFiles, otherFiles}) {
      try {
        const path = `scrapbook.rdf`;
        const file = await otherFiles.getFile(path);
        if (!file) { return; }

        this.log(`Found 'scrapbook.rdf' for legacy ScrapBook. Importing...`);

        const doc = await scrapbook.readFileAsDocument(file);

        const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
        const NS1 = "http://amb.vis.ne.jp/mozilla/scrapbook-rdf#";
        const NC = "http://home.netscape.com/NC-rdf#";

        const parseItemElem = (elem) => {
          const rid = elem.getAttributeNS(RDF, "about");
          if (!/^urn:scrapbook:item(\d{14})$/.test(rid)) { return; }

          const id = elem.getAttributeNS(NS1, "id") || RegExp.$1;
          const meta = {id};
          Array.prototype.forEach.call(elem.attributes, (attrElem) => {
            const attrName = attrElem.localName;
            if (attrElem.namespaceURI === NS1 && attrName !== "id") {
              meta[attrName] = elem.getAttributeNS(NS1, attrName);
            }
          });

          if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
          scrapbookData.meta[id].index = this.getIndexPath(dataFiles, id) || undefined,
          this.mergeLegacyMeta(scrapbookData.meta[id], meta);
        };

        const parseSeqElem = (elem) => {
          const rid = elem.getAttributeNS(RDF, "about");
          if (!/^urn:scrapbook:(?:item(\d{14})|(root))$/.test(rid)) { return; }

          const id = RegExp.$1 || RegExp.$2;

          Array.prototype.forEach.call(elem.getElementsByTagNameNS(RDF, "li"), (refElem) => {
            const refRid = refElem.getAttributeNS(RDF, "resource");
            if (!/^urn:scrapbook:item(\d{14})$/.test(refRid)) { return; }
            const refId = RegExp.$1;
            if (!scrapbookData.toc[id]) { scrapbookData.toc[id] = []; }
            scrapbookData.toc[id].push(refId);
          });
        };

        Array.prototype.forEach.call(doc.getElementsByTagNameNS(RDF, "Description"), parseItemElem);
        Array.prototype.forEach.call(doc.getElementsByTagNameNS(NC, "BookmarkSeparator"), parseItemElem);
        Array.prototype.forEach.call(doc.getElementsByTagNameNS(RDF, "Seq"), parseSeqElem);
      } catch (ex) {
        console.error(ex);
        this.error(`Error importing 'scrapbook.rdf': ${ex.message}`);
      }
    },

    /* Import tree/meta*.js */
    async importMetaJs({scrapbookData, treeFiles}) {
      for (let i = 0; ; i++) {
        const path = `${this.treeDir}meta${i || ""}.js`;
        const file = await treeFiles.getFile(path);
        if (!file) { break; }

        this.log(`Importing '${path}'...`);
        try {
          const text = await scrapbook.readFileAsText(file);

          if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
            throw new Error(`Failed to retrieve JSON data.`);
          }

          const data = JSON.parse(RegExp.$1);
          for (const id in data) {
            if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
            scrapbookData.meta[id] = Object.assign(scrapbookData.meta[id], data[id]);
          }
        } catch (ex) {
          this.error(`Error importing '${path}': ${ex.message}`);
        }
      }
    },

    /* Import tree/toc*.js */
    async importTocJs({scrapbookData, treeFiles}) {
      for (let i = 0; ; i++) {
        const path = `${this.treeDir}toc${i || ""}.js`;
        const file = await treeFiles.getFile(path);
        if (!file) { break; }

        this.log(`Importing '${path}'...`);
        try {
          const text = await scrapbook.readFileAsText(file);

          if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
            throw new Error(`Failed to retrieve JSON data.`);
          }

          const data = JSON.parse(RegExp.$1);
          scrapbookData.toc = Object.assign(scrapbookData.toc, data);
        } catch (ex) {
          this.error(`Error importing '${path}': ${ex.message}`);
        }
      }
    },

    /* Import metadata from data/* */
    async importDataDir({scrapbookData, dataFiles, dataDirIds}) {
      this.log(`Inspecting data files...`);
      for (const id of [...dataDirIds].sort()) {
        if (scrapbookData.meta[id]) { continue; }
        if (SPECIAL_ITEM_ID.has(id)) { continue; }

        const index = this.getIndexPath(dataFiles, id);

        let meta;
        let importedIndexDat = false;

        // import legacy ScrapBook item (check for index.html and index.dat)
        await (async () => {
          if (!(!index || index.endsWith('/index.html'))) { return; }

          const indexDatPath = `${id}/index.dat`;
          const indexDatFile = await dataFiles.getFile(indexDatPath);
          if (!indexDatFile) { return; }

          this.log(`Found '${this.dataDir}${indexDatPath}' for legacy ScrapBook. Importing...`);
          try {
            const text = await scrapbook.readFileAsText(indexDatFile);
            const indexDatMeta = this.parseIndexDat(text);
            if (!indexDatMeta) { return; }

            if (!scrapbookData.meta[id]) { scrapbookData.meta[id] = this.getDefaultMeta(); }
            this.mergeLegacyMeta(scrapbookData.meta[id], indexDatMeta);
            importedIndexDat = true;
          } catch (ex) {
            console.error(ex);
            this.error(`Error importing '${this.dataDir}${indexDatPath}': ${ex.message}`);
          }
        })();

        await (async () => {
          if (!index) { return; }

          meta = scrapbookData.meta[id] = scrapbookData.meta[id] || this.getDefaultMeta();

          /* meta.index */
          meta.index = index;

          /* meta.modify */
          // update using last modified time of the index file
          const fileModify = scrapbook.dateToId(new Date(dataFiles.get(index).lastModified));
          if (fileModify > meta.modify) { meta.modify = fileModify; }

          // skip importing index file if index.dat has been imported
          if (importedIndexDat) {
            return;
          }

          this.log(`Generating metadata entry from '${this.dataDir}${index}'...`);

          // import *.md as note
          if (this.isMarkdownFile(index)) {
            meta.type = "note";
            return;
          }

          try {
            const doc = await (async () => {
              if (this.isHtmlFile(index)) {
                return await scrapbook.readFileAsDocument(await dataFiles.getFile(index));
              } else if (this.isHtzFile(index)) {
                const zip = await new JSZip().loadAsync(await dataFiles.getFile(index));
                const ab = await zip.file("index.html").async("arraybuffer");
                const blob = new Blob([ab], {type: "text/html"});
                return await scrapbook.readFileAsDocument(blob);
              } else if (this.isMaffFile(index)) {
                // @TODO: support multiple entries in one maff file
                const zip = await new JSZip().loadAsync(await dataFiles.getFile(index), {createFolders: true});
                const zipDir = zip.folder(Object.keys(zip.files)[0]);
                const zipRdfFile = zipDir.file("index.rdf");
                if (zipRdfFile) {
                  let ab = await zipRdfFile.async("arraybuffer");
                  let blob = new Blob([ab], {type: "application/rdf+xml"});
                  const doc = await scrapbook.readFileAsDocument(blob);

                  const rdfMeta = scrapbook.parseMaffRdfDocument(doc);

                  // merge rdf metadata to scrapbookData.meta
                  if (rdfMeta.title) {
                    meta.title = rdfMeta.title;
                  }
                  if (rdfMeta.originalurl) {
                    meta.source = rdfMeta.originalurl;
                  }
                  if (rdfMeta.archivetime) {
                    meta.create = scrapbook.dateToId(new Date(rdfMeta.archivetime));
                  }

                  // load pointed index file
                  ab = await zipDir.file(rdfMeta.indexfilename).async("arraybuffer");
                  blob = new Blob([ab], {type: "text/html"});
                  return await scrapbook.readFileAsDocument(blob);
                } else {
                  for (const path in zipDir.files) {
                    const subPath = path.slice(zipDir.root.length);
                    if (subPath.startsWith("index.")) {
                      const ab = await zipDir.file(subPath).async("arraybuffer");
                      const blob = new Blob([ab], {type: "text/html"});
                      return await scrapbook.readFileAsDocument(blob);
                    }
                  }
                }
              }
            })();

            await (async () => {
              if (!doc) { throw new Error(`Unable to load index file '${this.dataDir}${index}'`); }

              /* Merge information from html document to meta */
              const html = doc.documentElement;

              /* meta.id */
              meta.id = html.hasAttribute('data-scrapbook-id') ? 
                  html.getAttribute('data-scrapbook-id') : 
                  meta.id;

              /* meta.type */
              meta.type = html.hasAttribute('data-scrapbook-type') ? 
                  html.getAttribute('data-scrapbook-type') : 
                  meta.type;

              /* meta.source */
              meta.source = html.hasAttribute('data-scrapbook-source') ? 
                  html.getAttribute('data-scrapbook-source') : 
                  meta.source;

              /* meta.title */
              meta.title = html.hasAttribute('data-scrapbook-title') ? 
                  html.getAttribute('data-scrapbook-title') : 
                  doc.title || meta.title || 
                  (meta.source ? scrapbook.urlToFilename(meta.source) : '') || 
                  (meta.type !== 'separator' ? id : '');

              /* meta.create */
              meta.create = html.hasAttribute('data-scrapbook-create') ? 
                  html.getAttribute('data-scrapbook-create') : 
                  meta.create;

              /* meta.icon */
              {
                let icon;
                if (html.hasAttribute('data-scrapbook-icon')) {
                  icon = html.getAttribute('data-scrapbook-icon');
                } else {
                  const favIconElem = doc.querySelector('link[rel~="icon"][href]');
                  if (favIconElem) {
                    icon = favIconElem.getAttribute('href');
                  }
                }
                meta.icon = icon || meta.icon;
              }

              /* meta.comment */
              meta.comment = html.hasAttribute('data-scrapbook-comment') ? 
                  html.getAttribute('data-scrapbook-comment') : 
                  meta.comment;

              /* meta.charset */
              meta.charset = html.hasAttribute('data-scrapbook-charset') ? 
                  html.getAttribute('data-scrapbook-charset') : 
                  meta.charset;

              /* meta.folder */
              meta.folder = html.hasAttribute('data-scrapbook-folder') ? 
                  html.getAttribute('data-scrapbook-folder') : 
                  meta.folder;

              /* meta.exported */
              meta.exported = html.hasAttribute('data-scrapbook-exported') ? 
                  html.getAttribute('data-scrapbook-exported') : 
                  meta.exported;
            })();
          } catch (ex) {
            console.error(ex);
            this.error(`Error inspecting '${this.dataDir}${index}': ${ex.message}`);
          }
        })();
      }
    },

    /* Fix meta and toc */
    async fixMetaToc({scrapbookData, dataFiles}) {
      /* Process metadata */
      this.log(`Inspecting metadata...`);

      // handle tweaked ID
      const indexIdMap = new Map();
      for (let id in scrapbookData.meta) {
        const meta = scrapbookData.meta[id];

        if (meta.id) {
          const newId = meta.id;
          // scrapbookData.meta[newId] is imported from meta#.js
          // scrapbookData.meta[id] is imported from dataDir
          if (newId !== id) {
            if (!scrapbookData.meta[newId]) {
              // scrapbookData.meta[newId] not used
              scrapbookData.meta[newId] = meta;
              delete(scrapbookData.meta[id]);
              this.log(`Tweaked '${id}' to '${newId}'.`);
              id = newId;
            } else if (scrapbookData.meta[newId].index === meta.index) {
              // scrapbookData.meta[newId] used by self
              delete(scrapbookData.meta[id]);
              this.log(`Tweaked '${id}' to '${newId}'. Discarded metadata of '${id}'.`);
              continue;
            } else {
              // scrapbookData.meta[newId] used by another item, mark this as invalid
              delete(scrapbookData.meta[id]);
              this.error(`Removed bad metadata entry '${id}': specified ID '${newId}' has been used.`);
              continue;
            }
          }
        }

        if (meta.index) {
          const indexId = indexIdMap.get(meta.index);
          if (indexId) {
            delete(scrapbookData.meta[id]);
            this.log(`Tweaked '${id}' to '${indexId}'. Discarded metadata of '${id}'.`);
            continue;
          }
          indexIdMap.set(meta.index, id);
        }
      }

      for (const id in scrapbookData.meta) {
        const meta = scrapbookData.meta[id];

        // remove stale items
        if (!['folder', 'separator', 'bookmark'].includes(meta.type)) {
          // index-dependant item: fix missing index file
          if (!meta.index || !dataFiles.has(meta.index)) {
            const index = this.getIndexPath(dataFiles, id);
            if (index) {
              const _index = meta.index || '';
              meta.index = index;
              this.error(`Missing index file '${_index}' for '${id}'. Shifted to '${index}'.`);
            } else {
              delete(scrapbookData.meta[id]);
              this.error(`Removed metadata entry for '${id}': Missing index file.`);
              continue;
            }
          }
        } else {
          // index-independant item: update index
          if (meta.index && !dataFiles.has(meta.index)) {
            meta.index = "";
            this.log(`Removed index file entry for '${id}': Missing index file.`);
          }
        }

        // fix meta

        /* meta.type */
        meta.type = meta.type || "";

        /* meta.source */
        meta.source = meta.source || "";

        /* meta.title */
        meta.title = meta.title || "";

        /* meta.modify */
        // fallback to current time
        meta.modify = meta.modify || scrapbook.dateToId();

        /* meta.create */
        // fallback to modify time
        meta.create = meta.create || meta.modify;

        /* meta.icon */
        meta.icon = meta.icon || "";
      }

      /* Remove stale items from TOC */
      // generate referredIds during the loop for later use
      this.log(`Inspecting TOC...`);
      const referredIds = new Set();
      for (const id in scrapbookData.toc) {
        if (!scrapbookData.meta[id] && !this.isSpecialItem(id)) {
          delete(scrapbookData.toc[id]);
          this.error(`Removed TOC entry '${id}': Missing metadata entry.`);
          continue;
        }

        scrapbookData.toc[id] = scrapbookData.toc[id].filter((refId) => {
          if (this.isSpecialItem(refId)) {
            this.error(`Removed TOC reference '${refId}' from '${id}': Invalid entry.`);
            return false;
          }
          if (!scrapbookData.meta[refId]) {
            this.error(`Removed TOC reference '${refId}' from '${id}': Missing metadata entry.`);
            return false;
          }
          referredIds.add(refId);
          return true;
        });

        if (!scrapbookData.toc[id].length && id !== 'root') {
          delete(scrapbookData.toc[id]);
          this.error(`Removed empty TOC entry '${id}'.`);
        }
      }

      /* Add new items to TOC */
      this.log(`Adding new items to TOC...`);

      const insertToToc = (id, toc, metas) => {
        if (!metas[id].folder) {
          this.log(`Appended '${id}' to root of TOC.`);
          toc['root'].push(id);
          return;
        }

        let parentIds = ['root'];
        for (const folder of metas[id].folder.split(/[\t\n\r\v\f]+/)) {
          const parentIdsNext = [];
          for (const parentId of parentIds) {
            if (!toc[parentId]) { continue; }
            for (const folderId of toc[parentId]) {
              if (scrapbookData.meta[folderId].title === folder) {
                parentIdsNext.push(folderId);
              }
            }
          }
          if (!parentIdsNext.length) {
            const folderId = this.generateFolder(folder, metas);
            const parentId = parentIds[parentIds.length - 1];
            if (!toc[parentId]) { toc[parentId] = []; }
            toc[parentId].push(folderId);
            parentIdsNext.push(folderId);
            this.log(`Generated folder '${folderId}' (${folder}) under '${parentId}'.`);
          }
          parentIds = parentIdsNext;
        }
        const parentId = parentIds[parentIds.length - 1];
        if (!toc[parentId]) { toc[parentId] = []; }
        toc[parentId].push(id);
        this.log(`Appended '${id}' to '${parentId}'.`);
      };

      for (const id of Object.keys(scrapbookData.meta).sort((a, b) => {
        const token_a = [scrapbookData.meta[a].exported, a];
        const token_b = [scrapbookData.meta[b].exported, b];
        if (token_a > token_b) { return 1; }
        if (token_a < token_b) { return -1; }
        return 0;
      })) {
        if (!referredIds.has(id) && !SPECIAL_ITEM_ID.has(id)) {
          insertToToc(id, scrapbookData.toc, scrapbookData.meta);
          const title = scrapbookData.meta[id].title;
        }

        // id, folder, and exported are temporary
        delete(scrapbookData.meta[id].id);
        delete(scrapbookData.meta[id].folder);
        delete(scrapbookData.meta[id].exported);
      }
    },

    /* Generate cache for favicon */
    async cacheFavicons({scrapbookData, dataFiles, treeFiles, zip}) {
      this.log(`Inspecting favicons...`);

      const getShaFile = (data) => {
        if (!data) { throw new Error(`Unable to fetch a file for this favicon URL.`); }

        let {ab, mime, ext} = data;

        // validate that we have a correct image mimetype
        if (!mime.startsWith('image/') && mime !== 'application/octet-stream') {
          throw new Error(`Invalid image mimetype '${mime}'.`);
        }

        // if no extension, generate one according to mime
        if (!ext) { ext = Mime.extension(mime); }

        const sha = scrapbook.sha1(ab, 'ARRAYBUFFER');
        return new File([ab], `${sha}${ext ? '.' + ext : ''}`, {type: mime});
      };

      // generate cache for every favicon with an absolute URL, data URL, or in-zip path
      const urlAccessMap = new Map();
      return await Promise.all(Object.keys(scrapbookData.meta).map(async (id) => {
        try {
          let {index, icon: favIconUrl} = scrapbookData.meta[id];
          index = index || "";

          if (!favIconUrl) { return; }

          // skip to avoid repeated prefixing of invalid URL
          if (favIconUrl.startsWith('urn:')) { return; }

          try {
            const file = await (async () => {
              if (favIconUrl.startsWith("data:")) {
                return scrapbook.dataUriToFile(favIconUrl, false);
              }

              if (scrapbook.isUrlAbsolute(favIconUrl)) {
                const prevAccess = urlAccessMap.get(favIconUrl);
                if (prevAccess) {
                  // this.log(`Using previuos access for '${favIconUrl}' for '${id}'.`);
                  return prevAccess;
                }

                const p = (async () => {
                  const headers = {};
                  let xhr;
                  try {
                    xhr = await scrapbook.xhr({
                      url: favIconUrl,
                      responseType: 'blob',
                      timeout: 5000,
                      onreadystatechange(xhr) {
                        if (xhr.readyState !== 2) { return; }

                        // get headers
                        if (xhr.status !== 0) {
                          const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
                          if (headerContentDisposition) {
                            const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
                            headers.filename = contentDisposition.parameters.filename;
                          }
                        }
                      },
                    });
                  } catch (ex) {
                    throw new Error(`Unable to fetch URL: ${ex.message}`);
                  }

                  const [, ext] = scrapbook.filenameParts(headers.filename || scrapbook.urlToFilename(xhr.responseURL));
                  const blob = xhr.response;
                  const mime = blob.type;

                  const ab = await scrapbook.readFileAsArrayBuffer(blob);
                  return getShaFile({ab, mime, ext});
                })();
                urlAccessMap.set(favIconUrl, p);
                return p;
              }

              if (this.isHtzFile(index) || this.isMaffFile(index)) {
                // skip obvious not in-zip path
                if (favIconUrl.startsWith('../')) { return; }

                // skip if the favicon is already in the tree/favicon directory
                const u1 = (new URL(favIconUrl, 'file:///' + scrapbook.escapeFilename(this.dataDir + index))).href;
                const u2 = (new URL('file:///' + scrapbook.escapeFilename(this.faviconDir))).href;
                if (u1.startsWith(u2)) { return; }

                const zip = await new JSZip().loadAsync(await dataFiles.getFile(index), {createFolders: true});

                const zipDir = this.isMaffFile(index) ? zip.folder(Object.keys(zip.files)[0]) : zip;
                const favIconPath = decodeURIComponent(favIconUrl);
                const zipFile = zipDir.file(favIconPath);

                if (!zipFile) {
                  throw new Error(`'${favIconPath}' does not exist in '${index}'.`);
                }

                const mime = Mime.lookup(zipFile.name);
                const [, ext] = scrapbook.filenameParts(zipFile.name);

                const ab = await zipFile.async('arraybuffer');
                return getShaFile({ab, mime, ext});
              }
            })();

            if (!file) { return; }

            const path = this.faviconDir + file.name;

            // A non-empty existed file is a duplicate since favicon files are named using a checksum.
            if (!treeFiles.has(path) || treeFiles.get(path).size === 0) {
              scrapbook.zipAddFile(zip, path, file, false);
              this.log(`Saved favicon '${scrapbook.crop(favIconUrl, 256)}' for '${id}' at '${path}'.`);
            } else {
              this.log(`Use saved favicon for '${scrapbook.crop(favIconUrl, 256)}' for '${id}' at '${path}'.`);
            }

            const url = scrapbook.getRelativeUrl(
              scrapbook.escapeFilename(path),
              scrapbook.escapeFilename(this.dataDir + index)
            );
            scrapbookData.meta[id].icon = url;
          } catch (ex) {
            console.error(ex);
            this.error(`Prefixed invalid favicon '${scrapbook.crop(favIconUrl, 256)}' for '${id}': ${ex.message}`);
            scrapbookData.meta[id].icon = `urn:scrapbook:icon:error:${favIconUrl}`;
          }
        } catch (ex) {
          console.error(ex);
          this.error(`Error inspecting favicon for '${id}': ${ex.message}`);
        }
      }));
    },

    /* Check for missing and unused favicons */
    async handleBadFavicons({scrapbookData, treeFiles, zip}) {
      const referedFavIcons = new Set();
      for (const id in scrapbookData.meta) {
        const meta = scrapbookData.meta[id];
        const u1 = new URL(meta.icon, 'file:///' + scrapbook.escapeFilename(this.dataDir + meta.index)).href;
        const u2 = new URL('file:///' + scrapbook.escapeFilename(this.faviconDir)).href;
        if (u1.startsWith(u2)) {
          const path = scrapbook.decodeURIComponent(u1.slice(8));
          referedFavIcons.add(path);

          if (!treeFiles.has(path) && !zip.files[path]) {
            this.error(`Missing favicon: '${path}' (used by '${id}')`);
          }
        }
      }

      for (const [path, file] of treeFiles.entries()) {
        if (path.startsWith(this.faviconDir)) {
          if (!referedFavIcons.has(path)) {
            if (file.size > 0) {
              this.error(`Unused favicon: '${path}'`);

              // generate an empty icon file to replace it
              const newFile = new Blob([""], {type: "application/octet-stream"});
              scrapbook.zipAddFile(zip, path, newFile, false, {comment: 'emptying'});
            } else {
              this.error(`Unused favicon (emptied): '${path}'`);
            }
          }
        }
      }
    },
    
    /* Generate index pages, meta, toc, resource files, etc. */
    async generateFiles({scrapbookData, treeFiles, zip}) {
      this.log(`Checking for created and updated files...`);

      let metaFiles = 0;
      let tocFiles = 0;

      /* tree/meta#.js */
      // A javascript string >= 256 MiB (UTF-16 chars) causes an error
      // in the browser. Split each js file at around 256 K items to
      // prevent the issue. (An item is mostly < 512 bytes)
      {
        const exportFile = (meta, i) => {
          const content = this.generateMetaFile(meta);
          const file = new Blob([content], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, `${this.treeDir}meta${i || ""}.js`, file, true);
        };

        const sizeThreshold = 256 * 1024;
        let i = 0;
        let size = 1;
        let meta = {};
        for (const id in scrapbookData.meta) {
          meta[id] = scrapbookData.meta[id];
          size += 1;

          if (size >= sizeThreshold) {
            exportFile(meta, i);
            i += 1;
            size = 0;
            meta = {};
          }
        }
        if (size) {
          exportFile(meta, i);
          i += 1;
        }
        metaFiles = i;

        // fill an empty file for unused tree/meta#.js
        for (; ; i++) {
          const path = `${this.treeDir}meta${i}.js`;
          if (!treeFiles.has(path)) { break; }

          const file = new Blob([""], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, path, file, true);
        }
      }

      /* tree/toc#.js */
      // A javascript string >= 256 MiB (UTF-16 chars) causes an error
      // in the browser. Split each js file at around 4 M entries to
      // prevent the issue. (An entry is mostly < 32 bytes)
      {
        const exportFile = (toc, i) => {
          const content = this.generateTocFile(toc);
          const file = new Blob([content], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, `${this.treeDir}toc${i || ""}.js`, file, true);
        };

        const sizeThreshold = 4 * 1024 * 1024;
        let i = 0;
        let size = 1;
        let toc = {};
        for (const id in scrapbookData.toc) {
          toc[id] = scrapbookData.toc[id];
          size += 1 + toc[id].length;

          if (size >= sizeThreshold) {
            exportFile(toc, i);
            i += 1;
            size = 0;
            toc = {};
          }
        }
        if (size) {
          exportFile(toc, i);
          i += 1;
        }
        tocFiles = i;

        // fill an empty file for unused tree/toc#.js
        for (; ; i++) {
          const path = `${this.treeDir}toc${i}.js`;
          if (!treeFiles.has(path)) { break; }

          const file = new Blob([""], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, path, file, true);
        }
      }

      /* tree/index.html */
      if (this.options["indexer.createStaticIndex"]) {
        const content = this.generateMapFile(scrapbookData, "index", metaFiles, tocFiles);
        const file = new Blob([content], {type: "text/html"});
        scrapbook.zipAddFile(zip, `${this.treeDir}index.html`, file, true);
      }

      /* tree/map.html */
      {
        const content = this.generateMapFile(scrapbookData, "map", metaFiles, tocFiles);
        const file = new Blob([content], {type: "text/html"});
        scrapbook.zipAddFile(zip, `${this.treeDir}map.html`, file, true);
      }

      /* tree/frame.html */
      {
        const content = this.generateFrameFile(scrapbookData);
        const file = new Blob([content], {type: "text/html"});
        scrapbook.zipAddFile(zip, `${this.treeDir}frame.html`, file, true);
      }

      /* tree/search.html */
      {
        const content = this.generateSearchFile(scrapbookData);
        const file = new Blob([content], {type: "text/html"});
        scrapbook.zipAddFile(zip, `${this.treeDir}search.html`, file, true);
      }

      /* resource files */
      const resToInclude = {
        [this.treeDir + "icon/toggle.png"]: browser.runtime.getURL("resources/toggle.png"),
        [this.treeDir + "icon/search.png"]: browser.runtime.getURL("resources/search.png"),
        [this.treeDir + "icon/collapse.png"]: browser.runtime.getURL("resources/collapse.png"),
        [this.treeDir + "icon/expand.png"]: browser.runtime.getURL("resources/expand.png"),
        [this.treeDir + "icon/external.png"]: browser.runtime.getURL("resources/external.png"),
        [this.treeDir + "icon/item.png"]: browser.runtime.getURL("resources/item.png"),
        [this.treeDir + "icon/fclose.png"]: browser.runtime.getURL("resources/fclose.png"),
        [this.treeDir + "icon/fopen.png"]: browser.runtime.getURL("resources/fopen.png"),
        [this.treeDir + "icon/file.png"]: browser.runtime.getURL("resources/file.png"),
        [this.treeDir + "icon/note.png"]: browser.runtime.getURL("resources/note.png"),  // ScrapBook X notex
        [this.treeDir + "icon/postit.png"]: browser.runtime.getURL("resources/postit.png"),  // ScrapBook X note
      };

      for (const path in resToInclude) {
        if (treeFiles.has(path)) { continue; }

        try {
          const xhr = await scrapbook.xhr({
            url: resToInclude[path],
            responseType: 'blob',
          });
          const blob = xhr.response;
          scrapbook.zipAddFile(zip, path, blob, false);
        } catch (ex) {
          this.error(`Error adding file '${path}' to zip: ${ex.message}`);
        }
      }
    },

    /* Generate fulltext cache */
    async generateFulltextCache({scrapbookData, dataFiles, treeFiles, zip}) {
      this.log(`Generating fulltext cache...`);
      let cacheLastModified = 0;

      /* Import tree/fulltext*.js */
      for (let i = 0; ; i++) {
        const path = `${this.treeDir}fulltext${i || ""}.js`;
        const file = await treeFiles.getFile(path);
        if (!file) { break; }

        this.log(`Importing '${path}'...`);
        try {
          const text = await scrapbook.readFileAsText(file);
          if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
            throw new Error(`Failed to retrieve JSON data.`);
          }

          const data = JSON.parse(RegExp.$1);
          scrapbookData.fulltext = Object.assign(scrapbookData.fulltext, data);
          cacheLastModified = Math.max(file.lastModified, cacheLastModified);
        } catch (ex) {
          this.error(`Error importing '${path}': ${ex.message}`);
        }
      }

      /* Remove stale cache for nonexist items */
      for (const id in scrapbookData.fulltext) {
        if (!scrapbookData.meta[id]) {
          delete(scrapbookData.fulltext[id]);
          this.log(`Removed stale cache for '${id}'.`);
        }
      }

      /* Build cache for items */
      await (async () => {
        const getIndexPaths = async () => {
          if (this.isMaffFile(index)) {
            itemZip = itemZip || await new JSZip().loadAsync(await dataFiles.getFile(index), {createFolders: true});
            return await scrapbook.getMaffIndexFiles(itemZip);
          } else if (this.isHtzFile(index)) {
            return ['index.html'];
          }

          return [scrapbook.filepathParts(index)[1]];
        };

        const getFile = async (path, lazy = false) => {
          if (this.isHtzFile(index) || this.isMaffFile(index)) {
            const [base, filename] = scrapbook.filepathParts(path);
            itemZip = itemZip || await new JSZip().loadAsync(await dataFiles.getFile(index), {createFolders: true});

            const file = itemZip.file(path);
            if (!file) { return file; }

            const ab = await file.async("arraybuffer");
            return new File([ab], filename, {type: Mime.lookup(filename)});
          } else {
            if (path === '.') {
              return lazy ? dataFiles.get(index) : await dataFiles.getFile(index);
            }

            let [base] = scrapbook.filepathParts(index);
            base = base ? base + '/' : '';
            return lazy ? dataFiles.get(base + path) : await dataFiles.getFile(base + path);
          }
        };

        const getFulltextCache = async (path) => {
          const file = await getFile(path);
          return await getFulltextCacheForFile(path, file);
        };

        const getFulltextCacheForFile = async (path, file) => {
          if (!file) { return null; }

          const mime = scrapbook.parseHeaderContentType(file.type).type;

          if (["text/html", "application/xhtml+xml"].includes(mime)) {
            return await getFulltextCacheHtml(path, file);
          } else if (mime.startsWith("text/")) {
            return await getFulltextCacheTxt(path, file);
          }
        };

        const getFulltextCacheHtml = async (path, file) => {
          const doc = await scrapbook.readFileAsDocument(file);
          if (!doc) { return null; }

          const getRelativeFilePath = (url) => {
            const base = getRelativeFilePath.base = getRelativeFilePath.base || 
                'file:///!/';
            const ref = getRelativeFilePath.ref = getRelativeFilePath.ref || 
                new URL(path.replace(/[^/]+/g, m => encodeURIComponent(m)), base).href;
            const [urlMain] = scrapbook.splitUrlByAnchor(url);

            let target;
            try {
              target = new URL(urlMain, ref).href;
            } catch (ex) {
              // urlMain cannot be resolved
            }
            if (!target) { return null; }
            if (!target.startsWith(base)) { return null; }
            if (target === ref) { return null; } // ignore referring self
            return decodeURIComponent(target.slice(base.length));
          };

          // @TODO: better handle content
          // (no space between inline nodes, line break between block nodes, etc.)
          const getElementTextRecursively = async (elem) => {
            for (const child of elem.childNodes) {
              if (child.nodeType === 1) {
                const nodeName = child.nodeName.toLowerCase();
                if (["a", "area"].includes(nodeName)) {
                  if (child.hasAttribute("href")) {
                    const url = child.getAttribute("href");
                    if (url.startsWith("data:")) {
                      await addDataUriContent(url);
                    } else {
                      const target = getRelativeFilePath(url);
                      if (target && !filesToUpdate.has(target)) { filesToUpdate.set(target, true); }
                    }
                  }
                } else if (["iframe", "frame"].includes(nodeName)) {
                  if (child.hasAttribute("src")) {
                    const url = child.getAttribute("src");
                    if (url.startsWith("data:")) {
                      await addDataUriContent(url);
                    } else {
                      const target = getRelativeFilePath(url);
                      if (target) {
                        if (this.options["indexer.fulltextCacheFrameAsPageContent"]) {
                          // Add frame content to current page content if the targeted
                          // file hasn't been indexed.
                          if (filesToUpdate.get(target) !== false) {
                            filesToUpdate.set(target, false);
                            const fulltext = await getFulltextCache(target);
                            if (fulltext) { results.push(fulltext); }
                          }
                        } else {
                          if (!filesToUpdate.has(target)) { filesToUpdate.set(target, true); }
                        }
                      }
                    }
                  }
                }
                if (!child.closest(FULLTEXT_NO_INDEX_SELECTOR)) {
                  await getElementTextRecursively(child);
                }
              } else if (child.nodeType === 3) {
                results.push(child.nodeValue);
              }
            }
          };

          const addDataUriContent = async (url) => {
            const file = scrapbook.dataUriToFile(url);
            const fulltext = await getFulltextCacheForFile("", file);
            if (fulltext) { results.push(fulltext); }
          };

          const results = [];

          // check for a potential meta refresh (mostly for file item)
          let hasInstantRedirect = false;
          for (const metaRefreshElem of doc.querySelectorAll('meta[http-equiv="refresh"][content]')) {
            if (metaRefreshElem.closest(FULLTEXT_NO_META_REFRESH_SELECTOR)) { continue; }

            const {time, url} = scrapbook.parseHeaderRefresh(metaRefreshElem.getAttribute("content"));
            if (time === 0) { hasInstantRedirect = true; }
            if (url) {
              if (url.startsWith("data:")) {
                await addDataUriContent(url);
              } else {
                const target = getRelativeFilePath(url);
                if (target && !filesToUpdate.has(target)) { filesToUpdate.set(target, true); }
              }
            }
          }

          if (hasInstantRedirect) {
            if (results.length) {
              return results.join(" ").replace(/\s+/g, " ");
            }

            return null;
          }

          await getElementTextRecursively(doc);
          return results.join(" ").replace(/\s+/g, " ");
        };

        const getFulltextCacheTxt = async (path, file) => {
          const text = await scrapbook.readFileAsText(file, meta.charset || 'UTF-8') || null;
          if (!text) { return text; }

          return text.replace(/\s+/g, " ");
        };

        let meta;
        let index;
        let itemZip;
        let itemLoaderData;
        let filesToUpdate;

        for (const id in scrapbookData.meta) {
          try {
            meta = scrapbookData.meta[id];
            index = meta.index;

            const file = index && dataFiles.get(index);

            // no index file: remove cache
            if (!file) {
              if (scrapbookData.fulltext[id]) {
                delete(scrapbookData.fulltext[id]);
                this.log(`Removed stale cache for '${id}'.`);
              }
              continue;
            }

            filesToUpdate = new Map();
            itemZip = null;
            itemLoaderData = null;

            /* determine the files to be cached */
            await (async () => {
              // if no existed fulltext cache, rebuild as default
              // (for index and referred files)
              if (!scrapbookData.fulltext[id]) {
                this.log(`Creating cache for '${id}'...`);

                scrapbookData.fulltext[id] = {};
                (await getIndexPaths()).forEach((filePath) => {
                  filesToUpdate.set(filePath, true);
                });
                return;
              }

              // rebuild partial
              // For folder: check index and all cached files, and rebuild updated ones
              // For archive or single HTML: rebuild all entries if the archive file is changed

              // check update for index file / archive file
              if (file.lastModified > cacheLastModified) {
                // updated: add to update list
                (await getIndexPaths()).forEach((filePath) => {
                  filesToUpdate.set(filePath, true);
                });
              }

              // check update for files that has a fulltext cache
              if (this.isHtmlFile(index)) {
                for (let filePath in scrapbookData.fulltext[id]) {
                  // replace deprecated filePath "."
                  if (filePath === '.') {
                    const filePathNew = scrapbook.filepathParts(index)[1];
                    scrapbookData.fulltext[id][filePathNew] = scrapbookData.fulltext[id][filePath];
                    delete(scrapbookData.fulltext[id][filePath]);
                    filePath = filePathNew;
                  }

                  const file = await getFile(filePath, true);
                  if (!file) {
                    // removed: remove the cache
                    delete(scrapbookData.fulltext[id][filePath]);
                    filesToUpdate.set(filePath, true);
                  } else if (file.lastModified > cacheLastModified) {
                    // updated: add to update list
                    filesToUpdate.set(filePath, true);
                  }
                }
              }

              if (filesToUpdate.size > 0) {
                // at least one file to update
                this.log(`Updating cache for '${id}'...`);

                if (!this.isHtmlFile(index)) {
                  scrapbookData.fulltext[id] = {};
                }
              }
            })();

            /* build cache for filesToUpdate Set */
            for (const filePath of filesToUpdate.keys()) {
              if (!filesToUpdate.get(filePath)) {
                delete(scrapbookData.fulltext[id][filePath]);
                continue;
              }

              filesToUpdate.set(filePath, false);
              const fulltext = await getFulltextCache(filePath) || null;
              if (fulltext === null) {
                delete(scrapbookData.fulltext[id][filePath]);
              } else {
                scrapbookData.fulltext[id][filePath] = {
                  content: fulltext || '',
                };
              }
            }
          } catch (ex) {
            console.error(ex);
            this.error(`Error generating cache for '${id}': ${ex.message}`);
          }
        }
      })();

      /* Generate files */
      {
        /* tree/fulltext#.js */
        // A javascript string >= 256 MiB (UTF-16 chars) causes an error
        // in the browser. Split each js file at at around 128 MiB to
        // prevent the issue.
        const exportFile = (fulltext, i) => {
          const content = this.generateFulltextFile(fulltext);
          const file = new Blob([content], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, `${this.treeDir}fulltext${i || ""}.js`, file, true);
        };

        const sizeThreshold = 128 * 1024 * 1024;
        let i = 0;
        let size = 1;
        let fulltext = {};
        for (const id in scrapbookData.fulltext) {
          fulltext[id] = scrapbookData.fulltext[id];
          for (const filePath in fulltext[id]) {
            size += fulltext[id][filePath].content.length;
          }
          if (size >= sizeThreshold) {
            exportFile(fulltext, i);
            i += 1;
            size = 0;
            fulltext = {};
          }
        }
        if (size) {
          exportFile(fulltext, i);
          i += 1;
        }

        // fill an empty file for unused tree/fulltext#.js
        for (; ; i++) {
          const path = `${this.treeDir}fulltext${i}.js`;
          if (!treeFiles.has(path)) { break; }

          const file = new Blob([""], {type: "application/javascript"});
          scrapbook.zipAddFile(zip, path, file, true);
        }
      }
    },

    async generateRssFeed({scrapbookData, zip}) {
      if (!scrapbookData.base) {
        this.log(`Skip generating RSS feed since base URL is not defined...`);
        return;
      }

      this.log(`Generating RSS feed...`);

      const NS = "http://www.w3.org/2005/Atom";
      const u = new URL(scrapbookData.base);
      const ID_PREFIX = `urn:webscrapbook:${u.host}${u.pathname}`.replace(/\/+$/g, '');

      const entries = Array.from(Object.entries(scrapbookData.meta))
        .map(x => ({
          id: x[0],
          modify: x[1].modify || x[1].create,
          item: x[1],
        }))
        .filter(({item}) => !["folder", "separator"].includes(item.type))
        .sort(item => item.modify)
        .reverse()
        .slice(0, 50);

      const xmlStr = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="${NS}"></feed>`;

      const doc = (new DOMParser()).parseFromString(xmlStr, "application/xml");
      const rootElem = doc.documentElement;

      var elem = rootElem.appendChild(doc.createElementNS(NS, "id"));
      elem.textContent = ID_PREFIX;

      var elem = rootElem.appendChild(doc.createElementNS(NS, "link"));
      elem.setAttribute("rel", "self");
      elem.setAttribute("href",
          new URL(scrapbook.escapeFilename(this.treeDir) + 'feed.atom', scrapbookData.base).href);

      var elem = rootElem.appendChild(doc.createElementNS(NS, "link"));
      elem.setAttribute("href",
          new URL(scrapbook.escapeFilename(this.treeDir) + 'map.html', scrapbookData.base).href);

      var elem = rootElem.appendChild(doc.createElementNS(NS, "title"));
      elem.setAttribute("type", "text");
      elem.textContent = scrapbookData.title || "";

      var elem = rootElem.appendChild(doc.createElementNS(NS, "updated"));
      elem.textContent = entries.length ? 
          scrapbook.idToDate(entries[0].modify).toISOString() : 
          new Date(0).toISOString();

      for (const entry of entries) {
        var entryElem = rootElem.appendChild(doc.createElementNS(NS, "entry"));

        var elem = entryElem.appendChild(doc.createElementNS(NS, "id"));
        elem.textContent = ID_PREFIX + ":" + encodeURIComponent(entry.id);

        var elem = entryElem.appendChild(doc.createElementNS(NS, "link"));
        elem.setAttribute("href",
            entry.item.type === "bookmark" ? 
                entry.item.source : 
                new URL(scrapbook.escapeFilename(this.dataDir + entry.item.index), scrapbookData.base));

        var elem = entryElem.appendChild(doc.createElementNS(NS, "title"));
        elem.setAttribute("type", "text");
        elem.textContent = entry.item.title;

        var elem = entryElem.appendChild(doc.createElementNS(NS, "published"));
        elem.textContent = scrapbook.idToDate(entry.item.create).toISOString();

        var elem = entryElem.appendChild(doc.createElementNS(NS, "updated"));
        elem.textContent = scrapbook.idToDate(entry.modify).toISOString();

        var elem = entryElem.appendChild(doc.createElementNS(NS, "author"));
        var elem = elem.appendChild(doc.createElementNS(NS, "name"));
        elem.textContent = "Anonymous";
      }

      const file = new Blob([new XMLSerializer().serializeToString(doc)], {type: "application/atom+xml"});
      scrapbook.zipAddFile(zip, this.treeDir + 'feed.atom', file, true);
    },

    /* Remove same files and generate backup files */
    async checkSameAndBackup({scrapbookData, treeFiles, zip}) {
      for (const [path, zipObj] of Object.entries(zip.files)) {
        if (zipObj.dir) { continue; }
        if (!path.startsWith(this.treeDir)) { continue; }
        if (path.startsWith(this.cacheDir)) { continue; }

        const bakPath = this.treeBakDir + path.slice(this.treeDir.length);
        const oldFile = await treeFiles.getFile(path);

        if (!oldFile) { continue; }

        // @TODO: Maybe binary compare is better than sha compare?
        try {
          const shaOld = scrapbook.sha1(await scrapbook.readFileAsArrayBuffer(oldFile), 'ARRAYBUFFER');
          const shaNew = scrapbook.sha1(await zipObj.async('arraybuffer'), 'ARRAYBUFFER');
          if (shaOld !== shaNew) {
            scrapbook.zipAddFile(zip, bakPath, oldFile, null, {date: oldFile.lastModifiedDate});
          } else {
            zip.remove(path);
          }
        } catch (ex) {
          console.error(ex);
          this.error(`Error checking file ${path}: ${ex.message}`);
        }
      }
    },

    /* Generate the zip file and download it */
    async makeZipAndDownload({scrapbookData, zip}) {
      // check if there is a new file
      let hasNewFile = false;
      for (const path in zip.files) {
        const zipObj = zip.files[path];
        if (!zipObj.dir) {
          hasNewFile = true;
          break;
        }
      }
      if (!hasNewFile) {
        this.log(`Current files are already up-to-date.`);
        return;
      }

      // server
      if (this.serverData.isIndexingServer) {
        this.log(`Uploading changed files to server...`);
        const book = this.serverData.book;

        await book.lockTree();

        try {
          // ensure tree not changed during the indexing
          if (!await book.validateTree()) {
            throw new Error("Tree data in the server has been changed. Run indexer again and do not modify the scrapbook during the indexing process.");
          }

          // delete previous backup folder
          try {
            const target = book.topUrl + scrapbook.escapeFilename(this.treeBakDir);
            await server.request({
              url: target + '?a=delete',
              method: 'POST',
              format: 'json',
              csrfToken: true,
            });
          } catch (ex) {
            // ignore
          }

          for (const [inZipPath, zipObj] of Object.entries(zip.files)) {
            if (zipObj.dir) { continue; }

            // delete emptying favicons
            if (inZipPath.startsWith(this.faviconDir) && zipObj.comment === "emptying") {
              const target = book.topUrl + scrapbook.escapeFilename(inZipPath);
              await server.request({
                url: target + '?a=delete',
                method: 'POST',
                format: 'json',
                csrfToken: true,
              });
              continue;
            }

            const file = new File(
              [await zipObj.async('blob')],
              inZipPath.split('/').pop(),
              {type: "application/octet-stream"}
            );
            const target = book.topUrl + scrapbook.escapeFilename(inZipPath);
            await server.request({
              url: target + '?a=save',
              method: 'POST',
              format: 'json',
              csrfToken: true,
              body: {
                upload: file,
              },
            });
          }
        } finally {
          await book.unlockTree();
        }

        return;
      }

      // download zip
      this.log(`Generating zip file...`);
      const blob = await zip.generateAsync({type: "blob"});

      /* Download the blob */
      const filename = `${scrapbookData.title}.zip`;

      if (scrapbook.userAgent.is('gecko')) {
        // Firefox has a bug that the screen turns unresponsive
        // when an addon page is redirected to a blob URL.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
        //
        // Workaround by creating the anchor in an iframe.
        const iDoc = this.downloader.contentDocument;
        const a = iDoc.createElement('a');
        a.download = filename;
        a.href = URL.createObjectURL(blob);
        iDoc.body.appendChild(a);
        a.click();
        a.remove();

        // In case the download still fails.
        const file = new File([blob], filename, {type: "application/octet-stream"});
        const elem = document.createElement('a');
        elem.target = 'download';
        elem.href = URL.createObjectURL(file);
        elem.textContent = `If the download doesn't start, click me.`;
        this.logger.appendChild(elem);
        this.log('');
        return;
      }

      const elem = document.createElement('a');
      elem.download = filename;
      elem.href = URL.createObjectURL(blob);
      elem.textContent = `If the download doesn't start, click me.`;
      this.logger.appendChild(elem);
      elem.click();
      this.log('');
    },

    getIndexPath(dataFiles, id) {
      let index;

      index = `${id}/index.html`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}/index.md`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.html`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.htm`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.xhtml`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.xht`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.md`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.maff`;
      if (dataFiles.has(index)) { return index; }

      index = `${id}.htz`;
      if (dataFiles.has(index)) { return index; }

      return null;
    },

    isHtmlFile(path) {
      const p = path.toLowerCase();
      return p.endsWith('.html') || p.endsWith('.htm') || 
          p.endsWith('.xhtml') || p.endsWith('.xht');
    },

    isHtzFile(path) {
      const p = path.toLowerCase();
      return p.endsWith('.htz');
    },

    isMaffFile(path) {
      const p = path.toLowerCase();
      return p.endsWith('.maff');
    },

    isMarkdownFile(path) {
      const p = path.toLowerCase();
      return p.endsWith('.md');
    },

    getDefaultMeta() {
      return {
        id: undefined,
        index: undefined,
        title: undefined,
        type: undefined,
        create: undefined,
        modify: undefined,
        source: undefined,
        icon: undefined,
        comment: undefined,
        charset: undefined,
        marked: undefined,
        locked: undefined,
        folder: undefined,
        exported: undefined,
      };
    },

    parseIndexDat(text) {
      const data = text.split('\n');
      if (data.length < 2) { return null; }
      const meta = this.getDefaultMeta();
      for (const d of data) {
        const [key, ...values] = d.split('\t');
        if (!values.length) { continue; }
        meta[key] = values.join('\t');
      }
      return meta;
    },

    /**
     * @param {Object} newMeta - current scrapbookData.meta[id] object, will be modified
     * @param {Object} legacyMeta - meta object from legacy ScrapBook X
     */
    mergeLegacyMeta(newMeta, legacyMeta) {
      const id = legacyMeta.id;

      const meta = JSON.parse(JSON.stringify(legacyMeta));

      /* meta.type, meta.marked */
      meta.type = {
        "note": "postit",
        "notex": "note",
        "combine": "site",
      }[meta.type] || meta.type || "";

      if (meta.type == "marked") {
        meta.type = "";
        meta.marked = true;
      }

      /* meta.create */
      meta.create = meta.create ? scrapbook.dateToId(scrapbook.idToDateOld(meta.create)) : "";

      /* meta.modify */
      meta.modify = meta.modify ? scrapbook.dateToId(scrapbook.idToDateOld(meta.modify)) : "";

      /* meta.icon */
      const resProtocolBase = `resource://scrapbook/data/${id}/`;
      const resProtocolBase2 = `resource://scrapbook/icon/`;
      meta.icon = meta.icon || "";
      if (meta.icon.startsWith(resProtocolBase)) {
        meta.icon = meta.icon.slice(resProtocolBase.length);
      } else if (meta.icon.startsWith(resProtocolBase2)) {
        meta.icon = scrapbook.getRelativeUrl(meta.icon, "resource://scrapbook/data/" + (newMeta.index || "").replace(/[/][^/]+$/, '/'));
      } else if (meta.icon.startsWith('moz-icon://')) {
        meta.icon = "";
      }

      /* meta.comment */
      meta.comment = meta.comment ? meta.comment.replace(/ __BR__ /g, '\n') : "";

      /* meta.charset */
      if (meta.chars) {
        meta.charset = meta.chars;
      }
      delete(meta.chars);

      /* meta.locked */
      if (meta.lock) {
        meta.locked = true;
      }
      delete(meta.lock);

      /* meta.container */
      delete(meta.container);

      /* meta.exported */
      if (meta.exported) {
        meta.exported = scrapbook.dateToId(new Date(meta.exported));
      }

      newMeta = Object.assign(newMeta, meta);
    },

    getUniqueId(id, metas) {
      if (!metas[id]) { return id; }

      const d = scrapbook.idToDate(id);
      let v = d.valueOf();
      do {
        v += 1;
        d.setTime(v);
        id = scrapbook.dateToId(d);
      } while (metas[id]);

      return id;
    },

    generateFolder(title, metas) {
      const folderId = this.getUniqueId(scrapbook.dateToId(), metas);
      const meta = metas[folderId] = this.getDefaultMeta();
      meta.type = 'folder';
      meta.title = title;
      meta.create = folderId;
      return folderId;
    },

    generateMetaFile(jsonData) {
      return `/**
 * Feel free to edit this file, but keep data code valid JSON format.
 */
scrapbook.meta(${JSON.stringify(jsonData, null, 2)})`;
    },

    generateTocFile(jsonData) {
      return `/**
 * Feel free to edit this file, but keep data code valid JSON format.
 */
scrapbook.toc(${JSON.stringify(jsonData, null, 2)})`;
    },

    generateFulltextFile(jsonData) {
      return `/**
 * This file is generated by WebScrapBook and is not intended to be edited.
 */
scrapbook.fulltext(${JSON.stringify(jsonData, null, 1)})`;
    },

    /**
     * The generated page ought to work on most browsers.
     *
     * Beware of cross-browser compatibility, basicly comply with CSS 2.1
     * and ECMAscript 3 or provide a fallback.
     *
     * - Avoid Node.textContent (IE < 9)
     *
     * Also remember to escape '\' with '\\' in this long string.
     */
    generateMapFile(scrapbookData, fileType, metaFiles = 1, tocFiles = 1) {
      const loadMetaJs = () => {
        let result = [];
        for (let i = 0; i < metaFiles; i++) {
          result.push(`<script src="meta${i || ""}.js"></script>`);
        }
        return result.join("\n");
      };

      const loadTocJs = () => {
        let result = [];
        for (let i = 0; i < tocFiles; i++) {
          result.push(`<script src="toc${i || ""}.js"></script>`);
        }
        return result.join("\n");
      };

      const addChildItems = (parentId) => {
        let toc = scrapbookData.toc[parentId];
        if (!toc) { return; }

        toc = toc.filter(id => id in scrapbookData.meta && !itemSet.has(id));
        if (!toc.length) { return; }

        itemHtml += ' '.repeat(indent) + '<ul class="scrapbook-container">\n';
        indent += 2;
        for (const id of toc) {
          const meta = scrapbookData.meta[id];

          const classes = [];
          if (meta.type) { classes.push(`scrapbook-type-${meta.type}`); }
          if (meta.marked) { classes.push(`scrapbook-marked`); }
          const className = classes.join(' ');

          itemHtml += ' '.repeat(indent) + `<li id="item-${scrapbook.escapeHtml(id)}"${className ? ' class="' + scrapbook.escapeHtml(className) + '"' : ''}>\n`;
          indent += 2;

          itemSet.add(id);

          if (meta.type !== 'separator') {
            let title = scrapbook.escapeHtml(meta.title || id, true, false, true);

            let href = (meta.type === 'bookmark' && meta.source) ?
                meta.source :
                (scrapbook.getRelativeUrl(scrapbook.escapeFilename(this.dataDir), scrapbook.escapeFilename(this.treeDir)) + scrapbook.escapeFilename(meta.index || ""));
            href = meta.type !== 'folder' ? ' href="' + scrapbook.escapeHtml(href) + '"' : '';

            let icon = meta.icon ?
                (/^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
                    meta.icon : 
                    (scrapbook.getRelativeUrl(scrapbook.escapeFilename(this.dataDir), scrapbook.escapeFilename(this.treeDir)) + scrapbook.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon) : 
                ({
                  'folder': 'icon/fclose.png',
                  'file': 'icon/file.png',
                  'note': 'icon/note.png',
                  'postit': 'icon/postit.png',
                }[meta.type] || 'icon/item.png');
            icon = scrapbook.escapeHtml(icon);

            itemHtml += ' '.repeat(indent) + `<div><a${href}><img src="${icon}" alt="">${title}</a></div>\n`;
          } else {
            let title = scrapbook.escapeHtml(meta.title || '', true, false, true);

            itemHtml += ' '.repeat(indent) + `<div><fieldset><legend>&nbsp;${title}&nbsp;</legend></fieldset></div>\n`;
          }
          addChildItems(id);

          indent -= 2;
          itemHtml += ' '.repeat(indent) + `</li>\n`;
        }
        indent -= 2;
        itemHtml += ' '.repeat(indent) + '</ul>\n';
      };

      const itemSet = new Set(['root', 'hidden', 'recycle']);
      let itemHtml = '';
      let indent = 0;
      if (fileType === 'index') {
        itemHtml += '<div id="item-root">\n';
        addChildItems('root');
        itemHtml += '</div>\n';
      }

      const feed = this.options["indexer.createRssFeed"] && scrapbookData.base ? 
          `<link rel="alternate" type ="application/rss+xml" title="Atom Feed" href="feed.atom">\n` : 
          "";

      return `<!DOCTYPE html>
<!--
  This file is generated by WebScrapBook and is not intended to be edited.
  Create ${fileType}.css and/or ${fileType}.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="${fileType}">
<head>
<base target="main">
<meta charset="UTF-8">
<title>${scrapbook.escapeHtml(scrapbookData.title || "", true)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${feed}<style>
html {
  height: 100%;
}

body {
  margin: 0;
  padding: 0;
  line-height: 1.35em;
}

#header {
  margin-bottom: .75em;
  border: 1px solid #A0A0A0;
  padding: .125em .5em;
  background-color: #FFFFE1;
}

#header > a {
  color: #666666;
}

#search img {
  margin: 0;
  width: 1.5em;
  height: 1em;
}

#item-root {
  padding: 0 1.5em;
}

ul {
  margin: 0;
  padding: 0;
}

li {
  list-style-type: none;
  margin: .2em 0;
  padding-${scrapbook.lang('@@bidi_start_edge')}: 1em;
}

li > div {
  margin-${scrapbook.lang('@@bidi_start_edge')}: -1em;
  white-space: nowrap;
}

li > div:hover {
  background-color: rgba(196, 221, 252, 0.3);
}

li > div:focus {
  outline-style: auto;
  background-color: rgba(196, 221, 252, 1);
}

a {
  text-decoration: none;
  color: #000000;
}

a:focus {
  outline-style: auto;
  background-color: rgba(196, 221, 252, 1);
}

a > img {
  display: inline-block;
  margin: 0 .2em;
  border: none;
  width: 1em;
  height: 1em;
  vertical-align: middle;
}

a.scrapbook-toggle {
  margin-${scrapbook.lang('@@bidi_start_edge')}: -1em;
}

a.scrapbook-toggle > img {
  margin: 0;
}

a.scrapbook-external > img {
  margin: 0 .1em;
  width: .7em;
  height: .7em;
  vertical-align: top;
}

.scrapbook-type-bookmark > div > a {
  color: rgb(32,192,32);
}

.scrapbook-type-note > div > a {
  color: rgb(80,0,32);
}

.scrapbook-type-site > div > a {
  color: blue;
}

.scrapbook-type-separator > div > fieldset {
  margin: 0;
  border: none;
  border-top: 1px solid #aaa;
  padding: 0 0 0 1em;
  text-indent: 0;
}

.scrapbook-type-separator > div > fieldset > legend {
  padding: 0;
}

.scrapbook-marked > div > a {
  font-weight: bold;
}
</style>
<link rel="stylesheet" href="${fileType}.css">
<script>
var scrapbook = {
  conf: {
    dataDir: "${scrapbook.getRelativeUrl(scrapbook.escapeFilename(this.dataDir), scrapbook.escapeFilename(this.treeDir))}",
    viewSourceTitle: "${scrapbook.escapeQuotes(scrapbook.lang('IndexerTreeSourceLinkTitle'))}"
  },

  data: {
    title: document.title,
    toc: {},
    meta: {}
  },

  toc: function (data) {
    for (var id in data) {
      this.data.toc[id] = data[id];
    }
  },

  meta: function (data) {
    for (var id in data) {
      this.data.meta[id] = data[id];
    }
  },

  init: function () {
    var rootElem = document.getElementById('item-root');
    while (rootElem) {
      rootElem.parentNode.removeChild(rootElem);
      rootElem = document.getElementById('item-root');
    }

    var rootElem = document.createElement('div');
    rootElem.id = 'item-root';

    rootElem.container = document.createElement('ul');
    rootElem.container.className = 'scrapbook-container';
    rootElem.appendChild(rootElem.container);

    for (var i = 0, I = scrapbook.data.toc.root.length; i < I; i++) {
      var id = scrapbook.data.toc.root[i];
      scrapbook.addItem(id, rootElem, ["root"]);
    }

    document.body.appendChild(rootElem);

    document.getElementById('toggle-all').onclick = scrapbook.onClickToggleAll;

    scrapbook.loadHash();
  },

  addItem: function (id, parent, idChain) {
    var meta = scrapbook.data.meta[id];

    var elem = document.createElement('li');
    elem.id = 'item-' + id;
    if (meta.type) { elem.className = 'scrapbook-type-' + meta.type + ' '; };
    if (meta.marked) { elem.className += 'scrapbook-marked '; }

    var div = elem.appendChild(document.createElement('div'));
    div.setAttribute('tabindex', -1);
    div.onclick = scrapbook.onClickItem;

    if (meta.type !== 'separator') {
      var a = div.appendChild(document.createElement('a'));
      a.appendChild(document.createTextNode(meta.title || id));
      a.title = (meta.title || id) + (meta.source ? "\\n" + meta.source : "") + (meta.comment ? "\\n\\n" + meta.comment : "");
      if (meta.type !== 'bookmark') {
        if (meta.index) { a.href = scrapbook.conf.dataDir + scrapbook.escapeFilename(meta.index); }
      } else {
        if (meta.source) {
          a.href = meta.source;
        } else {
          if (meta.index) { a.href = scrapbook.conf.dataDir + scrapbook.escapeFilename(meta.index); }
        }
      }
      if (meta.type === 'folder') { a.onclick = scrapbook.onClickFolder; }

      var icon = a.insertBefore(document.createElement('img'), a.firstChild);
      if (meta.icon) {
        icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
            meta.icon : 
            (scrapbook.conf.dataDir + scrapbook.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon;
      } else {
        icon.src = {
          'folder': 'icon/fclose.png',
          'file': 'icon/file.png',
          'note': 'icon/note.png',
          'postit': 'icon/postit.png',
        }[meta.type] || 'icon/item.png';
      }
      icon.alt = "";

      if (meta.type !== 'bookmark' && meta.source) {
        var srcLink = div.appendChild(document.createElement('a'));
        srcLink.className = 'scrapbook-external';
        srcLink.href = meta.source;
        srcLink.title = scrapbook.conf.viewSourceTitle;
        srcLink.target = "_blank";

        var srcImg = srcLink.appendChild(document.createElement('img'));
        srcImg.src = 'icon/external.png';
        srcImg.alt = '';
      }

      var childIdList = scrapbook.data.toc[id];
      if (childIdList && childIdList.length) {
        elem.toggle = div.insertBefore(document.createElement('a'), div.firstChild);
        elem.toggle.href = '#';
        elem.toggle.className = 'scrapbook-toggle';
        elem.toggle.onclick = scrapbook.onClickToggle;

        var toggleImg = elem.toggle.appendChild(document.createElement('img'));
        toggleImg.src = 'icon/collapse.png';
        toggleImg.alt = '';

        elem.container = elem.appendChild(document.createElement('ul'));
        elem.container.className = 'scrapbook-container';
        elem.container.style.display = 'none';

        var childIdChain = idChain.slice();
        childIdChain.push(id);
        for (var i = 0, I = childIdList.length; i < I; i++) {
          var childId = childIdList[i];
          if (idChain.indexOf(childId) === -1) {
            scrapbook.addItem(childId, elem, childIdChain);
          }
        }
      }
    } else {
      var line = div.appendChild(document.createElement('fieldset'));
      line.title = (meta.title || "") + (meta.source ? "\\n" + meta.source : "") + (meta.comment ? "\\n\\n" + meta.comment : "");

      var legend = line.appendChild(document.createElement('legend'));
      legend.appendChild(document.createTextNode('\\xA0' + (meta.title || '') + '\\xA0'));
    }

    parent.container.appendChild(elem);

    return elem;
  },

  loadHash: function () {
    var hash = self.location.hash || top.location.hash;
    if (!hash) { return; }

    var itemElem = document.getElementById(hash.slice(1));
    if (!itemElem) { return; }

    var e = itemElem.parentNode;
    while (e && e.parentNode) {
      if (e.nodeName.toLowerCase() === 'ul') {
        scrapbook.toggleElem(e, true);
      }
      e = e.parentNode;
    }

    if (self !== top && location.hash !== hash) {
      location.hash = hash;
    }

    setTimeout(function(){ itemElem.firstChild.focus(); }, 0);

    var anchor = scrapbook.getItemAnchor(itemElem);

    if (anchor) {
      if (self !== top) {
        top.document.title = anchor.firstChild.nodeValue || scrapbook.data.title;
        if (anchor.href) { top.frames["main"].location = anchor.href; }
      }
    }
  },

  getItemAnchor: function (itemElem) {
    var anchorElem = null;
    if (!/^item-(?!root$)/.test(itemElem.id)) { return anchorElem; }

    var elems = itemElem.firstChild.getElementsByTagName('a');
    for (var i = 0, I = elems.length; i < I; i++) {
      var e = elems[i];
      if (e.className !== 'scrapbook-toggle' && 
          e.className !== 'scrapbook-external') {
        anchorElem = e;
        break;
      }
    }
    return anchorElem;
  },

  onClickFolder: function (event) {
    event.preventDefault();
    var target = this.previousSibling;
    if (target) {
      target.focus();
      target.click();
    }
  },

  onClickItem: function (event) {
    var hash = '#' + this.parentNode.id;
    var anchor = scrapbook.getItemAnchor(this.parentNode);

    try {
      var title = anchor ? anchor.firstChild.nodeValue : "";
      title = title || scrapbook.data.title;

      if (self !== top) {
        top.document.title = title;
        if (top.history && top.history.pushState) {
          top.history.pushState('', title, hash);
        } else {
          top.location.hash = hash;
        }
      } else {
        if (history && history.replaceState) {
          history.replaceState('', title, hash);
        }
      }
    } catch(ex) {
      if (console && console.error) { console.error(ex); }
    }
  },

  onClickToggle: function (event) {
    event.preventDefault();
    scrapbook.toggleElem(this.parentNode.nextSibling);
  },

  onClickToggleAll: function (event) {
    event.preventDefault();
    scrapbook.toggleAllElem();
  },

  toggleElem: function (elem, willOpen) {
    if (typeof willOpen === "undefined") {
      willOpen = (elem.style.display === "none");
    }
    elem.style.display = willOpen ? '' : 'none';

    try {
      elem.previousSibling.firstChild.firstChild.src = willOpen ? 'icon/expand.png' : 'icon/collapse.png';
    } catch (ex) {
      // if the elem is the root elem, previousSibling is undefined and an error is thrown
    }
  },

  toggleAllElem: function (willOpen) {
    var elems = document.getElementsByTagName("ul");
    if (typeof willOpen === "undefined") {
      willOpen = false;
      for (var i = 1, I = elems.length; i < I; i++) { // skip root
        if (elems[i].style.display === "none") { willOpen = true; break; }
      }
    }
    for (var i = 1, I = elems.length; i < I; i++) { // skip root
      scrapbook.toggleElem(elems[i], willOpen);
    }
  },

  escapeFilename: function (filename) {
    return filename.replace(/[^/]+/g, function (m) { return encodeURIComponent(m); });
  }
};
</script>
${loadMetaJs()}
${loadTocJs()}
<script src="${fileType}.js"></script>
</head>
<body>
<div id="header">
<a id="toggle-all" title="${scrapbook.escapeHtml(scrapbook.lang('IndexerTreeToggleAll'))}" href="#"><img src="icon/toggle.png">${scrapbook.escapeHtml(scrapbookData.title || "", true)}</a>
<a id="search" href="search.html" target="_self" title="${scrapbook.escapeHtml(scrapbook.lang('IndexerTreeSearchLinkTitle'))}"><img src="icon/search.png" alt=""></a>
</div>
${itemHtml}<script>scrapbook.init();</script>
</body>
</html>
`;
    },

    /**
     * The generated page ought to work on most browsers.
     *
     * Also remember to escape '\' with '\\' in this long string.
     */
    generateFrameFile(scrapbookData) {
      return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Frameset//EN" "http://www.w3.org/TR/html4/frameset.dtd">
<!--
  This file is generated by WebScrapBook and is not intended to be edited.
  Create frame.css and/or frame.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="frame">
<head>
<meta charset="UTF-8">
<title>${scrapbook.escapeHtml(scrapbookData.title || "", true)}</title>
<link rel="stylesheet" href="frame.css">
<script src="frame.js"></script>
</head>
<frameset cols="200,*">
<frame name="nav" src="map.html">
<frame name="main">
</frameset>
</html>
`;
    },

    generateSearchFile(scrapbookData) {
      return `<!DOCTYPE html>
<!--
  This file is generated by WebScrapBook and is not intended to be edited.
  Create search.css and/or search.js for customization.
-->
<html dir="${scrapbook.lang('@@bidi_dir')}" data-scrapbook-tree-page="search">
<head>
<meta charset="UTF-8">
<title>${scrapbook.escapeHtml(scrapbook.lang('IndexerTreeSearchTitle', [scrapbookData.title || ""]), true)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html {
  height: 100%;
}

body {
  margin: 0;
  padding: 0;
  line-height: 1.35em;
}

#searchForm {
  display: flex;
  flex-direction: row;
  padding: .25em;
}

#keyword {
  flex: auto;
  min-width: 150px;
}

#helper {
  width: 2em;
}

#result {
  margin: 0;
  margin-top: 1em;
  padding: 0;
}

#support {
  margin-top: 2em;
  padding: .5em;
  background-color: #FEE;
  font-size: .85em;
}

ul {
  margin: 0;
  padding: 0;
}

li {
  list-style-type: none;
  margin: .2em;
  padding-${scrapbook.lang('@@bidi_start_edge')}: 1em;
}

li > div {
  white-space: nowrap;
}

li > div:hover {
  background-color: rgba(196, 221, 252, 0.3);
}

a {
  text-decoration: none;
  color: #000000;
}

a:focus {
  outline-style: auto;
  background-color: rgba(196, 221, 252, 1);
}

a > img {
  display: inline-block;
  margin: 0 .2em;
  border: none;
  width: 1em;
  height: 1em;
  vertical-align: middle;
}

a.scrapbook-toggle {
  margin-${scrapbook.lang('@@bidi_start_edge')}: -1.45em;
}

a.scrapbook-toggle > img {
  margin: 0;
}

a.scrapbook-external > img {
  margin: 0 .1em;
  width: .7em;
  height: .7em;
  vertical-align: top;
}

.scrapbook-type-bookmark > div > a {
  color: rgb(32,192,32);
}

.scrapbook-type-note > div > a {
  color: rgb(80,0,32);
}

.scrapbook-type-site > div > a {
  color: blue;
}

.scrapbook-type-separator > div > fieldset {
  margin: 0;
  border: none;
  border-top: 1px solid #aaa;
  padding: 0 0 0 1em;
  text-indent: 0;
}

.scrapbook-type-separator > div > fieldset > legend {
  padding: 0;
}

.scrapbook-marked > div > a {
  font-weight: bold;
}
</style>
<link rel="stylesheet" href="search.css">
<script>
const conf = {
  scrapbooks: [
    {name: "", path: "${scrapbook.getRelativeUrl('', scrapbook.escapeFilename(this.treeDir))}", dataDir: "${scrapbook.escapeFilename(this.dataDir)}", treeDir: "${scrapbook.escapeFilename(this.treeDir)}", indexPage: "${this.indexPage}"}
  ],
  allowHttp: 0,  // whether to load js cache from HTTP(S)? -1: deny, 0: ask; 1: allow
  defaultSearch: "-type:folder -type:separator",  // the constant string to add before the input keyword
  viewInMapTitle: "${scrapbook.escapeQuotes(scrapbook.lang('IndexerTreeSearchViewInMap'))}",  // title for "view in map"
};

const scrapbook = {
  books: [],

  data: null,

  toc(data) {
    this.data.toc = Object.assign(this.data.toc, data);
  },

  meta(data) {
    this.data.meta = Object.assign(this.data.meta, data);
  },

  fulltext(data) {
    this.data.fulltext = Object.assign(this.data.fulltext, data);
  },

  init() {
    document.getElementById('searchForm').addEventListener('submit', (event) => {
      event.preventDefault();
      this.search();
    });
 
    document.getElementById('helper').addEventListener('change', (event) => {
      event.preventDefault();
      this.helperFill();
    });

    scrapbook.books = conf.scrapbooks.map(
      book => Object.assign({}, book, {
        toc: {},
        meta: {},
        fulltext: {},
      })
    );

    return this.loadBooks().then(() => {
      document.getElementById('search').disabled = false;
    });
  },

  loadBooks() {
    let p = Promise.resolve();
    scrapbook.books.forEach((book) => {
      p = p.then(() => {
        return this.loadBook(book);
      }).catch((ex) => {
        console.error(ex);
        this.addMsg("Error: " + ex.message);
      });
    });
    return p;
  },

  loadBook(book) {
    return Promise.resolve().then(() => {
      let base = this.resolveUrl(book.path, location.href);

      const loadMeta = () => {
        const loop = () => {
          const url = this.resolveUrl(book.treeDir + "meta" + (i || "") + ".js", base);
          return this.loadScript(url, true).then(() => {
            i += 1;
            return loop();
          }).catch((ex) => {
            if (i === 0) { throw ex; }
            console.log("Unable to load '" + url + "'");
          });
        };

        let i = 0;
        return loop();
      };

      const loadToc = () => {
        const loop = () => {
          const url = this.resolveUrl(book.treeDir + "toc" + (i || "") + ".js", base);
          return this.loadScript(url, true).then(() => {
            i += 1;
            return loop();
          }).catch((ex) => {
            if (i === 0) { throw ex; }
            console.log("Unable to load '" + url + "'");
          });
        };

        let i = 0;
        return loop();
      };

      const loadFulltext = () => {
        const loop = () => {
          const url = this.resolveUrl(book.treeDir + "fulltext" + (i || "") + ".js", base);
          return this.loadScript(url, true).then(() => {
            i += 1;
            return loop();
          }).catch((ex) => {
            console.log("Unable to load '" + url + "'");
          });
        };

        let i = 0;
        return loop();
      };

      scrapbook.data = book;
      if (!this.checkHttp(base)) {
        this.addMsg("Rejected to load remote fulltext cache: " + base);
        return Promise.all([
          loadMeta(),
          loadToc(),
        ]);
      } else {
        return Promise.all([
          loadMeta(),
          loadToc(),
          loadFulltext(),
        ]);
      }
    });
  },

  loadScript(url, noCache) {
    return new Promise((resolve, reject) => {
      const elem = document.createElement("script");
      document.getElementsByTagName("head")[0].appendChild(elem);
      elem.onload = (event) => {
        console.log("Loaded '" + url + "'");
        resolve();
      };
      elem.onerror = (event) => {
        elem.remove();
        reject(new Error("Failed to load '" + url + "'"));
      };
      elem.src = url + (noCache ? "?ts=" + Date.now() : "");
    });
  },

  checkHttp(url) {
    const targetUrl = this.resolveUrl(url, location.href);
    const targetUrlObj = new URL(targetUrl);
    if (['http:', 'https:'].indexOf(targetUrlObj.protocol) !== -1 &&
        ['localhost', '127.0.0.1'].indexOf(targetUrlObj.hostname) === -1) {
      if (conf.allowHttp === 0) {
        if (confirm("Loading remote fulltext cache may require large network flow. Continue?")) {
          conf.allowHttp = 1;
        } else {
          conf.allowHttp = -1;
        }
      }
      if (conf.allowHttp > 0) { return true; }
      return false;
    }
    return true;
  },

  search() {
    return Promise.resolve().then(() => {
      this.clearResult();

      // set query string
      let queryStr = document.getElementById("keyword").value;
      if (conf.defaultSearch) {
        queryStr = conf.defaultSearch + " " + queryStr;
      }

      // parse query
      const query = searchEngine.parseQuery(queryStr);
      if (query.error.length) {
        for (const err of query.error) {
          this.addMsg("Error: " + err);
        }
        return;
      }
      console.log("Search:", query);

      // search and get result
      return searchEngine.search(query);
    }).catch((ex) => {
      console.error(ex);
      this.addMsg("Error: " + ex.message);
    });
  },

  showResults(results, book) {
    const name = book.name ? "(" + book.name + ") " : "";
    this.addMsg(name + "Found " + results.length + " results:");
    const wrapper = document.getElementById("result");
    for (const item of results) {
      this.addResult(item, book, wrapper);
    }
    this.addMsg("\\u00A0");
  },

  addResult(item, book, wrapper) {
    const {id, file, meta, fulltext} = item;

    const li = document.createElement("li");
    if (meta.type) {
      li.className = "scrapbook-type-" + meta.type;
    }

    const div = li.appendChild(document.createElement("div"));

    var a = div.appendChild(document.createElement("a"));
    if (meta.type !== "bookmark") {
      if (meta.index) {
        let subpath = 
            (!file || file === '.' || this.isZipFile(meta.index)) ? 
            meta.index : 
            meta.index.replace(/[^/]+$/, '') + file;
        subpath = this.escapeFilename(subpath || "");
        if (subpath) {
          a.href = book.path + book.dataDir + subpath;
        }
      }
    } else {
      if (meta.source) {
        a.href = meta.source;
      }
    }
    a.target = "main";
    a.textContent = meta.title || id;
    a.title = (meta.title || id) + (meta.source ? "\\n" + meta.source : "");

    if (file && !(
        file === "." || 
        (this.isZipFile(meta.index) && file === "index.html") || 
        (!this.isZipFile(meta.index) && file === meta.index.replace(/^.*[/]/, ''))
        )) {
      const span = div.appendChild(document.createElement("span"));
      span.textContent = " (" + file + ")";
    }

    var icon = a.insertBefore(document.createElement('img'), a.firstChild);
    if (meta.icon) {
      icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
          meta.icon : 
          (book.path + book.dataDir + this.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon;
    } else {
      icon.src = {
        'folder': 'icon/fclose.png',
        'note': 'icon/note.png',
        'postit': 'icon/postit.png',
      }[meta.type] || 'icon/item.png';
    }
    icon.alt = "";

    var a = div.appendChild(document.createElement("a"));
    a.href = book.path + book.indexPage + "#item-" + id;
    a.target = "_blank";
    a.className = "scrapbook-external";
    a.title = conf.viewInMapTitle;
    var img = a.appendChild(document.createElement("img"));
    img.src = "icon/external.png";
    img.alt = "";

    wrapper.appendChild(li);
  },

  clearResult() {
    document.getElementById("result").innerHTML = "";
  },

  addMsg(msg) {
    let wrapper = document.getElementById("result");
    let result = document.createElement("li");
    result.appendChild(document.createTextNode(msg));
    wrapper.appendChild(result);
  },

  resolveUrl(url, base) {
    try {
      return new URL(url, base).href;
    } catch(ex) {
      // unable to resolve
    }
    return url;
  },

  isZipFile(path) {
    const p = path.toLowerCase();
    return p.endsWith('.htz') || p.endsWith('.maff');
  },

  escapeRegExp(str) {
    return str.replace(/[-/\\\\^$*+?.|()[\\]{}]/g, "\\\\$&");
  },

  escapeFilename(filename) {
    return filename.replace(/[^/]+/g, m => encodeURIComponent(m));
  },

  helperFill() {
    let helper = document.getElementById("helper");
    let keyword = document.getElementById("keyword");
    keyword.value = keyword.value + (keyword.value === "" ? "" : " ") + helper.value;
    helper.selectedIndex = 0;
    keyword.focus();
    keyword.setSelectionRange(keyword.value.length, keyword.value.length);
  },
};

const searchEngine = {
  get supportRegexUnicodeFlag() {
    let support = false;
    try {
      new RegExp('', 'u');
      support = true;
    } catch (ex) {}
    delete(this.supportRegexUnicodeFlag);
    return this.supportRegexUnicodeFlag = support;
  },

  parseQuery(queryStr) {
    const query = {
      error: [],
      rules: {},
      sorts: [],
      books: {
        include: [],
        exclude: [],
      },
      roots: {
        include: [],
        exclude: [],
      },
      mc: false,
      re: false,
      default: "tcc",
    };

    const addRule = (name, type, value) => {
      if (typeof query.rules[name] === "undefined") {
        query.rules[name] = {"include": [], "exclude": []};
      }
      query.rules[name][type].push(value);
    };

    const addSort = (key, order) => {
      switch (key) {
        case "id": case "file":
          query.sorts.push({key, order});
          break;
        case "content":
          query.sorts.push({key: "fulltext", subkey: key, order});
          break;
        default:
          query.sorts.push({key: "meta", subkey: key, order});
          break;
      }
    };

    const addError = (msg) => {
      query.error.push(msg);
    };

    const parseStr = (term, exactMatch = false) => {
      let flags = query.mc ? "m" : "im";
      if (this.supportRegexUnicodeFlag) { flags += "u"; }
      let regex = "";
      if (query.re) {
        try {
          regex = new RegExp(term, flags);
        } catch(ex) {
          addError("Invalid RegExp: " + term);
          return null;
        }
      } else {
        let key = scrapbook.escapeRegExp(term);
        if (exactMatch) { key = "^" + key + "$"; }
        regex = new RegExp(key, flags);
      }
      return regex;
    };

    const parseDate = (term) => {
      const match = term.match(/^(\\d{0,17})(?:-(\\d{0,17}))?$/);
      if (!match) {
        addError("Invalid date format: " + term);
        return null;
      }
      const since = match[1] ? this.dateUtcToLocal(pad(match[1], 17)) : pad("", 17);
      const until = match[2] ? this.dateUtcToLocal(pad(match[2], 17)) : pad("", 17, "9");
      return [since, until];
    };

    const pad = (n, width, z) => {
      z = z || "0";
      n = n + "";
      return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
    };

    queryStr.replace(/(-*[A-Za-z]+:|-+)(?:"([^"]*(?:""[^"]*)*)"|([^"\\s]*))|(?:"([^"]*(?:""[^"]*)*)"|([^"\\s]+))/g, (match, cmd, qterm, term, qterm2, term2) => {
      let pos = true;
      if (cmd) {
        term = (qterm !== undefined) ? qterm.replace(/""/g, '"') : term;
        let m = /^(-*)(.*)$/.exec(cmd);
        if (m[1].length % 2 === 1) { pos = false; }
        cmd = m[2];
      } else {
        term = (qterm2 !== undefined) ? qterm2.replace(/""/g, '"') : term2;
      }

      if (cmd) {
        cmd = cmd.slice(0, -1);
      } else {
        cmd = query.default;
      }

      switch (cmd) {
        case "default":
          query.default = String(term);
          break;
        case "mc":
          query.mc = pos;
          break;
        case "re":
          query.re = pos;
          break;
        case "book":
          query.books[pos ? 'include' : 'exclude'].push(term);
          break;
        case "root":
          query.roots[pos ? 'include' : 'exclude'].push(term);
          break;
        case "sort":
          addSort(term, pos ? 1 : -1);
          break;
        case "type":
          addRule("type", pos ? "include" : "exclude", parseStr(term, true));
          break;
        case "id":
          addRule("id", pos ? "include" : "exclude", parseStr(term, true));
          break;
        case "file":
          addRule("file", pos ? "include" : "exclude", parseStr(term));
          break;
        case "source":
          addRule("source", pos ? "include" : "exclude", parseStr(term));
          break;
        case "tcc":
          addRule("tcc", pos ? "include" : "exclude", parseStr(term));
          break;
        case "title":
          addRule("title", pos ? "include" : "exclude", parseStr(term));
          break;
        case "comment":
          addRule("comment", pos ? "include" : "exclude", parseStr(term));
          break;
        case "content":
          addRule("content", pos ? "include" : "exclude", parseStr(term));
          break;
        case "create":
          addRule("create", pos ? "include" : "exclude", parseDate(term));
          break;
        case "modify":
          addRule("modify", pos ? "include" : "exclude", parseDate(term));
          break;
      }

      return "";
    });
    return query;
  },

  search(query) {
    const books = new Set(scrapbook.books);
    if (query.books.include.length) {
      for (const book of books) {
        if (!query.books.include.includes(book.name)) {
          books.delete(book);
        }
      }
    }
    for (const book of books) {
      if (query.books.exclude.includes(book.name)) {
        books.delete(book);
      }
    }

    let p = Promise.resolve();
    books.forEach((book) => {
      p = p.then(() => {
        return this.searchBook(query, book).then((results) => {
          scrapbook.showResults(results, book);
        });
      });
    });
    return p;
  },

  searchBook(query, book) {
    return Promise.resolve().then(() => {
      const results = [];

      const idPool = new Set();
      {
        if (!query.roots.include.length) {
          query.roots.include.push('root');
        }

        for (const root of query.roots.include) {
          for (const id of this.getReachableItems(book, root)) {
            idPool.add(id);
          }
        }

        for (const root of query.roots.exclude) {
          for (const id of this.getReachableItems(book, root)) {
            idPool.delete(id);
          }
        }
      }

      for (const id of idPool) {
        let subfiles = book.fulltext[id] || {};
        if (!Object.keys(subfiles).length) { subfiles[""] = {}; }

        for (const file in subfiles) {
          const item = {
            id,
            file,
            meta: book.meta[id],
            fulltext: subfiles[file],
          };
          if (this.matchItem(item, query)) {
            results.push(item);
          }
        }
      }

      // sort results
      for (const {key, subkey, order} of query.sorts) {
        results.sort((a, b) => {
          a = a[key]; if (subkey) { a = a[subkey]; } a = a || "";
          b = b[key]; if (subkey) { b = b[subkey]; } b = b || "";
          if (a > b) { return order; }
          if (a < b) { return -order; }
          return 0;
        });
      }

      return results;
    });
  },

  getReachableItems(book, root, set = new Set()) {
    const addIdRecursively = (id) => {
      for (const refId of book.toc[id]) {
        if (book.meta[refId] && !set.has(refId)) {
          set.add(refId);
          if (book.toc[refId]) {
            addIdRecursively(refId);
          }
        }
      }
    };
    if (book.meta[root]) {
      set.add(root);
    }
    if (book.toc[root]) {
      addIdRecursively(root);
    }
    return set;
  },

  matchItem(item, query) {
    if (!item.meta) {
      return false;
    }

    for (const i in query.rules) {
      if (!this["_match_" + i](query.rules[i], item)) { return false; }
    }

    return true;
  },

  _match_tcc(rule, item) {
    return this.matchText(rule, [item.meta.title, item.meta.comment, item.fulltext.content].join("\\n"));
  },

  _match_content(rule, item) {
    return this.matchText(rule, item.fulltext.content);
  },

  _match_id(rule, item) {
    return this.matchTextOr(rule, item.id);
  },

  _match_file(rule, item) {
    return this.matchText(rule, item.file);
  },

  _match_title(rule, item) {
    return this.matchText(rule, item.meta.title);
  },

  _match_comment(rule, item) {
    return this.matchText(rule, item.meta.comment);
  },

  _match_source(rule, item) {
    return this.matchText(rule, item.meta.source);
  },

  _match_type(rule, item) {
    return this.matchTextOr(rule, item.meta.type);
  },

  _match_create(rule, item) {
    return this.matchDate(rule, item.meta.create);
  },

  _match_modify(rule, item) {
    return this.matchDate(rule, item.meta.modify);
  },

  matchText(rule, text) {
    text = text || "";

    for (const key of rule.exclude) {
      if (key.test(text)) {
        return false;
      }
    }

    for (const key of rule.include) {
      if (!key.test(text)) {
        return false;
      }
    }

    return true;
  },

  matchTextOr(rule, text) {
    text = text || "";
    
    for (const key of rule.exclude) {
      if (key.test(text)) {
        return false;
      }
    }

    if (!rule.include.length) { return true; }
    for (const key of rule.include) {
      if (key.test(text)) {
        return true;
      }
    }
    return false;
  },

  matchDate(rule, date) {
    if (!date) { return false; }

    for (const key of rule.exclude) {
      if (key[0] <= date && date <= key[1]) {
        return false;
      }
    }

    for (const key of rule.include) {
      if (!(key[0] <= date && date <= key[1])) {
        return false;
      }
    }

    return true;
  },

  dateUtcToLocal(dateStr) {
    if (/^(\\d{4})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{3})$/.test(dateStr)) {
      const dd = new Date(
          parseInt(RegExp.$1, 10), Math.max(parseInt(RegExp.$2, 10), 1) - 1, Math.max(parseInt(RegExp.$3, 10), 1),
          parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10), parseInt(RegExp.$7, 10)
          );
      return dd.getUTCFullYear() +
          this.intToFixedStr(dd.getUTCMonth() + 1, 2) +
          this.intToFixedStr(dd.getUTCDate(), 2) +
          this.intToFixedStr(dd.getUTCHours(), 2) +
          this.intToFixedStr(dd.getUTCMinutes(), 2) +
          this.intToFixedStr(dd.getUTCSeconds(), 2) +
          this.intToFixedStr(dd.getUTCMilliseconds(), 3);
    }
    return null;
  },

  intToFixedStr(number, width, padder) {
    padder = padder || "0";
    number = number.toString(10);
    return number.length >= width ? number : new Array(width - number.length + 1).join(padder) + number;
  },
};
</script>
<script src="search.js"></script>
</head>
<body>
<form id="searchForm">
  <input id="keyword" type="text">
  <select id="helper">
    <option value="" selected="selected"></option>
    <option value="id:">id:</option>
    <option value="title:">title:</option>
    <option value="comment:">comment:</option>
    <option value="content:">content:</option>
    <option value="tcc:">tcc:</option>
    <option value="source:">source:</option>
    <option value="type:">type:</option>
    <option value="create:">create:</option>
    <option value="modify:">modify:</option>
    <option value="re:">re:</option>
    <option value="mc:">mc:</option>
    <option value="file:">file:</option>
    <option value="root:">root:</option>
    <option value="sort:">sort:</option>
    <option value="-sort:modify">Last Modified</option>
    <option value="-sort:create">Last Created</option>
    <option value="sort:title">Title Ascending</option>
    <option value="-sort:title">Title Descending</option>
    <option value="sort:id">ID Sort</option>
  </select>
  <input id="search" type="submit" value="${scrapbook.escapeHtml(scrapbook.lang('IndexerTreeSearchStart'))}" disabled autocomplete="off">
</form>
<div>
<ul id="result"></ul>
</div>
<div id="support">
Supported browsers: Chromium ≥ 49, Firefox ≥ 41, Edge ≥ 14, Safari ≥ 8, with JavaScript enabled.
</div>
<script>scrapbook.init();</script>
</body>
</html>
`;
    },
  };

  document.addEventListener("DOMContentLoaded", async function () {
    scrapbook.loadLanguages(document);

    // init common elements and events
    indexer.logger = document.getElementById('logger');
    indexer.dropmask = document.getElementById('dropmask');
    indexer.downloader = document.getElementById('downloader');

    indexer.panel = document.getElementById('panel');
    indexer.dirSelector = document.getElementById('dir-selector');
    indexer.filesSelector = document.getElementById('files-selector');
    indexer.loadServerLabel = document.getElementById('load-server-label');

    const dirSelectorLabel = document.getElementById('dir-selector-label');
    const filesSelectorLabel = document.getElementById('files-selector-label');

    await scrapbook.loadOptionsAuto;

    // init UI
    if (
      // Check for "webkitdirectory" attribute only as it is implemented by major
      // browsers and is the ongoing standard of File and Directory Entries API.
      // https://wicg.github.io/entries-api/#dom-htmlinputelement-webkitdirectory
      indexer.dirSelector.webkitdirectory &&
      // Hide directory selector in Chromium < 72 as its webkitRelativePath for
      // selected files are bad. (Use drag-and-drop instead)
      // https://bugs.chromium.org/p/chromium/issues/detail?id=124187
      !(scrapbook.userAgent.is('chromium') && scrapbook.userAgent.major < 72)
    ) {
      dirSelectorLabel.hidden = false;
    }
    filesSelectorLabel.hidden = false;
    indexer.loadServerLabel.hidden = !scrapbook.hasServer();

    // handle URL actions
    const params = new URL(document.URL).searchParams;
    switch (params.get('a')) {
      case 'load_server':
        if (scrapbook.hasServer()) {
          await indexer.loadServerFiles(params.getAll('bookId'));
          return;
        }
        break;
    }

    // enable UI if no action
    indexer.enableUi();
  });

  return indexer;

}));
