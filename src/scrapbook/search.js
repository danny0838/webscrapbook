/******************************************************************************
 *
 * Script for search.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @require {Class} CustomTree
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.search = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    root.CustomTree,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, CustomTree, window, document, console) {

  'use strict';

  class SearchTree extends CustomTree {
    constructor(params) {
      super(params);
      this.markers = params.markers;
      this.commentLength = params.commentLength;
      this.contextLength = params.contextLength;
      this.sourceLength = params.sourceLength;
    }

    addItem(item, file, fulltext) {
      const elem = super.addItem(item);

      const div = elem.controller;

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
        const fileNode = span.appendChild(document.createTextNode(file));
        span.appendChild(document.createTextNode(')'));
        nodeMarker.markTextNode(fileNode, this.markers.file);
        a.parentNode.insertBefore(span, a.nextSibling);
      }

      var a = div.appendChild(document.createElement('a'));
      a.href = "#";
      a.addEventListener('click', search.onClickLocate);
      var img = a.appendChild(document.createElement('img'));
      img.src = browser.runtime.getURL("resources/edit-locate.svg");
      img.title = scrapbook.lang('SearchLocateTitle');
      img.alt = "";

      // mark title
      nodeMarker.markTextNode(elem.label, this.markers.title);

      // add details if set
      if (this.commentLength || this.contextLength || this.sourceLength) {
        const divDetails = document.createElement('div');
        divDetails.classList.add('details');

        // comment
        if (this.commentLength && item.comment) {
          const text = nodeMarker.cropSnippets(item.comment, this.markers.comment, this.commentLength);
          const div = divDetails.appendChild(document.createElement('div'));
          div.classList.add('comment');
          const commentNode = div.appendChild(document.createTextNode(text));
          nodeMarker.markTextNode(commentNode, this.markers.comment);
        }

        // context (fulltext)
        if (this.contextLength && fulltext) {
          const text = nodeMarker.cropSnippets(fulltext, this.markers.content, this.contextLength);
          const div = divDetails.appendChild(document.createElement('div'));
          div.classList.add('context');
          const contextNode = div.appendChild(document.createTextNode(text));
          nodeMarker.markTextNode(contextNode, this.markers.content);
        }

        // source
        if (this.sourceLength && item.source) {
          const text = nodeMarker.cropSnippets(item.source, this.markers.source, this.sourceLength);
          const div = divDetails.appendChild(document.createElement('div'));
          div.classList.add('source');
          const sourceNode = div.appendChild(document.createTextNode(text));
          nodeMarker.markTextNode(sourceNode, this.markers.source);
        }

        div.parentNode.appendChild(divDetails);
      }
    }
  }

  const nodeMarker = {
    get template() {
      const value = document.createElement('mark');
      Object.defineProperty(nodeMarker, 'template', {
        value,
        configurable: true,
      });
      return value;
    },

    markTextNode(node, regexes) {
      regexes = new Set(regexes);

      let curNode = node;
      let nextNode;
      let s = curNode.nodeValue;
      let nextIndex = 0;
      for (const regex of regexes) {
        regex.lastIndex = 0;
      }

      while (true) {
        let hits = [];
        for (const regex of regexes) {
          const m = regex.exec(s);
          if (!m) {
            regexes.delete(regex);
            continue;
          }
          const len = m[0].length;
          const end = regex.lastIndex;
          const start = regex.lastIndex - len;
          hits.push({regex, start, len, end});
        }

        if (!hits.length) { break; }

        const hit = hits.reduce(this.markTextNodeReducer);
        if (hit.len === 0) {
          // lastIndex of /(?:)/u decreases from 1 to 0 after exec on '\uD800\uDC00'
          // also save to nextIndex to ensure increasing for every loop.
          nextIndex = Math.max(hit.regex.lastIndex, nextIndex) + 1;
          for (const regex of regexes) {
            regex.lastIndex = nextIndex;
          }
          continue;
        }

        const newNode = this.template.cloneNode(false);
        if (curNode.nodeValue.length > hit.end) {
          nextNode = curNode.splitText(hit.end);
        }
        const wordNode = curNode.splitText(hit.start);
        curNode.parentNode.replaceChild(newNode, wordNode);
        newNode.appendChild(wordNode);

        if (!nextNode) { break; }

        curNode = nextNode;
        s = curNode.nodeValue;
        nextIndex = 0;
        for (const regex of regexes) {
          regex.lastIndex = 0;
        }
      }
    },

    markTextNodeReducer(a, b) {
      if (a.start < b.start) { return a; }
      if (a.start > b.start) { return b; }
      if (a.len > b.len) { return a; }
      if (a.len < b.len) { return b; }
      return a;
    },

    cropSnippets(text, regexes, maxLen) {
      cropAtHit: {
        const hits = [];
        for (const regex of regexes) {
          regex.lastIndex = 0;
          const m = regex.exec(text);
          if (!m) { continue; }
          const len = m[0].length;
          const end = regex.lastIndex;
          const start = regex.lastIndex - len;
          hits.push({regex, start, len, end});
        }
        if (!hits.length) { break cropAtHit; }
        const hit = hits.reduce(this.cropTextReducer);
        const cropStart = Math.max(hit.start - maxLen / 4, 0);
        text = text.slice(cropStart);
      }
      return scrapbook.crop(text, maxLen);
    },

    cropTextReducer(a, b) {
      if (a.start < b.start) { return a; }
      if (a.start > b.start) { return b; }
      return a;
    },
  };

  const search = {
    defaultSearch: "",
    fulltextCacheUpdateThreshold: null,
    fulltextCacheRemoteSizeLimit: null,
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
        this.fulltextCacheRemoteSizeLimit = scrapbook.getOption('scrapbook.fulltextCacheRemoteSizeLimit');
        this.inclusiveFrames = scrapbook.getOption('indexer.fulltextCacheFrameAsPageContent');

        await server.init();

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
            opt.value = opt.textContent = book.name;
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

        this.enableUi(true);

        await Promise.all(usedBooks.map(book => this.loadBook(book)));

        if (query !== null) {
          document.getElementById('keyword').value = query;
          await this.search();
        }

        document.getElementById('keyword').focus();
      } catch (ex) {
        console.error(ex);
        this.addMsg(`Error: ${ex.message}`, 'error');
      }
    },

    async search() {
      try {
        this.clearResult();

        // set queryStrFromFrom
        let queryStrFromFrom = "";
        queryStrFromFrom +=  Array.from(document.getElementById("books").selectedOptions).map(x => `book:"${x.value}"`).join(' ');

        // set query string
        let queryStr = document.getElementById("keyword").value;
        if (this.defaultSearch) {
          queryStr = this.defaultSearch + " " + queryStr;
        }
        if (queryStrFromFrom) {
          queryStr = queryStrFromFrom + " " + queryStr;
        }

        // parse query
        const query = searchEngine.parseQuery(queryStr);
        if (query.error.length) {
          for (const err of query.error) {
            this.addMsg(scrapbook.lang('ErrorSearch', [err]), 'error');
          }
          return;
        }
        console.log("Search:", query);

        // search and get result
        return await searchEngine.search(query, {
          resultHandler: this.showResults.bind(this),
        });
      } catch(ex) {
        console.error(ex);
        this.addMsg(scrapbook.lang('ErrorSearch', [ex.message]), 'error');
      };
    },

    showResults(results, {book, markers}) {
      this.addMsg(scrapbook.lang('SearchFound', [book.name, results.length]));

      const wrapper = document.createElement("div");

      const tree = new SearchTree({
        treeElem: wrapper,
        bookId: book.id,
        markers,
        commentLength: scrapbook.getOption("scrapbook.searchCommentLength"),
        contextLength: scrapbook.getOption("scrapbook.searchContextLength"),
        sourceLength: scrapbook.getOption("scrapbook.searchSourceLength"),
      });
      tree.init({
        book,
        allowSelect: false,
        allowMultiSelect: false,
        allowMultiSelectOnClick: false,
        allowAnchorClick: true,
        allowDrag: false,
        allowDrop: false,
      });
      tree.rebuild();

      for (const result of results) {
        const {id, file, meta, fulltext} = result;
        tree.addItem(meta, file, fulltext.content);
      }

      // Add a <br> for spacing between books, and adds a spacing when the user
      // selects and the search results and copy and paste as plain text.
      wrapper.appendChild(document.createElement('br'));

      document.getElementById("result").appendChild(wrapper);
    },

    clearResult() {
      document.getElementById("result").textContent = "";
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
          let fulltextSize = 0;
          let metaMtime = -Infinity;
          let metaSize = 0;
          for (const file of book.treeFiles.values()) {
            if (regexFulltext.test(file.name)) {
              fulltextMtime = Math.max(fulltextMtime, file.last_modified);
              if (file.size !== null) { fulltextSize += file.size; }
            } else if (regexMeta.test(file.name)) {
              metaMtime = Math.max(metaMtime, file.last_modified);
              if (file.size !== null) { metaSize += file.size; }
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
              if (this.inclusiveFrames) {
                u.searchParams.append('inclusive_frames', 1);
              }

              const a = document.createElement('a');
              a.textContent = cacheOutdatedMessage;
              a.href = u.href;
              a.target = '_blank';
              this.addMsg(a, 'warn', document.getElementById('messages'));
            }
          }

          // check size
          const tasks = [
            book.loadMeta(),
            book.loadToc(),
          ];
          if (!server.config.app.is_local
              && typeof this.fulltextCacheRemoteSizeLimit === 'number'
              && fulltextSize > this.fulltextCacheRemoteSizeLimit * 1024 * 1024) {
            let size = fulltextSize / (1024 * 1024);
            size = size > 0.1 ? size.toFixed(1) + ' MiB' :
                size * 1024 > 0.1 ? (size * 1024).toFixed(1) + ' KiB' :
                fulltextSize + ' B';
            const msg = scrapbook.lang('WarnSearchCacheBlocked', [book.name, size]);
            this.addMsg(msg, 'warn', document.getElementById('messages'));
            book.fulltext = {};
          } else {
            tasks.push(book.loadFulltext());
          }

          // load index
          await Promise.all(tasks);
        })();
        tasks.set(book.id, task);
        return task;
      };
      return await loadBook(book);
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
      const bookId = elem.closest('[data-bookId]').getAttribute('data-bookId');
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

  const searchEngine = {
    parseQuery(queryStr) {
      const query = {
        error: [],
        rules: {},
        sorts: [],
        limit: null,
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

      const setLimit = (value, positive) => {
        if (!positive) {
          query.limit = null;
          return; 
        }

        const newValue = parseInt(value);
        if (!Number.isNaN(newValue)) {
          query.limit = newValue;
        }
      };

      const addError = (msg) => {
        query.error.push(msg);
      };

      const parseStr = (term, exactMatch = false) => {
        let flags = query.mc ? "mu" : "imu";
        let regex = "";
        if (query.re) {
          try {
            regex = new RegExp(term, flags);
          } catch(ex) {
            addError(scrapbook.lang('ErrorSearchInvalidRegExp', [term]));
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
        const match = term.match(/^(\d{0,17})(?:-(\d{0,17}))?$/);
        if (!match) {
          addError(scrapbook.lang('ErrorSearchInvalidDate', [term]));
          return null;
        }
        const since = match[1] ? this.idLocalToUtc(pad(match[1], 17)) : pad("", 17);
        const until = match[2] ? this.idLocalToUtc(pad(match[2], 17)) : pad("", 17, "9");
        return [since, until];
      };

      const pad = (n, width, z) => {
        z = z || "0";
        n = n + "";
        return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
      };

      queryStr.replace(/(-*[A-Za-z]+:|-+)(?:"([^"]*(?:""[^"]*)*)"|([^"\s]*))|(?:"([^"]*(?:""[^"]*)*)"|([^"\s]+))/g, (match, cmd, qterm, term, qterm2, term2) => {
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
          case "limit":
            setLimit(term, pos);
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
          case "icon":
            addRule("icon", pos ? "include" : "exclude", parseStr(term));
            break;
          case "tc":
            addRule("tc", pos ? "include" : "exclude", parseStr(term));
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
          case "index":
            addRule("index", pos ? "include" : "exclude", parseStr(term));
            break;
          case "charset":
            addRule("charset", pos ? "include" : "exclude", parseStr(term));
            break;
          case "create":
            addRule("create", pos ? "include" : "exclude", parseDate(term));
            break;
          case "modify":
            addRule("modify", pos ? "include" : "exclude", parseDate(term));
            break;
          case "marked":
            addRule("marked", pos ? "include" : "exclude", true);
            break;
          case "locked":
            addRule("locked", pos ? "include" : "exclude", true);
            break;
          case "location":
            addRule("location", pos ? "include" : "exclude", true);
            break;
        }

        return "";
      });
      return query;
    },

    parseMarkers(query) {
      const markers = {
        title: [],
        comment: [],
        content: [],
        source: [],
        file: [],
      };
      if (query.rules.tcc) {
        for (const regex of query.rules.tcc.include) {
          markers.title.push(regex);
          markers.comment.push(regex);
          markers.content.push(regex);
        }
      }
      if (query.rules.tc) {
        for (const regex of query.rules.tc.include) {
          markers.title.push(regex);
          markers.comment.push(regex);
        }
      }
      if (query.rules.title) {
        for (const regex of query.rules.title.include) {
          markers.title.push(regex);
        }
      }
      if (query.rules.comment) {
        for (const regex of query.rules.comment.include) {
          markers.comment.push(regex);
        }
      }
      if (query.rules.content) {
        for (const regex of query.rules.content.include) {
          markers.content.push(regex);
        }
      }
      if (query.rules.source) {
        for (const regex of query.rules.source.include) {
          markers.source.push(regex);
        }
      }
      if (query.rules.file) {
        for (const regex of query.rules.file.include) {
          markers.file.push(regex);
        }
      }

      for (const k in markers) {
        markers[k] = markers[k].map(r => new RegExp(r.source, `${r.ignoreCase ? 'i': ''}mug`));
      }

      return markers;
    },

    async search(query, {resultHandler}) {
      const books = new Set(search.books);
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

      const markers = this.parseMarkers(query);

      for (const book of books) {
        await search.loadBook(book);
        const results = this.searchBook(query, book);
        resultHandler(results, {book, markers});
      }
    },

    searchBook(query, book) {
      const results = [];

      const idPool = new Set();
      {
        if (!query.roots.include.length) {
          query.roots.include.push('root');
        }

        for (const root of query.roots.include) {
          for (const id of book.getReachableItems(root)) {
            idPool.add(id);
          }
        }

        for (const root of query.roots.exclude) {
          for (const id of book.getReachableItems(root)) {
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

      // limit results
      if (query.limit) {
        results.splice(query.limit);
      }

      return results;
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

    _match_tc(rule, item) {
      return this.matchText(rule, [item.meta.title, item.meta.comment].join("\n"));
    },

    _match_tcc(rule, item) {
      return this.matchText(rule, [item.meta.title, item.meta.comment, item.fulltext.content].join("\n"));
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

    _match_index(rule, item) {
      return this.matchText(rule, item.meta.index);
    },

    _match_charset(rule, item) {
      return this.matchText(rule, item.meta.charset);
    },

    _match_source(rule, item) {
      return this.matchText(rule, item.meta.source);
    },

    _match_icon(rule, item) {
      return this.matchText(rule, item.meta.icon);
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

    _match_marked(rule, item) {
      return this.matchBool(rule, item.meta.marked);
    },

    _match_locked(rule, item) {
      return this.matchBool(rule, item.meta.locked);
    },

    _match_location(rule, item) {
      return this.matchBool(rule, item.meta.location);
    },

    matchBool(rule, bool) {
      if (rule.exclude.length) {
        if (bool) {
          return false;
        }
      }

      if (rule.include.length) {
        if (!bool) {
          return false;
        }
      }

      return true;
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

    idLocalToUtc(id) {
      if (/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/.test(id)) {
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
