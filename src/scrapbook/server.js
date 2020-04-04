/******************************************************************************
 *
 * Shared class for server related manipulation.
 *
 * @require {Object} scrapbook
 * @public {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.server = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  const SPECIAL_ITEM_ID = new Set(['root', 'hidden', 'recycle']);

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

    /**
     * Wrapped API for a general request to backend server
     *
     * @param {Object} params
     * @param {string} params.url
     * @param {string} params.method
     * @param {Object} params.headers
     * @param {Object} params.body
     * @param {Object} params.credentials
     * @param {Object} params.cache
     */
    async request(params = {}) {
      let {
        url,
        method = 'GET',
        headers,
        body,
        credentials = 'include',
        cache = 'no-cache',
      } = params;

      if (headers) {
        const h = new Headers();
        for (const [key, value] in Object.entries(headers)) {
          h.set(key, value);
        }
        headers = h;
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
        throw new Error('Unable to connect to backend server.');
      }

      if (!response.ok) {
        let json;
        try {
          json = await response.json();
        } catch (ex) {
          const statusText = response.status + (response.statusText ? " " + response.statusText : "");
          throw new Error(statusText);
        }
        if (json.error) {
          throw json.error;
        }
      }
      return response;
    }

    /**
     * Load the config of the backend server
     */
    async init(refresh = false) {
      if (!this._config || refresh) {
        if (!scrapbook.hasServer()) {
          throw new Error('Backend server not configured.');
        }

        // record configs
        this._user = scrapbook.getOption("server.user");
        this._password = scrapbook.getOption("server.password");
        this._bookId = scrapbook.getOption("server.scrapbook");

        let rootUrlObj;
        try {
          rootUrlObj = new URL(scrapbook.getOption("server.url"));
          if (!rootUrlObj.pathname.endsWith('/')) { rootUrlObj.pathname += '/'; }
          rootUrlObj.search = rootUrlObj.hash = '';
        } catch (ex) {
          throw new Error('Malformed server address.');
        }
        const rootUrl = rootUrlObj.href;

        // load config from server
        {
          // Use xhr for the first time for authentication as fetch API doesn't
          // support a URL with user/password.
          let xhr;
          try {
            xhr = await scrapbook.xhr({
              url: rootUrl + '?a=config&f=json&ts=' + Date.now(), // ignore cache
              user: this._user,
              password: this._password,
              responseType: 'json',
              method: "GET",
              onload: true,
            });
          } catch (ex) {
            throw new Error('Unable to connect to backend server.');
          }

          if (xhr.status === 401) {
            throw new Error('HTTP authentication failed.');
          }

          if (!(xhr.status >= 200 && xhr.status < 300 &&
              xhr.response && xhr.response.data)) {
            throw new Error('The server does not support WebScrapBook protocol.');
          }

          this._config = xhr.response.data;
        }

        // validate if the server version is compatible
        {
          if (scrapbook.versionCompare(this._config.VERSION, scrapbook.BACKEND_MIN_VERSION) < 0) {
            throw new Error(`Require server app version >= ${scrapbook.BACKEND_MIN_VERSION}.`);
          }
        }

        // revise server root URL
        // rootUrl may be too deep, replace with server configured base path
        {
          rootUrlObj.pathname = this._config.app.base + '/';
          this._serverRoot = rootUrlObj.href;
        }

        // load books
        {
          this._books = {};
          for (const bookId in server.config.book) {
            this._books[bookId] = new Book(bookId, this);
          }
        }
      }
    }

    /**
     * Acquire an access token from the backend server
     */
    async acquireToken(url) {
      try {
        const json = await this.request({
          url: (url || this._serverRoot) + '?a=token&f=json',
          method: "GET",
        }).then(r => r.json());
        return json.data;
      } catch (ex) {
        throw new Error(`Unable to acquire access token: ${ex.message}`);
      }
    }

    async lockTree(params = {}) {
      const {timeout = 5, staleThreshold = 60} = params;

      const formData = new FormData();
      formData.append('token', await this.acquireToken());
      formData.append('name', 'tree.lock');
      if (timeout !== undefined) {
        formData.append('chkt', timeout);
      }
      if (staleThreshold !== undefined) {
        formData.append('chks', staleThreshold);
      }

      await this.request({
        url: this._serverRoot + '?a=lock&f=json',
        method: "POST",
        body: formData,
      });
    }

    async unlockTree() {
      const formData = new FormData();
      formData.append('token', await this.acquireToken());
      formData.append('name', 'tree.lock');

      await this.request({
        url: this._serverRoot + '?a=unlock&f=json',
        method: "POST",
        body: formData,
      });
    }

    async findBookIdFromUrl(url) {
      const u = scrapbook.splitUrl(url)[0];
      for (const [id, book] of Object.entries(this.books)) {
        if (u.startsWith(book.dataUrl) && !book.config.no_tree) {
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
      this.treeLastModified = Infinity;
      this.specialItems = new Set(['root', 'hidden', 'recycle']);

      if (!this.config) {
        throw new Error(`unknown scrapbook: ${bookId}`);
      }

      this.topUrl = server.serverRoot +
        (this.config.top_dir ? scrapbook.escapeFilename(this.config.top_dir) + '/' : '');

      this.dataUrl = this.topUrl +
          (this.config.data_dir ? scrapbook.escapeFilename(this.config.data_dir) + '/' : '');

      this.treeUrl = this.topUrl +
          (this.config.tree_dir ? scrapbook.escapeFilename(this.config.tree_dir) + '/' : '');

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
          url: this.treeUrl + '?a=list&f=json',
          method: "GET",
        });
        data = (await response.json()).data;
      } catch (ex) {
        if (ex.status === 400) {
          // tree folder not exist, create one
          const formData = new FormData();
          formData.append('token', await this.server.acquireToken());

          await this.server.request({
            url: this.treeUrl + '?a=mkdir&f=json',
            method: "POST",
            body: formData,
          });

          // load again
          response = await this.server.request({
            url: this.treeUrl + '?a=list&f=json',
            method: "GET",
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

    async loadMeta(refresh = false) {
      if (this.meta && !refresh) {
        return this.meta;
      }

      const objList = [{}];
      const treeFiles = await this.loadTreeFiles();
      const prefix = this.treeUrl;
      for (let i = 0; ; i++) {
        const file = `meta${i || ""}.js`;
        if (treeFiles.has(file) && treeFiles.get(file).type === 'file') {
          const url = prefix + encodeURIComponent(file);
          try {
            const text = await this.server.request({
              url,
              method: "GET",
            }).then(r => r.text());

            if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
              throw new Error(`Unable to retrieve JSON data.`);
            }

            const obj = JSON.parse(RegExp.$1);
            for (const key in obj) {
              obj[key].id = key;
            }
            objList.push(obj);
          } catch (ex) {
            throw new Error(`Error loading '${url}': ${ex.message}`);
          }
        } else {
          break;
        }
      }
      return this.meta = Object.assign.apply(this, objList);
    }

    async loadToc(refresh = false) {
      if (this.toc && !refresh) {
        return this.toc;
      }

      const objList = [{}];
      const treeFiles = await this.loadTreeFiles();
      const prefix = this.treeUrl;
      for (let i = 0; ; i++) {
        const file = `toc${i || ""}.js`;
        if (treeFiles.has(file) && treeFiles.get(file).type === 'file') {
          const url = prefix + encodeURIComponent(file);
          try {
            const text = await this.server.request({
              url,
              method: "GET",
            }).then(r => r.text());

            if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
              throw new Error(`Unable to retrieve JSON data.`);
            }

            objList.push(JSON.parse(RegExp.$1));
          } catch (ex) {
            throw new Error(`Error loading '${url}': ${ex.message}`);
          }
        } else {
          break;
        }
      }
      return this.toc = Object.assign.apply(this, objList);
    }

    async loadFulltext(refresh = false) {
      if (this.fulltext && !refresh) {
        return this.fulltext;
      }

      const objList = [{}];
      const treeFiles = await this.loadTreeFiles();
      const prefix = this.treeUrl;
      for (let i = 0; ; i++) {
        const file = `fulltext${i || ""}.js`;
        if (treeFiles.has(file) && treeFiles.get(file).type === 'file') {
          const url = prefix + encodeURIComponent(file);
          try {
            const text = await this.server.request({
              url,
              method: "GET",
            }).then(r => r.text());

            if (!/^(?:\/\*.*\*\/|[^(])+\(([\s\S]*)\)(?:\/\*.*\*\/|[\s;])*$/.test(text)) {
              throw new Error(`Unable to retrieve JSON data.`);
            }

            objList.push(JSON.parse(RegExp.$1));
          } catch (ex) {
            throw new Error(`Error loading '${url}': ${ex.message}`);
          }
        } else {
          break;
        }
      }
      return this.fulltext = Object.assign.apply(this, objList);
    }

    async lockTree(...args) {
      await this.server.lockTree(...args);
    }

    async unlockTree(...args) {
      await this.server.unlockTree(...args);
    }

    /**
     * Validate that tree files has not been changed since last loaded
     */
    async validateTree() {
      const treeLastModified = this.treeLastModified;
      const treeFiles = await this.loadTreeFiles(true);
      if (this.treeLastModified > treeLastModified) {
        return false;
      }
      return true;
    }

    /**
     * Validate this.treeLastModified and update it afterwards.
     */
    async saveTreeFiles(params = {}) {
      const {meta = false, toc = false, useLock = true} = params;

      if (useLock) {
        await this.lockTree();

        // validate tree
        if (!await this.validateTree()) {
          await this.unlockTree();
          throw new Error(scrapbook.lang('ScrapBookErrorServerTreeChanged'));
        }
      }

      // save requested tree files
      if (meta) {
        await this.saveMeta();
      }
      if (toc) {
        await this.saveToc();
      }

      // update this.treeLastModified
      await this.loadTreeFiles(true);

      if (useLock) {
        await this.unlockTree();
      }
    }

    /**
     * This API does not validate. Use saveTreeFiles for safety.
     */
    async saveMeta() {
      const exportFile = async (meta, i) => {
        const content = this.generateMetaFile(meta);
        const file = new File([content], `meta${i || ""}.js`, {type: "application/javascript"});
        const target = this.treeUrl + file.name;

        const formData = new FormData();
        formData.append('token', await this.server.acquireToken());
        formData.append('upload', file);

        await this.server.request({
          url: target + '?a=save&f=json',
          method: "POST",
          body: formData,
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
        meta[id] = Object.assign({}, this.meta[id]);
        delete meta[id].id;
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

        const formData = new FormData();
        formData.append('token', await this.server.acquireToken());

        await this.server.request({
          url: target + '?a=delete&f=json',
          method: "POST",
          body: formData,
        });
      }
    }

    /**
     * This API does not validate. Use saveTreeFiles for safety.
     */
    async saveToc() {
      const exportFile = async (toc, i) => {
        const content = this.generateTocFile(toc);
        const file = new File([content], `toc${i || ""}.js`, {type: "application/javascript"});
        const target = this.treeUrl + file.name;

        const formData = new FormData();
        formData.append('token', await this.server.acquireToken());
        formData.append('upload', file);

        await this.server.request({
          url: target + '?a=save&f=json',
          method: "POST",
          body: formData,
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
        toc[id] = this.toc[id];
        size += 1 + toc[id].length;

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

        const formData = new FormData();
        formData.append('token', await this.server.acquireToken());

        await this.server.request({
          url: target + '?a=delete&f=json',
          method: "POST",
          body: formData,
        });
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
     * @param {Objet} params.item - null to generate a default item. Overwrites existed id.
     * @param {string} params.parentId - null to not add to any parent
     * @param {integer} params.index - Infinity to insert to last
     * @return {Objet}
     */
    addItem(params) {
      let {
        item,
        parentId = 'root',
        index = Infinity,
      } = params;

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

      // add to TOC if parentId is not null/undefined
      if (parentId) {
        if (!this.toc[parentId]) {
          this.toc[parentId] = [];
        }
        this.toc[parentId].splice(index + 1, 0, item.id);
      }

      return item;
    }

    /**
     * Remove an item and descneding items from the Book.
     *
     * @param {Object} params
     * @param {string} params.id
     * @param {string} params.parentId - null to not removed from certain parent
     *         (useful for checking stale items)
     * @param {integer} params.index
     * @return {Set} a set of removed items
     */
    removeItemTree(params) {
      let {
        id,
        parentId,
        index,
      } = params;

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
        if (curItems.has(id)) { continue; }
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
     * @param {string} params.currentParentId - null to not removed from certain parent
     *         (useful for checking stale items)
     * @param {integer} params.currentIndex
     * @param {string} params.targetParentId - ID of the recycle bin item
     * @param {integer} params.targetIndex - Infinity to insert to last
     * @return {integer} the real insertion index
     */
    recycleItemTree(params) {
      let {
        id,
        currentParentId,
        currentIndex,
        targetParentId = 'recycle',
        targetIndex = Infinity,
      } = params;

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
      }

      return targetIndex;
    }

    /**
     * Move an item in the Book.
     *
     * @param {Object} params
     * @param {string} params.id
     * @param {string} params.currentParentId - null if none
     * @param {integer} params.currentIndex
     * @param {integer} params.targetParentId
     * @param {integer} params.targetIndex - Infinity to insert to last
     * @return {integer} the real insertion index
     */
    moveItem(params) {
      let {
        id,
        currentParentId,
        currentIndex,
        targetParentId,
        targetIndex = Infinity,
      } = params;

      // fix when moving within the same parent
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
     * @param {Set} set
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

    async findItemFromUrl(url) {
      await this.loadTreeFiles();
      await this.loadMeta();

      const u = scrapbook.splitUrl(url)[0];
      for (const [id, item] of Object.entries(this.meta)) {
        if (!item.index) { continue; }
        const indexUrl = new URL(this.dataUrl + scrapbook.escapeFilename(item.index).replace(/\/index.[^.]+$/, '/')).href;

        if (indexUrl.endsWith('/')) {
          if (u.startsWith(indexUrl)) {
            return item;
          }
        } else if (/\.(htz|maff)$/i.test(indexUrl)) {
          if (u.startsWith(indexUrl + "!/")) {
            return item;
          }
        }
        if (u === indexUrl) {
          return item;
        }
      }

      return null;
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
            result.push(path.slice());
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
  }

  return new Server();

}));
