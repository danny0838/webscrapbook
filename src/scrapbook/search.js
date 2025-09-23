/******************************************************************************
 * Script for search.html.
 *
 * @requires scrapbook
 * @requires server
 * @requires CustomTree
 * @module search
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.search = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
    global.CustomTree,
  );
}(this, function (isDebug, scrapbook, server, CustomTree) {

'use strict';

const TREE_CLASS = 'tree-search';

class SearchTree extends CustomTree {
  constructor(params) {
    super(params);
    this.treeElem.classList.add(TREE_CLASS);
  }

  init({book}) {
    super.init({
      book,
      allowSelect: false,
      allowMultiSelect: false,
      allowMultiSelectOnClick: false,
      allowAnchorClick: true,
      allowDrag: false,
      allowDrop: false,
    });
    this.treeElem.setAttribute('data-book-id', book.id);
  }

  rebuild() {
    super.rebuild();

    // Add a <br> for spacing between books, and adds a spacing when the user
    // selects and the search results and copy and paste as plain text.
    this.treeElem.appendChild(document.createElement('br'));
  }

  addItem(item, file, context) {
    const elem = super.addItem(item);

    const div = elem.controller;

    // replace label with marked context title if item has title
    // (or use the original value such as item ID without marking)
    if (item.title) {
      const labelElem = document.createElement('span');
      labelElem.innerHTML = context.title;
      elem.label.replaceWith(labelElem);
      elem.label = labelElem;
    }

    handleSubFile: {
      if (!file || file === '.') {
        break handleSubFile;
      }

      const a = elem.anchor;
      const p = item.index.toLowerCase();

      if (p.endsWith('.htz')) {
        if (file === 'index.html') {
          break handleSubFile;
        }
        a.href = new URL(file, a.href + '!/').href;
      } else if (p.endsWith('.maff')) {
        a.href = new URL(file, a.href + '!/').href;
      } else {
        if (file === item.index.replace(/^.*\//, '')) {
          break handleSubFile;
        }
        a.href = new URL(file, a.href).href;
      }

      const span = document.createElement('span');
      span.appendChild(document.createTextNode(' ('));
      span.insertAdjacentHTML('beforeend', context.file);
      span.appendChild(document.createTextNode(')'));
      a.parentNode.insertBefore(span, a.nextSibling);
    }

    var a = div.appendChild(document.createElement('a'));
    a.href = "javascript:void(0)";
    a.addEventListener('click', search.onClickLocate);
    var img = a.appendChild(document.createElement('img'));
    img.draggable = false;
    img.src = browser.runtime.getURL("resources/edit-locate.svg");
    img.title = scrapbook.lang('SearchLocateTitle');
    img.alt = "";

    // add context to details if exists
    if (context.comment || context.fulltext || context.source) {
      const divDetails = document.createElement('div');
      divDetails.classList.add('details');

      // comment
      if (context.comment) {
        const div = divDetails.appendChild(document.createElement('div'));
        div.classList.add('comment');
        div.innerHTML = context.comment;
      }

      // fulltext
      if (context.fulltext) {
        const div = divDetails.appendChild(document.createElement('div'));
        div.classList.add('context');
        div.innerHTML = context.fulltext;
      }

      // source
      if (context.source) {
        const div = divDetails.appendChild(document.createElement('div'));
        div.classList.add('source');
        div.innerHTML = context.source;
      }

      div.parentNode.appendChild(divDetails);
    }
  }
}

const search = {
  defaultSearch: "",
  fulltextCacheUpdateThreshold: null,
  books: [],

  enableUi(willEnable) {
    document.querySelector('#searchForm fieldset').disabled = !willEnable;
  },

  async init() {
    try {
      await scrapbook.loadOptions();

      // load conf from options
      this.defaultSearch = scrapbook.getOption("scrapbook.defaultSearch");
      this.fulltextCacheUpdateThreshold = scrapbook.getOption('scrapbook.fulltextCacheUpdateThreshold');
      this.searchSse = scrapbook.getOption("scrapbook.searchSse");

      await server.init();

      const searchInfo = await server.request({
        query: {
          a: 'config',
          k: 'search_help',
        },
        format: 'json',
        method: "GET",
      }).then(r => r.json()).then(r => r.data);

      // parse URL params
      // id: book(s) to select and load. Pick current book if not specified.
      // root: root id(s) to search for.
      // q: query to search.
      const urlParams = new URL(document.URL).searchParams;

      const usedBookIds = new Set(urlParams.getAll('id'));
      if (!usedBookIds.size) {
        usedBookIds.add(server.bookId);
      }

      const rootIds = urlParams.getAll('root');
      const searchWithRootIds = rootIds.some(x => x !== 'root');
      if (searchWithRootIds) {
        const q = rootIds.map(rootId => `root:"${rootId.replace(/"/g, '""')}"`).join(' ');
        this.defaultSearch += ` ${q}`;
      }

      const query = urlParams.get('q');

      // init UI
      const booksSelectElem = document.getElementById("books");
      for (const key of Object.keys(server.books).sort()) {
        const book = server.books[key];
        if (book.config.no_tree) { continue; }
        if (!searchWithRootIds || usedBookIds.has(key)) {
          this.books.push(book);
          const opt = document.createElement('option');
          opt.textContent = book.name;
          opt.value = book.id;
          if (usedBookIds.has(key)) { opt.selected = true; }
          booksSelectElem.appendChild(opt);
        }
      }
      if (booksSelectElem.childNodes.length <= 1) {
        booksSelectElem.multiple = false;
      }

      const usedBooks = this.books.filter(book => usedBookIds.has(book.id));

      const book = usedBooks[0];
      {
        const bookName = book ? usedBooks.map(x => x.name).join(' | ') : '';
        if (!searchWithRootIds) {
          document.title = scrapbook.lang('SearchTitle', bookName);
        } else {
          document.title = scrapbook.lang('SearchTitleWithRoot', [bookName, rootIds.join(' | ')]);
        }
      }

      {
        document.querySelector('#help div').textContent = searchInfo.help.desc;

        const helpers = document.querySelector('#helper');
        for (const {text, value} of searchInfo.helpers) {
          const opt = helpers.appendChild(document.createElement('option'));
          opt.textContent = text;
          opt.value = value;
        }
      }

      this.enableUi(true);

      await Promise.all(usedBooks.map(book => this.loadBook(book)));

      if (query !== null) {
        document.getElementById('keyword').value = query;
        await this.search();
      }

      document.getElementById('keyword').focus();
    } catch (ex) {
      console.error(ex);
      this.addMsg(`Error: ${ex.message}`, {type: 'error'});
    }
  },

  async search() {
    // Set up a clean new wrapper to place further async results.
    // The wrapper will be removed from DOM if the search is interrupted.
    const wrapper = document.createElement('div');
    wrapper.id = "result";
    document.getElementById("result").replaceWith(wrapper);

    try {
      // set queryStrFromFrom
      let queryStrFromFrom = "";
      queryStrFromFrom += Array.from(document.getElementById("books").selectedOptions).map(x => `book:"${x.value}"`).join(' ');

      // set query string
      let queryStr = document.getElementById("keyword").value;
      if (this.defaultSearch) {
        queryStr = this.defaultSearch + " " + queryStr;
      }
      if (queryStrFromFrom) {
        queryStr = queryStrFromFrom + " " + queryStr;
      }

      // prepare query to server
      let url;
      {
        const u = new URL(server.serverRoot);
        u.searchParams.set('a', 'search');
        u.searchParams.set('q', queryStr);

        const commentLength = scrapbook.getOption("scrapbook.searchCommentLength");
        if (Number.isInteger(commentLength)) {
          u.searchParams.set('comment', commentLength);
        }

        const sourceLength = scrapbook.getOption("scrapbook.searchSourceLength");
        if (Number.isInteger(sourceLength)) {
          u.searchParams.set('source', sourceLength);
        }

        const contextLength = scrapbook.getOption("scrapbook.searchContextLength");
        if (Number.isInteger(contextLength)) {
          u.searchParams.set('fulltext', contextLength);
        }

        url = u.href;
      }

      // handle response
      if (this.searchSse) {
        const rv = new Map();
        let error = false;
        await server.requestSse({
          url,
          onMessage: (info) => {
            if (['error', 'critical'].includes(info.type)) {
              this.addMsg(scrapbook.lang('ErrorSearch', [info.msg]), {type: 'error', wrapper});
              error = true;
              return;
            }
            const {book_id, id, file, context} = info.data;
            let list = rv.get(book_id);
            if (!list) {
              list = [];
              rv.set(book_id, list);
            }
            list.push({id, file, context});
          },
        });
        if (error) { return; }
        if (rv.size) {
          for (const [bookId, results] of rv) {
            const book = server.books[bookId];
            await this.loadBook(book);
            await this.showResults(results, {book, wrapper});
          }
        } else {
          this.addMsg(scrapbook.lang('SearchNotFound'), {wrapper});
        }
      } else {
        const response = await server.request({
          url,
          method: 'POST',
          format: 'json',
          csrfToken: true,
        }).then(r => r.json());
        let found = false;
        for (const bookId in response.data) {
          found = true;
          const results = response.data[bookId];
          const book = server.books[bookId];
          await this.loadBook(book);
          await this.showResults(results, {book, wrapper});
        }
        if (!found) {
          this.addMsg(scrapbook.lang('SearchNotFound'), {wrapper});
        }
      }
    } catch (ex) {
      console.error(ex);
      this.addMsg(scrapbook.lang('ErrorSearch', [ex.message]), {type: 'error', wrapper});
    }
  },

  showResults(results, {book, wrapper}) {
    this.addMsg(scrapbook.lang('SearchFound', [book.name, results.length]), {wrapper});

    const treeElem = document.createElement("div");
    const tree = new SearchTree({treeElem});
    tree.init({book});
    tree.rebuild();

    for (const result of results) {
      const {id, file, context} = result;
      const meta = book.meta[id];
      if (!meta) { continue; }
      tree.addItem(meta, file, context);
    }

    wrapper.appendChild(treeElem);
  },

  async loadBook(book) {
    const tasks = new Map();
    const loadBook = this.loadBook = async (book) => {
      let task = tasks.get(book.id);
      if (task) { return task; }
      task = (async () => {
        await book.loadTreeFiles();

        // check fulltext cache
        let regexFulltext = /^fulltext\d*\.js$/;
        let regexMeta = /^(?:meta|toc)\d*\.js$/;
        let fulltextMtime = -Infinity;
        let metaMtime = -Infinity;
        for (const file of book.treeFiles.values()) {
          if (regexFulltext.test(file.name)) {
            fulltextMtime = Math.max(fulltextMtime, file.last_modified);
          } else if (regexMeta.test(file.name)) {
            metaMtime = Math.max(metaMtime, file.last_modified);
          }
        }
        fulltextMtime = Math.floor(fulltextMtime) * 1000;
        metaMtime = Math.floor(metaMtime) * 1000;

        cacheOutdatedWarning: {
          let cacheOutdatedMessage;
          if (fulltextMtime === -Infinity) {
            cacheOutdatedMessage = scrapbook.lang('WarnSearchCacheMissing', [book.name]);
          } else if (metaMtime > fulltextMtime) {
            const threshold = this.fulltextCacheUpdateThreshold;
            if (typeof threshold === 'number' && Date.now() > fulltextMtime + threshold) {
              cacheOutdatedMessage = scrapbook.lang('WarnSearchCacheOutdated', [book.name]);
            }
          }

          if (cacheOutdatedMessage) {
            const u = new URL(browser.runtime.getURL('scrapbook/cache.html'));
            u.searchParams.append('book', book.id);
            u.searchParams.append('fulltext', 1);

            const a = document.createElement('a');
            a.textContent = cacheOutdatedMessage;
            a.href = u.href;
            a.target = '_blank';
            this.addMsg(a, {type: 'warn', wrapper: document.getElementById('messages')});
          }
        }

        await book.loadMeta();
      })();
      tasks.set(book.id, task);
      return task;
    };
    return await loadBook(book);
  },

  addMsg(msg, {type, wrapper = document.getElementById("result")} = {}) {
    const div = document.createElement("div");
    if (typeof msg === 'string') {
      div.textContent = msg;
    } else {
      div.appendChild(msg);
    }
    div.classList.add('msg');
    if (type) { div.classList.add(type); }
    wrapper.appendChild(div);
  },

  async onClickLocate(event) {
    event.preventDefault();
    const elem = event.currentTarget;
    const bookId = elem.closest('[data-book-id]').getAttribute('data-book-id');
    const id = elem.closest('[data-id]').getAttribute('data-id');
    const response = await scrapbook.invokeExtensionScript({
      cmd: "background.locateItem",
      args: {bookId, id},
    });
    if (response === false) {
      alert(scrapbook.lang("ErrorLocateSidebarNotOpened"));
    } else if (response === null) {
      alert(scrapbook.lang("ErrorLocateNotFound"));
    }
  },
};

document.addEventListener('DOMContentLoaded', (event) => {
  scrapbook.loadLanguages(document);

  document.getElementById('searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    search.search();
  });

  document.getElementById('helper').addEventListener('change', (event) => {
    event.preventDefault();
    let helper = event.currentTarget;
    let keyword = document.getElementById("keyword");
    keyword.value = keyword.value + (keyword.value === "" ? "" : " ") + helper.value;
    helper.selectedIndex = 0;
    keyword.focus();
    keyword.setSelectionRange(keyword.value.length, keyword.value.length);
  });

  search.init();
});


return search;

}));
