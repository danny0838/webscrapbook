/******************************************************************************
 *
 * Script for main.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

const scrapbookUi = {
  lastDraggedElem: null,
  lastHighlightElem: null,
  bookId: null,
  book: null,
  rootId: 'root',
  mode: 'normal',

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
    document.getElementById('command').disabled = !willEnable;
  },

  /**
   * @param {HTMLElement} elem - the element to be inserted to the dialog.
   *     - Dispatch 'dialogSubmit' event on elem to resolve the Promise with value.
   *     - Listen to 'dialogShow' event for elem to handle initialization.
   */
  async showDialog(elem) {
    const mask = document.getElementById('dialog-mask');
    const wrapper = document.getElementById('dialog-wrapper');
    const cancelElem = elem.querySelector('.buttons input[type="button"]')

    const onKeyEscape = (event) => {
      if (event.code === 'Escape' &&
          !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        elem.dispatchEvent(new CustomEvent('dialogSubmit'), {detail: null});
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

    window.addEventListener('keydown', onKeyEscape, true);
    elem.addEventListener('submit', onSubmit);
    cancelElem.addEventListener('click', onCancel);

    wrapper.innerHTML = '';
    wrapper.appendChild(elem);
    mask.hidden = false;

    const result = await new Promise((resolve, reject) => {
      elem.addEventListener('dialogSubmit', (event) => {
       resolve(event.detail); 
      });
      elem.dispatchEvent(new CustomEvent('dialogShow', {detail: null}));
    });

    window.removeEventListener('keydown', onKeyEscape);
    elem.removeEventListener('submit', onSubmit);
    cancelElem.removeEventListener('submit', onCancel);

    mask.hidden = true;

    return result;
  },
  
  async init() {
    // load config
    await scrapbook.loadOptions();

    if (!scrapbook.hasServer()) {
      this.error(scrapbook.lang('ScrapBookMainErrorServerNotConfigured'));
      return;
    }

    // load server config
    try {
      await server.init();
    } catch (ex) {
      console.error(ex);
      this.error(scrapbook.lang('ScrapBookMainErrorServerInit', [ex.message]));
      return;
    }

    // load URL params
    const urlParams = new URL(location.href).searchParams;
    this.rootId = urlParams.get('root') || this.rootId;
    this.mode = urlParams.get('mode') || this.mode;

    // load current scrapbook and scrapbooks list
    try {
      let bookId = this.bookId = urlParams.has('id') ? urlParams.get('id') : server.bookId;
      let book = this.book = server.books[bookId];

      if (!book) {
        this.warn(scrapbook.lang('ScrapBookMainErrorBookNotExist', [bookId]));
        bookId = this.bookId = '';
        book = this.book = server.books[bookId];
        await scrapbook.setOption("server.scrapbook", bookId);
      }

      // init book select
      const wrapper = document.getElementById('book');

      // remove placeholder option
      wrapper.querySelector('option:last-child').remove();

      // assign a random UUID to prevent being selected accidentally
      wrapper.querySelector('option').value = scrapbook.getUuid();

      for (const book of Object.values(server.books)) {
        const opt = document.createElement('option');
        opt.value = book.id;
        opt.textContent = book.name;
        wrapper.appendChild(opt);
      }
      wrapper.value = bookId;
    } catch (ex) {
      console.error(ex);
      this.error(scrapbook.lang('ScrapBookMainErrorLoadBooks', [ex.message]));
      return;
    }

    // init UI
    document.title = this.book.name + (this.rootId !== 'root' ? ' :: ' + this.rootId : '') + ' | ' + server.config.app.name;

    const cmdElem = document.getElementById('command');
    cmdElem.querySelector('option[value="exec_book"]').disabled = !server.config.app.is_local;
    cmdElem.querySelector('option[value="browse"]').disabled = !server.config.app.is_local;

    const rootElem = document.getElementById('item-root');
    rootElem.container = document.createElement('ul');
    rootElem.container.classList.add('container');
    rootElem.appendChild(rootElem.container);
    
    await this.refresh();
  },

  async refresh() {
    this.enableUi(false);

    try {
      await this.book.loadTreeFiles(true);
      await this.book.loadToc(true);
      await this.book.loadMeta(true);

      const rootId = this.rootId;
      if (!this.book.meta[rootId] && !this.book.specialItems.has(rootId)) {
        throw new Error(`specified root item "${rootId}" does not exist.`);
      }

      const rootElem = document.getElementById('item-root');
      rootElem.setAttribute('data-id', rootId);
      this.toggleItem(rootElem, true);
    } catch (ex) {
      console.error(ex);
      this.error(scrapbook.lang('ScrapBookMainErrorInitTree', [ex.message]));
      return;
    }

    this.enableUi(true);
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
    if (newTab) {
      await browser.tabs.create({
        url,
      });
      return;
    }

    if (browser.windows) {
      let win;
      try {
        win = await browser.windows.getLastFocused({
          populate: true,
          windowTypes: ['normal'],
        });
        if (win.type !== 'normal') {
          // Firefox deprecates windowTypes argument and may get a last focused
          // window of a bad type. Attempt to get another window instead.
          win = (await browser.windows.getAll({
            populate: true,
          })).find(x => x.type === 'normal');
        }
        if (!win) {
          throw new Error('no last-focused window');
        }
      } catch (ex) {
        // no last-focused window
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

  async getMetaRefreshTarget(refUrl) {
    const doc = await server.request({
      url: refUrl,
      method: "GET",
    })
      .then(r => r.blob())
      .then(b => scrapbook.readFileAsDocument(b));

    let target;
    Array.prototype.some.call(
      doc.querySelectorAll('meta[http-equiv][content]'),
      (elem) => {
        if (elem.getAttribute("http-equiv").toLowerCase() == "refresh") {
          const metaRefresh = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
          if (metaRefresh.url) {
            target = new URL(metaRefresh.url, refUrl).href;
            return true;
          }
        }
      }
    );
    return target;
  },

  itemIsValidTarget(itemId) {
    return itemId && (!!this.book.meta[itemId] || this.book.specialItems.has(itemId));
  },

  itemMakeContainer(elem) {
    if (elem.container) { return; }

    const div = elem.firstChild;

    const toggle = elem.toggle = document.createElement('a');
    toggle.href = '#';
    toggle.className = 'toggle';
    toggle.addEventListener('click', this.onClickToggle.bind(this));
    div.insertBefore(toggle, div.firstChild);

    const toggleImg = document.createElement('img');
    toggleImg.src = browser.runtime.getURL('resources/collapse.png');
    toggleImg.alt = '';
    toggle.appendChild(toggleImg);

    const container = elem.container = document.createElement('ul');
    container.className = 'container';
    container.hidden = true;
    elem.appendChild(container);
  },

  itemReduceContainer(elem) {
    if (!elem.container) { return; }
    if (elem.container.hasAttribute('data-loaded') && !elem.container.hasChildNodes()) {
      // remove toggle
      if (elem.toggle && elem.toggle.parentNode) {
        elem.toggle.remove();
      }

      // remove container
      elem.container.remove();
      delete elem.container;
    }
  },

  addItem(id, parent, index = Infinity) {
    const meta = this.book.meta[id];
    if (!meta) {
      return null;
    }

    var elem = document.createElement('li');
    elem.setAttribute('data-id', id);
    if (meta.type) { elem.setAttribute('data-type', meta.type); };
    if (meta.marked) { elem.setAttribute('data-marked', ''); }
    this.itemMakeContainer(parent);
    if (isFinite(index)) {
      parent.container.insertBefore(elem, parent.container.children[index]);
    } else {
      parent.container.appendChild(elem);
    }

    var div = document.createElement('div');
    div.setAttribute('draggable', true);
    div.addEventListener('click', this.onClickItem.bind(this));
    div.addEventListener('mousedown', this.onMiddleClickItem.bind(this));
    div.addEventListener('contextmenu', this.onClickItem.bind(this));
    div.addEventListener('dragstart', this.onItemDragStart.bind(this));
    div.addEventListener('dragend', this.onItemDragEnd.bind(this));
    div.addEventListener('dragenter', this.onItemDragEnter.bind(this));
    div.addEventListener('dragover', this.onItemDragOver.bind(this));
    div.addEventListener('dragleave', this.onItemDragLeave.bind(this));
    div.addEventListener('drop', this.onItemDrop.bind(this));
    elem.appendChild(div);

    if (meta.type !== 'separator') {
      var a = document.createElement('a');
      a.appendChild(document.createTextNode(meta.title || id));
      a.title = meta.title || id;
      if (meta.type !== 'bookmark') {
        if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
      } else {
        if (meta.source) {
          a.href = meta.source;
        } else {
          if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
        }
      }
      if (meta.type === 'folder') { a.addEventListener('onclick', this.onClickFolder.bind(this)); }
      div.appendChild(a);

      var icon = document.createElement('img');
      if (meta.icon) {
        icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
            meta.icon : 
            (this.book.dataUrl + scrapbook.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon;
      } else {
        icon.src = {
          'folder': browser.runtime.getURL('resources/fclose.png'),
          'note': browser.runtime.getURL('resources/note.png'),
          'postit': browser.runtime.getURL('resources/postit.png'),
        }[meta.type] || browser.runtime.getURL('resources/item.png');
      }
      icon.alt = "";
      a.insertBefore(icon, a.firstChild);
    } else {
      var line = document.createElement('fieldset');
      if (meta.comment) { line.title = meta.comment; }
      div.appendChild(line);

      var legend = document.createElement('legend');
      legend.appendChild(document.createTextNode('\xA0' + (meta.title || '') + '\xA0'));
      line.appendChild(legend);
    }

    var childIdList = this.book.toc[id];
    if (childIdList && childIdList.length) {
      this.itemMakeContainer(elem);
    }

    return elem;
  },

  toggleItem(elem, willOpen) {
    const container = elem.container;
    if (!container) { return; }

    if (typeof willOpen === "undefined") {
      willOpen = !!container.hidden;
    }

    // load child nodes if not loaded yet
    if (willOpen && !container.hasAttribute('data-loaded'))  {
      if (this.book.toc[elem.getAttribute('data-id')]) {
        for (const id of this.book.toc[elem.getAttribute('data-id')]) {
          this.addItem(id, elem);
        }
      }
      container.setAttribute('data-loaded', '');
    }

    container.hidden = !willOpen;

    // root item container's previousSibling is undefined
    if (container.previousSibling) {
      container.previousSibling.firstChild.firstChild.src = willOpen ?
      browser.runtime.getURL('resources/expand.png') :
      browser.runtime.getURL('resources/collapse.png');
    }
  },

  getHighlightElem(itemElem) {
    let elem = itemElem.firstChild.firstChild;
    if (elem.classList.contains('toggle')) {
      elem = elem.nextSibling;
    }
    return elem;
  },

  highlightItem(itemElem, willHighlight) {
    if (typeof willHighlight === "undefined") {
      willHighlight = !this.getHighlightElem(itemElem).classList.contains("highlight");
    }

    if (willHighlight) {
      if (this.mode !== 'manage') {
        if (this.lastHighlightElem) {
          this.getHighlightElem(this.lastHighlightElem).classList.remove("highlight");
        }
        this.lastHighlightElem = itemElem;
      }
      this.getHighlightElem(itemElem).classList.add("highlight");
    } else {
      this.getHighlightElem(itemElem).classList.remove("highlight");
      if (this.mode !== 'manage') {
        if (this.lastHighlightElem === itemElem) {
          this.lastHighlightElem = null;
        }
      }
    }
  },

  async moveItems(sourceItemElems, targetId, targetIndex) {
    // Reverse the order to always move an item before its parent so that
    // its parent is in the DOM and gets children updated correctly.
    const itemElems = [...sourceItemElems].reverse();

    for (const itemElem of itemElems) {
      const itemId = itemElem.getAttribute('data-id');

      // forbid moving self to a decendant as it will become non-reachagble
      if (this.book.getReachableItems(itemId).has(targetId)) { continue; }

      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);

      // the operated item element is missing due to an unexpected reason
      if (index === -1) { continue; }

      // update TOC
      const newIndex = this.book.moveItem({
        id: itemId,
        currentParentId: parentItemId,
        currentIndex: index,
        targetParentId: targetId,
        targetIndex,
      });

      // update DOM
      Array.prototype.filter.call(
        document.getElementById('items').querySelectorAll('[data-id]'),
        x => x.getAttribute('data-id') === parentItemId
      ).forEach((parentElem) => {
        if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
        const itemElem = parentElem.container.children[index];
        itemElem.remove();
        this.itemReduceContainer(parentElem);
      });

      Array.prototype.filter.call(
        document.getElementById('items').querySelectorAll('[data-id]'),
        x => x.getAttribute('data-id') === targetId
      ).forEach((parentElem) => {
        if (!(parentElem.parentNode)) { return; }
        this.itemMakeContainer(parentElem);
        if (!parentElem.container.hasAttribute('data-loaded')) { return; }
        this.addItem(itemId, parentElem, newIndex);
      });

      targetIndex = newIndex;
    }

    // upload changes to server
    await this.book.saveTreeFiles({toc: true});
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
      Array.prototype.filter.call(
        document.getElementById('items').querySelectorAll('[data-id]'),
        x => x.getAttribute('data-id') === targetId
      ).forEach((parentElem) => {
        if (!(parentElem.parentNode)) { return; }
        this.itemMakeContainer(parentElem);
        if (!parentElem.container.hasAttribute('data-loaded')) { return; }
        this.addItem(itemId, parentElem, newIndex);
      });

      targetIndex = newIndex + 1;
    }

    // upload changes to server
    await this.book.saveTreeFiles({toc: true});
  },

  onItemDragStart(event) {
    if (document.getElementById('command').disabled) {
      event.dataTransfer.effectAllowed = 'none';
      return;
    }

    const selectedItemElems = Array.prototype.map.call(
      document.querySelectorAll('#item-root .highlight'),
      x => x.parentNode.parentNode
    );
    if (!selectedItemElems.length) {
      event.dataTransfer.effectAllowed = 'none';
      return;
    }

    // Firefox requires at least one data to get dragging work
    event.dataTransfer.setData(
      'text/plain',
      selectedItemElems.map(x => x.getAttribute('data-id')).join('\n')
    );

    event.dataTransfer.effectAllowed = 'all';
    event.target.classList.add('dragged');
    this.lastDraggedElem = selectedItemElems;
  },

  onItemDragEnd(event) {
    if (!this.lastDraggedElem) { return; }

    event.target.classList.remove('dragged');
    this.lastDraggedElem = null;
  },

  onItemDragEnter(event) {
    if (!this.lastDraggedElem) { return; }

    const wrapper = event.currentTarget;
    if (!wrapper.classList.contains('dragover')) {
      wrapper.classList.add('dragover');
    }
  },

  onItemDragOver(event) {
    if (!this.lastDraggedElem) { return; }

    const wrapper = event.currentTarget;
    const wrapperRect = wrapper.getBoundingClientRect();
    const pos = (event.clientY - wrapperRect.top) / wrapperRect.height;

    wrapper.classList.remove('above');
    wrapper.classList.remove('below');
    wrapper.classList.remove('within');

    if (pos < 1/3) {
      wrapper.classList.add('above');
    } else if (pos > 2/3) {
      wrapper.classList.add('below');
    } else {
      wrapper.classList.add('within');
    }

    // determine the drop effect according to modifiers
    if (event.ctrlKey && this.rootId !== 'recycle') {
      event.dataTransfer.dropEffect = 'link';
    } else {
      event.dataTransfer.dropEffect = 'move';
    }

    // prevent default to allow drop
    event.preventDefault();
  },

  onItemDragLeave(event) {
    if (!this.lastDraggedElem) { return; }

    const wrapper = event.currentTarget;
    let enteredElem = event.relatedTarget;

    // In Firefox the relatedTarget could be a text node
    if (enteredElem && enteredElem.nodeType !== 1) {
      enteredElem = enteredElem.parentElement;
    }

    if (!enteredElem || (enteredElem !== wrapper && enteredElem.closest('.dragover') !== wrapper)) {
      wrapper.classList.remove('dragover');
      wrapper.classList.remove('above');
      wrapper.classList.remove('below');
      wrapper.classList.remove('within');
    }
  },

  async onItemDrop(event) {
    if (!this.lastDraggedElem) { return; }

    // prevent default navigation effect
    event.preventDefault();

    const wrapper = event.currentTarget;
    wrapper.classList.remove('dragover');
    wrapper.classList.remove('above');
    wrapper.classList.remove('below');
    wrapper.classList.remove('within');

    const selectedItemElems = Array.prototype.map.call(
      document.querySelectorAll('#item-root .highlight'),
      x => x.parentNode.parentNode
    );
    if (!selectedItemElems.length) { return; }

    let targetId;
    let targetIndex;
    {
      const wrapperRect = wrapper.getBoundingClientRect();
      const pos = (event.clientY - wrapperRect.top) / wrapperRect.height;
      const itemElem = wrapper.parentNode;

      if (pos < 1/3) {
        // above
        const parentItemElem = itemElem.parentNode.parentNode;
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);
        targetId = parentItemElem.getAttribute('data-id');
        targetIndex = index;
      } else if (pos > 2/3) {
        // below
        const parentItemElem = itemElem.parentNode.parentNode;
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);
        targetId = parentItemElem.getAttribute('data-id');
        targetIndex = index + 1;
      } else {
        // within
        targetId = itemElem.getAttribute('data-id');
        targetIndex = Infinity;
      }
    }

    if (!this.itemIsValidTarget(targetId)) { return; }

    this.enableUi(false);

    try {
      if (event.ctrlKey && this.rootId !== 'recycle') {
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
  },

  onClickItem(event) {
    const itemElem = event.currentTarget.parentNode;
    this.highlightItem(itemElem);
  },

  onMiddleClickItem(event) {
    if (event.button !== 1) { return; }
    this.onClickItem(event);
  },

  onClickFolder(event) {
    event.preventDefault();
    const target = event.currentTarget.previousSibling;
    target.focus();
    target.click();
  },

  onClickToggle(event) {
    event.preventDefault();
    const itemElem = event.currentTarget.parentNode.parentNode;
    this.highlightItem(itemElem);
    this.toggleItem(itemElem);
  },

  async onClickAnchor(event) {
    const selector = 'a[href]:not(.toggle)';
    let elem = event.target;
    if (!elem.matches(selector)) {
      elem = elem.closest(selector);
    }
    if (!elem) {
      return;
    }

    if (this.mode !== 'manage') {
      if (browser.windows) {
        // for desktop browsers, open link in the same tab of the main window
        event.preventDefault();
        await scrapbookUi.openLink(elem.href);
      } else {
        // for Firefox Android (browser.windows not supported)
        // use default action to open in another tab
      }
    } else {
      // do not open link on click in manage mode
      event.preventDefault();
    }
  },

  async onBookChange(event) {
    this.enableUi(false);
    if (event.target.selectedIndex === 0) {
      // refresh
      location.reload();
    } else {
      // select book
      const bookId = event.target.value;
      await scrapbook.setOption("server.scrapbook", bookId);
      const urlObj = new URL(location.href);
      urlObj.searchParams.set('id', bookId);
      urlObj.searchParams.delete('root');
      location.assign(urlObj.href);
    }
    this.enableUi(true);
  },

  async onCommandFocus(event) {
    const cmdElem = document.getElementById('command');

    const selectedItemElems = Array.prototype.map.call(
      document.querySelectorAll('#item-root .highlight'),
      x => x.parentNode.parentNode
    );

    const isRecycle = this.rootId === 'recycle';

    switch (selectedItemElems.length) {
      case 0: {
        cmdElem.querySelector('option[value="index"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="search"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="exec_book"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="open"]').hidden = true;
        cmdElem.querySelector('option[value="opentab"]').hidden = true;
        cmdElem.querySelector('option[value="exec"]').hidden = true;
        cmdElem.querySelector('option[value="browse"]').hidden = true;
        cmdElem.querySelector('option[value="source"]').hidden = true;
        cmdElem.querySelector('option[value="manage"]').hidden = !(!isRecycle);

        cmdElem.querySelector('option[value="mkfolder"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="mksep"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="mknote"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="upload"]').hidden = !(!isRecycle);

        cmdElem.querySelector('option[value="edit"]').hidden = true;
        cmdElem.querySelector('option[value="editx"]').hidden = true;
        cmdElem.querySelector('option[value="move_up"]').hidden = true;
        cmdElem.querySelector('option[value="move_down"]').hidden = true;
        cmdElem.querySelector('option[value="move_into"]').hidden = true;
        cmdElem.querySelector('option[value="recycle"]').hidden = true;
        cmdElem.querySelector('option[value="delete"]').hidden = true;

        cmdElem.querySelector('option[value="meta"]').hidden = true;
        cmdElem.querySelector('option[value="view_recycle"]').hidden = !(!isRecycle);
        break;
      }

      case 1: {
        const item = this.book.meta[selectedItemElems[0].getAttribute('data-id')];
        const isHtml = /\.(?:html?|xht(?:ml)?)$/.test(item.index);

        cmdElem.querySelector('option[value="index"]').hidden = true;
        cmdElem.querySelector('option[value="search"]').hidden = true;
        cmdElem.querySelector('option[value="exec_book"]').hidden = true;
        cmdElem.querySelector('option[value="open"]').hidden = ['folder', 'separator'].includes(item.type);
        cmdElem.querySelector('option[value="opentab"]').hidden = ['folder', 'separator'].includes(item.type);
        cmdElem.querySelector('option[value="exec"]').hidden = !(item.type === 'file' && item.index);
        cmdElem.querySelector('option[value="browse"]').hidden = !(item.index);
        cmdElem.querySelector('option[value="source"]').hidden = !(item.source);
        cmdElem.querySelector('option[value="manage"]').hidden = !(item.type === 'folder' || this.book.toc[item.id]);

        cmdElem.querySelector('option[value="mkfolder"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="mksep"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="mknote"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="upload"]').hidden = !(!isRecycle);

        cmdElem.querySelector('option[value="edit"]').hidden = !(!isRecycle && ['', 'note'].includes(item.type) && item.index);
        cmdElem.querySelector('option[value="editx"]').hidden = !(!isRecycle && ['', 'note'].includes(item.type) && isHtml);
        cmdElem.querySelector('option[value="move_up"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="move_down"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="move_into"]').hidden = false;
        cmdElem.querySelector('option[value="recycle"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="delete"]').hidden = !(isRecycle);

        cmdElem.querySelector('option[value="meta"]').hidden = false;
        cmdElem.querySelector('option[value="view_recycle"]').hidden = true;
        break;
      }

      default: {
        cmdElem.querySelector('option[value="index"]').hidden = true;
        cmdElem.querySelector('option[value="search"]').hidden = true;
        cmdElem.querySelector('option[value="exec_book"]').hidden = true;
        cmdElem.querySelector('option[value="open"]').hidden = true;
        cmdElem.querySelector('option[value="opentab"]').hidden = false;
        cmdElem.querySelector('option[value="exec"]').hidden = false;
        cmdElem.querySelector('option[value="browse"]').hidden = true;
        cmdElem.querySelector('option[value="source"]').hidden = false;
        cmdElem.querySelector('option[value="manage"]').hidden = true;

        cmdElem.querySelector('option[value="mkfolder"]').hidden = true;
        cmdElem.querySelector('option[value="mksep"]').hidden = true;
        cmdElem.querySelector('option[value="mknote"]').hidden = true;
        cmdElem.querySelector('option[value="upload"]').hidden = true;

        cmdElem.querySelector('option[value="edit"]').hidden = true;
        cmdElem.querySelector('option[value="editx"]').hidden = true;
        cmdElem.querySelector('option[value="move_up"]').hidden = true;
        cmdElem.querySelector('option[value="move_down"]').hidden = true;
        cmdElem.querySelector('option[value="move_into"]').hidden = false;
        cmdElem.querySelector('option[value="recycle"]').hidden = !(!isRecycle);
        cmdElem.querySelector('option[value="delete"]').hidden = !(isRecycle);

        cmdElem.querySelector('option[value="meta"]').hidden = true;
        cmdElem.querySelector('option[value="view_recycle"]').hidden = true;
        break;
      }
    }

    // show/hide each separator if there are shown items around it
    let hasShownItem = false;
    let lastSep = null;
    for (const elem of cmdElem.querySelectorAll('option')) {
      if (elem.value === 'separator') {
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
  },

  async onCommandChange(event) {
    const command = event.target.value;
    event.target.value = '';

    // blur the select element so that next select triggers onblur event
    event.target.blur();

    switch (command) {
      case 'upload': {
        const elem = document.getElementById('upload-file-selector');
        elem.value = '';
        elem.click();
        break;
      }

      default: {
        const evt = new CustomEvent("command", {
          detail: {
            cmd: command,
          },
        });
        window.dispatchEvent(evt);
      }
    }
  },

  async onCommandRun(event) {
    const command = event.detail.cmd;
    const selectedItemElems = Array.prototype.map.call(
      document.querySelectorAll('#item-root .highlight'),
      x => x.parentNode.parentNode
    );

    this.enableUi(false);

    try {
      await this['cmd_' + command](selectedItemElems, event.detail);
    } catch (ex) {
      console.error(ex);
      this.error(ex.message);
      // when any error happens, the UI is possibility in an inconsistent status.
      // lock the UI to avoid further manipulation and damage.
      return;
    }

    this.enableUi(true);
  },

  async cmd_index(selectedItemElems) {
    await this.openLink(this.book.indexUrl);
  },

  async cmd_search(selectedItemElems) {
    await this.openLink(this.book.treeUrl + 'search.html');
  },

  async cmd_exec_book(selectedItemElems) {
    const target = this.book.topUrl;
    await server.request({
      url: target + '?a=exec&f=json',
      method: "GET",
    });
  },

  async cmd_open(selectedItemElems) {
    const id = selectedItemElems[0].getAttribute('data-id');
    const item = this.book.meta[id];
    switch (item.type) {
      case 'folder':
      case 'separator': {
        break;
      }
      case 'bookmark': {
        if (item.source) {
          await this.openLink(item.source);
        }
        break;
      }
      case 'file':
      default: {
        if (item.index) {
          const target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          await this.openLink(target);
        }
        break;
      }
    }
  },

  async cmd_opentab(selectedItemElems) {
    for (const elem of selectedItemElems) {
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

  async cmd_exec(selectedItemElems) {
    for (const elem of selectedItemElems) {
      const id = elem.getAttribute('data-id');
      const item = this.book.meta[id];
      const target = this.book.dataUrl + scrapbook.escapeFilename(item.index);

      if (target.endsWith('.html')) {
        const redirectedTarget = await this.getMetaRefreshTarget(target);
        if (redirectedTarget) {
          target = redirectedTarget;
        }
      }

      await server.request({
        url: target + '?a=exec&f=json',
        method: "GET",
      });
    }
  },

  async cmd_browse(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    let target;
    const id = selectedItemElems[0].getAttribute('data-id');
    const item = this.book.meta[id];
    target = this.book.dataUrl + scrapbook.escapeFilename(item.index);

    if (target.endsWith('.html')) {
      const redirectedTarget = await this.getMetaRefreshTarget(target);
      if (redirectedTarget) {
        target = redirectedTarget;
      }
    }

    await server.request({
      url: target + '?a=browse&f=json',
      method: "GET",
    });
  },

  async cmd_source(selectedItemElems) {
    const inNewTab = selectedItemElems.length > 1;
    for (const elem of selectedItemElems) {
      const id = elem.getAttribute('data-id');
      const item = this.book.meta[id];
      if (item.source) {
        const target = item.source;
        await this.openLink(target, inNewTab);
      }
    }
  },

  async cmd_manage(selectedItemElems) {
    const id = selectedItemElems.length ? selectedItemElems[0].getAttribute('data-id') : 'root';
    const urlObj = new URL(location.href);
    const currentMode = urlObj.searchParams.get('mode');
    urlObj.searchParams.set('id', this.bookId);
    urlObj.searchParams.set('mode', 'manage');
    urlObj.searchParams.set('root', id);
    const target = urlObj.href;
    if (currentMode === 'manage') {
      location.assign(target);
    } else {
      await this.openModalWindow(target);
    }
  },

  async cmd_meta(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    const itemElem = selectedItemElems[0];
    const id = itemElem.getAttribute('data-id');
    const item = this.book.meta[id];

    const frag = document.importNode(document.getElementById('tpl-meta').content, true);
    const dialog = frag.children[0];
    scrapbook.loadLanguages(dialog);

    dialog.querySelector('[name="id"]').value = id || "";
    dialog.querySelector('[name="title"]').value = item.title || "";
    dialog.querySelector('[name="index"]').value = item.index || "";
    dialog.querySelector('[name="source"]').value = item.source || "";
    dialog.querySelector('[name="icon"]').value = item.icon || "";
    dialog.querySelector('[name="type"]').value = item.type || "";
    dialog.querySelector('[name="charset"]').value = item.charset || "";
    dialog.querySelector('[name="create"]').value = item.create ? scrapbook.idToDate(item.create).toLocaleString() : "";
    dialog.querySelector('[name="modify"]').value = item.modify ? scrapbook.idToDate(item.modify).toLocaleString() : "";
    dialog.querySelector('[name="comment"]').value = item.comment || "";

    dialog.addEventListener('dialogShow', (event) => {
      dialog.querySelector('[name="title"]').focus();
    });

    if (!await this.showDialog(dialog)) {
      return;
    }

    const dialogData = {
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
      if (value.length || typeof item[key] !== 'undefined') {
        newItem[key] = value;
      }
    }

    // save meta
    await this.book.saveTreeFiles({meta: true});

    // update DOM
    Array.prototype.filter.call(
      document.getElementById('items').querySelectorAll('[data-id]'),
      x => x.getAttribute('data-id') === id
    ).forEach((itemElem) => {
      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);

      // the operated item element is missing due to an unexpected reason
      if (index === -1) { return; }

      parentItemElem.container.children[index].remove();
      this.addItem(id, parentItemElem, index);
    });
  },

  async cmd_mkfolder(selectedItemElems) {
    let parentItemId = this.rootId;
    let index = Infinity;

    if (selectedItemElems.length) {
      const itemElem = selectedItemElems[0];
      const itemId = itemElem.getAttribute('data-id');

      const parentItemElem = itemElem.parentNode.parentNode;
      parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      index = Array.prototype.indexOf.call(siblingItems, itemElem);
    }

    // create new item
    const newItem = this.book.addItem({
      item: {
        "title": scrapbook.lang('ScrapBookMainNewFolderName'),
        "type": "folder",
      },
      parentId: parentItemId,
      index,
    });

    // save meta and TOC
    await this.book.saveTreeFiles({meta: true, toc: true});

    // update DOM
    Array.prototype.filter.call(
      document.getElementById('items').querySelectorAll('[data-id]'),
      x => x.getAttribute('data-id') === parentItemId
    ).forEach((parentElem) => {
      if (!(parentElem.parentNode)) { return; }
      this.itemMakeContainer(parentElem);
      if (!parentElem.container.hasAttribute('data-loaded')) { return; }
      this.addItem(newItem.id, parentElem, index + 1);
    });
  },

  async cmd_mksep(selectedItemElems) {
    let parentItemId = this.rootId;
    let index = Infinity;

    if (selectedItemElems.length) {
      const itemElem = selectedItemElems[0];
      const itemId = itemElem.getAttribute('data-id');

      const parentItemElem = itemElem.parentNode.parentNode;
      parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      index = Array.prototype.indexOf.call(siblingItems, itemElem);
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
    await this.book.saveTreeFiles({meta: true, toc: true});

    // update DOM
    Array.prototype.filter.call(
      document.getElementById('items').querySelectorAll('[data-id]'),
      x => x.getAttribute('data-id') === parentItemId
    ).forEach((parentElem) => {
      if (!(parentElem.parentNode)) { return; }
      this.itemMakeContainer(parentElem);
      if (!parentElem.container.hasAttribute('data-loaded')) { return; }
      this.addItem(newItem.id, parentElem, index + 1);
    });
  },

  async cmd_mknote(selectedItemElems) {
    let parentItemId = this.rootId;
    let index = Infinity;

    if (selectedItemElems.length) {
      const itemElem = selectedItemElems[0];
      const itemId = itemElem.getAttribute('data-id');

      const parentItemElem = itemElem.parentNode.parentNode;
      parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      index = Array.prototype.indexOf.call(siblingItems, itemElem);
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
        "title": scrapbook.lang('ScrapBookMainNewNoteName'),
        "type": "note",
      },
      parentId: parentItemId,
      index,
    });

    // create file
    let target;
    let file;
    let action;
    switch (type) {
      case 'html': {
        const filename = 'index.html';
        newItem.index = newItem.id + '/' + filename;
        target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);
        const content = `<!DOCTYPE html>
<html data-scrapbook-type="note">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body>${newItem.title}</body>
</html>
`;
        file = new File([content], filename, {type: 'text/html'});
        action = 'editx';
        break;
      }

      case 'markdown': {
        const filename = 'index.md';
        newItem.index = newItem.id + '/' + filename;
        target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);
        file = new File([], filename, {type: 'text/markdown'});
        action = 'edit';
        break;
      }
    }

    // save meta and TOC
    await this.book.saveTreeFiles({meta: true, toc: true});

    // save data files
    const formData = new FormData();
    formData.append('token', await server.acquireToken());
    formData.append('upload', file);

    await server.request({
      url: target + '?a=save&f=json',
      method: "POST",
      body: formData,
    });

    // update DOM
    Array.prototype.filter.call(
      document.getElementById('items').querySelectorAll('[data-id]'),
      x => x.getAttribute('data-id') === parentItemId
    ).forEach((parentElem) => {
      if (!(parentElem.parentNode)) { return; }
      this.itemMakeContainer(parentElem);
      if (!parentElem.container.hasAttribute('data-loaded')) { return; }
      this.addItem(newItem.id, parentElem, index + 1);
    });

    // open link
    await this.openLink(target + `?a=${action}`);
  },

  async cmd_upload(selectedItemElems, detail) {
    let parentItemId = this.rootId;
    let index = Infinity;

    if (selectedItemElems.length) {
      const itemElem = selectedItemElems[0];
      const itemId = itemElem.getAttribute('data-id');

      const parentItemElem = itemElem.parentNode.parentNode;
      parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      index = Array.prototype.indexOf.call(siblingItems, itemElem);
    }

    // acquire a lock
    await this.book.lockTree();

    // validate if we can modify the tree
    if (!await this.book.validateTree()) {
      await this.book.unlockTree();
      throw new Error(scrapbook.lang('ScrapBookMainErrorServerTreeChanged'));
    }

    for (const file of detail.files) {
      try {
        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": file.name,
            "type": "file",
          },
          parentId: parentItemId,
          index,
        });
        newItem.index = newItem.id + '/index.html';

        let filename = file.name;
        if (filename === 'index.html') { filename = 'index-1.html'; }
        filename = scrapbook.validateFilename(filename, scrapbook.getOption("capture.saveAsciiFilename"));

        // upload file
        {
          const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/' + filename);
          const formData = new FormData();
          formData.append('token', await server.acquireToken());
          formData.append('upload', file);
          await server.request({
            url: target + '?a=save&f=json',
            method: "POST",
            body: formData,
          });
        }

        // upload index.html
        {
          const title = newItem.title;
          const url = scrapbook.escapeFilename(filename);
          const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(url)}">${scrapbook.escapeHtml(filename, false)}</a>
</body>
</html>`;
          const file = new File([html], 'index.html', {type: 'text/html'});
          const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.html');
          const formData = new FormData();
          formData.append('token', await server.acquireToken());
          formData.append('upload', file);
          await server.request({
            url: target + '?a=save&f=json',
            method: "POST",
            body: formData,
          });
        }

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode)) { return; }
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(newItem.id, parentElem, index + 1);
        });

        index++;
      } catch (ex) {
        console.error(ex);
        this.warn(`Unable to upload '${file.name}': ${ex.message}`);
      }
    }

    // save meta and TOC
    await this.book.saveTreeFiles({meta: true, toc: true, useLock: false});

    // release the lock
    await this.book.unlockTree();
  },

  async cmd_edit(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    const id = selectedItemElems[0].getAttribute('data-id');
    const item = this.book.meta[id];
    const target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
    await this.openLink(target + '?a=edit');
  },

  async cmd_editx(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    const id = selectedItemElems[0].getAttribute('data-id');
    const item = this.book.meta[id];
    const target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
    await this.openLink(target + '?a=editx');
  },

  async cmd_move_up(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    const itemElem = selectedItemElems[0];
    const itemId = itemElem.getAttribute('data-id');

    const parentItemElem = itemElem.parentNode.parentNode;
    const parentItemId = parentItemElem.getAttribute('data-id');
    const siblingItems = parentItemElem.container.children;
    const index = Array.prototype.indexOf.call(siblingItems, itemElem);

    // the operated item element is missing due to an unexpected reason
    if (index === -1) { return; }

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
    Array.prototype.filter.call(
      document.getElementById('items').querySelectorAll('[data-id]'),
      x => x.getAttribute('data-id') === parentItemId
    ).forEach((parentElem) => {
      if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
      const itemElem = parentElem.container.children[index];
      itemElem.parentNode.insertBefore(itemElem, itemElem.previousSibling);
    });

    // upload changes to server
    await this.book.saveTreeFiles({toc: true});
  },

  async cmd_move_down(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    const itemElem = selectedItemElems[0];
    const itemId = itemElem.getAttribute('data-id');

    const parentItemElem = itemElem.parentNode.parentNode;
    const parentItemId = parentItemElem.getAttribute('data-id');
    const siblingItems = parentItemElem.container.children;
    const index = Array.prototype.indexOf.call(siblingItems, itemElem);

    // the operated item element is missing due to an unexpected reason
    if (index === -1) { return; }

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
    Array.prototype.filter.call(
      document.getElementById('items').querySelectorAll('[data-id]'),
      x => x.getAttribute('data-id') === parentItemId
    ).forEach((parentElem) => {
      if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
      const itemElem = parentElem.container.children[index];
      itemElem.parentNode.insertBefore(itemElem, itemElem.nextSibling.nextSibling);
    });

    // upload changes to server
    await this.book.saveTreeFiles({toc: true});
  },

  async cmd_move_into(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

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
        await this.linkItems(selectedItemElems, targetId, targetIndex);
        break;
      }
      case "move":
      default: {
        await this.moveItems(selectedItemElems, targetId, targetIndex);
        break;
      }
    }
  },

  async cmd_recycle(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    // Reverse the order to always move an item before its parent so that
    // its parent is in the DOM and gets children updated correctly.
    const itemElems = [...selectedItemElems].reverse();

    let targetIndex = Infinity;
    for (const itemElem of itemElems) {
      const itemId = itemElem.getAttribute('data-id');

      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);

      // the operated item element is missing due to an unexpected reason
      if (index === -1) { continue; }

      // remove this and descendant items from Book
      const newIndex = this.book.recycleItemTree({
        id: itemId,
        currentParentId: parentItemId,
        currentIndex: index,
        targetIndex,
      });

      // update DOM
      Array.prototype.filter.call(
        document.getElementById('items').querySelectorAll('[data-id]'),
        x => x.getAttribute('data-id') === parentItemId
      ).forEach((parentElem) => {
        if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
        const itemElem = parentElem.container.children[index];
        itemElem.remove();
        this.itemReduceContainer(parentElem);
      });

      targetIndex = newIndex;
    }

    // upload changes to server
    await this.book.saveTreeFiles({toc: true});
  },

  async cmd_delete(selectedItemElems) {
    if (!selectedItemElems.length) { return; }

    const removeDataFiles = async (itemIndexFile) => {
      if (!itemIndexFile) { return; }
      const index = itemIndexFile.replace(/\/index.[^.]+$/, '');
      const target = this.book.dataUrl + scrapbook.escapeFilename(index);

      const formData = new FormData();
      formData.append('token', await server.acquireToken());

      await server.request({
        url: target + '?a=delete&f=json',
        method: "POST",
        body: formData,
      });
    };

    // acquire a lock
    await this.book.lockTree();

    // validate if we can modify the tree
    if (!await this.book.validateTree()) {
      await this.book.unlockTree();
      throw new Error(scrapbook.lang('ScrapBookMainErrorServerTreeChanged'));
    }

    // Reverse the order to always move an item before its parent so that
    // its parent is in the DOM and gets children updated correctly.
    const itemElems = [...selectedItemElems].reverse();

    let hasRemovedItems = false;
    for (const itemElem of itemElems) {
      const itemId = itemElem.getAttribute('data-id');

      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);

      // the operated item element is missing due to an unexpected reason
      if (index === -1) { continue; }

      // remove this and descendant items from Book
      const removedItems = this.book.removeItemTree({
        id: itemId,
        parentId: parentItemId,
        index,
      });
      if (removedItems.size > 0) { hasRemovedItems = true; }

      // update DOM
      Array.prototype.filter.call(
        document.getElementById('items').querySelectorAll('[data-id]'),
        x => x.getAttribute('data-id') === parentItemId
      ).forEach((parentElem) => {
        if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
        const itemElem = parentElem.container.children[index];
        itemElem.remove();
        this.itemReduceContainer(parentElem);
      });

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
    await this.book.saveTreeFiles({meta: hasRemovedItems, toc: true, useLock: false});

    // release the lock
    await this.book.unlockTree();
  },

  async cmd_view_recycle(selectedItemElems) {
    const urlObj = new URL(location.href);
    const currentMode = urlObj.searchParams.get('mode');
    urlObj.searchParams.set('id', this.bookId);
    urlObj.searchParams.set('mode', 'manage');
    urlObj.searchParams.set('root', 'recycle');
    const target = urlObj.href;
    if (currentMode === 'manage') {
      location.assign(target);
    } else {
      await this.openModalWindow(target);
    }
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  scrapbook.loadLanguages(document);

  document.getElementById("book").addEventListener('change', scrapbookUi.onBookChange.bind(scrapbookUi));

  document.getElementById("command").addEventListener('focus', scrapbookUi.onCommandFocus.bind(scrapbookUi));

  document.getElementById("command").addEventListener('change', scrapbookUi.onCommandChange.bind(scrapbookUi));

  // file selector
  document.getElementById('upload-file-selector').addEventListener('change', (event) => {
    event.preventDefault();
    const evt = new CustomEvent("command", {
      detail: {
        cmd: 'upload',
        files: event.target.files,
      },
    });
    window.dispatchEvent(evt);
  });

  // command handler
  window.addEventListener('command', scrapbookUi.onCommandRun.bind(scrapbookUi));

  document.getElementById('item-root').addEventListener('click', scrapbookUi.onClickAnchor.bind(scrapbookUi));

  await scrapbookUi.init();
});
