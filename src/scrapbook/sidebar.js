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

  const customDataMap = new WeakMap();

  const sidebar = {
    tree: null,
    treeElem: null,
    bookId: null,
    book: null,
    rootId: null,
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

      document.getElementById("book").addEventListener('change', this.onBookChange);
      document.getElementById("search").addEventListener('click', this.onSearchButtonClick);
      document.getElementById("refresh").addEventListener('click', this.onRefreshButtonClick);
      document.getElementById("command").addEventListener('click', this.onCommandButtonClick);

      document.getElementById("command-popup-book").addEventListener('click', this.onBookCommandClick);
      document.getElementById("command-popup-book").addEventListener('focusout', this.onBookCommandFocusOut);

      document.getElementById("command-popup").addEventListener('click', this.onCommandClick);
      document.getElementById("command-popup").addEventListener('focusout', this.onCommandFocusOut);

      document.getElementById('upload-file-selector').addEventListener('change', this.onClickFileSelector);

      window.addEventListener('customCommand', this.onCustomCommandRun);

      // load config
      await scrapbook.loadOptionsAuto;

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

        // For authentication failure, show alternative login link if user and
        // password not configured.
        if (ex.status === 401 && (server._user === null || server._password === null)) {
          const a = document.createElement('a');
          a.href = location.href;
          a.target = 'login';
          a.textContent = scrapbook.lang('WarnSidebarLoginPromptMissing');
          this.error(a);
        }

        return;
      }

      // load URL params
      const urlParams = new URL(document.URL).searchParams;
      const bookId = urlParams.has('id') ? urlParams.get('id') : server.bookId;
      const rootId = urlParams.get('root') || 'root';

      // init tree instance
      this.treeElem = document.getElementById('items');
      this.tree = new BookTree({
        treeElem: this.treeElem,
        cacheType: this.mode === 'normal' ? 'storage' : 'sessionStorage',
      });

      await this.refresh(bookId, rootId, true);
    },

    /**
     * Update UI to match the given bookId and rootId.
     */
    async refresh(bookId, rootId, initial = false) {
      // save current active element
      const activeElement = document.activeElement;

      this.enableUi(false);

      // clear logs
      if (!initial) {
        document.getElementById('logger').textContent = '';
      }

      try {
        // update bookId
        if (typeof bookId === 'string' && bookId !== this.bookId) {
          let requireUpdateBooks = true;

          if (!initial) {
            await scrapbook.cache.set({table: "scrapbookServer", key: "currentScrapbook"}, bookId, 'storage');

            await this.savePostit();
            await this.uneditPostit();

            // reload server config in case there has been a change
            requireUpdateBooks = await server.init(true);
          }

          // update current book
          this.bookId = bookId;
          this.book = server.books[bookId];

          if (!this.book) {
            this.warn(scrapbook.lang('ScrapBookErrorBookNotExist', [bookId]));
            bookId = this.bookId = '';
            this.book = server.books[bookId];
            await scrapbook.cache.set({table: "scrapbookServer", key: "currentScrapbook"}, bookId, 'storage');
          }

          // update book selector
          if (this.mode === 'normal' && requireUpdateBooks) {
            const wrapper = document.getElementById('book');
            wrapper.textContent = '';
            for (const bookId of Object.keys(server.books).sort()) {
              const book = server.books[bookId];
              const opt = wrapper.appendChild(document.createElement('option'));
              opt.value = book.id;
              opt.textContent = book.name;
            }
            wrapper.value = bookId;
            wrapper.hidden = false;
          }

          document.getElementById('book').value = bookId;
        }

        // update rootId
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
          menuElem.querySelector('button[value="exec_book"]').disabled = !(isLocal);
          menuElem.querySelector('button[value="manage"]').disabled = isNoTree;
          menuElem.querySelector('button[value="sort"]').disabled = isNoTree;

          menuElem.querySelector('button[value="mkfolder"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mksep"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mkpostit"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mknote"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="upload"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="view_recycle"]').disabled = isNoTree;

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
          menuElem.querySelector('button[value="mkpostit"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mknote"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="upload"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="edit"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="recover"]').disabled = !(!isNoTree && isRecycle);
          menuElem.querySelector('button[value="move_up"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="move_down"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="move_into"]').disabled = isNoTree;
          menuElem.querySelector('button[value="copy_into"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="drag"]').disabled = isNoTree;
          menuElem.querySelector('button[value="recycle"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="delete"]').disabled = !(!isNoTree && isRecycle);

          menuElem.querySelector('button[value="recapture"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="copyinfo"]').disabled = isNoTree;
          menuElem.querySelector('button[value="meta"]').disabled = isNoTree;
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
        } else {
          this.log(scrapbook.lang('ScrapBookNoTree'));
        }

        this.tree.init({
          book: this.book,
          rootId: this.rootId,
          allowSelect: true,
          allowMultiSelect: true,
          allowMultiSelectOnClick: this.mode === 'manage',
          allowAnchorClick: this.mode !== 'manage',
          allowContextMenu: true,
          allowKeyboardNavigation: true,
          allowDrag: true,
          allowDrop: true,
          allowCopy: true,
          allowPaste: true,
          contextMenuCallback: this.onTreeContextMenu,
          pasteCallback: this.onTreePaste,
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

      // restore active element
      if (activeElement) {
        activeElement.focus();
      }
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
        const evt = new CustomEvent("customCommand", {
          detail: {
            command,
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
      const newTab = event.shiftKey || event.ctrlKey || scrapbook.getOption("scrapbook.sidebarSearchInNewTab");
      const url = new URL(browser.runtime.getURL(`scrapbook/search.html`));
      url.searchParams.set('id', this.bookId);
      if (this.rootId !== 'root') { url.searchParams.set('root', this.rootId); }
      this.openLink(url.href, newTab);
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
      const {ctrlKey, shiftKey, altKey, metaKey} = event;
      const modifiers = {ctrlKey, shiftKey, altKey, metaKey};

      switch (command) {
        case 'upload': {
          const elem = document.getElementById('upload-file-selector');
          customDataMap.set(elem, {
            items: false,
            modifiers,
          });
          elem.value = '';
          elem.click();
          break;
        }

        default: {
          const evt = new CustomEvent("customCommand", {
            detail: {
              command,
              itemElems: [],
              modifiers,
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
      const {ctrlKey, shiftKey, altKey, metaKey} = event;
      const modifiers = {ctrlKey, shiftKey, altKey, metaKey};

      switch (command) {
        case 'upload': {
          const elem = document.getElementById('upload-file-selector');
          customDataMap.set(elem, {
            items: true,
            modifiers,
          });
          elem.value = '';
          elem.click();
          break;
        }

        default: {
          const evt = new CustomEvent("customCommand", {
            detail: {
              command,
              itemElems: this.tree.getSelectedItemElems(),
              modifiers,
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
    async onCustomCommandRun(event) {
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
      const detail = customDataMap.get(document.getElementById('upload-file-selector'));
      const evt = new CustomEvent("customCommand", {
        detail: {
          command: 'upload',
          itemElems: detail.items ? this.tree.getSelectedItemElems() : [],
          files: event.target.files,
          modifiers: detail.modifiers,
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
        lastDraggedElems: this.tree.lastDraggedElems,
        isOnItem: false,
      });
    },

    async onWindowItemDrop(event) {
      event.stopPropagation();
      event.preventDefault();
      return await this.onTreeItemDrop(event, {
        lastDraggedElems: this.tree.lastDraggedElems,
        targetId: this.rootId,
        isOnItem: false,
      });
    },

    onTreeContextMenu(event) {
      // disallow when commands disabled
      if (document.querySelector('#command:disabled')) {
        return;
      }

      event.preventDefault();
      this.showCommands(true, event);
    },

    async onTreePaste(event, {
      targetId,
      targetIndex,
    }) {
      // disallow when commands disabled
      if (document.querySelector('#command:disabled')) {
        return;
      }

      if (event.clipboardData.types.includes('application/scrapbook.items+json')) {
        const data = JSON.parse(event.clipboardData.getData('application/scrapbook.items+json'));
        if (!data.items) {
          return;
        }

        this.enableUi(false);

        try {
          if (this.rootId !== 'recycle') {
            await this.copyItems(data, targetId, targetIndex);
          }
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

    async onTreeItemAnchorClick(event, {
      tree,
    }) {
      const anchorElem = event.currentTarget;
      const itemElem = anchorElem.parentNode.parentNode;

      event.preventDefault();

      // special handling for postit
      if (itemElem.getAttribute('data-type') === 'postit') {
        if (scrapbook.getOption("scrapbook.sidebarEditPostitInNewTab")) {
          await this.openLink(anchorElem.href, true);
        } else {
          await this.editPostit(itemElem.getAttribute('data-id'));
        }
        return;
      }

      // special handling for note
      if (itemElem.getAttribute('data-type') === 'note') {
        await this.openLink(anchorElem.href, scrapbook.getOption("scrapbook.sidebarEditNoteInNewTab"));
        return;
      }

      await this.openLink(anchorElem.href, scrapbook.getOption("scrapbook.sidebarOpenInNewTab"));
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
      if (document.querySelector('#command-popup button[value="drag"]:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      if (event.dataTransfer.types.includes('application/scrapbook.items+json')) {
        if (isOnItem || !lastDraggedElems) {
          if (!lastDraggedElems) {
            // dragged from a different window
            if (this.rootId !== 'recycle') {
              event.dataTransfer.dropEffect = 'copy';
            } else {
              event.dataTransfer.dropEffect = 'none';
            }
          } else if (event.altKey && this.rootId !== 'recycle') {
            event.dataTransfer.dropEffect = 'link';
          } else if (event.shiftKey && this.rootId !== 'recycle') {
            event.dataTransfer.dropEffect = 'copy';
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

      if (event.dataTransfer.types.includes('application/scrapbook.capturetabs+json') && this.rootId !== 'recycle') {
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
        if (isOnItem || !lastDraggedElems) {
          const data = JSON.parse(event.dataTransfer.getData('application/scrapbook.items+json'));
          if (!data.items) {
            return;
          }

          this.enableUi(false);

          try {
            if (!lastDraggedElems) {
              // drag from a different window
              if (this.rootId !== 'recycle') {
                await this.copyItems(data, targetId, targetIndex);
              }
            } else if (event.altKey && this.rootId !== 'recycle') {
              await this.linkItems(lastDraggedElems, targetId, targetIndex);
            } else if (event.shiftKey && this.rootId !== 'recycle') {
              await this.copyItems(data, targetId, targetIndex);
            } else {
              await this.moveItems(lastDraggedElems, targetId, targetIndex);
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

      if (event.dataTransfer.types.includes('application/scrapbook.capturetabs+json') && this.rootId !== 'recycle') {
        this.enableUi(false);
        try {
          const data = JSON.parse(event.dataTransfer.getData('application/scrapbook.capturetabs+json'));
          const targetTab = await browser.tabs.get(data.tabId);
          const tabs = await scrapbook.getHighlightedTabs({windowId: targetTab.windowId});
          const mode = event.altKey ? 'bookmark' : event.shiftKey ? 'source' : data.mode;
          const taskInfo = {
            tasks: tabs.map(tab => ({
              tabId: tab.id,
              title: tab.title,
            })),
            bookId: this.bookId,
            parentId: targetId,
            index: targetIndex,
            mode,
            delay: null,
            options: Object.assign(scrapbook.getOptions("capture"), {
              "capture.saveTo": "server",
            }),
          };

          if (event.ctrlKey || data.captureAs) {
            await scrapbook.invokeCaptureAs(taskInfo);
          } else {
            await scrapbook.invokeCaptureEx({
              taskInfo,
              waitForResponse: true,
            });

            await this.rebuild();
          }
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

        const mode = event.altKey ? 'bookmark' : event.shiftKey ? 'tab' : '';
        try {
          const tasks = event.dataTransfer.getData('text/uri-list')
            .split('\r\n')
            .filter(x => !x.startsWith('#') && x.trim())
            .map(url => ({
              url,
            }));
          const taskInfo = {
            tasks,
            bookId: this.bookId,
            parentId: targetId,
            index: targetIndex,
            mode,
            delay: null,
            options: Object.assign(scrapbook.getOptions("capture"), {
              "capture.saveTo": "server",
            }),
          };

          if (event.ctrlKey) {
            await scrapbook.invokeBatchCapture({
              taskInfo,
              customTitle: true,
              useJson: true,
            });
          } else {
            await scrapbook.invokeCaptureEx({
              taskInfo,
              waitForResponse: true,
            });

            await this.rebuild();
          }
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

      const rootIds = (bookId === this.bookId) ?
        (function* () {
          yield this.rootId;
          for (const id of book.specialItems) {
            if (id === this.rootId) { continue; }
            yield id;
          }
        }).call(this) :
        book.specialItems;
      let rootId;
      let paths;
      for (rootId of rootIds) {
        paths = book.findItemPaths(item.id, rootId);
        if (paths.length) { break; }
      }

      // return if not found
      if (!paths.length) {
        return null;
      }

      // switch if bookId or rootId is not current
      if (bookId !== this.bookId || rootId !== this.rootId) {
        await this.refresh(bookId, rootId);
      }

      this.tree.locate(item.id, paths);

      return true;
    },

    log(msg, type = 'log') {
      const div = document.createElement("div");
      div.classList.add(type);
      if (typeof msg === 'string') {
        div.textContent = msg;
      } else {
        div.appendChild(msg);
      }
      document.getElementById("logger").appendChild(div);
    },

    warn(msg) {
      this.log(msg, 'warn');
    },

    error(msg) {
      this.log(msg, 'error');
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
      menuElem.querySelector('button[value="mkpostit"]').hidden = !(!isRecycle);
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
        this.treeElem.focus();
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
          menuElem.querySelector('button[value="mkpostit"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="edit"]').hidden = true;
          menuElem.querySelector('button[value="recover"]').hidden = true;
          menuElem.querySelector('button[value="move_up"]').hidden = true;
          menuElem.querySelector('button[value="move_down"]').hidden = true;
          menuElem.querySelector('button[value="move_into"]').hidden = true;
          menuElem.querySelector('button[value="copy_into"]').hidden = true;
          menuElem.querySelector('button[value="recycle"]').hidden = true;
          menuElem.querySelector('button[value="delete"]').hidden = true;

          menuElem.querySelector('button[value="recapture"]').hidden = true;
          menuElem.querySelector('button[value="copyinfo"]').hidden = true;
          menuElem.querySelector('button[value="meta"]').hidden = true;
          break;
        }

        case 1: {
          const item = this.book.meta[selectedItemElems[0].getAttribute('data-id')];

          menuElem.querySelector('button[value="opentab"]').hidden = ['folder', 'separator'].includes(item.type);
          menuElem.querySelector('button[value="view_text"]').hidden = !(item.type === 'file' && item.index);
          menuElem.querySelector('button[value="exec"]').hidden = !(item.type === 'file' && item.index && !/\.(?:htz|maff)$/i.test(item.index));
          menuElem.querySelector('button[value="browse"]').hidden = !(item.index);
          menuElem.querySelector('button[value="source"]').hidden = !(item.source);
          menuElem.querySelector('button[value="manage"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));
          menuElem.querySelector('button[value="search_in"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));
          menuElem.querySelector('button[value="sort"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));

          menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mkpostit"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="edit"]').hidden = !(!isRecycle && ['note'].includes(item.type) && item.index);
          menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
          menuElem.querySelector('button[value="move_up"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="move_down"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="move_into"]').hidden = false;
          menuElem.querySelector('button[value="copy_into"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="delete"]').hidden = !(isRecycle);

          menuElem.querySelector('button[value="recapture"]').hidden = !(!isRecycle && ['', 'site', 'file', 'image', 'bookmark'].includes(item.type) && item.source);
          menuElem.querySelector('button[value="copyinfo"]').hidden = false;
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
          menuElem.querySelector('button[value="mkpostit"]').hidden = true;
          menuElem.querySelector('button[value="mknote"]').hidden = true;
          menuElem.querySelector('button[value="upload"]').hidden = true;

          menuElem.querySelector('button[value="edit"]').hidden = true;
          menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
          menuElem.querySelector('button[value="move_up"]').hidden = true;
          menuElem.querySelector('button[value="move_down"]').hidden = true;
          menuElem.querySelector('button[value="move_into"]').hidden = false;
          menuElem.querySelector('button[value="copy_into"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="delete"]').hidden = !(isRecycle);

          menuElem.querySelector('button[value="recapture"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="copyinfo"]').hidden = false;
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
     * @param {Object} [options]
     * @param {boolean} [options.lockUi] - whether to lock UI during dialog shown.
     *   This is generally unneeded if there's already a wrapper context manager
     *   that handles the UI locking.
     */
    async showDialog(elem, {lockUi = false} = {}) {
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
      if (lockUi) {
        this.enableUi(false);
      }
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
      if (lockUi) {
        this.enableUi(true);
      }
      this.treeElem.focus();

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

    async openLink(url, newTab = false, singleton = false) {
      // prevent open in self tab if window not supported
      if (!browser.windows) {
        newTab = true;
      }

      return await scrapbook.visitLink({
        url,
        newTab,
        singleton,
        inNormalWindow: true,
      });
    },

    async moveItems(sourceItemElems, targetId, targetIndex) {
      if (!targetId || !(!!this.book.meta[targetId] || this.book.isSpecialItem(targetId))) {
        this.warn(`Unable to move: target ID "${targetId}" is invalid.`);
        return;
      }

      // Reverse the order to always move an item before its parent so that
      // its parent is in the DOM and gets children updated correctly.
      const itemElems = [...sourceItemElems].reverse();

      for (const itemElem of itemElems) {
        if (!this.treeElem.contains(itemElem)) { continue; }

        const itemId = itemElem.getAttribute('data-id');

        const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);

        // Forbid moving self to a descendant as it will become non-reachagble
        // (unless move within the same parent).
        if (this.book.getReachableItems(itemId).has(targetId) && targetId !== parentItemId) {
          continue;
        }

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
      if (!targetId || !(!!this.book.meta[targetId] || this.book.isSpecialItem(targetId))) {
        this.warn(`Unable to create link: target ID "${targetId}" is invalid.`);
        return;
      }

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

    async copyItems({src, bookId: sourceBookId, treeLastModified, items: sourceItems},
        targetParentId, targetIndex, targetBookId = this.bookId, recursively = true) {
      if (src && src !== this.book.server.serverRoot) { return; }

      const sourceBook = server.books[sourceBookId];
      if (!sourceBook || sourceBook.config.no_tree) { return; }

      const targetBook = server.books[targetBookId];
      if (!targetBook || targetBook.config.no_tree) { return; }

      const _copyItems = async (book) => {
        await book.loadMeta();
        await book.loadToc();

        if (!targetParentId || !(!!book.meta[targetParentId] || book.isSpecialItem(targetParentId))) {
          this.warn(`Unable to copy: target ID "${targetParentId}" is invalid.`);
          return;
        }

        const sourceBookFaviconPrefix = scrapbook.normalizeUrl(sourceBook.treeUrl + 'favicon/');
        const targetBookFaviconPrefix = scrapbook.normalizeUrl(targetBook.treeUrl + 'favicon/');

        const itemsToCache = [];

        // a mapping for item descendants be attached to the newly created parent
        const idMapping = new Map();

        const _tidyFilename = (name) => {
          name = scrapbook.validateFilename(name);
          name = scrapbook.crop(name, scrapbook.getOption("capture.saveFilenameMaxLenUtf16"), scrapbook.getOption("capture.saveFilenameMaxLenUtf8"), "");
          return name;
        };

        const _uniquifyFilename = async (name) => {
          const isFilenameTaken = async (path) => {
            const target = targetBook.dataUrl + scrapbook.escapeFilename(path);
            const info = await server.request({
              url: target + '?a=info',
              format: 'json',
              method: "GET",
            }).then(r => r.json()).then(r => r.data);
            return info.type !== null;
          };

          let [base, ext] = scrapbook.filenameParts(name);
          let index = 0;
          while (await isFilenameTaken(name)) {
            name = base + '(' + (++index) + ')' + (ext ? '.' + ext : '');
          }

          return name;
        };

        const _copyItem = async (itemId, targetParentId, targetIndex) => {
          const item = sourceBook.meta[itemId];
          if (!item) { return; }

          const targetId = targetBook.meta[itemId] ? targetBook.generateId() : itemId;
          const targetFilename = _tidyFilename(targetId);
          const newItem = Object.assign({}, item, {id: targetId});
          idMapping.set(itemId, targetId);

          // copy data files
          let oldIndexFile;
          let newIndexFile;
          if (item.index) {
            if (item.index.endsWith('/index.html')) {
              oldIndexFile = item.index.replace(/[/][^/]*$/, '');
              newIndexFile = await _uniquifyFilename(`${targetFilename}`);
              newItem.index = `${newIndexFile}/index.html`;
            } else {
              let [, ext] = scrapbook.filenameParts(item.index);
              ext = ext ? '.' + ext : '';
              oldIndexFile = item.index;
              newIndexFile = await _uniquifyFilename(`${targetFilename}${ext}`);
              newItem.index = `${newIndexFile}`;
            }

            const source = sourceBook.dataUrl + scrapbook.escapeFilename(oldIndexFile);
            const target = '/' + (targetBook.dataUrl + scrapbook.escapeFilename(newIndexFile)).slice(server.serverRoot.length);
            const u = new URL(source);
            u.searchParams.append('a', 'copy');
            u.searchParams.append('target', decodeURIComponent(target));
            await server.request({
              url: u,
              method: "POST",
              format: 'json',
              csrfToken: true,
            });

            itemsToCache.push(newItem.id);
          }

          // copy cached favicon
          if (sourceBook !== targetBook && item.icon) {
            let oldIcon = new URL(item.icon, sourceBook.dataUrl + scrapbook.escapeFilename(item.index || ''));
            oldIcon = scrapbook.normalizeUrl(oldIcon.href);
            if (oldIcon.startsWith(sourceBookFaviconPrefix)) {
              const [oldIconMain, oldIconSearch, oldIconHash] = scrapbook.splitUrl(oldIcon);
              const newIcon = targetBookFaviconPrefix + oldIconMain.replace(/^.*[/]/, '');
              newItem.icon = scrapbook.getRelativeUrl(newIcon, targetBook.dataUrl + scrapbook.escapeFilename(newItem.index || ''));

              const u = new URL(oldIconMain);
              u.searchParams.append('a', 'copy');
              u.searchParams.append('target', decodeURIComponent(newIcon.slice(server.serverRoot.length)));
              try {
                await server.request({
                  url: u,
                  method: "POST",
                  format: 'json',
                  csrfToken: true,
                });
              } catch (ex) {
                console.error(ex);
              }
            }
          }

          // update TOC
          targetBook.addItem({
            item: newItem,
            parentId: targetParentId,
            index: targetIndex,
          });
          const newIndex = Number.isInteger(targetIndex) ? targetIndex : targetBook.toc[targetParentId].length - 1;

          // update DOM
          if (targetBook === this.book) {
            this.tree.insertItem(targetId, targetParentId, newIndex);
          }

          return newIndex;
        };

        const _linkItem = (itemId, targetParentId, targetIndex) => {
          // update TOC
          const newIndex = targetBook.moveItem({
            id: itemId,
            currentParentId: null,
            targetParentId,
            targetIndex,
          });

          // update DOM
          if (targetBook === this.book) {
            this.tree.insertItem(itemId, targetParentId, targetIndex);
          }

          return newIndex;
        };

        const _addDecendingItems = async (id, parentId, index, idChain) => {
          // this id is already copied, link to it and do not add descendants
          if (idMapping.has(id)) {
            return _linkItem(idMapping.get(id), parentId, index);
          }

          const newIndex = await _copyItem(id, parentId, index);

          // failed to add id
          if (!Number.isInteger(newIndex)) { return newIndex; }

          // this is a recursive node, do not add descendants
          if (idChain.has(id)) { return newIndex; }

          // recursively add descendants to the generated item copy
          if (recursively) {
            const toc = sourceBook.toc[id];
            if (toc) {
              idChain.add(id);
              for (let i = 0, I = toc.length; i < I; ++i) {
                await _addDecendingItems(toc[i], idMapping.get(id), i, idChain);
              }
              idChain.delete(id);
            }
          }

          return newIndex;
        };

        for (const {id, parentId, index} of sourceItems) {
          // Forbid copying self to a descendant recursively
          if (recursively && book.getReachableItems(id).has(targetParentId)) {
            continue;
          }

          // copy item and descendants
          const idChain = new Set();

          // validate that id matches the provided parentId and index
          const toc = sourceBook.toc[parentId];
          if (!toc || toc[index] !== id) {
            return;
          }

          const newIndex = await _addDecendingItems(id, targetParentId, targetIndex, idChain);

          if (Number.isInteger(newIndex)) {
            targetIndex = newIndex + 1;
          }
        }

        // upload changes to server
        await book.saveMeta();
        await book.saveToc();

        if (itemsToCache.length > 0) {
          // Due to a concern of URL length and performance, skip cache
          // update if too many items are affected.
          if (scrapbook.getOption("indexer.fulltextCache")) {
            await server.requestSse({
              query: {
                "a": "cache",
                "book": book.id,
                "item": itemsToCache.slice(0, 10),
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
      };

      await sourceBook.transaction({
        mode: 'validate',
        callback: async (sourceBook) => {
          // validate if the dragging source is up to date
          if (treeLastModified !== sourceBook.treeLastModified) {
            this.warn(scrapbook.lang('ScrapBookErrorSourceTreeOutdated'));
            return;
          }

          if (sourceBook !== targetBook) {
            await sourceBook.loadMeta();
            await sourceBook.loadToc();

            await targetBook.transaction({
              mode: 'validate',
              callback: _copyItems,
            });
            return;
          }

          await _copyItems(sourceBook);
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
<meta http-equiv="refresh" content="0; url=${scrapbook.escapeHtml(url)}">
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
          content = scrapbook.documentToString(doc);
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

    async editPostit(id) {
      const postitElem = document.getElementById('postit');
      if (!postitElem) { return; }

      await this.savePostit();

      const u = new URL(browser.runtime.getURL("scrapbook/postit-frame.html"));
      u.searchParams.append('id', id);
      u.searchParams.append('bookId', this.bookId);
      postitElem.src = u.href;

      postitElem.parentNode.removeAttribute('hidden');
    },

    async savePostit() {
      const postitElem = document.getElementById('postit');
      if (!postitElem) { return; }

      // save the currently opened one, if exists
      try {
        await postitElem.contentWindow.editor.save();
        await this.rebuild();
      } catch (ex) {
        // skip error
      }
    },

    async uneditPostit(rebuild) {
      const postitElem = document.getElementById('postit');
      if (!postitElem) { return; }
      postitElem.parentNode.setAttribute('hidden', '');
      postitElem.src = '';
      if (rebuild) {
        await this.rebuild();
        this.treeElem.focus();
      }
    },

    commands: {
      async index({modifiers}) {
        const newTab = modifiers.shiftKey || modifiers.ctrlKey || scrapbook.getOption("scrapbook.sidebarOpenInNewTab");
        await this.openLink(this.book.indexUrl, newTab);
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
          const url = this.tree.getItemUrl(elem);
          if (!url) { continue; }
          await this.openLink(url, true);
        }
      },

      async view_text({itemElems, modifiers}) {
        const newTab = modifiers.shiftKey || modifiers.ctrlKey || scrapbook.getOption("scrapbook.sidebarViewTextInNewTab");
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          const target = await this.book.getItemIndexUrl(item);
          const u = new URL(target);
          u.searchParams.set('a', 'source');
          if (item.charset) { u.searchParams.set('e', item.charset); }
          await this.openLink(u.href, newTab);
        }
      },

      async exec({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          const target = await this.book.getItemIndexUrl(item, {checkArchiveRedirect: false});
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

      async source({itemElems, modifiers}) {
        const newTab = modifiers.shiftKey || modifiers.ctrlKey || scrapbook.getOption("scrapbook.sidebarSourceInNewTab");
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (item.source) {
            const target = item.source;
            await this.openLink(target, newTab);
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

      async search_in({itemElems, modifiers}) {
        const newTab = modifiers.shiftKey || modifiers.ctrlKey || scrapbook.getOption("scrapbook.sidebarSearchInNewTab");
        const urlObj = new URL(browser.runtime.getURL("scrapbook/search.html"));
        urlObj.searchParams.set('id', this.bookId);
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          urlObj.searchParams.append('root', id);
        }
        const target = urlObj.href;
        await this.openLink(target, newTab);
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
          itemElems = [this.tree.rootElem];
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

      async copyinfo(...args) {
        const tempTextarea = document.createElement('textarea');

        const copyToClipboard = (plainText, htmlText) => {
          const _activeElement = document.activeElement;

          const callback = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (htmlText) {
              event.clipboardData.setData('text/html', htmlText);
            }
            event.clipboardData.setData('text/plain', plainText);
          };

          tempTextarea.addEventListener('copy', callback);
          document.documentElement.appendChild(tempTextarea);
          tempTextarea.select();
          document.execCommand('copy');
          tempTextarea.removeEventListener('copy', callback);
          tempTextarea.remove();
          _activeElement.focus();
        };

        const copyinfo = async ({itemElems, modifiers}) => {
          if (!itemElems.length) { return; }

          const items = [];
          {
            if (modifiers.shiftKey || modifiers.ctrlKey) {
              const elems = new Set();
              for (const itemElem of itemElems) {
                elems.add(itemElem);
                this.tree.loadDescendants(itemElem);
                for (const elem of itemElem.querySelectorAll('li[data-id]')) {
                  elems.add(elem);
                }
              }
              itemElems = elems;
            }
            for (const itemElem of itemElems) {
              const id = itemElem.getAttribute('data-id');
              items.push(this.book.meta[id]);
            }
          }

          const plainFormat = scrapbook.getOption("scrapbook.copyItemInfoFormatPlain");
          const plainText = items.map((item) => {
            return scrapbook.ItemInfoFormatter.format(item, plainFormat, {book: this.book});
          }).join('\r\n');

          const htmlFormat = scrapbook.getOption("scrapbook.copyItemInfoFormatHtml");
          const htmlText = htmlFormat ? items.map((item) => {
            return scrapbook.ItemInfoFormatter.format(item, htmlFormat, {book: this.book});
          }).join('<br>') : "";

          copyToClipboard(plainText, htmlText);
        };

        this.copyinfo = copyinfo;
        return await copyinfo(...args);
      },

      async meta({itemElems: [itemElem]}) {
        if (!itemElem) { return; }

        const id = itemElem.getAttribute('data-id');
        const item = this.book.meta[id];

        const frag = document.importNode(document.getElementById('tpl-meta').content, true);
        const dialog = frag.children[0];
        scrapbook.loadLanguages(dialog);

        // show dialog
        {
          const editDate = (elem) => {
            const id = elem.getAttribute('data-id');
            if (id) {
              const date = scrapbook.idToDate(id);
              date.setTime(date.valueOf() - date.getTimezoneOffset() * 60 * 1000);
              elem.value = scrapbook.dateToId(date);
            } else {
              elem.value = '';
            }
            elem.setAttribute('data-editing', '');
          };
          const uneditDate = (elem) => {
            if (!elem.hasAttribute('data-editing')) { return; }

            const date = scrapbook.idToDate(elem.value);

            // if new date is valid, re-convert to id;
            // otherwise revert to previous value
            if (date) {
              date.setTime(date.valueOf() + date.getTimezoneOffset() * 60 * 1000);
              elem.setAttribute('data-id', scrapbook.dateToId(date));
              elem.value = date.toLocaleString();
            } else {
              const id = elem.getAttribute('data-id');
              elem.value = id ? scrapbook.idToDate(id).toLocaleString() : '';
            }

            elem.removeAttribute('data-editing');
          };
          const onDateFocus = (event) => {
            editDate(event.target);
          };
          const onDateBlur = (event) => {
            uneditDate(event.target);
          };
          const validateLocation = (elem) => {
            const value = elem.value;
            let validity = '';
            if (value) {
              try {
                const obj = JSON.parse(value);
                scrapbook.validateGeoLocation(obj);
              } catch (ex) {
                validity = ex.message;
              }
            }
            elem.setCustomValidity(validity);
          };
          const onLocationChange = (event) => {
            validateLocation(event.target);
          };
          const onLocationShow = async (event) => {
            event.preventDefault();
            const elem = dialog.querySelector('[name="location"]');
            if (elem.validity.valid) {
              const value = elem.value;
              if (value) {
                const c = JSON.parse(value);
                const url = scrapbook.getOption("geolocation.mapUrl")
                    .replace(/%(\w*)%/g, (_, key) => Number.isFinite(c[key]) ? c[key] : '');
                await this.openLink(url, true);
              }
            }
          };
          const onLocationReset = async (event) => {
            event.preventDefault();
            const elem = dialog.querySelector('[name="location"]');
            const location = await scrapbook.getGeoLocation().catch(ex => {
              this.warn(`Unable to get geolocation: ${ex.message}`);
            });
            if (location) {
              elem.value = JSON.stringify(location);
            }
            validateLocation(elem);
          };

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
          dialog.querySelector('[name="comment"]').value = item.comment || "";

          var elem = dialog.querySelector('[name="create"]');
          elem.value = item.create ? scrapbook.idToDate(item.create).toLocaleString() : "";
          elem.setAttribute('data-id', item.create || "");
          elem.addEventListener('focus', onDateFocus);
          elem.addEventListener('blur', onDateBlur);

          var elem = dialog.querySelector('[name="modify"]');
          elem.value = item.modify ? scrapbook.idToDate(item.modify).toLocaleString() : "";
          elem.setAttribute('data-id', item.modify || "");
          elem.addEventListener('focus', onDateFocus);
          elem.addEventListener('blur', onDateBlur);

          var elem = dialog.querySelector('[name="location"]');
          elem.value = item.location ? JSON.stringify(item.location) : "";
          validateLocation(elem);
          elem.addEventListener('change', onLocationChange);

          var elem = dialog.querySelector('[name="location-view"]');
          elem.addEventListener('click', onLocationShow);

          var elem = dialog.querySelector('[name="location-reset"]');
          elem.addEventListener('click', onLocationReset);

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

          // onblur may have not been triggered if the user submitted the form
          // via enter without blurring focus.
          uneditDate(dialog.querySelector('[name="create"]'));
          uneditDate(dialog.querySelector('[name="modify"]'));
        }

        let location;
        {
          const locationText = dialog.querySelector('[name="location"]').value;
          if (locationText) {
            const obj = JSON.parse(locationText);
            try {
              location = scrapbook.validateGeoLocation(obj);
            } catch (ex) {
              // skip error
            }
          }
        }

        const dialogData = {
          marked: dialog.querySelector('[name="marked"]').checked,
          locked: dialog.querySelector('[name="locked"]').checked,
          title: dialog.querySelector('[name="title"]').value,
          index: dialog.querySelector('[name="index"]').value,
          source: dialog.querySelector('[name="source"]').value,
          icon: dialog.querySelector('[name="icon"]').value,
          create: dialog.querySelector('[name="create"]').getAttribute('data-id'),
          modify: dialog.querySelector('[name="modify"]').getAttribute('data-id'),
          charset: dialog.querySelector('[name="charset"]').value,
          location,
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

      async mkfolder({itemElems: [itemElem], modifiers}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          if (modifiers.altKey) {
            parentItemId = itemElem.getAttribute('data-id');
          } else {
            ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

            // insert after the selected one
            index += 1;
          }
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

      async mksep({itemElems: [itemElem], modifiers}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          if (modifiers.altKey) {
            parentItemId = itemElem.getAttribute('data-id');
          } else {
            ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

            // insert after the selected one
            index += 1;
          }
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

      async mkpostit({itemElems: [itemElem], modifiers}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          if (modifiers.altKey) {
            parentItemId = itemElem.getAttribute('data-id');
          } else {
            ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

            // insert after the selected one
            index += 1;
          }
        }

        const newTab = modifiers.shiftKey || modifiers.ctrlKey;

        // create new item
        const newItem = this.book.addItem({
          item: {
            "type": "postit",
          },
          parentId: parentItemId,
          index,
        });
        newItem.index = newItem.id + '/index.html';

        // create file
        const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);

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
            upload: new Blob([''], {type: 'text/plain'}),
          },
        });

        // update DOM
        this.tree.insertItem(newItem.id, parentItemId, index);

        // edit the postit
        if (this.mode !== 'normal') {
          return;
        }

        if (newTab || scrapbook.getOption("scrapbook.sidebarEditPostitInNewTab")) {
          const u = new URL(browser.runtime.getURL("scrapbook/postit.html"));
          u.searchParams.append('id', newItem.id);
          u.searchParams.append('bookId', this.book.id);
          await this.openLink(u.href, true);
        } else {
          await this.editPostit(newItem.id);
        }
      },

      async mknote({itemElems: [itemElem], modifiers}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          if (modifiers.altKey) {
            parentItemId = itemElem.getAttribute('data-id');
          } else {
            ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

            // insert after the selected one
            index += 1;
          }
        }

        const newTab = modifiers.shiftKey || modifiers.ctrlKey;

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
<meta http-equiv="refresh" content="0; url=index.md">
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
        if (this.mode !== 'normal') {
          return;
        }

        switch (type) {
          case 'html': {
            await this.openLink(target, newTab || scrapbook.getOption("scrapbook.sidebarEditNoteInNewTab"));
            break;
          }

          case 'markdown': {
            const u = new URL(browser.runtime.getURL("scrapbook/edit.html"));
            u.searchParams.set('id', newItem.id);
            u.searchParams.set('bookId', this.bookId);
            await this.openLink(u.href, newTab || scrapbook.getOption("scrapbook.sidebarEditNoteInNewTab"));
            break;
          }
        }
      },

      async upload({itemElems: [itemElem], files, modifiers}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElem) {
          if (modifiers.altKey) {
            parentItemId = itemElem.getAttribute('data-id');
          } else {
            ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

            // insert after the selected one
            index += 1;
          }
        }

        await this.uploadItems(files, parentItemId, index);
      },

      async edit({itemElems: [itemElem], modifiers}) {
        if (!itemElem) { return; }

        const newTab = modifiers.shiftKey || modifiers.ctrlKey || scrapbook.getOption("scrapbook.sidebarEditNoteInNewTab");
        const id = itemElem.getAttribute('data-id');
        const urlObj = new URL(browser.runtime.getURL("scrapbook/edit.html"));
        urlObj.searchParams.set('id', id);
        urlObj.searchParams.set('bookId', this.bookId);
        await this.openLink(urlObj.href, newTab);
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

      async move_up({itemElems: [itemElem]}) {
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

      async move_down({itemElems: [itemElem]}) {
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

      async copy_into({itemElems}) {
        if (!itemElems.length) { return; }

        let targetBookId;
        let targetId;
        let targetIndex;
        let recursively;
        {
          const frag = document.importNode(document.getElementById('tpl-copy-into').content, true);
          const dialog = frag.children[0];
          scrapbook.loadLanguages(dialog);

          const bookSelector = dialog.querySelector('select');
          for (const key of Object.keys(server.books).sort()) {
            const book = server.books[key];
            if (book.config.no_tree) { continue; }
            const opt = document.createElement('option');
            opt.value = book.id;
            opt.textContent = book.name;
            bookSelector.appendChild(opt);
          }
          bookSelector.value = this.bookId;

          dialog.addEventListener('dialogShow', (event) => {
            dialog.querySelector('[name="id"]').focus();
          });

          if (!await this.showDialog(dialog)) {
            return;
          }

          targetBookId = bookSelector.value;
          targetId = dialog.querySelector('[name="id"]').value;
          targetIndex = parseInt(dialog.querySelector('[name="index"]').value, 10);
          targetIndex = isNaN(targetIndex) ? Infinity : Math.max(targetIndex, 0);
          recursively = dialog.querySelector('[name="recursive"]').checked;
        }

        const items = itemElems.reduce((list, itemElem) => {
          const id = itemElem.getAttribute('data-id');
          const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);
          list.push({
            id,
            parentId: parentItemId,
            index,
          });

          return list;
        }, []);
        await this.copyItems({bookId: this.bookId, treeLastModified: this.book.treeLastModified, items},
          targetId, targetIndex, targetBookId, recursively);
      },

      async recycle({itemElems}) {
        if (!itemElems.length) { return; }

        // Reverse the order to always move an item before its parent so that
        // its parent is in the DOM and gets children updated correctly.
        itemElems = [...itemElems].reverse();

        const cachedItemElems = this.tree.treeElem.querySelectorAll('li[data-id]');
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
          this.tree.removeItem(parentItemId, index, cachedItemElems);

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
            const cachedItemElems = this.tree.treeElem.querySelectorAll('li[data-id]');
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
              this.tree.removeItem(parentItemId, index, cachedItemElems);

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
                if (scrapbook.getOption("indexer.fulltextCache")) {
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
        const cachedItemElems = this.tree.treeElem.querySelectorAll('li[data-id]');
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
            this.tree.removeItem(parentItemId, index, cachedItemElems);
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
      if (browser.extension.getViews({type: 'sidebar'}).some(v => v === window)) {
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
