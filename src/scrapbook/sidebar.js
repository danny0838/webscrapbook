/******************************************************************************
 *
 * Scrapbook sidebar UI controller, for pages like sidebar.html and manage.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @require {Class} Tree
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.sidebar = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    root.BookTree,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, BookTree, window, document, console) {

  'use strict';

  const sidebar = {
    tree: null,
    treeElem: null,
    bookId: null,
    book: null,
    rootId: 'root',
    mode: 'normal',
    sidebarWindowId: null,

    async init() {
      // Init event handlers first so that the refresh button works if there's
      // an error during further init.

      // bind "this" variable for command callbacks functions
      for (const cmd in this.commands) {
        this.commands[cmd] = this.commands[cmd].bind(this);
      }

      // bind on* event callbacks
      for (const funcName of Object.getOwnPropertyNames(this)) {
        if (funcName.startsWith('on')) {
          this[funcName] = this[funcName].bind(this);
        }
      }

      // init event handlers
      window.addEventListener('keydown', this.onKeyDown);

      window.addEventListener('dragenter', this.onWindowItemDragEnter);
      window.addEventListener('dragover', this.onWindowItemDragOver);
      window.addEventListener('drop', this.onWindowItemDrop);

      this.treeElem = document.getElementById('items');
      this.treeElem.addEventListener('contextmenu', this.onTreeContextMenu);

      document.getElementById("book").addEventListener('change', this.onBookChange);
      document.getElementById("search").addEventListener('click', this.onSearchButtonClick);
      document.getElementById("refresh").addEventListener('click', this.onRefreshButtonClick);
      document.getElementById("command").addEventListener('click', this.onCommandButtonClick);

      document.getElementById("command-popup-book").addEventListener('click', this.onBookCommandClick);
      document.getElementById("command-popup-book").addEventListener('focusout', this.onBookCommandFocusOut);

      document.getElementById("command-popup").addEventListener('click', this.onCommandClick);
      document.getElementById("command-popup").addEventListener('focusout', this.onCommandFocusOut);

      document.getElementById('upload-file-selector').addEventListener('change', this.onClickFileSelector);

      window.addEventListener('command', this.onCommandRun);

      // load config
      await scrapbook.loadOptions();

      if (!scrapbook.hasServer()) {
        this.error(scrapbook.lang('ScrapBookErrorServerNotConfigured'));
        return;
      }

      // load server config
      try {
        await server.init();
      } catch (ex) {
        console.error(ex);
        this.error(scrapbook.lang('ScrapBookErrorServerInit', [ex.message]));
        return;
      }

      // load URL params
      const urlParams = new URL(document.URL).searchParams;
      this.rootId = urlParams.get('root') || this.rootId;

      // load current scrapbook and scrapbooks list
      try {
        let bookId = this.bookId = urlParams.has('id') ? urlParams.get('id') : server.bookId;
        let book = this.book = server.books[bookId];

        if (!book) {
          this.warn(scrapbook.lang('ScrapBookErrorBookNotExist', [bookId]));
          bookId = this.bookId = '';
          book = this.book = server.books[bookId];
          await scrapbook.cache.set({table: "scrapbookServer", key: "currentScrapbook"}, bookId, 'storage');
        }

        // init book select
        if (this.mode === 'normal') {
          const wrapper = document.getElementById('book');
          wrapper.hidden = false;

          for (const key of Object.keys(server.books).sort()) {
            const book = server.books[key];
            const opt = document.createElement('option');
            opt.value = book.id;
            opt.textContent = book.name;
            wrapper.appendChild(opt);
          }
          wrapper.value = bookId;
        }
      } catch (ex) {
        console.error(ex);
        this.error(scrapbook.lang('ScrapBookErrorLoadBooks', [ex.message]));
        return;
      }

      // init tree instance
      this.tree = new BookTree({
        treeElem: this.treeElem,
        cacheType: this.mode === 'normal' ? 'storage' : 'sessionStorage',
      });

      await this.refresh(undefined, undefined, true);
    },

    /**
     * Update UI to match the given bookId and rootId.
     */
    async refresh(bookId, rootId, keepLogs = false) {
      this.enableUi(false);

      try {
        // update bookId and rootId
        if (typeof bookId === 'string' && bookId !== this.bookId) {
          await scrapbook.cache.set({table: "scrapbookServer", key: "currentScrapbook"}, bookId, 'storage');
          this.bookId = bookId;
          this.book = server.books[bookId];
          document.getElementById('book').value = bookId;
        }
        if (typeof rootId === 'string' && rootId !== this.rootId) {
          this.rootId = rootId;
        }

        // refresh UI
        if (this.rootId === 'root') {
          document.title = scrapbook.lang('SidebarTitle', [server.config.app.name, this.book.name]);
        } else {
          document.title = scrapbook.lang('SidebarTitleWithRoot', [server.config.app.name, this.book.name, this.rootId])
        }

        const isLocal = server.config.app.is_local;
        const isNoTree = !!this.book.config.no_tree;
        const isRecycle = this.rootId === 'recycle';

        document.getElementById('search').disabled = isNoTree;

        {
          const menuElem = document.getElementById('command-popup-book');
          menuElem.querySelector('button[value="exec_book"]').disabled = !(!isNoTree && isLocal);
          menuElem.querySelector('button[value="manage"]').disabled = isNoTree;
          menuElem.querySelector('button[value="sort"]').disabled = isNoTree;

          menuElem.querySelector('button[value="mkfolder"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mksep"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mknote"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="upload"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="view_recycle"]').hidden = !(!isRecycle);
        }

        {
          const menuElem = document.getElementById('command-popup');
          menuElem.querySelector('button[value="opentab"]').disabled = isNoTree;
          menuElem.querySelector('button[value="view_text"]').disabled = isNoTree;
          menuElem.querySelector('button[value="exec"]').disabled = !(!isNoTree && isLocal);
          menuElem.querySelector('button[value="browse"]').disabled = !(!isNoTree && isLocal);
          menuElem.querySelector('button[value="source"]').disabled = isNoTree;
          menuElem.querySelector('button[value="manage"]').disabled = isNoTree;
          menuElem.querySelector('button[value="search_in"]').disabled = isNoTree;
          menuElem.querySelector('button[value="sort"]').disabled = isNoTree;

          menuElem.querySelector('button[value="mkfolder"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mksep"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mknote"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="upload"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="edit"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="recover"]').disabled = !(!isNoTree && isRecycle);
          menuElem.querySelector('button[value="move_up"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="move_down"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="move_into"]').disabled = isNoTree;
          menuElem.querySelector('button[value="move_drag"]').disabled = isNoTree;
          menuElem.querySelector('button[value="recycle"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="delete"]').disabled = !(!isNoTree && isRecycle);

          menuElem.querySelector('button[value="recapture"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="meta"]').disabled = isNoTree;
        }

        if (!keepLogs) {
          document.getElementById('logger').textContent = '';
        }

        // refresh book tree
        if (!isNoTree) {
          await this.book.loadTreeFiles();
          await this.book.loadToc();
          await this.book.loadMeta();

          const rootId = this.rootId;
          if (!this.book.meta[rootId] && !this.book.isSpecialItem(rootId)) {
            throw new Error(`specified root item "${rootId}" does not exist.`);
          }
        }

        this.tree.init({
          book: this.book,
          rootId: this.rootId,
          allowSelect: true,
          allowMultiSelect: true,
          allowMultiSelectOnClick: this.mode === 'manage',
          allowAnchorClick: this.mode !== 'manage',
          allowDrag: true,
          allowDrop: true,
          itemAnchorClickCallback: this.onTreeItemAnchorClick,
          itemDragOverCallback: this.onTreeItemDragOver,
          itemDropCallback: this.onTreeItemDrop,
        });
        await this.tree.rebuild();
      } catch (ex) {
        console.error(ex);
        this.error(scrapbook.lang('ScrapBookErrorInitTree', [ex.message]));
        return;
      }

      this.enableUi(true);
    },

    /**
     * Reload tree data and rebuild the item tree.
     */
    async rebuild() {
      const refresh = !await this.book.validateTree();
      await this.book.loadMeta(refresh);
      await this.book.loadToc(refresh);
      await this.tree.rebuild();
    },

    onKeyDown(event) {
      if (!document.getElementById('command-popup-book').hidden) {
        if (event.code === "Escape") {
          event.preventDefault();
          this.showBookCommands(false);
          return;
        }

        if (event.code === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup-book button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup-book button:focus'));
          idx--;
          if (idx < 0) { idx = buttons.length - 1; }
          buttons[idx].focus();
          return;
        }

        if (event.code === "ArrowDown") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup-book button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup-book button:focus'));
          idx++;
          if (idx > buttons.length - 1) { idx = 0; }
          buttons[idx].focus();
          return;
        }

        return;
      }

      if (!document.getElementById('command-popup').hidden) {
        if (event.code === "Escape") {
          event.preventDefault();
          this.showCommands(false);
          return;
        }

        if (event.code === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup button:focus'));
          idx--;
          if (idx < 0) { idx = buttons.length - 1; }
          buttons[idx].focus();
          return;
        }

        if (event.code === "ArrowDown") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup button:focus'));
          idx++;
          if (idx > buttons.length - 1) { idx = 0; }
          buttons[idx].focus();
          return;
        }

        return;
      }

      {
        // skip if a modifier is pressed
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
          return;
        }

        // skip if command is diabled
        if (document.querySelector('#command:disabled')) {
          return;
        }

        // execute the corresponding command
        const command = {
          'F2': 'meta',
          'Delete': 'recycle',
        }[event.code];

        if (!command) {
          return;
        }

        // skip if command disabled
        if (document.querySelector(`#command-popup button[value="${command}"]:disabled`)) {
          return;
        }

        // execute command
        event.preventDefault();
        const evt = new CustomEvent("command", {
          detail: {
            command,
            itemElem: this.tree.getLastSelectedItemElem(),
            itemElems: this.tree.getSelectedItemElems(),
          },
        });
        window.dispatchEvent(evt);
      }
    },

    async onBookChange(event) {
      const bookId = event.target.value;
      await this.refresh(bookId, 'root');
    },

    onSearchButtonClick(event) {
      event.preventDefault();
      const url = new URL(browser.runtime.getURL(`scrapbook/search.html`));
      url.searchParams.set('id', this.bookId);
      if (this.rootId !== 'root') { url.searchParams.set('root', this.rootId); }
      this.openLink(url.href, "search");
    },

    onRefreshButtonClick(event) {
      event.preventDefault();
      location.reload();
    },

    onCommandButtonClick(event) {
      event.preventDefault();
      let clientX = event.clientX;
      let clientY = event.clientY;
      if (clientX === 0 && clientY === 0) {
        // keybord or other device
        const rect = document.getElementById('command').getBoundingClientRect();
        clientX = rect.left;
        clientY = rect.top;
      }
      this.showBookCommands(true, {clientX, clientY});
    },

    async onBookCommandClick(event) {
      if (event.target.localName !== 'button') { return; }

      this.showBookCommands(false);

      const command = event.target.value;

      switch (command) {
        case 'upload': {
          const elem = document.getElementById('upload-file-selector');
          elem.removeAttribute('data-item-elem');
          elem.value = '';
          elem.click();
          break;
        }

        default: {
          const evt = new CustomEvent("command", {
            detail: {
              command,
              itemElem: null,
              itemElems: [],
            },
          });
          window.dispatchEvent(evt);
        }
      }
    },

    async onBookCommandFocusOut(event) {
      // skip when focusing another descendant of the wrapper
      if (document.getElementById('command-popup-book').contains(event.relatedTarget)) {
        return;
      }

      this.showBookCommands(false);
    },

    async onCommandClick(event) {
      if (event.target.localName !== 'button') { return; }

      this.showCommands(false);

      const command = event.target.value;

      switch (command) {
        case 'upload': {
          const elem = document.getElementById('upload-file-selector');
          elem.setAttribute('data-item-elem', '');
          elem.value = '';
          elem.click();
          break;
        }

        default: {
          const evt = new CustomEvent("command", {
            detail: {
              command,
              itemElem: this.tree.getLastSelectedItemElem(),
              itemElems: this.tree.getSelectedItemElems(),
            },
          });
          window.dispatchEvent(evt);
        }
      }
    },

    async onCommandFocusOut(event) {
      // skip when focusing another descendant of the wrapper
      if (document.getElementById('command-popup').contains(event.relatedTarget)) {
        return;
      }

      this.showCommands(false);
    },

    /***
     * @param {Object} event.detail
     * @param {string} event.detail.command - the command being run
     * @param {(HTMLElement)[]} [event.detail.itemElems] - selected item elements
     * @param {File[]} [event.detail.files] - files being uploaded
     */
    async onCommandRun(event) {
      const detail = event.detail;

      this.enableUi(false);

      try {
        await this.commands[detail.command](detail);
      } catch (ex) {
        console.error(ex);
        this.error(ex.message);
        // when any error happens, the UI is possibility in an inconsistent status.
        // lock the UI to avoid further manipulation and damage.
        return;
      }

      this.enableUi(true);

      await this.tree.saveViewStatus();
    },

    onClickFileSelector(event) {
      event.preventDefault();
      const evt = new CustomEvent("command", {
        detail: {
          command: 'upload',
          itemElem: event.target.hasAttribute('data-item-elem') ? this.tree.getLastSelectedItemElem() : null,
          files: event.target.files,
        },
      });
      window.dispatchEvent(evt);
    },

    onWindowItemDragEnter(event) {
      return this.onWindowItemDragOver(event);
    },

    onWindowItemDragOver(event) {
      event.stopPropagation();
      event.preventDefault();
      return this.onTreeItemDragOver(event, {
        lastDraggedElems: this.tree.getSelectedItemElems(),
        isOnItem: false,
      });
    },

    async onWindowItemDrop(event) {
      event.stopPropagation();
      event.preventDefault();
      return await this.onTreeItemDrop(event, {
        lastDraggedElems: this.tree.getSelectedItemElems(),
        targetId: this.rootId,
        targetIndex: Infinity,
        isOnItem: false,
      });
    },

    onTreeContextMenu(event) {
      // disallow when commands disabled
      if (document.querySelector('#command:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      event.preventDefault();
      this.showCommands(true, event);
    },

    async onTreeItemAnchorClick(event, {
      tree,
    }) {
      if (browser.windows) {
        // for desktop browsers, open link in the same tab of the main window
        event.preventDefault();
        await this.openLink(event.currentTarget.href);
      } else {
        // for Firefox Android (browser.windows not supported)
        // use default action to open in the "webscrapbook" tab
      }
    },

    onTreeItemDragOver(event, {
      lastDraggedElems,
      isOnItem = true,
    }) {
      // disallow when commands disabled
      if (document.querySelector('#command:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      // disallow when drag disabled
      if (document.querySelector('#command-popup button[value="move_drag"]:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      if (event.dataTransfer.types.includes('application/scrapbook.items+json')) {
        if (lastDraggedElems && isOnItem) {
          // determine the drop effect according to modifiers
          if (event.altKey && this.rootId !== 'recycle') {
            event.dataTransfer.dropEffect = 'link';
          } else {
            event.dataTransfer.dropEffect = 'move';
          }
          return;
        }

        event.dataTransfer.dropEffect = 'none';
        return;
      }

      if (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') {
        event.dataTransfer.dropEffect = 'copy';
        return;
      }

      if (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle') {
        // determine the drop effect according to modifiers
        if (event.altKey) {
          event.dataTransfer.dropEffect = 'link';
        } else {
          event.dataTransfer.dropEffect = 'copy';
        }
        return;
      }

      if (event.dataTransfer.types.includes('text/html') && this.rootId !== 'recycle') {
        event.dataTransfer.dropEffect = 'copy';
        return;
      }

      if (event.dataTransfer.types.includes('text/plain') && this.rootId !== 'recycle') {
        event.dataTransfer.dropEffect = 'copy';
        return;
      }

      event.dataTransfer.dropEffect = 'none';
    },

    async onTreeItemDrop(event, {
      lastDraggedElems,
      targetId,
      targetIndex,
      isOnItem = true,
    }) {
      if (event.dataTransfer.types.includes('application/scrapbook.items+json')) {
        if (lastDraggedElems && isOnItem) {
          const selectedItemElems = lastDraggedElems;
          if (!selectedItemElems.length) {
            // this shouldn't happen as lastDraggedElems should be all selected
            return;
          }

          this.enableUi(false);

          try {
            if (event.altKey && this.rootId !== 'recycle') {
              await this.linkItems(selectedItemElems, targetId, targetIndex);
            } else {
              await this.moveItems(selectedItemElems, targetId, targetIndex);
            }
          } catch (ex) {
            console.error(ex);
            this.error(ex.message);
            // when any error happens, the UI is possibility in an inconsistent status.
            // lock the UI to avoid further manipulation and damage.
            return;
          }

          this.enableUi(true);
        }
        return;
      }

      if (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') {
        this.enableUi(false);

        try {
          const entries = Array.prototype.map.call(
            event.dataTransfer.items,
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
            } catch (ex) {}
          }

          await this.uploadItems(files, targetId, targetIndex);
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
        return;
      }

      if (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle') {
        this.enableUi(false);

        const mode = event.altKey ? 'bookmark' : event.shiftKey ? '' : 'source';
        try {
          const tasks = event.dataTransfer.getData('text/uri-list')
            .split('\r\n')
            .filter(x => !x.startsWith('#') && x.trim())
            .map(url => ({
              url,
              mode,
              options: {
                "capture.saveTo": "server",
              },
            }));
          await scrapbook.invokeCaptureEx({
            taskInfo: {
              tasks,
              parentId: targetId,
              index: targetIndex,
            },
            waitForResponse: true,
          });

          await this.rebuild();
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
        return;
      }

      if (event.dataTransfer.types.includes('text/html') && this.rootId !== 'recycle') {
        this.enableUi(false);

        try {
          await this.captureNote({
            targetId,
            targetIndex,
            type: 'html',
            content: event.dataTransfer.getData('text/html'),
          });
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
        return;
      }

      if (event.dataTransfer.types.includes('text/plain') && this.rootId !== 'recycle') {
        this.enableUi(false);

        try {
          await this.captureNote({
            targetId,
            targetIndex,
            type: 'text',
            content: event.dataTransfer.getData('text/plain'),
          });
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
        return;
      }
    },

    /**
     * Locate item position in the sidebar.
     *
     * Provide {bookId, id}, {url}, or {bookId, url}.
     *
     * @kind invokable
     */
    async locate({bookId, id, url}) {
      if (this.mode !== 'normal') { return null; }

      // if url is provided and bookId not specified, find bookId from url.
      if (url && typeof bookId === 'undefined') {
        bookId = await server.findBookIdFromUrl(url);
      }

      // search for the item
      const book = server.books[bookId];
      if (!book || book.config.no_tree) { return null; }

      // -- load (on demand) as book could have been changed
      await book.loadTreeFiles();
      await book.loadToc();
      await book.loadMeta();

      let item;
      if (id) {
        item = book.meta[id];
      } else if (url) {
        item = await book.findItemFromUrl(url);
      }
      if (!item) { return null; }

      let rootId = this.rootId;
      let paths = book.findItemPaths(item.id, this.rootId);
      if (!paths.length) {
        // attempt to search under other special root ID
        for (rootId of book.specialItems) {
          if (rootId === this.rootId) { continue; }
          paths = book.findItemPaths(item.id, rootId);
          if (paths.length) { break; }
        }

        // return if still not found
        if (!paths.length) {
          return null;
        }
      }

      // switch if bookId or rootId is not current
      if (bookId !== this.bookId || rootId !== this.rootId) {
        await this.refresh(bookId, rootId);
      }

      if (this.tree.locate(item.id, paths)) {
        return item;
      }
    },

    log(msg) {
      document.getElementById("logger").appendChild(document.createTextNode(msg + '\n'));
    },

    warn(msg) {
      const span = document.createElement('span');
      span.className = 'warn';
      span.appendChild(document.createTextNode(msg + '\n'));
      document.getElementById("logger").appendChild(span);
    },

    error(msg) {
      const span = document.createElement('span');
      span.className = 'error';
      span.appendChild(document.createTextNode(msg + '\n'));
      document.getElementById("logger").appendChild(span);
    },

    enableUi(willEnable) {
      document.getElementById('book').disabled = !willEnable;
      document.getElementById('command').disabled = !willEnable;
      document.getElementById('search').disabled = !(willEnable && !this.book.config.no_tree);
    },

    showBookCommands(willShow = document.getElementById('command-popup-book').hidden, pos = {}) {
      const menuElem = document.getElementById('command-popup-book');

      if (!willShow) {
        menuElem.hidden = true;
        return;
      }

      const isRecycle = this.rootId === 'recycle';

      menuElem.querySelector('button[value="index"]').hidden = false;
      menuElem.querySelector('button[value="exec_book"]').hidden = false;
      menuElem.querySelector('button[value="manage"]').hidden = false;
      menuElem.querySelector('button[value="sort"]').hidden = !(!isRecycle);

      menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
      menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
      menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
      menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

      menuElem.querySelector('button[value="view_recycle"]').hidden = !(!isRecycle);

      // show/hide each separator if there are shown items around it
      let hasShownItem = false;
      let lastSep = null;
      for (const elem of menuElem.querySelectorAll('button, hr')) {
        if (elem.localName === 'hr') {
          elem.hidden = true;
          if (hasShownItem) { lastSep = elem; }
          hasShownItem = false;
        } else {
          if (!elem.hidden) {
            hasShownItem = true;
            if (lastSep) {
              lastSep.hidden = false;
              lastSep = null;
            }
          }
        }
      }

      // show menu and fix position
      menuElem.style.setProperty('max-width', '95vw');
      menuElem.style.setProperty('max-height', '95vh');
      menuElem.hidden = false;

      const {clientX = 0, clientY = 0} = pos;
      const viewport = scrapbook.getViewport(window);
      const anchorPos = scrapbook.getAnchoredPosition(menuElem, {
        clientX: Math.min(Math.max(clientX, 0), viewport.width - menuElem.offsetWidth),
        clientY: Math.min(Math.max(clientY, 0), viewport.height - menuElem.offsetHeight),
      }, viewport);
      menuElem.style.setProperty('left', anchorPos.left + 'px');
      menuElem.style.setProperty('top', anchorPos.top + 'px');

      menuElem.focus();
    },

    showCommands(willShow = document.getElementById('command-popup').hidden, pos = {}) {
      const menuElem = document.getElementById('command-popup');

      if (!willShow) {
        menuElem.hidden = true;
        return;
      }

      const selectedItemElems = this.tree.getSelectedItemElems();

      const isRecycle = this.rootId === 'recycle';

      switch (selectedItemElems.length) {
        case 0: {
          menuElem.querySelector('button[value="opentab"]').hidden = true;
          menuElem.querySelector('button[value="view_text"]').hidden = true;
          menuElem.querySelector('button[value="exec"]').hidden = true;
          menuElem.querySelector('button[value="browse"]').hidden = true;
          menuElem.querySelector('button[value="source"]').hidden = true;
          menuElem.querySelector('button[value="manage"]').hidden = false;
          menuElem.querySelector('button[value="search_in"]').hidden = true;
          menuElem.querySelector('button[value="sort"]').hidden = true;

          menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="edit"]').hidden = true;
          menuElem.querySelector('button[value="recover"]').hidden = true;
          menuElem.querySelector('button[value="move_up"]').hidden = true;
          menuElem.querySelector('button[value="move_down"]').hidden = true;
          menuElem.querySelector('button[value="move_into"]').hidden = true;
          menuElem.querySelector('button[value="recycle"]').hidden = true;
          menuElem.querySelector('button[value="delete"]').hidden = true;

          menuElem.querySelector('button[value="recapture"]').hidden = true;
          menuElem.querySelector('button[value="meta"]').hidden = true;
          break;
        }

        case 1: {
          const item = this.book.meta[selectedItemElems[0].getAttribute('data-id')];

          menuElem.querySelector('button[value="opentab"]').hidden = ['folder', 'separator'].includes(item.type);
          menuElem.querySelector('button[value="view_text"]').hidden = !(item.type === 'file' && item.index);
          menuElem.querySelector('button[value="exec"]').hidden = !(item.type === 'file' && item.index);
          menuElem.querySelector('button[value="browse"]').hidden = !(item.index);
          menuElem.querySelector('button[value="source"]').hidden = !(item.source);
          menuElem.querySelector('button[value="manage"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));
          menuElem.querySelector('button[value="search_in"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));
          menuElem.querySelector('button[value="sort"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));

          menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="edit"]').hidden = !(!isRecycle && ['note'].includes(item.type) && item.index);
          menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
          menuElem.querySelector('button[value="move_up"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="move_down"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="move_into"]').hidden = false;
          menuElem.querySelector('button[value="recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="delete"]').hidden = !(isRecycle);

          menuElem.querySelector('button[value="recapture"]').hidden = !(!isRecycle && ['', 'site', 'file', 'image', 'bookmark'].includes(item.type) && item.source);
          menuElem.querySelector('button[value="meta"]').hidden = false;
          break;
        }

        default: {
          menuElem.querySelector('button[value="opentab"]').hidden = false;
          menuElem.querySelector('button[value="view_text"]').hidden = true;
          menuElem.querySelector('button[value="exec"]').hidden = true;
          menuElem.querySelector('button[value="browse"]').hidden = false;
          menuElem.querySelector('button[value="source"]').hidden = false;
          menuElem.querySelector('button[value="manage"]').hidden = true;
          menuElem.querySelector('button[value="search_in"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="sort"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="mkfolder"]').hidden = true;
          menuElem.querySelector('button[value="mksep"]').hidden = true;
          menuElem.querySelector('button[value="mknote"]').hidden = true;
          menuElem.querySelector('button[value="upload"]').hidden = true;

          menuElem.querySelector('button[value="edit"]').hidden = true;
          menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
          menuElem.querySelector('button[value="move_up"]').hidden = true;
          menuElem.querySelector('button[value="move_down"]').hidden = true;
          menuElem.querySelector('button[value="move_into"]').hidden = false;
          menuElem.querySelector('button[value="recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="delete"]').hidden = !(isRecycle);

          menuElem.querySelector('button[value="recapture"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="meta"]').hidden = true;
          break;
        }
      }

      // show/hide each separator if there are shown items around it
      let hasShownItem = false;
      let lastSep = null;
      for (const elem of menuElem.querySelectorAll('button, hr')) {
        if (elem.localName === 'hr') {
          elem.hidden = true;
          if (hasShownItem) { lastSep = elem; }
          hasShownItem = false;
        } else {
          if (!elem.hidden) {
            hasShownItem = true;
            if (lastSep) {
              lastSep.hidden = false;
              lastSep = null;
            }
          }
        }
      }

      // show menu and fix position
      menuElem.style.setProperty('max-width', '95vw');
      menuElem.style.setProperty('max-height', '95vh');
      menuElem.hidden = false;

      const {clientX = 0, clientY = 0} = pos;
      const viewport = scrapbook.getViewport(window);
      const anchorPos = scrapbook.getAnchoredPosition(menuElem, {
        clientX: Math.min(Math.max(clientX, 0), viewport.width - menuElem.offsetWidth),
        clientY: Math.min(Math.max(clientY, 0), viewport.height - menuElem.offsetHeight),
      }, viewport);
      menuElem.style.setProperty('left', anchorPos.left + 'px');
      menuElem.style.setProperty('top', anchorPos.top + 'px');

      menuElem.focus();
    },

    /**
     * @param {HTMLElement} elem - the element to be inserted to the dialog.
     *   - Dispatch 'dialogSubmit' event on elem to resolve the Promise with value.
     *   - Listen to 'dialogShow' event for elem to handle initialization.
     */
    async showDialog(elem) {
      const mask = document.getElementById('dialog-mask');
      const wrapper = document.getElementById('dialog-wrapper');
      const cancelElem = elem.querySelector('.cancel');

      const onKeyDown = (event) => {
        // skip if there's a modifier
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
          return;
        }

        if (event.code === "Escape" || event.code === "F10") {
          event.preventDefault();
          elem.dispatchEvent(new CustomEvent('dialogSubmit', {detail: null}));
        }
      };

      const onSubmit = (event) => {
        event.preventDefault();
        elem.dispatchEvent(new CustomEvent('dialogSubmit', {detail: true}));
      };

      const onCancel = (event) => {
        event.preventDefault();
        elem.dispatchEvent(new CustomEvent('dialogSubmit', {detail: null}));
      };

      wrapper.innerHTML = '';
      wrapper.appendChild(elem);
      this.enableUi(false);
      mask.hidden = false;

      if (!wrapper.hasAttribute('tabindex')) {
        wrapper.setAttribute('tabindex', -1);
      }
      wrapper.focus();

      window.addEventListener('keydown', onKeyDown, true);
      elem.addEventListener('submit', onSubmit);
      cancelElem.addEventListener('click', onCancel);

      const result = await new Promise((resolve, reject) => {
        elem.addEventListener('dialogSubmit', (event) => {
         resolve(event.detail);
        });
        elem.dispatchEvent(new CustomEvent('dialogShow', {detail: null}));
      });

      window.removeEventListener('keydown', onKeyDown, true);
      elem.removeEventListener('submit', onSubmit);
      cancelElem.removeEventListener('click', onCancel);

      mask.hidden = true;
      this.enableUi(true);

      return result;
    },

    async openModalWindow(url) {
      if (browser.windows) {
        await browser.windows.create({
          url,
          type: 'popup',
        });
      } else {
        await browser.tabs.create({
          url,
        });
      }
    },

    async openLink(url, newTab) {
      const getLastFocusedWindow = async (windowTypes = ['normal']) => {
        let win;
        try {
          win = await browser.windows.getLastFocused({
            populate: true,
            windowTypes,
          });
          if (!windowTypes.includes(win.type)) {
            // Firefox deprecates windowTypes argument and may get a last focused
            // window of a bad type. Attempt to get another window instead.
            win = (await browser.windows.getAll({
              populate: true,
            })).find(x => windowTypes.includes(x.type));
          }
          if (!win) {
            throw new Error('no last-focused window');
          }
        } catch (ex) {
          // no last-focused window
          return null;
        }
        return win;
      };

      if (newTab) {
        if (typeof newTab === 'string') {
          window.open(url, newTab);
          return;
        }

        if (scrapbook.userAgent.is('gecko') && browser.windows) {
          // Firefox < 60 (?) allows multiple tabs in a popup window,
          // but the user cannot switch between them.
          // Open the newTab in the last-focused window instead.
          if ((await browser.windows.getCurrent()).type !== 'normal') {
            const win = await getLastFocusedWindow();
            if (!win) {
              await browser.windows.create({
                url,
              });
              return;
            }

            await browser.tabs.create({
              windowId: win.id,
              url,
            });
            return;
          }
        }

        // Chromium allows only one tab in a popup window.
        // If the current tab is already in a popup, the newly created tab
        // will be in the most recently focused window, which does not work
        // same as window.getCurrentWindow or window.getLastFocusedWindow.
        const tab = await browser.tabs.create({
          url,
        });
        return;
      }

      if (browser.windows) {
        const win = await getLastFocusedWindow();
        if (!win) {
          await browser.windows.create({
            url,
          });
          return;
        }

        const targetTab = win.tabs.filter(x => x.active)[0];
        if (!targetTab) {
          await browser.tabs.create({
            windowId: win.id,
            url,
          });
          return;
        }

        await browser.tabs.update(targetTab.id, {
          url,
        });
      } else {
        const activeTab = (await browser.tabs.query({
          active: true,
        }))[0];
        if (!activeTab || activeTab.id === (await browser.tabs.getCurrent()).id) {
          await browser.tabs.create({
            url,
          });
          return;
        }

        await browser.tabs.update(activeTab.id, {
          url,
        });
      }
    },

    itemIsValidTarget(itemId) {
      return itemId && (!!this.book.meta[itemId] || this.book.isSpecialItem(itemId));
    },

    async moveItems(sourceItemElems, targetId, targetIndex) {
      // Reverse the order to always move an item before its parent so that
      // its parent is in the DOM and gets children updated correctly.
      const itemElems = [...sourceItemElems].reverse();

      for (const itemElem of itemElems) {
        if (!this.treeElem.contains(itemElem)) { continue; }

        const itemId = itemElem.getAttribute('data-id');

        // forbid moving self to a decendant as it will become non-reachagble
        if (this.book.getReachableItems(itemId).has(targetId)) { continue; }

        const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: parentItemId,
          currentIndex: index,
          targetParentId: targetId,
          targetIndex,
        });

        // update DOM
        this.tree.moveItem(itemId, parentItemId, index, targetId, newIndex);

        targetIndex = newIndex;
      }

      // upload changes to server
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
    },

    async linkItems(sourceItemElems, targetId, targetIndex) {
      for (const itemElem of sourceItemElems) {
        const itemId = itemElem.getAttribute('data-id');

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: null,
          targetParentId: targetId,
          targetIndex,
        });

        // update DOM
        this.tree.insertItem(itemId, targetId, newIndex);

        targetIndex = newIndex + 1;
      }

      // upload changes to server
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
    },

    async uploadItems(files, targetId, targetIndex) {
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          for (const file of files) {
            try {
              // create new item
              const newItem = this.book.addItem({
                item: {
                  "title": file.name,
                  "type": "file",
                },
                parentId: targetId,
                index: targetIndex,
              });
              newItem.index = newItem.id + '/index.html';

              let filename = file.name;
              if (filename === 'index.html') { filename = 'index-1.html'; }
              filename = scrapbook.validateFilename(filename, scrapbook.getOption("capture.saveAsciiFilename"));

              // upload file
              {
                const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/' + filename);
                await server.request({
                  url: target + '?a=save',
                  method: "POST",
                  format: 'json',
                  csrfToken: true,
                  body: {
                    upload: file,
                  },
                });
              }

              // upload index.html
              {
                const title = newItem.title;
                const url = scrapbook.escapeFilename(filename);
                const html = `<!DOCTYPE html>
<html data-scrapbook-type="file">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(url)}">${scrapbook.escapeHtml(filename, false)}</a>
</body>
</html>
`;
                const file = new File([html], 'index.html', {type: 'text/html'});
                const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.html');
                await server.request({
                  url: target + '?a=save',
                  method: "POST",
                  format: 'json',
                  csrfToken: true,
                  body: {
                    upload: file,
                  },
                });
              }

              // update DOM
              this.tree.insertItem(newItem.id, targetId, targetIndex);

              targetIndex++;
            } catch (ex) {
              console.error(ex);
              this.warn(`Unable to upload '${file.name}': ${ex.message}`);
            }
          }

          // save meta and TOC
          await book.saveMeta();
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
    },

    async captureNote({
      targetId,
      targetIndex,
      type,
      content,
    }) {
      let parentItemId = targetId;
      let index = targetIndex;

      // create new item
      const newItem = this.book.addItem({
        item: {
          "type": "note",
        },
        parentId: parentItemId,
        index,
      });
      newItem.index = newItem.id + '/index.html';

      // create file
      let target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);

      // prepare html content
      switch (type) {
        case 'html': {
          const doc = (new DOMParser()).parseFromString('<!DOCTYPE html>' + content, 'text/html');
          setMetaCharset: {
            let metaCharsetNode = doc.querySelector('meta[charset]');
            if (metaCharsetNode) {
              metaCharsetNode.setAttribute('charset', 'UTF-8');
              break setMetaCharset;
            }

            metaCharsetNode = doc.querySelector('meta[http-equiv="content-type"i][content]');
            if (metaCharsetNode) {
              metaCharsetNode.setAttribute('content', 'text/html; charset=UTF-8');
              break setMetaCharset;
            }

            metaCharsetNode = doc.head.appendChild(doc.createElement('meta'));
            metaCharsetNode.setAttribute('charset', 'UTF-8');
          }
          setMetaViewport: {
            let metaViewportNode = doc.querySelector('meta[name="viewport"i]');
            if (metaViewportNode) {
              break setMetaViewport;
            }

            metaViewportNode = doc.head.appendChild(doc.createElement('meta'));
            metaViewportNode.setAttribute('name', 'viewport');
            metaViewportNode.setAttribute('content', 'width=device-width');
          }
          content = scrapbook.doctypeToString(doc.doctype) + doc.documentElement.outerHTML;
          break;
        }
        default: {
          content = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
</head>
<body>
<pre style="white-space: pre-wrap;">
${scrapbook.escapeHtml(content)}
</pre>
</body>
</html>`;
          break;
        }
      }

      // upload data
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          // save data file
          const blob = new Blob([content], {type: 'text/plain'});
          await server.request({
            url: target + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              upload: blob,
            },
          });

          // save meta and TOC
          await book.saveMeta();
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });

      // update DOM
      this.tree.insertItem(newItem.id, parentItemId, index);
    },

    commands: {
      async index() {
        if (this.book.config.no_tree) {
          await this.openLink(this.book.dataUrl, true);
          return;
        }

        await this.openLink(this.book.indexUrl, true);
      },

      async exec_book() {
        const target = this.book.topUrl;
        await server.request({
          url: target + '?a=exec',
          method: "GET",
          format: 'json',
        });
      },

      async opentab({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          switch (item.type) {
            case 'folder':
            case 'separator': {
              break;
            }
            case 'bookmark': {
              if (item.source) {
                await this.openLink(item.source, true);
              }
              break;
            }
            case 'postit': {
              if (item.index) {
                const u = new URL(browser.runtime.getURL("scrapbook/postit.html"));
                u.searchParams.append('id', id);
                u.searchParams.append('bookId', this.book.id);
                await this.openLink(u.href, true);
              }
              break;
            }
            case 'file':
            default: {
              if (item.index) {
                const target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
                await this.openLink(target, true);
              }
              break;
            }
          }
        }
      },

      async view_text({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          let target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          if (target.endsWith('/index.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = redirectedTarget;
            }
          }

          const u = new URL(target);
          u.searchParams.set('a', 'source');
          if (item.charset) { u.searchParams.set('e', item.charset); }
          await this.openLink(u.href, true);
        }
      },

      async exec({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          let target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          if (target.endsWith('/index.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = scrapbook.splitUrlByAnchor(redirectedTarget)[0];
            }
          }

          await server.request({
            url: target + '?a=exec',
            method: "GET",
            format: 'json',
          });
        }
      },

      async browse({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          let target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          if (target.endsWith('/index.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = scrapbook.splitUrlByAnchor(redirectedTarget)[0];
            }
          }

          await server.request({
            url: target + '?a=browse',
            method: "GET",
            format: 'json',
          });
        }
      },

      async source({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (item.source) {
            const target = item.source;
            await this.openLink(target, true);
          }
        }
      },

      async manage({itemElems}) {
        const id = itemElems.length ? itemElems[0].getAttribute('data-id') : 'root';
        const urlObj = new URL(browser.runtime.getURL("scrapbook/manage.html"));
        urlObj.searchParams.set('id', this.bookId);
        urlObj.searchParams.set('root', id);
        const target = urlObj.href;
        if (this.mode === 'manage') {
          location.assign(target);
        } else {
          await this.openModalWindow(target);
        }
      },

      async search_in({itemElems}) {
        const urlObj = new URL(browser.runtime.getURL("scrapbook/search.html"));
        urlObj.searchParams.set('id', this.bookId);
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          urlObj.searchParams.append('root', id);
        }
        const target = urlObj.href;
        await this.openLink(target, true);
      },

      async sort({itemElems}) {
        const frag = document.importNode(document.getElementById('tpl-sort').content, true);
        const dialog = frag.children[0];
        scrapbook.loadLanguages(dialog);

        if (!await this.showDialog(dialog)) {
          return;
        }

        const key = dialog.key.value;
        const direction = dialog.direction.value;
        const recursive = dialog.recursive.checked;

        if (!(itemElems && itemElems.length)) {
          itemElems = [this.tree.getRootElem()];
        }
        const itemIds = itemElems.reduce((set, itemElem) => {
          const id = itemElem.getAttribute('data-id');
          if (recursive) {
            this.book.getReachableItems(id, set);
          } else {
            set.add(id);
          }
          return set;
        }, new Set());

        const meta = this.book.meta;
        const toc = this.book.toc;
        const order = (direction === 'desc') ? -1 : 1;

        let compareFunc;
        if (key === 'reverse') {
          for (const itemId of itemIds) {
            const subToc = toc[itemId];
            if (!(subToc && subToc.length)) { continue; }
            subToc.reverse();
          }
        } else {
          if (key === 'type') {
            const mapTypeValue = {
              folder: -1,
              bookmark: 1,
              postit: 2,
              note: 3,
            };
            compareFunc = (a, b) => {
              const va = mapTypeValue[meta[a].type] || 0;
              const vb = mapTypeValue[meta[b].type] || 0;
              if (va > vb) { return order; }
              if (va < vb) { return -order; }
              return 0;
            };
          } else if (key === 'marked') {
            compareFunc = (a, b) => {
              const va = meta[a].marked ? 0 : 1;
              const vb = meta[b].marked ? 0 : 1;
              if (va > vb) { return order; }
              if (va < vb) { return -order; }
              return 0;
            };
          } else {
            compareFunc = (a, b) => {
              const va = meta[a][key] || '';
              const vb = meta[b][key] || '';
              if (va > vb) { return order; }
              if (va < vb) { return -order; }
              return 0;
            };
          }

          for (const itemId of itemIds) {
            const subToc = toc[itemId];
            if (!(subToc && subToc.length)) { continue; }
            subToc.sort(compareFunc);
          }
        }

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        await this.tree.rebuild();
      },

      async meta({itemElem}) {
        if (!itemElem) { return; }

        const id = itemElem.getAttribute('data-id');
        const item = this.book.meta[id];

        const frag = document.importNode(document.getElementById('tpl-meta').content, true);
        const dialog = frag.children[0];
        scrapbook.loadLanguages(dialog);

        const isRecycle = this.rootId === 'recycle';

        dialog.querySelector('[name="id"]').value = id || "";
        dialog.querySelector('[name="parent"]').value = item.parent || "";
        dialog.querySelector('[name="recycled"]').value = item.recycled ? scrapbook.idToDate(item.recycled).toLocaleString() : "";
        dialog.querySelector('[name="title"]').value = item.title || "";
        dialog.querySelector('[name="index"]').value = item.index || "";
        dialog.querySelector('[name="source"]').value = item.source || "";
        dialog.querySelector('[name="icon"]').value = item.icon || "";
        dialog.querySelector('[name="type"]').value = item.type || "";
        dialog.querySelector('[name="marked"]').checked = item.marked;
        dialog.querySelector('[name="locked"]').checked = item.locked;
        dialog.querySelector('[name="charset"]').value = item.charset || "";
        dialog.querySelector('[name="create"]').value = item.create ? scrapbook.idToDate(item.create).toLocaleString() : "";
        dialog.querySelector('[name="modify"]').value = item.modify ? scrapbook.idToDate(item.modify).toLocaleString() : "";
        dialog.querySelector('[name="comment"]').value = item.comment || "";

        if (['postit'].includes(item.type)) {
          dialog.querySelector('[name="title"]').setAttribute('readonly', '');
        } else {
          dialog.querySelector('[name="title"]').removeAttribute('readonly');
        }

        dialog.querySelector('[name="parent"]').parentNode.parentNode.hidden = !(isRecycle);
        dialog.querySelector('[name="recycled"]').parentNode.parentNode.hidden = !(isRecycle);
        dialog.querySelector('[name="index"]').parentNode.parentNode.hidden = ['folder', 'separator', 'postit'].includes(item.type);
        dialog.querySelector('[name="source"]').parentNode.parentNode.hidden = ['folder', 'separator', 'postit'].includes(item.type);
        dialog.querySelector('[name="icon"]').parentNode.parentNode.hidden = ['separator', 'postit'].includes(item.type);
        dialog.querySelector('[name="marked"]').parentNode.parentNode.hidden = ['separator'].includes(item.type);
        dialog.querySelector('[name="locked"]').parentNode.parentNode.hidden = ['folder', 'separator', 'bookmark', 'postit'].includes(item.type);
        dialog.querySelector('[name="charset"]').parentNode.parentNode.hidden = ['folder', 'separator', 'bookmark', 'postit'].includes(item.type);

        dialog.addEventListener('dialogShow', (event) => {
          dialog.querySelector('[name="title"]').focus();
        });

        if (!await this.showDialog(dialog)) {
          return;
        }

        const dialogData = {
          marked: dialog.querySelector('[name="marked"]').checked,
          locked: dialog.querySelector('[name="locked"]').checked,
          title: dialog.querySelector('[name="title"]').value,
          index: dialog.querySelector('[name="index"]').value,
          source: dialog.querySelector('[name="source"]').value,
          icon: dialog.querySelector('[name="icon"]').value,
          charset: dialog.querySelector('[name="charset"]').value,
          comment: dialog.querySelector('[name="comment"]').value,
        };
        const newItem = this.book.addItem({
          item,
          parentId: null,
        });
        for (const [key, value] of Object.entries(dialogData)) {
          if (value || typeof item[key] !== 'undefined') {
            newItem[key] = value;
          }
        }

        // save meta
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);
          },
        });

        // update DOM
        this.tree.refreshItem(id);
      },

      async mkfolder({itemElem}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          // insert after the selected one
          index += 1;
        }

        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": scrapbook.lang('ScrapBookNewFolderName'),
            "type": "folder",
          },
          parentId: parentItemId,
          index,
        });

        // save meta and TOC
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        // update DOM
        this.tree.insertItem(newItem.id, parentItemId, index);
      },

      async mksep({itemElem}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          // insert after the selected one
          index += 1;
        }

        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": "",
            "type": "separator",
          },
          parentId: parentItemId,
          index,
        });

        // save meta and TOC
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        // update DOM
        this.tree.insertItem(newItem.id, parentItemId, index);
      },

      async mknote({itemElem}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          // insert after the selected one
          index += 1;
        }

        let type;
        {
          const frag = document.importNode(document.getElementById('tpl-mknote').content, true);
          const dialog = frag.children[0];
          scrapbook.loadLanguages(dialog);

          dialog.addEventListener('dialogShow', (event) => {
            dialog.querySelector('[name="format"]').focus();
          });

          if (!await this.showDialog(dialog)) {
            return;
          }

          type = dialog['format'].value;
        }

        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": scrapbook.lang('ScrapBookNewNoteName'),
            "type": "note",
          },
          parentId: parentItemId,
          index,
        });
        newItem.index = newItem.id + '/index.html';

        // create file
        let target;
        switch (type) {
          case 'html': {
            target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);
            break;
          }
          case 'markdown': {
            target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.md');
            break;
          }
        }

        // generate content
        const content = await this.book.renderTemplate(target, newItem, type);
        const blob = new Blob([content], {type: 'text/plain'});

        // save meta and TOC
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        // save data files
        await server.request({
          url: target + '?a=save',
          method: "POST",
          format: 'json',
          csrfToken: true,
          body: {
            upload: blob,
          },
        });

        if (type === 'markdown') {
          const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.html');
          const content = `<!DOCTYPE html>
<html data-scrapbook-type="note">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=index.md">
</head>
<body>
Redirecting to file <a href="index.md">index.md</a>
</body>
</html>`;
          const blob = new Blob([content], {type: 'text/plain'});
          await server.request({
            url: target + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              upload: blob,
            },
          });
        }

        // update DOM
        this.tree.insertItem(newItem.id, parentItemId, index);

        // open link
        switch (type) {
          case 'html': {
            await this.openLink(target, true);
            break;
          }

          case 'markdown': {
            const u = new URL(browser.runtime.getURL("scrapbook/edit.html"));
            u.searchParams.set('id', newItem.id);
            u.searchParams.set('bookId', this.bookId);
            await this.openLink(u.href, true);
            break;
          }
        }
      },

      async upload({itemElem, files}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          // insert after the selected one
          index += 1;
        }

        await this.uploadItems(files, parentItemId, index);
      },

      async edit({itemElem}) {
        if (!itemElem) { return; }

        const id = itemElem.getAttribute('data-id');
        const urlObj = new URL(browser.runtime.getURL("scrapbook/edit.html"));
        urlObj.searchParams.set('id', id);
        urlObj.searchParams.set('bookId', this.bookId);
        await this.openLink(urlObj.href, true);
      },

      async recapture({itemElems}) {
        if (!itemElems.length) { return; }

        const tasks = [];
        for (const itemElem of itemElems) {
          const id = itemElem.getAttribute('data-id');
          const item = this.book.meta[id];

          if (!['', 'site', 'file', 'image', 'bookmark'].includes(item.type)) {
            continue;
          }

          const url = item.source;
          if (!scrapbook.isContentPage(url, false)) {
            continue;
          }

          tasks.push({
            url,
            title: item.title || item.id,
            recaptureInfo: {
              bookId: this.book.id,
              itemId: id,
            },
          });
        }

        await scrapbook.invokeBatchCapture({
          taskInfo: {
            tasks,
          },
          useJson: true,
          uniquify: false,
        });
      },

      async move_up({itemElem}) {
        if (!this.treeElem.contains(itemElem)) { return; }

        const itemId = itemElem.getAttribute('data-id');
        const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);
        if (!(index > 0)) { return; }

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: parentItemId,
          currentIndex: index,
          targetParentId: parentItemId,
          targetIndex: index - 1,
        });

        // update DOM
        this.tree.moveItem(itemId, parentItemId, index, parentItemId, newIndex);

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async move_down({itemElem}) {
        if (!this.treeElem.contains(itemElem)) { return; }

        const itemId = itemElem.getAttribute('data-id');
        const {parentItemId, index, siblingItems} = this.tree.getParentAndIndex(itemElem);
        if (!(index < siblingItems.length - 1)) { return; }

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: parentItemId,
          currentIndex: index,
          targetParentId: parentItemId,
          targetIndex: index + 2,
        });

        // update DOM
        this.tree.moveItem(itemId, parentItemId, index, parentItemId, newIndex);

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async move_into({itemElems}) {
        if (!itemElems.length) { return; }

        let targetId;
        let targetIndex;
        let mode;
        {
          const frag = document.importNode(document.getElementById('tpl-move-into').content, true);
          const dialog = frag.children[0];
          scrapbook.loadLanguages(dialog);

          // disable link mode for recycling bin
          if (this.rootId === 'recycle') {
            dialog.querySelector('[name="mode"][value="link"]').disabled = true;
          }

          dialog.addEventListener('dialogShow', (event) => {
            dialog.querySelector('[name="id"]').focus();
          });

          if (!await this.showDialog(dialog)) {
            return;
          }

          targetId = dialog.querySelector('[name="id"]').value;
          targetIndex = parseInt(dialog.querySelector('[name="index"]').value, 10);
          targetIndex = isNaN(targetIndex) ? Infinity : Math.max(targetIndex, 0);
          mode = dialog['mode'].value;
        }

        if (!this.itemIsValidTarget(targetId)) { return; }

        switch (mode) {
          case "link": {
            await this.linkItems(itemElems, targetId, targetIndex);
            break;
          }
          case "move":
          default: {
            await this.moveItems(itemElems, targetId, targetIndex);
            break;
          }
        }
      },

      async recycle({itemElems}) {
        if (!itemElems.length) { return; }

        // Reverse the order to always move an item before its parent so that
        // its parent is in the DOM and gets children updated correctly.
        itemElems = [...itemElems].reverse();

        let targetIndex = Infinity;
        for (const itemElem of itemElems) {
          if (!this.treeElem.contains(itemElem)) { continue; }

          const itemId = itemElem.getAttribute('data-id');
          const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);

          // remove this and descendant items from Book
          const newIndex = this.book.recycleItemTree({
            id: itemId,
            currentParentId: parentItemId,
            currentIndex: index,
            targetIndex,
          });

          // update DOM
          this.tree.removeItem(parentItemId, index);

          targetIndex = newIndex;
        }

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async delete({itemElems}) {
        if (!itemElems.length) { return; }

        const removeDataFiles = async (itemIndexFile) => {
          if (!itemIndexFile) { return; }
          const index = itemIndexFile.replace(/\/index.[^.]+$/, '');
          const target = this.book.dataUrl + scrapbook.escapeFilename(index);
          await server.request({
            url: target + '?a=delete',
            method: "POST",
            format: 'json',
            csrfToken: true,
          });
        };

        // Reverse the order to always move an item before its parent so that
        // its parent is in the DOM and gets children updated correctly.
        itemElems = [...itemElems].reverse();

        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            let allRemovedItems = [];
            for (const itemElem of itemElems) {
              if (!this.treeElem.contains(itemElem)) { continue; }

              const itemId = itemElem.getAttribute('data-id');
              const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);

              // remove this and descendant items from Book
              const removedItems = this.book.removeItemTree({
                id: itemId,
                parentId: parentItemId,
                index,
              });
              for (const i of removedItems) {
                allRemovedItems.push(i.id);
              }

              // update DOM
              this.tree.removeItem(parentItemId, index);

              // remove data files
              for (const removedItem of removedItems) {
                if (!removedItem.index) { continue; }
                try {
                  await removeDataFiles(removedItem.index);
                } catch (ex) {
                  console.error(ex);
                  this.warn(`Unable to delete '${removedItem.index}': ${ex.message}`);
                }
              }
            }

            // upload changes to server
            if (allRemovedItems.length > 0) {
              await book.saveMeta();
            }
            await book.saveToc();

            if (allRemovedItems.length > 0) {
              // Due to a concern of URL length and performance, skip cache
              // update if too many items are affected. Cache update for
              // deleted items can be safely deferred as deleted items aren't
              // shown in the search result anyway.
              if (allRemovedItems.length <= 20) {
                await server.requestSse({
                  query: {
                    "a": "cache",
                    "book": book.id,
                    "item": allRemovedItems,
                    "fulltext": 1,
                    "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
                    "no_lock": 1,
                    "no_backup": 1,
                  },
                  onMessage(info) {
                    if (['error', 'critical'].includes(info.type)) {
                      this.error(`Error when updating fulltext cache: ${info.msg}`);
                    }
                  },
                });
              }
            }

            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async recover({itemElems}) {
        if (!itemElems.length) { return; }

        // Handle items in order so that the order of recovered items is
        // preserved if they have same parent.
        // If a recycled item A has a child B, B will be removed from the DOM
        // when A is removed, and its moving will be skipped.
        for (const itemElem of itemElems) {
          if (!this.treeElem.contains(itemElem)) { continue; }

          const itemId = itemElem.getAttribute('data-id');
          const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);

          let targetId = this.book.meta[itemId].parent || 'root';

          // move to root instead if the original parent no more exists
          if (!(this.book.meta[targetId] || this.book.isSpecialItem(targetId))) {
            targetId = 'root';
          }

          if (targetId !== parentItemId) {
            // update TOC
            const newIndex = this.book.moveItem({
              id: itemId,
              currentParentId: parentItemId,
              currentIndex: index,
              targetParentId: targetId,
              targetIndex: Infinity,
            });

            // remove parent and recycled time record
            delete this.book.meta[itemId].parent;
            delete this.book.meta[itemId].recycled;

            // update DOM
            this.tree.removeItem(parentItemId, index);
            this.tree.insertItem(itemId, targetId, newIndex);
          }
        }

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async view_recycle() {
        const urlObj = new URL(browser.runtime.getURL("scrapbook/manage.html"));
        urlObj.searchParams.set('id', this.bookId);
        urlObj.searchParams.set('root', 'recycle');
        const target = urlObj.href;
        if (this.mode === 'manage') {
          location.assign(target);
        } else {
          await this.openModalWindow(target);
        }
      },
    },
  };

  scrapbook.addMessageListener((message, sender) => {
    if (!message.cmd.startsWith("sidebar.")) { return false; }
    if (message.id && message.id !== sidebar.sidebarWindowId) { return false; }
    return true;
  });

  // record current windowId for later validation if it's sidebar
  if (browser.sidebarAction && browser.windows) {
    (async () => {
      // Firefox has an issue that getViews({windowId}) does not contain sidebars.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1612390
      if ((await browser.extension.getViews({type: 'sidebar'})).some(v => v === window)) {
        sidebar.sidebarWindowId = (await browser.windows.getCurrent()).id;
      }
    })();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    scrapbook.loadLanguages(document);

    await sidebar.init();
  });


  return sidebar;

}));
