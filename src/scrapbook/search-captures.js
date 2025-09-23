/******************************************************************************
 * Script for search.html.
 *
 * @requires scrapbook
 * @requires server
 * @requires CustomTree
 * @requires MapWithDefault
 * @module searchCaptures
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.searchCaptures = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
    global.CustomTree,
    global.MapWithDefault,
  );
}(this, function (isDebug, scrapbook, server, CustomTree, MapWithDefault) {

'use strict';

const REGEX_IPv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const TREE_CLASS = 'tree-search-captures';

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

  addItem(item) {
    const elem = super.addItem(item);
    const div = elem.controller;

    var a = div.appendChild(document.createElement('a'));
    a.href = "#";
    a.addEventListener('click', search.onClickLocate);
    var img = a.appendChild(document.createElement('img'));
    img.src = browser.runtime.getURL("resources/edit-locate.svg");
    img.title = scrapbook.lang('SearchLocateTitle');
    img.alt = "";
  }
}

const search = {
  async init() {
    try {
      await scrapbook.loadOptions();

      // parse URL params
      const urlParams = new URL(document.URL).searchParams;
      const usedBookIds = new Set(urlParams.getAll('id'));
      const query = urlParams.getAll('q');

      // init UI
      document.getElementById('keyword').value = query.join(' ');

      await server.init();
      const booksSelectElem = document.getElementById('books');
      for (const bookId of Object.keys(server.books).sort()) {
        const book = server.books[bookId];
        if (book.config.no_tree) { continue; }

        const opt = document.createElement('option');
        opt.value = book.id;
        opt.textContent = book.name;
        if (usedBookIds.size === 0 || usedBookIds.has(bookId)) {
          opt.selected = true;
        }
        booksSelectElem.appendChild(opt);
      }
      if (booksSelectElem.childNodes.length <= 1) {
        booksSelectElem.multiple = false;
      }

      if (query.length) {
        await this.search();
      }

      document.getElementById('search').disabled = false;
    } catch (ex) {
      console.error(ex);
      this.addMsg(`Error: ${ex.message}`, 'error');
    }
  },

  async search() {
    try {
      this.clearResult();

      const bookIds = Array.from(document.getElementById('books').selectedOptions).map(x => x.value);
      const urls = document.getElementById('keyword').value.split(/\s+/).filter(x => !!x);
      console.log('Search:', urls, 'in', bookIds);

      const results = await this.getSearchResults(urls, bookIds);
      this.showResults(results);
    } catch (ex) {
      console.error(ex);
      this.addMsg(scrapbook.lang('ErrorSearch', [ex.message]), 'error');
    }
  },

  async getSearchResults(urls, bookIds) {
    // prepare regex checkers
    const urlCheckFullList = [];
    const urlCheckPathList = [];
    const urlCheckOriginList = [];
    const urlCheckSimilarDomainList = [];
    const urlCheckSimilarList = [];

    for (const url of urls) {
      let u;
      try {
        u = new URL(scrapbook.normalizeUrl(url));
      } catch (ex) {
        throw new Error(`Failed to handle URL "${url}": ${ex.message}`);
      }
      u.hash = '';
      urlCheckFullList.push(scrapbook.escapeRegExp(u.href));
      u.search = '';
      urlCheckPathList.push(scrapbook.escapeRegExp(u.href));
      urlCheckOriginList.push(scrapbook.escapeRegExp(u.origin));

      const hostname = u.hostname;
      if (hostname.startsWith('[') && hostname.endsWith(']')) {
        // IPv6
        urlCheckSimilarList.push(scrapbook.escapeRegExp(hostname));
      } else if (REGEX_IPv4.test(hostname)) {
        // IPv4
        urlCheckSimilarList.push(scrapbook.escapeRegExp(hostname));
      } else {
        urlCheckSimilarDomainList.push(scrapbook.escapeRegExp(hostname.replace(/^www\./, '')));
      }
    }

    const urlCheckFull = new RegExp(`^(?:${urlCheckFullList.join('|')})(?:#|$)`);
    const urlCheckPath = new RegExp(`^(?:${urlCheckPathList.join('|')})(?:\\?.*)?(?:#|$)`);
    const urlCheckOrigin = new RegExp(`^(?:${urlCheckOriginList.join('|')})(?:[/?#]|$)`);
    const urlCheckSimilarDomain = urlCheckSimilarDomainList.length ? `(?:www\\.)?(?:${urlCheckSimilarDomainList.join('|')})` : '';
    if (urlCheckSimilarDomain) { urlCheckSimilarList.unshift(urlCheckSimilarDomain); }
    const urlCheckSimilar = new RegExp(`^https?://(?:${urlCheckSimilarList.join('|')})(?::\\d+)?(?:[/?#]|$)`);

    const results = [];
    await server.init();
    await Promise.all(bookIds.map(async (bookId) => {
      const book = server.books[bookId];
      if (book.config.no_tree) { return; }

      try {
        await book.loadTreeFiles();
        await book.loadMeta();
        await book.loadToc();
      } catch (ex) {
        // skip book with tree loading error
        console.error(ex);
        this.addMsg(ex.message, 'error');
        return;
      }

      for (const id of book.getReachableItems('root')) {
        const meta = book.meta[id];
        if (!meta) { continue; }

        const source = meta.source;
        if (!source) { continue; }

        if (!urlCheckSimilar.test(source)) {
          continue;
        }

        let matchType = 'similar';
        if (urlCheckFull.test(source)) {
          matchType = 'full';
        } else if (urlCheckPath.test(source)) {
          matchType = 'path';
        } else if (urlCheckOrigin.test(source)) {
          matchType = 'origin';
        }

        results.push({
          bookId,
          id,
          item: meta,
          matchType,
        });
      }
    }));

    return results;
  },

  showResults(results) {
    const bookTreeBuilder = (bookId) => {
      const book = server.books[bookId];

      const wrapper = document.createElement('div');

      const tree = new SearchTree({treeElem: wrapper});
      tree.init({book});
      tree.rebuild();

      return tree;
    };

    const wrappers = new MapWithDefault(() => {
      return new MapWithDefault(bookTreeBuilder);
    });

    if (!results.length) {
      this.addMsg(scrapbook.lang('SearchCapturesNotFound'));
    }

    for (const result of results) {
      const {bookId, id, item, matchType} = result;
      wrappers.get(matchType).get(bookId).addItem(item);
    }

    const resultsWrapper = document.getElementById('result');
    for (const matchType of ['full', 'path', 'origin', 'similar']) {
      if (!wrappers.has(matchType)) { continue; }

      const matchTypeCap = matchType[0].toUpperCase() + matchType.slice(1);
      this.addMsg(scrapbook.lang('SearchCapturesFound' + matchTypeCap));

      const trees = wrappers.get(matchType);
      for (const bookId of [...trees.keys()].sort()) {
        const tree = trees.get(bookId);
        resultsWrapper.appendChild(tree.treeElem);
      }
    }
  },

  clearResult() {
    document.getElementById("result").textContent = "";
  },

  addMsg(msg, className, wrapper = document.getElementById("result")) {
    const div = document.createElement("div");
    if (typeof msg === 'string') {
      div.textContent = msg;
    } else {
      div.appendChild(msg);
    }
    div.classList.add('msg');
    if (className) { div.classList.add(className); }
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

  search.init();
});


return search;

}));
