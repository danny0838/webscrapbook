/********************************************************************
 *
 * Shared class for server related manipulation.
 *
 * @require {Object} scrapbook
 * @public {Class} Server
 *******************************************************************/

((window, document, browser) => {

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
   *     - {string} params.url
   *     - {string} params.method
   *     - {Object} params.headers
   *     - {Object} params.body
   *     - {Object} params.credentials
   *     - {Object} params.cache
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
        return null;
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

      // use the cached config if the configured server root isn't changed
      if (this._config) {
        if (rootUrl.startsWith(this._serverRoot)) {
          return this._config;
        }
      }

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
}

class Book {
  constructor(bookId, server) {
    this.id = bookId;
    this.name = server.config.book[bookId].name;
    this.server = server;
    this.config = server.config.book[bookId];
    this.treeLastModified = 0;
    this.specialItems = new Set(['root', 'hidden', 'recycle']);

    if (!this.config) {
      throw new Error(`unknown scrapbook: ${bookId}`);
    }

    this.topUrl = server.serverRoot +
      (this.config.top_dir ? this.config.top_dir + '/' : '');

    this.dataUrl = this.topUrl +
        (this.config.data_dir ? this.config.data_dir + '/' : '');

    this.treeUrl = this.topUrl +
        (this.config.tree_dir ? this.config.tree_dir + '/' : '');

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

    let treeLastModified = Math.max(this.treeLastModified, new Date(response.headers.get('Last-Modified')));
    let treeFiles = data.reduce((data, item) => {
      treeLastModified = Math.max(treeLastModified, parseInt(item.last_modified) * 1000);
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

  /**
   * Also update this.treeLastModified afterwards.
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
        url: target + '?a=upload&f=json',
        method: "POST",
        body: formData,
      });
    };

    // verify that tree files has not been changed since last loaded
    const treeLastModified = this.treeLastModified;
    const treeFiles = await this.loadTreeFiles(true);
    if (this.treeLastModified > treeLastModified) {
      throw new Error(scrapbook.lang('ScrapBookMainErrorServerTreeChanged'));
    }

    // A javascript string >= 256 MiB (UTF-16 chars) causes an error
    // in the browser. Split each js file at around 256 K items to
    // prevent the issue. (An item is mostly < 512 bytes)
    const sizeThreshold = 256 * 1024;
    const files = [];

    let i = 0;
    let size = 0;
    let meta = {};
    for (const id in this.meta) {
      meta[id] = Object.assign({}, this.meta[id]);
      delete meta[id].id;
      size += 1 + meta[id].length;

      if (size >= sizeThreshold) {
        await exportFile(meta, i);
        i += 1;
        size = 0;
        meta = {};
      }
    }
    if (Object.keys(meta).length) {
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

    // update this.treeLastModified
    await this.loadTreeFiles(true);
  }

  /**
   * Also update this.treeLastModified afterwards.
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
        url: target + '?a=upload&f=json',
        method: "POST",
        body: formData,
      });
    };

    // verify that tree files has not been changed since last loaded
    const treeLastModified = this.treeLastModified;
    const treeFiles = await this.loadTreeFiles(true);
    if (this.treeLastModified > treeLastModified) {
      throw new Error(scrapbook.lang('ScrapBookMainErrorServerTreeChanged'));
    }

    // A javascript string >= 256 MiB (UTF-16 chars) causes an error
    // in the browser. Split each js file at around 4 M entries to
    // prevent the issue. (An entry is mostly < 32 bytes)
    const sizeThreshold = 4 * 1024 * 1024;
    const files = [];

    let i = 0;
    let size = 0;
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
    if (Object.keys(toc).length) {
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

    // update this.treeLastModified
    await this.loadTreeFiles(true);
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
   *     - {Objet} params.item - null to generate a default item. Overwrites existed id.
   *     - {string} params.parentId - null to not add to any parent
   *     - {integer} params.index - Infinity to insert to last
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
   *     - {string} params.id
   *     - {string} params.parentId - null to not removed from certain parent
   *         (useful for checking stale items)
   *     - {integer} params.index
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
   * Remove an item from Book tree and put it to 'recycle' if no reference.
   *
   * @param {Object} params
   *     - {string} params.id
   *     - {string} params.parentId - null to not removed from certain parent
   *         (useful for checking stale items)
   *     - {integer} params.index
   * @return {Set} an empty set (to mimic removeItemTree)
   */
  recycleItemTree(params) {
    let {
      id,
      parentId,
      index,
    } = params;

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

    // add item to 'recycle' if no longer referenced
    if (!curItems.has(id)) {
      if (!this.toc['recycle']) {
        this.toc['recycle'] = [];
      }
      this.toc['recycle'].push(id);
    }

    return new Set();
  }

  /**
   * Move an item in the Book.
   *
   * @param {Object} params
   *     - {string} params.id
   *     - {string} params.currentParentId - null if none
   *     - {integer} params.currentIndex
   *     - {integer} params.targetParentId
   *     - {integer} params.targetIndex - Infinity to insert to last
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
}

window.Server = Server;
window.server = new Server();

})(this, this.document, this.browser);
