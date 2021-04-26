/******************************************************************************
 *
 * Shared class for server related manipulation.
 *
 * @require {Object} scrapbook
 * @public {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  if (root.hasOwnProperty('server')) { return; }
  root.server = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  // order is relevant
  const SPECIAL_ITEM_ID = new Set(['root', 'hidden', 'recycle']);

  // this should correspond with the lock stale time in the backend server
  const LOCK_STALE_TIME = 60 * 1000;

  const TRANSCATION_BACKUP_TREE_FILES_REGEX = /^(meta|toc)\d*\.js$/i;

  const TEMPLATE_DIR = '/templates/';
  const TEMPLATES = {
    'html': {
      filename: 'note_template.html',
      content: `<!DOCTYPE html>
<html data-scrapbook-type="note">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title data-scrapbook-elem="title">%NOTE_TITLE%</title>
</head>
<body>%NOTE_TITLE%</body>
</html>
`,
    },
    'markdown': {
      filename: 'note_template.md',
      content: `%NOTE_TITLE%`,
    },
  };

  const REGEX_ITEM_POSTIT = new RegExp('^[\\S\\s]*?<pre>\\n?([^<]*(?:<(?!/pre>)[^<]*)*)\\n</pre>[\\S\\s]*$');
  const ITEM_POSTIT_FORMATTER = `\
<!DOCTYPE html><html><head>\
<meta charset="UTF-8">\
<meta name="viewport" content="width=device-width">\
<style>pre { white-space: pre-wrap; overflow-wrap: break-word; }</style>\
</head><body><pre>
%POSTIT_CONTENT%
</pre></body></html>`;

  class RequestError extends Error {
    constructor(message, response) {
      super(message);
      this.name = 'RequestError';
      if (response) {
        this.url = response.url;
        this.status = response.status;
        this.headers = response.headers;
      }
    }
  }

  class Server {
    constructor () {
      this._config = null;
      this._serverRoot = null;
      this._user = null;
      this._password = null;
      this._bookId = null;
      this._books = null;
    }

    get serverRoot() {
      return this._serverRoot;
    }

    get config() {
      return this._config;
    }

    get books() {
      return this._books;
    }

    get bookId() {
      return this._bookId;
    }

    set bookId(bookId) {
      if (!this.books[bookId]) {
        throw new Error(`Invalid book ID "${bookId}".`);
      }
      this._bookId = bookId;
    }

    /**
     * Wrapped API for a general request to backend server
     *
     * @param {Object} params
     * @param {string|URL} params.url
     * @param {string} [params.method]
     * @param {Object|Headers} [params.headers]
     * @param {Object|FormData} [params.body]
     * @param {string} [params.credentials]
     * @param {string} [params.cache]
     * @param {boolean} [params.csrfToken]
     * @param {string} [params.format]
     */
    async request({
      url,
      method,
      headers,
      body,
      credentials = 'include',
      cache = 'no-cache',
      csrfToken = false,
      format,
    }) {
      if (!method) {
        method = (body || csrfToken) ? 'POST' : 'GET';
      }

      if (!(url instanceof URL)) {
        url = new URL(url);
      }

      if (headers && !(headers instanceof Headers)) {
        const h = new Headers();
        for (const [key, value] of Object.entries(headers)) {
          if (typeof value !== "undefined") {
            if (Array.isArray(value)) {
              for (const v of value) {
                h.append(key, v);
              }
            } else {
              h.append(key, value);
            }
          }
        }
        headers = h;
      }

      if (format) {
        // set Accept header
        const acceptHeader = {
          'json': 'application/json, */*;q=0.1',
        }[format.toLowerCase()];

        if (acceptHeader) {
          if (!headers) {
            headers = new Headers();
          }
          headers.set('Accept', acceptHeader);
        }

        // set format param
        url.searchParams.set('f', format);
      }

      if (body && !(body instanceof FormData)) {
        const b = new FormData();
        for (const [key, value] of Object.entries(body)) {
          if (typeof value !== "undefined") {
            if (Array.isArray(value)) {
              for (const v of value) {
                b.append(key, v);
              }
            } else {
              b.append(key, value);
            }
          }
        }
        body = b;
      }

      if (csrfToken) {
        if (!body) {
          body = new FormData();
        }
        body.append('token', await this.acquireToken());
      }

      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body,
          credentials,
          cache,
        });
      } catch (ex) {
        throw new RequestError('Unable to connect to backend server.');
      }

      if (!response.ok) {
        let json;
        try {
          json = await response.json();
        } catch (ex) {
          const statusText = response.status + (response.statusText ? " " + response.statusText : "");
          throw new RequestError(statusText, response);
        }
        if (json.error) {
          throw new RequestError(json.error.message, response);
        }
      }
      return response;
    }

    /**
     * Wrapped API for SSE request to backend server
     *
     * @param {Object} params
     * @param {string|URL} [params.url]
     * @param {Object} [params.query]
     * @param {string} [params.credentials]
     * @param {string} [params.cache]
     * @param {boolean} [params.csrfToken]
     * @param {Function} [params.onMessage]
     */
    async requestSse({
      url = this.serverRoot,
      query,
      credentials = 'include',
      cache = 'no-cache',
      csrfToken = true,
      onMessage,
    } = {}) {
      if (!(url instanceof URL)) {
        url = new URL(url);
      }

      url.searchParams.set('f', 'sse');

      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (typeof value !== "undefined") {
            if (Array.isArray(value)) {
              for (const v of value) {
                url.searchParams.append(key, v);
              }
            } else {
              url.searchParams.append(key, value);
            }
          }
        }
      }

      if (csrfToken) {
        url.searchParams.set('token', await this.acquireToken());
      }

      return await new Promise(async (resolve, reject) => {
        const evtSource = new EventSource(url.href);

        evtSource.addEventListener('complete', (event) => {
          evtSource.close();
          resolve();
        });

        evtSource.addEventListener('error', (event) => {
          evtSource.close();
          const msg = 'Connection failed.';
          if (onMessage) {
            onMessage({type: 'error', msg});
          }
          resolve();
        });

        evtSource.addEventListener('message', (event) => {
          let info;
          try {
            info = JSON.parse(event.data);
          } catch (ex) {
            console.error(ex);
            info = {type: 'error', msg: `${ex.message}`};
          }
          if (onMessage) {
            onMessage(info);
          }
        });
      });
    }

    /**
     * Load the config of the backend server
     *
     * @return {boolean} whether server config is changed
     */
    async init(refresh = false) {
      if (this._config && !refresh) {
        return false;
      }

      if (!scrapbook.hasServer()) {
        throw new Error('Backend server not configured.');
      }

      // record configs
      this._bookId = (await scrapbook.cache.get({table: "scrapbookServer", key: "currentScrapbook"}, 'storage')) || "";

      // Take user and password only when both are non-empty;
      // otherwise omit both fields for the browser to try cached
      // auth credentials.
      this._user = scrapbook.getOption("server.user");
      this._password = scrapbook.getOption("server.password");
      if (!(this._user && this._password)) {
        this._user = this._password = null;
      }

      // load config from server
      {
        let rootUrlObj;
        try {
          rootUrlObj = new URL(scrapbook.getOption("server.url"));
          if (!rootUrlObj.pathname.endsWith('/')) { rootUrlObj.pathname += '/'; }
          rootUrlObj.search = rootUrlObj.hash = '';
        } catch (ex) {
          throw new Error('Malformed server address.');
        }

        // Use xhr for the first time for authentication as fetch API doesn't
        // support a URL with user/password.
        let xhr;
        const url = rootUrlObj.href + '?a=config&f=json&ts=' + Date.now(); // ignore cache
        try {
          xhr = await scrapbook.xhr({
            url, // ignore cache
            user: this._user,
            password: this._password,
            responseType: 'json',
            requestHeaders: {
              Accept: 'application/json, */*;q=0.1',
            },
            method: "GET",
            allowAnyStatus: true,
          });
        } catch (ex) {
          throw new RequestError('Unable to connect to backend server.', {url});
        }

        if (xhr.status === 401) {
          throw new RequestError('HTTP authentication failed.', {
            url: xhr.responseURL,
            status: xhr.status,
          });
        }

        if (!(xhr.status >= 200 && xhr.status < 300 &&
            xhr.response && xhr.response.data)) {
          throw new Error('The server does not support WebScrapBook protocol.');
        }

        const config = xhr.response.data;

        // revise server root URL
        // rootUrlObj.href may be too deep, replace with server base path
        rootUrlObj.pathname = config.app.base + '/';
        const serverRoot = rootUrlObj.href;

        // return if server root and config are both set and not changed
        if (this._config &&
            this._serverRoot === serverRoot &&
            JSON.stringify(this._config) === JSON.stringify(config)) {
          return false;
        }

        this._serverRoot = serverRoot;
        this._config = config;
      }

      // validate if the server version is compatible
      {
        if (scrapbook.versionCompare(this._config.VERSION, scrapbook.BACKEND_MIN_VERSION) < 0) {
          throw new Error(`Require server app version >= ${scrapbook.BACKEND_MIN_VERSION}.`);
        }

        // if min extension version is set, validate it
        if (this._config.WSB_EXTENSION_MIN_VERSION) {
          let version;
          try {
            version = browser.runtime.getManifest().version;
          } catch (ex) {
            // skip if failed to get extension version
            console.error(ex);
          }
          if (version) {
            if (scrapbook.versionCompare(version, this._config.WSB_EXTENSION_MIN_VERSION) < 0) {
              throw new Error(`Server app requires extension version >= ${this._config.WSB_EXTENSION_MIN_VERSION}.`);
            }
          }
        }
      }

      // load books
      {
        this._books = {};
        for (const bookId in server.config.book) {
          this._books[bookId] = new Book(bookId, this);
        }
      }

      return true;
    }

    /**
     * Acquire an access token from the backend server
     */
    async acquireToken(url) {
      try {
        const json = await this.request({
          url: (url || this._serverRoot) + '?a=token',
          method: "POST",
          format: 'json',
          csrfToken: false, // avoid recursion
        }).then(r => r.json());
        return json.data;
      } catch (ex) {
        throw new Error(`Unable to acquire access token: ${ex.message}`);
      }
    }

    async getMetaRefreshTarget(refUrl) {
      const doc = await server.request({
        url: refUrl,
        method: "GET",
      })
        .then(r => r.blob())
        .then(b => scrapbook.readFileAsDocument(b));

      return scrapbook.getMetaRefreshTarget(doc, refUrl);
    }

    async findBookIdFromUrl(url) {
      const u = scrapbook.splitUrl(url)[0];
      for (const [id, book] of Object.entries(this.books)) {
        if (u.startsWith(book.dataUrl)) {
          return id;
        }
      }
    }
  }

  class Book {
    constructor(bookId, server) {
      this.id = bookId;
      this.name = server.config.book[bookId].name;
      this.server = server;
      this.config = server.config.book[bookId];
      this.treeLastModified = undefined;

      if (!this.config) {
        throw new Error(`unknown scrapbook: ${bookId}`);
      }

      this.topUrl = server.serverRoot +
        (this.config.top_dir ? scrapbook.quote(this.config.top_dir) + '/' : '');

      this.dataUrl = this.topUrl +
          (this.config.data_dir ? scrapbook.quote(this.config.data_dir) + '/' : '');

      this.treeUrl = this.topUrl +
          (this.config.tree_dir ? scrapbook.quote(this.config.tree_dir) + '/' : '');

      this.indexUrl = this.topUrl + this.config.index;

      this.treeFiles = null;
      this.toc = null;
      this.meta = null;
    }

    get defaultMeta() {
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
    }

    get specialItems() {
      return SPECIAL_ITEM_ID;
    }

    isSpecialItem(id) {
      return SPECIAL_ITEM_ID.has(id);
    }

    /**
     * Load tree file list.
     *
     * - Also update this.treeLastModified.
     *
     * @return {Map}
     */
    async loadTreeFiles(refresh = false) {
      if (this.treeFiles && !refresh) {
        return this.treeFiles;
      }

      let response, data;
      try {
        response = await this.server.request({
          url: this.treeUrl + '?a=list',
          method: "GET",
          format: 'json',
        });
        data = (await response.json()).data;
      } catch (ex) {
        if (ex.status === 404) {
          // tree folder not exist, create one
          await this.server.request({
            url: this.treeUrl + '?a=mkdir',
            method: "POST",
            format: 'json',
            csrfToken: true,
          });

          // load again
          response = await this.server.request({
            url: this.treeUrl + '?a=list',
            method: "GET",
            format: 'json',
          });
          data = (await response.json()).data;
        } else {
          throw new Error(ex.message);
        }
      }

      let regex = /^(?:meta|toc)\d*\.js$/i;
      let treeLastModified = new Date(response.headers.get('Last-Modified')).valueOf();
      let treeFiles = data.reduce((data, item) => {
        if (regex.test(item.name)) {
          treeLastModified = Math.max(treeLastModified, parseInt(item.last_modified) * 1000);
        }
        data.set(item.name, item);
        return data;
      }, new Map());

      this.treeLastModified = treeLastModified;
      return this.treeFiles = treeFiles;
    }

    /**
     * Load files with specific tree file name.
     *
     * e.g. meta.js, meta1.js, ...
     *
     * @return {Object}
     */
    async loadTreeFile(name) {
      const rv = {};
      const treeFiles = await this.loadTreeFiles();
      const prefix = this.treeUrl;
      for (let i = 0; ; i++) {
        const file = `${name}${i || ""}.js`;
        const fileObj = treeFiles.get(file);
        if (!(fileObj && fileObj.type === 'file' && fileObj.size > 0)) {
          break;
        }

        const url = prefix + encodeURIComponent(file);
        try {
          const text = await this.server.request({
            url,
            method: "GET",
          }).then(r => r.text());

          if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
            throw new Error(`unable to retrieve JSON data.`);
          }

          Object.assign(rv, JSON.parse(RegExp.$1));
        } catch (ex) {
          throw new Error(`Error loading '${url}': ${ex.message}`);
        }
      }

      // remove top-level null values to allow quick clear by appending file
      // e.g. add meta1.js with {id1: null} to quickly delete id1 in meta.js
      for (const key in rv) {
        if (!rv[key]) { delete rv[key]; }
      }

      return rv;
    }

    async loadMeta(refresh = false) {
      if (this.meta && !refresh) {
        return this.meta;
      }

      const obj = this.meta = await this.loadTreeFile('meta');

      // add id for all items
      for (const key in obj) {
        obj[key].id = key;
      }

      return obj;
    }

    async loadToc(refresh = false) {
      if (this.toc && !refresh) {
        return this.toc;
      }

      return this.toc = await this.loadTreeFile('toc');
    }

    async loadFulltext(refresh = false) {
      if (this.fulltext && !refresh) {
        return this.fulltext;
      }

      return this.fulltext = await this.loadTreeFile('fulltext');
    }

    async lockTree({
      id,
      timeout = 5,
    } = {}) {
      const json = await this.server.request({
        url: this.topUrl + '?a=lock',
        method: "POST",
        format: 'json',
        csrfToken: true,
        body: {
          name: `book-${this.id}-tree`,
          id,
          chkt: timeout,
        },
      }).then(r => r.json());
      return json.data;
    }

    async unlockTree({id} = {}) {
      await this.server.request({
        url: this.topUrl + '?a=unlock',
        method: "POST",
        format: 'json',
        csrfToken: true,
        body: {
          name: `book-${this.id}-tree`,
          id,
        },
      });
    }

    /**
     * Validate that tree files has not been changed since last loaded
     */
    async validateTree() {
      const treeLastModified = this.treeLastModified;
      await this.loadTreeFiles(true);

      // Check for equality as it's possible that the server has been switched
      // to another root directory that happens to have same config and book ID
      if (this.treeLastModified !== treeLastModified && typeof treeLastModified !== 'undefined') {
        return false;
      }
      return true;
    }

    /**
     * Low-level API. Wrap in a transaction for safety.
     */
    async saveMeta() {
      const exportFile = async (meta, i) => {
        const content = this.generateMetaFile(meta);
        const file = new File([content], `meta${i || ""}.js`, {type: "application/javascript"});
        const target = this.treeUrl + file.name;
        await this.server.request({
          url: target + '?a=save',
          method: "POST",
          format: 'json',
          csrfToken: true,
          body: {
            upload: file,
          },
        });
      };

      const treeFiles = await this.loadTreeFiles();

      // A javascript string >= 256 MiB (UTF-16 chars) causes an error
      // in the browser. Split each js file at around 256 K items to
      // prevent the issue. (An item is mostly < 512 bytes)
      const sizeThreshold = 256 * 1024;
      const files = [];

      let i = 0;
      let size = 1;
      let meta = {};
      for (const id in this.meta) {
        const value = this.meta[id];
        if (!value) { continue; }
        meta[id] = Object.assign({}, value, {id: undefined}); // remove id
        size += 1;

        if (size >= sizeThreshold) {
          await exportFile(meta, i);
          i += 1;
          size = 0;
          meta = {};
        }
      }
      if (size) {
        await exportFile(meta, i);
        i += 1;
      }

      // remove stale meta files
      for (; ; i++) {
        const path = `meta${i}.js`;
        if (!treeFiles.has(path)) { break; }

        const target = this.treeUrl + path;
        await this.server.request({
          url: target + '?a=delete',
          method: "POST",
          format: 'json',
          csrfToken: true,
        });
      }
    }

    /**
     * Low-level API. Wrap in a transaction for safety.
     */
    async saveToc() {
      const exportFile = async (toc, i) => {
        const content = this.generateTocFile(toc);
        const file = new File([content], `toc${i || ""}.js`, {type: "application/javascript"});
        const target = this.treeUrl + file.name;
        await this.server.request({
          url: target + '?a=save',
          method: "POST",
          format: 'json',
          csrfToken: true,
          body: {
            upload: file,
          },
        });
      };

      const treeFiles = await this.loadTreeFiles();

      // A javascript string >= 256 MiB (UTF-16 chars) causes an error
      // in the browser. Split each js file at around 4 M entries to
      // prevent the issue. (An entry is mostly < 32 bytes)
      const sizeThreshold = 4 * 1024 * 1024;
      const files = [];

      let i = 0;
      let size = 1;
      let toc = {};
      for (const id in this.toc) {
        const value = this.toc[id];
        if (!value) { continue; }
        toc[id] = value;
        size += 1 + value.length;

        if (size >= sizeThreshold) {
          await exportFile(toc, i);
          i += 1;
          size = 0;
          toc = {};
        }
      }
      if (size) {
        await exportFile(toc, i);
        i += 1;
      }

      // remove stale toc files
      for (; ; i++) {
        const path = `toc${i}.js`;
        if (!treeFiles.has(path)) { break; }

        const target = this.treeUrl + path;
        await this.server.request({
          url: target + '?a=delete',
          method: "POST",
          format: 'json',
          csrfToken: true,
        });
      }
    }


    /**
     * @callback transactionCallback
     * @param {Book} book - the Book the transaction is performed on.
     * @param {boolean} [updated] - whether the server tree has been updated.
     */

    /**
     * A high-level wrapper for common tree-releated request series.
     *
     * - Acquire a lock.
     * - Do a series of requests.
     * - Spawns a timer to refresh the lock automatically.
     * - Release the lock on success or fail.
     *
     * NOTE: this is NOT a true transaction, which supports atomic and rollback.
     *
     * @param {Object} params
     * @param {transactionCallback} params.callback - the callback function to
     *     peform the tasks.
     * @param {integer} [params.timeout] - timeout for lock.
     * @param {string} [params.mode] - mode for the transaction:
     *     - "validate": validate the tree before the request and fail out if
     *       the remote tree has been updated.
     *     - "refresh": refresh the tree before the request and pass an extra
     *        param about whether the remote tree has been updated.
     * @param {boolean} [params.autoBackup] - whether to automatically create a
     *     temporary tree backup before a transaction and remove after success.
     */
    async transaction({
      callback,
      mode,
      autoBackup = scrapbook.getOption("scrapbook.transactionAutoBackup"),
      timeout = 5,
    }) {
      let lockId;
      let keeper;
      let updated;
      let backupTs;
      let backupNote = 'transaction';

      // lock the tree
      try {
        lockId = await this.lockTree({timeout});
      } catch (ex) {
        if (ex.status === 503) {
          throw new Error(`Tree of remote book "${this.id}" has been locked by another process. Try again later.`);
        } else {
          throw new Error(`Failed to lock tree for remote book "${this.id}".`);
        }
      }

      try {
        // keeper setup
        const refreshInterval = LOCK_STALE_TIME * 0.2;
        const refreshAcquireTimeout = 1;
        keeper = setInterval(async () => {
          await this.lockTree({id: lockId, timeout: refreshAcquireTimeout});
        }, refreshInterval);

        // handle requested settings
        switch (mode) {
          case 'validate': {
            if (!await this.validateTree()) {
              throw new Error(scrapbook.lang('ScrapBookErrorServerTreeChanged'));
            }
            break;
          }
          case 'refresh': {
            updated = !await this.validateTree();
            break;
          }
        }

        // auto backup
        if (autoBackup) {
          backupTs = scrapbook.dateToId();

          // Load tree files if not done yet.
          if (!this.treeFiles) {
            await this.loadTreeFiles();
          }

          for (const [filename] of this.treeFiles) {
            if (TRANSCATION_BACKUP_TREE_FILES_REGEX.test(filename)) {
              await this.server.request({
                url: this.treeUrl + filename + `?a=backup&ts=${backupTs}&note=${backupNote}`,
                method: "POST",
                format: 'json',
                csrfToken: true,
              });
            }
          }
        }

        // run the callback
        await callback.call(this, this, updated);

        // clear auto backup if transaction successful
        if (backupTs) {
          try {
            await this.server.request({
              url: this.treeUrl + `?a=unbackup&ts=${backupTs}&note=${backupNote}`,
              method: "POST",
              format: 'json',
              csrfToken: true,
            });
          } catch (ex) {
            console.error(ex);
          }
        }
      } finally {
        // clear keeper
        clearInterval(keeper);

        // unlock the tree
        try {
          await this.unlockTree({id: lockId});
        } catch (ex) {
          throw new Error(`Failed to unlock tree for remote book "${this.id}".`);
        }
      }
    }

    generateMetaFile(jsonData) {
      return `/**
 * Feel free to edit this file, but keep data code valid JSON format.
 */
scrapbook.meta(${JSON.stringify(jsonData, null, 2)})`;
    }

    generateTocFile(jsonData) {
      return `/**
 * Feel free to edit this file, but keep data code valid JSON format.
 */
scrapbook.toc(${JSON.stringify(jsonData, null, 2)})`;
    }

    generateId() {
      let d = new Date();
      let i = d.valueOf();
      let id = scrapbook.dateToId(d);
      while (this.meta[id]) {
        d.setTime(++i);
        id = scrapbook.dateToId(d);
      }
      return id;
    }

    /**
     * Add (or replace) an item to the Book.
     *
     * @param {Object} params
     * @param {?Object} params.item - null to generate a default item. Overwrites existed id.
     * @param {?string} params.parentId - null to not add to any parent
     * @param {integer} params.index - Infinity to insert to last
     * @return {Object}
     */
    addItem({
      item,
      parentId = 'root',
      index = Infinity,
    }) {
      // generate a cloned item, with keys sorted in a predefined order
      item = Object.assign(this.defaultMeta, item);

      // type casting
      if (!item.id) {
        item.id = this.generateId();
        if (!item.create) {
          item.create = item.id;
        }
      } else {
        if (!item.create) {
          item.create = this.generateId();
        }
      }
      if (!item.modify) {
        item.modify = item.create;
      }

      // add to meta (overwrite if item.id exists)
      this.meta[item.id] = item;

      // add to TOC if parentId is not null
      if (parentId) {
        if (!this.toc[parentId]) {
          this.toc[parentId] = [];
        }
        this.toc[parentId].splice(index, 0, item.id);
      }

      return item;
    }

    /**
     * Remove an item and descneding items from the Book.
     *
     * @param {Object} params
     * @param {string} params.id
     * @param {?string} params.parentId - null to not removed from certain parent
     *         (useful for checking stale items)
     * @param {integer} params.index
     * @return {Set} a set of removed items
     */
    removeItemTree({
      id,
      parentId,
      index,
    }) {
      // reachable items
      const allItems = new Set();
      this.getReachableItems('root', allItems);
      this.getReachableItems('hidden', allItems);
      this.getReachableItems('recycle', allItems);

      // remove from parent TOC
      if (parentId && this.toc[parentId]) {
        this.toc[parentId].splice(index, 1);
        if (!this.toc[parentId].length) {
          delete this.toc[parentId];
        }
      }

      // reachable items after removal
      const curItems = new Set();
      this.getReachableItems('root', curItems);
      this.getReachableItems('hidden', curItems);
      this.getReachableItems('recycle', curItems);

      // clear stale data for items no longer reachable
      const removedItems = new Set();
      for (const id of allItems) {
        if (curItems.has(id)) {
          // still reachable
          continue;
        }
        if (!this.meta[id]) {
          // already deleted, but repeatedly called due to some reason
          continue;
        }
        removedItems.add(this.meta[id]);
        delete this.meta[id];
        delete this.toc[id];
      }

      return removedItems;
    }

    /**
     * Remove an item from Book tree and put it to recycle bin if not referenced.
     *
     * @param {Object} params
     * @param {string} params.id
     * @param {?string} params.currentParentId - null to not removed from certain parent
     *         (useful for checking stale items)
     * @param {integer} params.currentIndex
     * @param {string} [params.targetParentId] - ID of the recycle bin item
     * @param {integer} [params.targetIndex] - Infinity to insert to last
     * @return {integer} the real insertion index
     */
    recycleItemTree({
      id,
      currentParentId,
      currentIndex,
      targetParentId = 'recycle',
      targetIndex = Infinity,
    }) {
      // remove from parent TOC
      if (currentParentId && this.toc[currentParentId]) {
        this.toc[currentParentId].splice(currentIndex, 1);
        if (!this.toc[currentParentId].length) {
          delete this.toc[currentParentId];
        }
      }

      // reachable items after removal
      const curItems = new Set();
      this.getReachableItems('root', curItems);
      this.getReachableItems('hidden', curItems);
      this.getReachableItems(targetParentId, curItems);

      // add item to targetParentId if no longer referenced
      if (!curItems.has(id)) {
        if (!this.toc[targetParentId]) {
          this.toc[targetParentId] = [];
        }
        this.toc[targetParentId].splice(targetIndex, 0, id);

        if (!isFinite(targetIndex)) {
          targetIndex = this.toc[targetParentId].length - 1;
        }

        // record recycled time and original parent ID and in meta
        this.meta[id].parent = currentParentId;
        this.meta[id].recycled = scrapbook.dateToId();
      }

      return targetIndex;
    }

    /**
     * Move an item in the Book.
     *
     * @param {Object} params
     * @param {string} params.id
     * @param {?string} params.currentParentId - null if none
     * @param {integer} params.currentIndex
     * @param {integer} params.targetParentId
     * @param {integer} [params.targetIndex] - Infinity to insert to last
     * @return {integer} the real insertion index
     */
    moveItem({
      id,
      currentParentId,
      currentIndex,
      targetParentId,
      targetIndex = Infinity,
    }) {
      // fix when moving within the same parent
      // -1 as the current item will be removed from the original position
      if (currentParentId === targetParentId && targetIndex > currentIndex) {
        targetIndex--;
      }

      // remove from parent TOC
      if (currentParentId && this.toc[currentParentId]) {
        this.toc[currentParentId].splice(currentIndex, 1);
        if (!this.toc[currentParentId].length) {
          delete this.toc[currentParentId];
        }
      }

      // add to target TOC
      if (!this.toc[targetParentId]) {
        this.toc[targetParentId] = [];
      }
      this.toc[targetParentId].splice(targetIndex, 0, id);

      if (!isFinite(targetIndex)) {
        targetIndex = this.toc[targetParentId].length - 1;
      }
      return targetIndex;
    }

    /**
     * Get a flattened set of reachable items, including self.
     *
     * @param {string} id
     * @param {Set} [set]
     * @return {Set}
     */
    getReachableItems(id, set = new Set()) {
      const _addDecendingItems = (id) => {
        if (!set.has(id)) {
          set.add(id);
          if (this.toc[id]) {
            for (const childId of this.toc[id]) {
              _addDecendingItems(childId);
            }
          }
        }
      };
      _addDecendingItems(id);
      return set;
    }

    /**
     * Get URL of the real index file of an item.
     *
     * - Consider redirection of HTZ or MAFF.
     * - Consider meta refresh of index.html.
     */
    async getItemIndexUrl(item, {
      checkArchiveRedirect = true,
      checkMetaRefresh = true,
    } = {}) {
      const index = item.index;
      if (!index) { return; }

      let target = this.dataUrl + scrapbook.escapeFilename(index);

      if (checkArchiveRedirect) {
        const response = await this.server.request({
          url: target,
          method: "HEAD",
        });
        target = response.url;
      }

      if (checkMetaRefresh && target.endsWith('/index.html')) {
        const redirectedTarget = await this.server.getMetaRefreshTarget(target);
        if (redirectedTarget) {
          target = redirectedTarget;
        }
      }

      return target;
    }

    /**
     * Check whether url is a valid index file for item.
     *
     * - Currently any ~/index.html in a MAFF archive is considered true as
     *   there's no good way to determine which subdirectory corresponds to
     *   the item.
     */
    isItemIndexUrl(item, url) {
      if (!(item && item.index && url)) { return false; }

      let u = scrapbook.normalizeUrl(scrapbook.splitUrl(this.dataUrl + scrapbook.escapeFilename(item.index))[0]);
      let u1 = scrapbook.normalizeUrl(scrapbook.splitUrl(url)[0]);

      const p = u.toLowerCase();
      if (p.endsWith('.maff')) {
        const regex = new RegExp('^' + scrapbook.escapeRegExp(u) + '!/[^/]*/index\.html$');
        return regex.test(u1);
      }
      if (p.endsWith('.htz')) {
        u += '!/index.html';
      }
      return u === u1;
    }

    async findItemFromUrl(url) {
      await this.loadTreeFiles();
      await this.loadMeta();

      let matchedIndexUrl = ''; // last seen valid */index.html
      let matchedItem; // item for the above
      const u = scrapbook.normalizeUrl(scrapbook.splitUrl(url)[0]);
      for (const [id, item] of Object.entries(this.meta)) {
        if (!item.index) { continue; }
        const indexUrl = scrapbook.normalizeUrl(scrapbook.splitUrl(this.dataUrl + scrapbook.escapeFilename(item.index))[0]);
        // foo/page.html should not belong to an item with index foo/index.html
        // if an item with index foo/page.html exists.
        // record the longest match as the item candidate
        if (indexUrl.endsWith('/index.html')) {
          if (u.startsWith(indexUrl.slice(0, -10))) {
            if (indexUrl.length > matchedIndexUrl.length) {
              matchedIndexUrl = indexUrl;
              matchedItem = item;
            }
          }
        }
        if (/\.(htz|maff)$/i.test(indexUrl)) {
          if (u.startsWith(indexUrl + "!/")) {
            return item;
          }
        }
        if (u === indexUrl) {
          return item;
        }
      }

      return matchedItem;
    }

    findItemPaths(id, rootId) {
      const tracePath = (path) => {
        const parent = this.toc[path[path.length - 1].id];
        if (!parent) { return; }

        for (let i = 0, I = parent.length; i < I; ++i) {
          const child = parent[i];
          if (path.some(x => x.id === child)) { continue; }

          path.push({id: child, pos: i});
          if (child === id) {
            result.push([...path]);
          } else {
            tracePath(path);
          }
          path.pop();
        }
      };

      const result = [];
      tracePath([{id: rootId, pos: 1}]);
      return result;
    }

    async getTemplate(type = 'html') {
      const url = this.treeUrl + encodeURI(TEMPLATE_DIR + TEMPLATES[type].filename);

      let templateText;
      try {
        // attempt to load template
        templateText = await this.server.request({
          url: url + '?a=source',
          method: "GET",
        }).then(r => r.text());
      } catch (ex) {
        // template file not exist, generate default one
        templateText = TEMPLATES[type].content;
        const blob = new Blob([templateText], {type: "text/plain"});
        await this.server.request({
          url: url + '?a=save',
          method: "POST",
          format: 'json',
          csrfToken: true,
          body: {
            upload: blob,
          },
        });
      }

      return templateText;
    }

    async renderTemplate(target, item, type = 'html', subPageTitle) {
      const templateText = await this.getTemplate(type);
      return templateText.replace(/%(\w*)%/gu, (_, key) => {
        let value;
        switch (key) {
          case '':
            value = '%';
            break;
          case 'NOTE_TITLE':
            value = (typeof subPageTitle === 'string') ? subPageTitle : item.title;
            break;
          case 'SCRAPBOOK_DIR':
            value = scrapbook.getRelativeUrl(this.topUrl, target);
            break;
          case 'TREE_DIR':
            value = scrapbook.getRelativeUrl(this.treeUrl, target);
            break;
          case 'DATA_DIR':
            value = scrapbook.getRelativeUrl(this.dataUrl, target);
            break;
          case 'ITEM_DIR':
            value = scrapbook.getRelativeUrl(this.dataUrl + item.index.replace(/[^\/]*$/, ''), target) || './';
            break;
        }
        return value ? scrapbook.escapeHtml(value) : '';
      });
    }

    async loadPostit(item) {
      const target = await this.getItemIndexUrl(item);
      let text = await server.request({
        url: target + '?a=source',
        method: "GET",
      }).then(r => r.text());
      text = text.replace(/\r\n?/g, '\n');
      text = text.replace(REGEX_ITEM_POSTIT, '$1');
      return scrapbook.unescapeHtml(text);
    }

    async savePostit(id, text) {
      let item;
      let errors = [];
      await this.transaction({
        mode: 'refresh',
        callback: async (book, updated) => {
          const meta = await book.loadMeta(updated);

          item = meta[id];
          if (!item) {
            throw new Error(`Specified item "${id}" does not exist.`);
          }

          // upload text content
          const title = text.replace(/\n[\s\S]*$/, '');
          const content = ITEM_POSTIT_FORMATTER.replace(/%(\w*)%/gu, (_, key) => {
            let value;
            switch (key) {
              case '':
                value = '%';
                break;
              case 'POSTIT_CONTENT':
                value = text;
                break;
            }
            return value ? scrapbook.escapeHtml(value) : '';
          });

          const target = await this.getItemIndexUrl(item);
          await this.server.request({
            url: target + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              text: scrapbook.unicodeToUtf8(content),
            },
          });

          // update item
          item.title = title;
          item.modify = scrapbook.dateToId();
          await book.saveMeta();

          if (scrapbook.getOption("indexer.fulltextCache")) {
            await this.server.requestSse({
              query: {
                "a": "cache",
                "book": book.id,
                "item": item.id,
                "fulltext": 1,
                "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
                "no_lock": 1,
                "no_backup": 1,
              },
              onMessage(info) {
                if (['error', 'critical'].includes(info.type)) {
                  errors.push(`Error when updating fulltext cache: ${info.msg}`);
                }
              },
            });
          }

          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
      return {
        title: item.title,
        errors,
      };
    }

    /**
     * Cache a favicon.
     *
     * @param {Object} params
     * @param {Object} params.item
     * @param {string} params.icon - icon URL to cache
     * @return {Promise<string>} the new icon URL
     */
    async cacheFavIcon({book, item, icon}) {
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

      const getFavIcon = async (favIconUrl) => {
        if (favIconUrl.startsWith("data:")) {
          return scrapbook.dataUriToFile(favIconUrl, false);
        }

        const headers = {};
        const xhr = await scrapbook.xhr({
          url: favIconUrl,
          responseType: 'blob',
          timeout: 5000,
          onreadystatechange(xhr) {
            if (xhr.readyState !== 2) { return; }
            if (xhr.status === 0) { return; }

            // get headers
            const headerContentDisposition = xhr.getResponseHeader("Content-Disposition");
            if (headerContentDisposition) {
              const contentDisposition = scrapbook.parseHeaderContentDisposition(headerContentDisposition);
              headers.filename = contentDisposition.parameters.filename;
            }
          },
        });

        const [, ext] = scrapbook.filenameParts(headers.filename || scrapbook.urlToFilename(xhr.responseURL));
        const blob = xhr.response;
        const mime = blob.type;

        const ab = await scrapbook.readFileAsArrayBuffer(blob);
        return getShaFile({ab, mime, ext});
      };

      if (!scrapbook.isUrlAbsolute(icon)) {
        return icon;
      }

      try {
        const base = this.dataUrl + item.index;
        const file = await getFavIcon(icon);
        const target = this.treeUrl + 'favicon/' + file.name;

        const json = await server.request({
          url: target,
          method: "GET",
          format: 'json',
        }).then(r => r.json());

        // save favicon if nonexistent or emptied
        if (json.data.type === null || 
            (file.size > 0 && json.data.type === 'file' && json.data.size === 0)) {
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

        return scrapbook.getRelativeUrl(target, base);
      } catch (ex) {
        console.warn(ex);
        capturer.warn(scrapbook.lang("ErrorFileDownloadError", [icon, ex.message]));
      }

      return icon;
    }
  }

  return new Server();

}));
