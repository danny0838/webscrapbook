/******************************************************************************
 * Scrapbook sidebar UI controller, for pages like sidebar.html and manage.html.
 *
 * @requires scrapbook
 * @requires server
 * @requires Tree
 * @module sidebar
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.sidebar = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
    global.BookTree,
  );
}(this, function (isDebug, scrapbook, server, BookTree) {

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
  taskPromise: null,

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

    document.getElementById('upload-file-selector').addEventListener('change', this.onClickUploadFileSelector);
    document.getElementById('import-file-selector').addEventListener('change', this.onClickImportFileSelector);

    window.addEventListener('customCommand', this.onCustomCommandRun);

    // init postit resizer
    initPostitResizer: {
      // CSS3 resizer changes the height style when the user performs a
      // resize. Populate it to flex-basis.
      // @TODO: ResizeObserver may be better but not supported by all target
      // browsers currently.
      const resizer = document.getElementById('postit-resizer');
      if (!resizer) { break initPostitResizer; }
      const options = {
        attributes: true,
        attributeFilter: ['style'],
      };
      const handler = (mutationList) => {
        resizer.style.flexBasis = resizer.style.height;
      };
      const mutationObserver = new MutationObserver((mutationList, observer) => {
        mutationObserver.disconnect();
        handler(mutationList);
        mutationObserver.observe(resizer, options);
      });
      mutationObserver.observe(resizer, options);
    }

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

    // enable runTask
    this.taskPromise = Promise.resolve();

    await this.refresh(bookId, rootId, true);
  },

  /**
   * Update UI to match the given bookId and rootId.
   */
  async refresh(bookId, rootId, initial = false) {
    // save current active element
    const activeElement = document.activeElement;

    await this.runTask(async () => {
      try {
        // clear logs
        if (!initial) {
          document.getElementById('logger').textContent = '';
        }

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
          document.title = scrapbook.lang('SidebarTitleWithRoot', [server.config.app.name, this.book.name, this.rootId]);
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
          menuElem.querySelector('button[value="import"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="view_recycle"]').disabled = isNoTree;
          menuElem.querySelector('button[value="clean"]').disabled = !(!isNoTree && isRecycle);

          menuElem.querySelector('button[value="view_recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="clean"]').hidden = !(isRecycle);
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
          menuElem.querySelector('button[value="import"]').disabled = !(!isNoTree && !isRecycle);

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
        throw new Error(scrapbook.lang('ScrapBookErrorInitTree', [ex.message]));
      }
    });

    // restore active element
    if (activeElement?.isConnected) {
      activeElement.focus();
    }
  },

  /**
   * Reload tree data and rebuild the item tree.
   */
  async rebuild({keepHighlights} = {}) {
    const refresh = await this.book.refreshTreeFiles();
    if (refresh) {
      await this.tree.rebuild({keepHighlights});
    }
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

      // check modifiers
      const {ctrlKey, shiftKey, altKey, metaKey} = event;
      const modifiers = {ctrlKey, shiftKey, altKey, metaKey};
      switch (command) {
        case 'recycle':
          if (Object.entries(modifiers).some(([key, value]) => {
            return key !== 'shiftKey' && value;
          })) {
            return;
          }
          break;
        default:
          // skip if any modifier is pressed
          if (Object.values(modifiers).includes(true)) {
            return;
          }
          break;
      }

      // execute command
      event.preventDefault();
      const evt = new CustomEvent("customCommand", {
        detail: {
          command,
          itemElems: this.tree.getSelectedItemElems(),
          modifiers,
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

      case 'import': {
        const elem = document.getElementById('import-file-selector');
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

      case 'import': {
        const elem = document.getElementById('import-file-selector');
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
    // skip if all commands are disabled
    if (document.querySelector('#command:disabled')) {
      return;
    }

    const detail = event.detail;
    await this.runTask(async () => {
      await this.commands[detail.command](detail);
      await this.tree.saveViewStatus();
    });
  },

  onClickUploadFileSelector(event) {
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

  onClickImportFileSelector(event) {
    event.preventDefault();
    const detail = customDataMap.get(document.getElementById('import-file-selector'));
    const evt = new CustomEvent("customCommand", {
      detail: {
        command: 'import',
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

    // insert after the selected one
    if (!this.book.config.new_at_top) {
      targetIndex += 1;
    }

    if (event.clipboardData.types.includes('application/scrapbook.items+json')) {
      const data = JSON.parse(event.clipboardData.getData('application/scrapbook.items+json'));
      if (!data.items) {
        return;
      }

      if (this.rootId !== 'recycle') {
        await this.runTask(async () => {
          await this.copyItems(data, targetId, targetIndex);
        });
      }

      return;
    }

    if (event.clipboardData.types.includes('Files') && this.rootId !== 'recycle') {
      const entries = Array.prototype.map.call(
        event.clipboardData.items,
        x => x.webkitGetAsEntry && x.webkitGetAsEntry(),
      ).sort((a, b) => {
        if (a.name > b.name) { return 1; }
        if (a.name < b.name) { return -1; }
        return 0;
      });

      const files = [];
      for (const entry of entries) {
        if (!entry.isFile) { continue; }
        try {
          const file = await new Promise((resolve, reject) => {
            entry.file(resolve, reject);
          });
          files.push(file);
        } catch (ex) {
          console.error(`Unable to read file "${entry.name}"`);
        }
      }

      await this.runTask(async () => {
        if (files.every(f => f.name.toLowerCase().endsWith('.wsba'))) {
          await this.importItems(files, targetId, targetIndex);
        } else {
          await this.uploadItems(files, targetId, targetIndex);
        }
      });
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

    if (event.dataTransfer.types.includes('application/scrapbook.command+json') && this.rootId !== 'recycle') {
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
    targetIndex = null,
    isOnItem = true,
  }) {
    // disallow when commands disabled
    if (document.querySelector('#command:disabled')) {
      return;
    }

    if (event.dataTransfer.types.includes('application/scrapbook.items+json')) {
      if (isOnItem || !lastDraggedElems) {
        const data = JSON.parse(event.dataTransfer.getData('application/scrapbook.items+json'));
        if (!data.items) {
          return;
        }

        if (!lastDraggedElems) {
          // drag from a different window
          if (this.rootId !== 'recycle') {
            await this.runTask(async () => {
              await this.copyItems(data, targetId, targetIndex);
            });
          }
        } else if (event.altKey && this.rootId !== 'recycle') {
          await this.runTask(async () => {
            await this.linkItems(data, targetId, targetIndex);
          });
        } else if (event.shiftKey && this.rootId !== 'recycle') {
          await this.runTask(async () => {
            await this.copyItems(data, targetId, targetIndex);
          });
        } else {
          await this.runTask(async () => {
            await this.moveItems(data, targetId, targetIndex);
          });
        }
      }
      return;
    }

    if (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') {
      const entries = Array.prototype.map.call(
        event.dataTransfer.items,
        x => x.webkitGetAsEntry && x.webkitGetAsEntry(),
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
          console.error(`Unable to read file "${entry.name}"`);
        }
      }

      await this.runTask(async () => {
        if (files.every(f => f.name.toLowerCase().endsWith('.wsba'))) {
          await this.importItems(files, targetId, targetIndex);
        } else {
          await this.uploadItems(files, targetId, targetIndex);
        }
      });
      return;
    }

    if (event.dataTransfer.types.includes('application/scrapbook.command+json') && this.rootId !== 'recycle') {
      const data = JSON.parse(event.dataTransfer.getData('application/scrapbook.command+json'));
      const targetTab = await browser.tabs.get(data.tabId);
      const windowId = targetTab.windowId;
      const tabs = data.forAllTabs ? await scrapbook.getContentTabs({windowId}) : await scrapbook.getHighlightedTabs({windowId});
      const mode = event.altKey ? 'bookmark' :
          event.shiftKey ? (data.mode === 'source' ? 'tab' : 'source') :
          data.mode;
      const taskInfo = {
        tasks: tabs.map(tab => ({
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
        })),
        bookId: this.bookId,
        parentId: targetId,
        index: targetIndex,
        mode,
        options: {
          "capture.saveTo": "server",
        },
      };
      switch (data.cmd) {
        case 'capture': {
          event.ctrlKey ? await scrapbook.invokeCaptureAs(taskInfo) : await scrapbook.invokeCaptureEx({taskInfo});
          break;
        }
        case 'captureAs': {
          await scrapbook.invokeCaptureAs(taskInfo);
          break;
        }
        case 'batchCapture': {
          await scrapbook.invokeCaptureBatch(taskInfo);
          break;
        }
        case 'batchCaptureLinks': {
          await scrapbook.invokeCaptureBatchLinks(taskInfo);
          break;
        }
      }
      return;
    }

    if (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle') {
      const mode = event.altKey ? 'bookmark' : event.shiftKey ? 'tab' : '';
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
        await scrapbook.invokeCaptureAs(taskInfo);
      } else {
        await scrapbook.invokeCaptureEx({taskInfo});
      }
      return;
    }

    if (event.dataTransfer.types.includes('text/html') && this.rootId !== 'recycle') {
      const content = event.dataTransfer.getData('text/html');
      await this.runTask(async () => {
        await this.captureNote({
          targetId,
          targetIndex,
          type: 'html',
          content,
        });
      });
      return;
    }

    if (event.dataTransfer.types.includes('text/plain') && this.rootId !== 'recycle') {
      const content = event.dataTransfer.getData('text/plain');
      await this.runTask(async () => {
        await this.captureNote({
          targetId,
          targetIndex,
          type: 'text',
          content,
        });
      });
      return;
    }
  },

  onServerTreeChange() {
    if (!scrapbook.getOption("scrapbook.autoRebuildSidebars")) {
      return;
    }

    // async
    this.runTask(async () => {
      await this.rebuild();
    });
  },

  /**
   * Locate item position in the sidebar.
   *
   * Provide {bookId, id}, {url}, or {bookId, url}.
   *
   * @type invokable
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
      }.call(this)) :
      book.specialItems;
    let rootId;
    let path;
    for (rootId of rootIds) {
      const p = book.findItemPaths(item.id, rootId).next().value;
      if (p) {
        path = p;
        break;
      }
    }

    // return if not found
    if (!path) {
      return null;
    }

    // switch if bookId or rootId is not current
    if (bookId !== this.bookId || rootId !== this.rootId) {
      await this.refresh(bookId, rootId);
    }

    this.tree.locate(item.id, path);

    return true;
  },

  _log(type = 'log', ...msg) {
    const span = document.createElement("span");
    span.classList.add(type);
    span.append(...msg);
    const logger = document.getElementById("logger");
    logger.hidden = false;
    logger.append(span, '\n');
  },

  log(...msg) {
    this._log('log', ...msg);
  },

  warn(...msg) {
    this._log('warn', ...msg);
  },

  error(...msg) {
    this._log('error', ...msg);
  },

  enableUi(willEnable) {
    document.getElementById('book').disabled = !willEnable;
    document.getElementById('command').disabled = !willEnable;
    document.getElementById('search').disabled = !(willEnable && !this.book.config.no_tree);
  },

  /**
   * Add a task to queue and wait until it completes.
   *
   * - Automatically block UI during the task running.
   * - If an error occurs, show the error message in the window, keep the UI
   *   in blocked status, and fail the promise to prevent further run.
   */
  async runTask(callback) {
    this.taskPromise = this.taskPromise.then(async () => {
      this.enableUi(false);
      try {
        await callback();
      } catch (ex) {
        this.error(ex.message);
        // when any error happens, the UI is possibility in an inconsistent status.
        // keep the UI locked to avoid further manipulation and damage.
        throw ex;
      }
      this.enableUi(true);
    });
    await this.taskPromise;
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
    menuElem.querySelector('button[value="import"]').hidden = !(!isRecycle);

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
        menuElem.querySelector('button[value="import"]').hidden = !(!isRecycle);

        menuElem.querySelector('button[value="edit"]').hidden = true;
        menuElem.querySelector('button[value="recover"]').hidden = true;
        menuElem.querySelector('button[value="move_up"]').hidden = true;
        menuElem.querySelector('button[value="move_down"]').hidden = true;
        menuElem.querySelector('button[value="move_into"]').hidden = true;
        menuElem.querySelector('button[value="copy_into"]').hidden = true;
        menuElem.querySelector('button[value="export"]').hidden = true;
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
        menuElem.querySelector('button[value="import"]').hidden = !(!isRecycle);

        menuElem.querySelector('button[value="edit"]').hidden = !(!isRecycle && ['note'].includes(item.type) && item.index);
        menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
        menuElem.querySelector('button[value="move_up"]').hidden = !(!isRecycle);
        menuElem.querySelector('button[value="move_down"]').hidden = !(!isRecycle);
        menuElem.querySelector('button[value="move_into"]').hidden = false;
        menuElem.querySelector('button[value="copy_into"]').hidden = !(!isRecycle);
        menuElem.querySelector('button[value="export"]').hidden = !(!isRecycle);
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
        menuElem.querySelector('button[value="import"]').hidden = true;

        menuElem.querySelector('button[value="edit"]').hidden = true;
        menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
        menuElem.querySelector('button[value="move_up"]').hidden = true;
        menuElem.querySelector('button[value="move_down"]').hidden = true;
        menuElem.querySelector('button[value="move_into"]').hidden = false;
        menuElem.querySelector('button[value="copy_into"]').hidden = !(!isRecycle);
        menuElem.querySelector('button[value="export"]').hidden = !(!isRecycle);
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
   *   - Listen to 'dialogShow' event for elem to handle initialization.
   */
  async showDialog(elem) {
    // polyfill for Firefox < 98
    if (typeof HTMLDialogElement !== 'function') {
      return await this.showDialogPolyfill(elem);
    }

    elem.method = 'dialog';

    const dialog = document.createElement('dialog');
    dialog.id = 'dialog-wrapper';
    dialog.appendChild(elem);

    const cancelElem = elem.querySelector('.cancel');
    cancelElem.addEventListener('click', (event) => {
      event.preventDefault();
      dialog.close();
    });

    return await new Promise((resolve, reject) => {
      dialog.addEventListener('close', (event) => {
        dialog.remove();
        resolve(dialog.returnValue);
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      elem.dispatchEvent(new CustomEvent('dialogShow'));
    });
  },

  async showDialogPolyfill(elem) {
    const mask = document.createElement('div');
    mask.id = 'dialog-mask';

    const dialog = mask.appendChild(document.createElement('div'));
    dialog.id = 'dialog-wrapper';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', -1);
    dialog.appendChild(elem);

    const submitElem = elem.querySelector('input[type="submit"]');
    const cancelElem = elem.querySelector('.cancel');

    const onKeyDown = (event) => {
      // skip if there's a modifier
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (event.code === "Escape") {
        event.preventDefault();
        dialog.dispatchEvent(new CustomEvent('close', {detail: ''}));
      }
    };

    document.body.appendChild(mask);
    dialog.focus();

    window.addEventListener('keydown', onKeyDown, true);
    elem.addEventListener('submit', (event) => {
      event.preventDefault();
      dialog.dispatchEvent(new CustomEvent('close', {detail: submitElem.value}));
    });
    cancelElem.addEventListener('click', (event) => {
      event.preventDefault();
      dialog.dispatchEvent(new CustomEvent('close', {detail: ''}));
    });

    const result = await new Promise((resolve, reject) => {
      dialog.addEventListener('close', (event) => {
        resolve(event.detail);
      });
      elem.dispatchEvent(new CustomEvent('dialogShow'));
    });

    window.removeEventListener('keydown', onKeyDown, true);
    mask.remove();
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

  async openLink(url, newTab = false) {
    // Specially open the link in another same tab when multi-window is not
    // supported. Also note that a mobile browser usually requires a parent
    // session to allow closing a tab using the back button/gesture.
    // Explicitly check for a mobile browser since a Chromium-based Android
    // browser (e.g. Kiwi Browser) may support browser.windows, but actually
    // no visible multi-window.
    if (scrapbook.userAgent.is('mobile') || !browser.windows) {
      const a = document.createElement('a');
      a.href = url;
      a.target = newTab ? '_blank' : 'scrapbook';
      a.click();
      return;
    }

    return await scrapbook.visitLink({
      url,
      newTab,
      inNormalWindow: true,
    });
  },

  async pickItem({bookId, recentItemsKey = 'scrapbookLastPickedItems', withRelation = true}) {
    const result = await scrapbook.openModalWindow({
      url: browser.runtime.getURL("scrapbook/itempicker.html"),
      args: {
        bookId,
        recentItemsKey,
        withRelation,
      },
      windowCreateData: {width: 350, height: 600},
    });
    return result;
  },

  async moveItems({items: sourceItems}, targetId, targetIndex) {
    if (!targetId || !(!!this.book.meta[targetId] || this.book.isSpecialItem(targetId))) {
      this.warn(`Unable to move: target ID "${targetId}" is invalid.`);
      return;
    }

    const items = sourceItems.map((sourceItem) => {
      const {id, parentId, index} = sourceItem;
      return [parentId, index];
    });

    await this._moveItemsInternal(items, targetId, targetIndex);
  },

  async _moveItemsInternal(items, targetId, targetIndex) {
    await this.book.transaction({
      mode: 'validate',
      callback: async (book) => {
        await server.request({
          query: {
            a: 'query',
            lock: '',
          },
          body: {
            q: JSON.stringify({
              book: book.id,
              cmd: 'move_items',
              kwargs: {
                items,
                target_parent_id: targetId,
                target_index: targetIndex,
              },
            }),
          },
          method: 'POST',
          format: 'json',
          csrfToken: true,
        });

        // discard highlights as current items will be moved from the current
        // position
        await this.rebuild({keepHighlights: false});
      },
    });
  },

  async linkItems({items: sourceItems}, targetId, targetIndex) {
    if (!targetId || !(!!this.book.meta[targetId] || this.book.isSpecialItem(targetId))) {
      this.warn(`Unable to create link: target ID "${targetId}" is invalid.`);
      return;
    }

    const items = sourceItems.map((sourceItem) => {
      const {id, parentId, index} = sourceItem;
      return [parentId, index];
    });

    // update book
    await this.book.transaction({
      mode: 'validate',
      callback: async (book) => {
        await server.request({
          query: {
            a: 'query',
            lock: '',
          },
          body: {
            q: JSON.stringify({
              book: book.id,
              cmd: 'link_items',
              kwargs: {
                items,
                target_parent_id: targetId,
                target_index: targetIndex,
              },
            }),
          },
          method: 'POST',
          format: 'json',
          csrfToken: true,
        });

        // discard highlights as new items with same ID may be inserted the
        // relative position may change
        await this.rebuild({keepHighlights: false});
      },
    });
  },

  async copyItems({src, bookId: sourceBookId, treeLastModified, items: sourceItems},
    targetParentId, targetIndex, targetBookId = this.bookId, recursively = true,
  ) {
    if (src && src !== this.book.server.serverRoot) { return; }

    const sourceBook = server.books[sourceBookId];
    if (!sourceBook || sourceBook.config.no_tree) { return; }

    const targetBook = server.books[targetBookId];
    if (!targetBook || targetBook.config.no_tree) { return; }

    const items = sourceItems.map((sourceItem) => {
      const {id, parentId, index} = sourceItem;
      return [parentId, index];
    });

    // update book
    await sourceBook.transaction({
      mode: 'validate',
      callback: async (sourceBook, {backupTs}) => {
        // validate if the dragging source is up to date
        if (treeLastModified !== sourceBook.treeLastModified) {
          this.warn(scrapbook.lang('ScrapBookErrorSourceTreeOutdated'));
          return;
        }

        // lock targetBook for cross-book copy
        if (sourceBook === targetBook) {
          await this._copyItemsInternal(items, sourceBookId, targetParentId, targetIndex, targetBookId, recursively);
          await this.rebuild();
        } else {
          await targetBook.transaction({
            mode: 'validate',
            autoBackupTs: backupTs,
            callback: async (targetBook) => {
              await this._copyItemsInternal(items, sourceBookId, targetParentId, targetIndex, targetBookId, recursively);
              if (targetBook === this.book) {
                await this.rebuild();
              } else {
                await targetBook.refreshTreeFiles();
              }
            },
          });
        }
      },
    });
  },

  async _copyItemsInternal(items, sourceBookId, targetParentId, targetIndex, targetBookId, recursively) {
    await server.request({
      query: {
        a: 'query',
        lock: '',
      },
      body: {
        q: JSON.stringify({
          book: sourceBookId,
          cmd: 'copy_items',
          kwargs: {
            items,
            target_parent_id: targetParentId,
            target_index: targetIndex,
            target_book_id: targetBookId,
            recursively,
          },
        }),
        auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
      },
      method: 'POST',
      format: 'json',
      csrfToken: true,
    });
  },

  async uploadItems(files, targetId, targetIndex) {
    await this.book.transaction({
      mode: 'validate',
      callback: async (book) => {
        const items = [];
        for (const file of files) {
          try {
            // create new item
            const newItem = book.addItem({
              title: file.name,
              type: "file",
            });
            newItem.index = newItem.id + '/index.html';

            let filename = file.name;
            if (filename === 'index.html') { filename = 'index-1.html'; }
            filename = scrapbook.validateFilename(filename, scrapbook.getOption("capture.saveAsciiFilename"));

            // upload file
            {
              const target = book.dataUrl + scrapbook.escapeFilename(newItem.id + '/' + filename);
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
              const target = book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.html');
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

            items.push(newItem);
          } catch (ex) {
            console.error(ex);
            this.warn(`Unable to upload '${file.name}': ${ex.message}`);
          }
        }

        // update book
        await server.request({
          query: {
            a: 'query',
            lock: '',
          },
          body: {
            q: JSON.stringify({
              book: book.id,
              cmd: 'add_items',
              kwargs: {
                items,
                target_parent_id: targetId,
                target_index: targetIndex,
              },
            }),
            auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
          },
          method: 'POST',
          format: 'json',
          csrfToken: true,
        });

        await this.rebuild();
      },
    });
  },

  async importItems(files, targetId, targetIndex) {
    await this.book.transaction({
      mode: 'validate',
      callback: async (book) => {
        // clear dir if exists
        {
          const target = book.treeUrl + scrapbook.escapeFilename('exports');
          const json = await server.request({
            url: target,
            query: {
              a: 'info',
            },
            method: "POST",
            format: 'json',
            csrfToken: true,
          }).then(r => r.json());
          if (json.data.type !== null) {
            await server.request({
              url: target,
              query: {
                a: 'delete',
              },
              method: "POST",
              format: 'json',
              csrfToken: true,
            });
          }
        }

        // upload files
        for (const file of files) {
          try {
            const filename = scrapbook.validateFilename(file.name);
            const target = book.treeUrl + scrapbook.escapeFilename('exports/' + filename);
            await server.request({
              url: target,
              query: {
                a: 'save',
              },
              method: "POST",
              format: 'json',
              csrfToken: true,
              body: {
                upload: file,
              },
            });
          } catch (ex) {
            console.error(ex);
            this.warn(`Unable to upload '${file.name}': ${ex.message}`);
          }
        }

        // import
        await server.requestSse({
          query: {
            a: 'import',
            book: book.id,
            target: targetId,
            index: targetIndex,
            rebuild: scrapbook.getOption("scrapbook.import.rebuildFolders") ? 1 : '',
            resolve: scrapbook.getOption("scrapbook.import.resolveItemUsedNew") ? 'new' : 'skip',
            lock: '',
          },
          onMessage: (info) => {
            switch (info.type) {
              case 'info':
                this.log(info.msg);
                break;
              case 'warn':
                this.warn(info.msg);
                break;
              case 'error':
              case 'critical':
                this.error(info.msg);
                break;
            }
          },
        });

        await this.rebuild();
      },
    });
  },

  async deleteItems(itemElems) {
    if (!itemElems.length) { return; }

    const cacheMap = new Map();
    const items = itemElems.map((itemElem) => {
      const {parentItemId, index} = this.tree.getParentAndIndex(itemElem, cacheMap);
      return [parentItemId, index];
    });

    await this.book.transaction({
      mode: 'validate',
      callback: async (book) => {
        await server.request({
          query: {
            a: 'query',
            lock: '',
          },
          body: {
            q: JSON.stringify({
              book: book.id,
              cmd: 'delete_items',
              kwargs: {
                items,
              },
            }),
            auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
          },
          method: 'POST',
          format: 'json',
          csrfToken: true,
        });


        // discard highlights items will be removed
        await this.rebuild({keepHighlights: false});
      },
    });
  },

  async captureNote({
    targetId,
    targetIndex,
    type,
    content,
  }) {
    // prepare html content and title
    let title = '';
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
        title = doc.body.textContent.replace(/\s+/g, ' ');
        content = scrapbook.documentToString(doc);
        break;
      }
      default: {
        title = content.replace(/\s+/g, ' ');
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
    title = scrapbook.crop(title, 150, 180);

    // create new item
    const newItem = this.book.addItem({
      title,
      type: "note",
    });
    newItem.index = newItem.id + '/index.html';

    // create file
    let target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);

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

        // update book
        await server.request({
          query: {
            a: 'query',
            lock: '',
          },
          body: {
            q: JSON.stringify({
              book: book.id,
              cmd: 'add_item',
              kwargs: {
                item: newItem,
                target_parent_id: targetId,
                target_index: targetIndex,
              },
            }),
          },
          method: 'POST',
          format: 'json',
          csrfToken: true,
        });

        await this.rebuild();
      },
    });
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
      let newTab = modifiers.shiftKey || modifiers.ctrlKey || scrapbook.getOption("scrapbook.sidebarSourceInNewTab");
      for (const elem of itemElems) {
        const id = elem.getAttribute('data-id');
        const item = this.book.meta[id];
        if (item.source) {
          const target = item.source;
          await this.openLink(target, newTab);
          if (!newTab) { newTab = true; }
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
      const reverse = direction === 'desc';
      const recursive = dialog.recursive.checked;

      if (!itemElems?.length) {
        itemElems = [this.tree.rootElem];
      }
      const itemIds = itemElems.map(itemElem => itemElem.getAttribute('data-id'));

      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              'q': JSON.stringify({
                book: book.id,
                cmd: 'sort_items',
                kwargs: {
                  items: itemIds,
                  key,
                  reverse,
                  recursively: recursive,
                },
              }),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          // discard highlights items with same ID may be reordered
          await this.rebuild({keepHighlights: false});
        },
      });
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

        if (modifiers.shiftKey || modifiers.ctrlKey) {
          const elems = new Set();
          for (const itemElem of itemElems) {
            elems.add(itemElem);
            this.tree.loadDescendants(itemElem);
            for (const elem of itemElem.querySelectorAll('li[data-id]')) {
              elems.add(elem);
            }
          }
          itemElems = Array.from(elems);
        }

        const plainFormat = scrapbook.getOption("scrapbook.copyItemInfoFormatPlain");
        const plainText = itemElems.map((itemElem) => {
          const item = this.book.meta[itemElem.getAttribute('data-id')];
          return ItemInfoFormatter.format(item, plainFormat, {book: this.book, tree: this.tree, itemElem});
        }).join('\r\n');

        const htmlFormat = scrapbook.getOption("scrapbook.copyItemInfoFormatHtml");
        const htmlText = htmlFormat ? itemElems.map((itemElem) => {
          const item = this.book.meta[itemElem.getAttribute('data-id')];
          return ItemInfoFormatter.format(item, htmlFormat, {book: this.book, tree: this.tree, itemElem});
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

          if (elem.value) {
            const date = scrapbook.idToDate(elem.value.substring(0, 17).padEnd(17, '0'));

            // if new date is valid, re-convert to ID;
            // otherwise revert to previous value
            if (date) {
              date.setTime(date.valueOf() + date.getTimezoneOffset() * 60 * 1000);
              elem.setAttribute('data-id', scrapbook.dateToId(date));
              elem.value = date.toLocaleString();
            } else {
              const id = elem.getAttribute('data-id');
              elem.value = id ? scrapbook.idToDate(id).toLocaleString() : '';
            }
          } else {
            const date = new Date();
            elem.setAttribute('data-id', scrapbook.dateToId(date));
            elem.value = date.toLocaleString();
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
          const location = await (async () => {
            try {
              // Prompt for extension geolocation permission (if not granted)
              // Firefox < 101: Sidebar cannot prompt and always returns false.
              // ref: https://bugzilla.mozilla.org/show_bug.cgi?id=1493396
              await browser.permissions.request({permissions: ['geolocation']});
            } catch (ex) {
              // Optional geolocation permission for extension not supported
              // (Chromium). Prompt for origin-based permission instead.
              return await scrapbook.getGeoLocation();
            }
            // Firefox: Get from the background page as extension geolocation
            // permission is only honored by it. Throws an error if not
            // granted.
            return await scrapbook.invokeExtensionScript({
              cmd: "background.getGeoLocation",
            });
          })().catch(ex => {
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

        let elem;
        elem = dialog.querySelector('[name="create"]');
        elem.value = item.create ? scrapbook.idToDate(item.create).toLocaleString() : "";
        elem.setAttribute('data-id', item.create || "");
        elem.addEventListener('focus', onDateFocus);
        elem.addEventListener('blur', onDateBlur);

        elem = dialog.querySelector('[name="modify"]');
        elem.value = item.modify ? scrapbook.idToDate(item.modify).toLocaleString() : "";
        elem.setAttribute('data-id', item.modify || "");
        elem.addEventListener('focus', onDateFocus);
        elem.addEventListener('blur', onDateBlur);

        elem = dialog.querySelector('[name="location"]');
        elem.value = item.location ? JSON.stringify(item.location) : "";
        validateLocation(elem);
        elem.addEventListener('change', onLocationChange);

        elem = dialog.querySelector('[name="location-view"]');
        elem.addEventListener('click', onLocationShow);

        elem = dialog.querySelector('[name="location-reset"]');
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
          dialog.querySelector('[name="title"]').select();
        });

        if (!await this.showDialog(dialog)) {
          return;
        }

        // onblur may have not been triggered if the user submitted the form
        // via enter without blurring focus.
        uneditDate(dialog.querySelector('[name="create"]'));
        uneditDate(dialog.querySelector('[name="modify"]'));
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
        location: (() => {
          const elem = dialog.querySelector('[name="location"]');
          const value = elem.value;
          if (value) {
            try {
              const obj = JSON.parse(value);
              return scrapbook.validateGeoLocation(obj);
            } catch (ex) {
              return item.location;
            }
          }
          return null;
        })(),
        comment: dialog.querySelector('[name="comment"]').value,
      };
      const newItem = this.book.addItem(item);
      for (const [key, value] of Object.entries(dialogData)) {
        if (value || typeof item[key] !== 'undefined') {
          newItem[key] = value;
        }
      }

      // update book
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              q: JSON.stringify({
                book: book.id,
                cmd: 'update_item',
                kwargs: {
                  item: newItem,
                  auto_modify: false,
                },
              }),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          await this.rebuild();
        },
      });
    },

    async mkfolder({itemElems: [itemElem], modifiers}) {
      let parentItemId = this.rootId;
      let index = Infinity;

      if (itemElem) {
        if (modifiers.altKey) {
          parentItemId = itemElem.getAttribute('data-id');
        } else {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          if (!this.book.config.new_at_top) {
            // insert after the selected one
            index += 1;
          }
        }
      }

      let title;
      {
        const frag = document.importNode(document.getElementById('tpl-mkfolder').content, true);
        const dialog = frag.children[0];
        scrapbook.loadLanguages(dialog);
        dialog['title'].value = scrapbook.lang('ScrapBookNewFolderName');

        dialog.addEventListener('dialogShow', (event) => {
          dialog.querySelector('[name="title"]').select();
        });

        if (!await this.showDialog(dialog)) {
          return;
        }

        title = dialog['title'].value;
      }
      if (!title) {
        return;
      }

      // create new item
      const newItem = this.book.addItem({
        title,
        type: "folder",
      });

      // update book
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              q: JSON.stringify({
                book: book.id,
                cmd: 'add_item',
                kwargs: {
                  item: newItem,
                  target_parent_id: parentItemId,
                  target_index: index,
                },
              }),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          await this.rebuild();
        },
      });
    },

    async mksep({itemElems: [itemElem], modifiers}) {
      let parentItemId = this.rootId;
      let index = Infinity;

      if (itemElem) {
        if (modifiers.altKey) {
          parentItemId = itemElem.getAttribute('data-id');
        } else {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          if (!this.book.config.new_at_top) {
            // insert after the selected one
            index += 1;
          }
        }
      }

      // create new item
      const newItem = this.book.addItem({
        title: "",
        type: "separator",
      });

      // update book
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              q: JSON.stringify({
                book: book.id,
                cmd: 'add_item',
                kwargs: {
                  item: newItem,
                  target_parent_id: parentItemId,
                  target_index: index,
                },
              }),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          await this.rebuild();
        },
      });
    },

    async mkpostit({itemElems: [itemElem], modifiers}) {
      let parentItemId = this.rootId;
      let index = Infinity;

      if (itemElem) {
        if (modifiers.altKey) {
          parentItemId = itemElem.getAttribute('data-id');
        } else {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          if (!this.book.config.new_at_top) {
            // insert after the selected one
            index += 1;
          }
        }
      }

      const newTab = modifiers.shiftKey || modifiers.ctrlKey;

      // create new item
      const newItem = this.book.addItem({
        type: "postit",
      });
      newItem.index = newItem.id + '/index.html';

      // update book
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          // add item and generate index page
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: [
              ['q', JSON.stringify({
                book: book.id,
                cmd: 'add_item',
                kwargs: {
                  item: newItem,
                  target_parent_id: parentItemId,
                  target_index: index,
                },
              })],
              ['q', JSON.stringify({
                book: book.id,
                cmd: 'save_item_postit',
                kwargs: {
                  item_id: newItem.id,
                  content: '',
                  auto_modify: false,
                },
              })],
            ],
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          await this.rebuild();
        },
      });

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

          if (!this.book.config.new_at_top) {
            // insert after the selected one
            index += 1;
          }
        }
      }

      const newTab = modifiers.shiftKey || modifiers.ctrlKey;

      let title;
      let type;
      {
        const frag = document.importNode(document.getElementById('tpl-mknote').content, true);
        const dialog = frag.children[0];
        scrapbook.loadLanguages(dialog);
        dialog['title'].value = scrapbook.lang('ScrapBookNewNoteName');

        dialog.addEventListener('dialogShow', (event) => {
          dialog.querySelector('[name="title"]').select();
        });

        if (!await this.showDialog(dialog)) {
          return;
        }

        title = dialog['title'].value;
        type = dialog['format'].value;
      }
      if (!title) {
        return;
      }

      // create new item
      const newItem = this.book.addItem({
        title,
        type: "note",
      });
      newItem.index = newItem.id + '/index.html';

      // update book
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          // add item and generate index page
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: [
              ['q', JSON.stringify({
                book: book.id,
                cmd: 'add_item',
                kwargs: {
                  item: newItem,
                  target_parent_id: parentItemId,
                  target_index: index,
                },
              })],
              ['q', JSON.stringify({
                book: book.id,
                cmd: 'add_item_subpage',
                kwargs: {
                  item_id: newItem.id,
                  ext: type === 'markdown' ? '.md' : '.html',
                },
              })],
              ['auto_cache', JSON.stringify(scrapbook.autoCacheOptions())],
            ],
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          // create index redirect for markdown
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

          await this.rebuild();
        },
      });

      // open link
      if (this.mode !== 'normal') {
        return;
      }

      switch (type) {
        case 'html': {
          const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);
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

          if (!this.book.config.new_at_top) {
            // insert after the selected one
            index += 1;
          }
        }
      }

      await this.uploadItems(files, parentItemId, index);
    },

    async import({itemElems: [itemElem], files, modifiers}) {
      let parentItemId = this.rootId;
      let index = Infinity;

      if (itemElem) {
        if (modifiers.altKey) {
          parentItemId = itemElem.getAttribute('data-id');
        } else {
          ({parentItemId, index} = this.tree.getParentAndIndex(itemElem));

          if (!this.book.config.new_at_top) {
            // insert after the selected one
            index += 1;
          }
        }
      }

      await this.importItems(files, parentItemId, index);
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

      await scrapbook.invokeCaptureAs({tasks});
    },

    async move_up({itemElems: [itemElem]}) {
      if (!this.treeElem.contains(itemElem)) { return; }

      const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);
      if (!(index > 0)) { return; }

      await this._moveItemsInternal([[parentItemId, index]], parentItemId, index - 1);
    },

    async move_down({itemElems: [itemElem]}) {
      if (!this.treeElem.contains(itemElem)) { return; }

      const {parentItemId, index} = this.tree.getParentAndIndex(itemElem);
      if (!itemElem.nextElementSibling) { return; }

      await this._moveItemsInternal([[parentItemId, index]], parentItemId, index + 2);
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
          dialog.querySelector('[name="id"]').select();

          dialog.querySelector('[name="fill-id"]').addEventListener('click', async (event) => {
            const result = await this.pickItem({bookId: this.bookId});
            if (!result) { return; }
            dialog.querySelector('[name="id"]').value = result.id;
            dialog.querySelector('[name="index"]').value = result.index;
          });
        });

        if (!await this.showDialog(dialog)) {
          return;
        }

        targetId = dialog.querySelector('[name="id"]').value;
        targetIndex = parseInt(dialog.querySelector('[name="index"]').value, 10);
        targetIndex = isNaN(targetIndex) ? Infinity : Math.max(targetIndex, 0);
        mode = dialog['mode'].value;
      }

      const cacheMap = new Map();
      const items = itemElems.reduce((list, itemElem) => {
        const id = this.tree.getItemId(itemElem);
        const {parentItemId: parentId, index} = this.tree.getParentAndIndex(itemElem, cacheMap);
        list.push({id, parentId, index});
        return list;
      }, []);
      const data = {bookId: this.bookId, treeLastModified: this.book.treeLastModified, items};
      switch (mode) {
        case "link": {
          await this.linkItems(data, targetId, targetIndex);
          break;
        }
        case "move":
        default: {
          await this.moveItems(data, targetId, targetIndex);
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

        const bookSelector = dialog.querySelector('[name="book"]');
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
          dialog.querySelector('[name="id"]').select();

          dialog.querySelector('[name="fill-id"]').addEventListener('click', async (event) => {
            const result = await this.pickItem({bookId: bookSelector.value});
            if (!result) { return; }
            dialog.querySelector('[name="id"]').value = result.id;
            dialog.querySelector('[name="index"]').value = result.index;
          });
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

      const cacheMap = new Map();
      const items = itemElems.reduce((list, itemElem) => {
        const id = this.tree.getItemId(itemElem);
        const {parentItemId: parentId, index} = this.tree.getParentAndIndex(itemElem, cacheMap);
        list.push({id, parentId, index});
        return list;
      }, []);
      const data = {bookId: this.bookId, treeLastModified: this.book.treeLastModified, items};
      await this.copyItems(data, targetId, targetIndex, targetBookId, recursively);
    },

    async export({itemElems, modifiers}) {
      if (!itemElems.length) { return; }

      const cacheMap = new Map();
      const items = itemElems.map((itemElem) => {
        const parents = this.tree.getParents(itemElem, {includeIndex: true, cacheMap});
        if (parents.length) {
          const id = parents[0].id;
          const indexes = parents.map(p => p.index);
          return [id, ...indexes];
        }
        return null;
      });

      await this.book.transaction({
        mode: 'validate',
        callback: async (book, {lockId, discardLock}) => {
          const u = new URL(server.serverRoot);
          u.search = new URLSearchParams({
            a: 'export',
            book: book.id,
            recursive: scrapbook.getOption("scrapbook.export.recursive") ? 1 : '',
            singleton: !scrapbook.getOption("scrapbook.export.nonSingleton") ? 1 : '',
          });
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = u.href;
          let elem;
          elem = form.appendChild(document.createElement('input'));
          elem.name = 'items';
          elem.value = JSON.stringify(items);
          elem = form.appendChild(document.createElement('input'));
          elem.name = 'token';
          elem.value = await server.acquireToken();
          elem = form.appendChild(document.createElement('input'));
          elem.name = 'lock';
          elem.value = lockId;
          document.getElementById('downloader').contentDocument.body.appendChild(form);
          form.submit();
          form.remove();
          discardLock();
        },
      });
    },

    async recycle({itemElems, modifiers}) {
      if (!itemElems.length) { return; }

      // delete instead if Shift is hold
      if (modifiers.shiftKey) {
        if (!confirm(scrapbook.lang('ScrapBookCommandDeleteConfirm', [itemElems.length]))) {
          return;
        }
        await this.deleteItems(itemElems);
        return;
      }

      const cacheMap = new Map();
      const items = itemElems.map((itemElem) => {
        const {parentItemId, index} = this.tree.getParentAndIndex(itemElem, cacheMap);
        return [parentItemId, index];
      });

      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              q: JSON.stringify({
                book: book.id,
                cmd: 'recycle_items',
                kwargs: {
                  items,
                },
              }),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          // discard highlights items will be removed
          await this.rebuild({keepHighlights: false});
        },
      });
    },

    async delete({itemElems}) {
      await this.deleteItems(itemElems);
    },

    async recover({itemElems}) {
      if (!itemElems.length) { return; }

      const cacheMap = new Map();
      const items = itemElems.map((itemElem) => {
        const {parentItemId, index} = this.tree.getParentAndIndex(itemElem, cacheMap);
        return [parentItemId, index];
      });

      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              q: JSON.stringify({
                book: book.id,
                cmd: 'unrecycle_items',
                kwargs: {
                  items,
                },
              }),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });

          // discard highlights items will be removed
          await this.rebuild({keepHighlights: false});
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

    async clean() {
      const itemElems = Array.from(this.tree.rootElem.querySelectorAll('[data-id]'));
      await this.deleteItems(itemElems);
    },
  },
};

class ItemInfoFormatter extends scrapbook.ItemInfoFormatter {
  constructor(item, {book, tree, itemElem} = {}) {
    super(item, {book});
    this.tree = tree;
    this.itemElem = itemElem;
  }

  formatFolders(includeSelf = false, prop = 'title', sep = '/') {
    const {book, tree, itemElem, item} = this;
    let parents = tree.getParents(itemElem);

    // In most case parents should be ['root', ...],
    // and possibly ['recycle', ...], and ['hidden', ...].
    // Remove the top special item as it doesn't have real properties.
    if (this.book.isSpecialItem(parents[0].id)) {
      parents.shift();
    }

    const items = parents.map(({id}) => book.meta[id]);
    if (includeSelf) {
      items.push(item);
    }
    return items.map(item => item[prop]).join(sep);
  }

  format_folder(prop) {
    return this.formatFolders(false, prop);
  }

  format_path(prop) {
    return this.formatFolders(true, prop);
  }
}

scrapbook.addMessageListener((message, sender) => {
  if (!message.cmd.startsWith("sidebar.")) { return false; }
  if (message.id && message.id !== sidebar.sidebarWindowId) { return false; }
  return true;
});

// record current windowId for later validation if it's sidebar
if (browser.sidebarAction && browser.windows) {
  (async () => {
    // Firefox < 93: getViews({windowId}) does not contain sidebars.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1612390
    if (browser.extension.getViews({type: 'sidebar'}).some(v => v === window)) {
      sidebar.sidebarWindowId = (await browser.windows.getCurrent()).id;
    }
  })();
} else if (browser.sidePanel && browser.windows) {
  (async () => {
    if (await browser.tabs.getCurrent()) { return; }
    const {id: windowId} = await browser.windows.getCurrent();
    sidebar.sidebarWindowId = windowId;
  })();
}

document.addEventListener('DOMContentLoaded', async () => {
  scrapbook.loadLanguages(document);

  await sidebar.init();
});


return sidebar;

}));
