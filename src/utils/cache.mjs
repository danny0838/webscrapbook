/****************************************************************************
 * Cache system
 *
 * - IndexedDB is powerful and performant but not available in content
 *   scripts, and stored data in normal and incognito windows aren't shared
 *   with each other. IndexedDB is not available in Firefox private windows
 *   and will automatically fallback to storage.
 * - Storage API does not support storing Blob, File, etc., in Chromium. A
 *   shim with byte-string based object is implemented, but it's not
 *   performant and should thus be avoided whenever possible.
 * - Use storage by default and use indexedDB when appropriate.
 ***************************************************************************/

import {
  userAgent,
  getUuid,
  readFileAsArrayBuffer,
  arrayBufferToByteString,
  byteStringToArrayBuffer,
} from "./common.mjs";

/**
 * @typedef {Object} serializedBlob
 * @property {string} __type__
 * @property {string} type
 * @property {string[]} data
 */

/**
 * @typedef {serializedBlob} serializedFile
 * @property {string} __type__
 * @property {string} name
 * @property {string} type
 * @property {number} lastModified
 * @property {string[]} data
 */

/**
 * Serialize an object to be transmittable through messaging.
 *
 * If the serialization cannot be done synchronously, a Promise is returned.
 *
 * @param {*} obj
 * @return {*|serializedBlob|Promise<serializedBlob>}
 */
const serializeObject = (() => {
  // Max JavaScript string is 256MiB UTF-16 chars in an older Browser.
  const BYTE_STRING_MAX = 32 * 1024 * 1024;

  const readBlobAsByteStrings = async (blob) => {
    const rv = [];
    const u8ar = new Uint8Array(await readFileAsArrayBuffer(blob));
    for (let i = 0, I = u8ar.length; i < I; i += BYTE_STRING_MAX) {
      rv.push(arrayBufferToByteString(u8ar.subarray(i, i + BYTE_STRING_MAX)));
    }
    return rv;
  };

  return function serializeObject(obj) {
    if (obj instanceof File) {
      return (async () => ({
        __type__: 'File',
        name: obj.name,
        type: obj.type,
        lastModified: obj.lastModified,
        data: await readBlobAsByteStrings(obj),
      }))();
    } else if (obj instanceof Blob) {
      return (async () => ({
        __type__: 'Blob',
        type: obj.type,
        data: await readBlobAsByteStrings(obj),
      }))();
    }
    return obj;
  };
})();

/**
 * Deserialize a serializedBlob.
 *
 * If the deserialization cannot be done synchronously, a Promise is returned.
 *
 * @param {serializedBlob|*} obj
 * @return {*|Promise<*>}
 */
function deserializeObject(obj) {
  switch (obj?.__type__) {
    case "File": {
      const {data, name, type, lastModified} = obj;
      return new File(
        data.map(x => byteStringToArrayBuffer(x)),
        name,
        {type, lastModified},
      );
    }
    case "Blob": {
      const {data, type} = obj;
      return new Blob(
        data.map(x => byteStringToArrayBuffer(x)),
        {type},
      );
    }
  }
  return obj;
}

const cache = {
  _current: 'auto',

  get current() {
    if (this._current === 'auto') {
      this._current = 'storage';
    }
    return this._current;
  },

  set current(value) {
    this._current = value;
  },

  async _serializeObject(obj) {
    const map = {};
    const objStr = JSON.stringify(obj, (key, value) => {
      const valueNew = serializeObject(value);
      if (valueNew !== value) {
        const id = getUuid();
        map[id] = valueNew;
        return id;
      }
      return value;
    });
    if (!objStr) {
      // obj not JSON stringifiable, probably undefined
      return obj;
    }
    for (const key in map) {
      map[key] = await map[key];
    }
    return JSON.parse(objStr, (key, value) => {
      if (value in map) {
        return map[value];
      }
      return value;
    });
  },

  async _deserializeObject(obj) {
    const map = {};
    const objStr = JSON.stringify(obj, (key, value) => {
      const valueNew = deserializeObject(value);
      if (valueNew !== value) {
        const id = getUuid();
        map[id] = valueNew;
        return id;
      }
      return value;
    });
    if (!objStr) {
      // obj not JSON stringifiable, probably undefined
      return obj;
    }
    for (const key in map) {
      map[key] = await map[key];
    }
    return JSON.parse(objStr, (key, value) => {
      if (value in map) {
        return map[value];
      }
      return value;
    });
  },

  /**
   * @typedef {Object} cacheFilter
   * @property {Object<string, (string|string[]|Set<string>)>} [includes]
   * @property {Object<string, (string|string[]|Set<string>)>} [excludes]
   */

  /**
   * @param {string} key
   * @param {cacheFilter} [filter]
   */
  _applyFilter(key, filter) {
    let obj;
    try {
      obj = JSON.parse(key);
    } catch (ex) {
      // invalid JSON format => meaning not a cache
      return false;
    }

    filter = filter || {};

    if (filter.includes) {
      for (const key in filter.includes) {
        const value = filter.includes[key];
        if (value instanceof Set) {
          if (!value.has(obj[key])) {
            return false;
          }
        } else if (Array.isArray(value)) {
          if (!value.includes(obj[key])) {
            return false;
          }
        } else {
          if (obj[key] !== value) {
            return false;
          }
        }
      }
    }
    if (filter.excludes) {
      for (const key in filter.excludes) {
        const value = filter.excludes[key];
        if (value instanceof Set) {
          if (value.has(obj[key])) {
            return false;
          }
        } else if (Array.isArray(value)) {
          if (value.includes(obj[key])) {
            return false;
          }
        } else {
          if (obj[key] === value) {
            return false;
          }
        }
      }
    }
    return true;
  },

  /**
   * @param {string|Object} key
   */
  async get(key, cache = this.current) {
    const keyStr = (typeof key === "string") ? key : JSON.stringify(key);
    return this[cache].get(keyStr);
  },

  /**
   * @param {cacheFilter} filter
   */
  async getAll(filter, cache = this.current) {
    return this[cache].getAll(filter);
  },

  /**
   * @param {string|Object} key
   */
  async set(key, value, cache = this.current) {
    const keyStr = (typeof key === "string") ? key : JSON.stringify(key);
    return this[cache].set(keyStr, value);
  },

  /**
   * @param {string|Object} key
   */
  async remove(key, cache = this.current) {
    const keyStr = (typeof key === "string") ? key : JSON.stringify(key);
    return this[cache].remove(keyStr);
  },

  /**
   * @param {cacheFilter} filter
   */
  async removeAll(filter, cache = this.current) {
    return this[cache].removeAll(filter);
  },

  storage: {
    get _serializeObjectNeeded() {
      // In Chromium, a Blob cannot be stored in browser.storage,
      // fallback to an object containing byte string data.
      delete this._serializeObjectNeeded;
      return this._serializeObjectNeeded = userAgent.is('chromium');
    },

    async _serializeObject(obj) {
      if (this._serializeObjectNeeded) {
        return await cache._serializeObject(obj);
      }
      return obj;
    },

    async _deserializeObject(obj) {
      if (this._serializeObjectNeeded) {
        return await cache._deserializeObject(obj);
      }
      return obj;
    },

    async _getKeys(fallback = true) {
      // Chromium < 130 and Firefox < 143
      if (!browser.storage.local.getKeys) {
        if (fallback) {
          return Object.keys(await browser.storage.local.get());
        }

        return null;
      }

      return await browser.storage.local.getKeys();
    },

    async get(key) {
      const items = await browser.storage.local.get(key);
      return await this._deserializeObject(items[key]);
    },

    async getAll(filter) {
      const keys = await this._getKeys(false);

      // Chromium < 130 and Firefox < 143
      if (!keys) {
        const items = await browser.storage.local.get();
        for (const key in items) {
          if (!cache._applyFilter(key, filter)) {
            delete items[key];
          }
        }
        return await this._deserializeObject(items);
      }

      const items = await browser.storage.local.get(
        keys.filter(key => cache._applyFilter(key, filter)),
      );
      return await this._deserializeObject(items);
    },

    async set(key, value) {
      return await browser.storage.local.set({[key]: await this._serializeObject(value)});
    },

    async remove(key) {
      return await browser.storage.local.remove(key);
    },

    async removeAll(filter) {
      const keys = [];
      for (const key of (await this._getKeys())) {
        if (cache._applyFilter(key, filter)) {
          keys.push(key);
        }
      }
      return await browser.storage.local.remove(keys);
    },
  },

  indexedDB: {
    get _nosupport() {
      // Firefox: `indexedDB.open` throws `InvalidStateError` in an extension
      // tab in a private window.
      // ref: https://bugzilla.mozilla.org/show_bug.cgi?id=1841806
      const p = this._connect().then(
        (db) => (db.close(), false),
        (ex) => (ex.name === 'InvalidStateError'),
      );
      delete this._nosupport;
      return this._nosupport = p;
    },

    async _connect() {
      return await new Promise((resolve, reject) => {
        const request = indexedDB.open("scrapbook", 3);
        request.onupgradeneeded = (event) => {
          let db = event.target.result;
          if (event.oldVersion === 1) {
            db.deleteObjectStore("archiveZipFiles");
          } else if (event.oldVersion === 2) {
            db.deleteObjectStore("cache");
          }
          db.createObjectStore("cache");
        };
        request.onblocked = (event) => {
          reject(new Error("Upgrade of the indexedDB is blocked by another connection."));
        };
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    },

    async _transaction(callback, mode, options) {
      const db = await this._connect();
      try {
        const transaction = db.transaction("cache", mode, options);
        const objectStore = transaction.objectStore("cache");
        return await new Promise((resolve, reject) => {
          // transaction is available from objectStore.transaction
          const result = callback.call(this, objectStore);

          transaction.oncomplete = (event) => {
            resolve(result);
          };

          transaction.onerror = (event) => {
            // unhandled error for IDBRequest will bubble up to transaction error
            reject(event.target.error);
          };

          // abort the transaction if there's an unexpected error
          result.catch((ex) => {
            reject(ex);
            transaction.abort();
          });
        });
      } finally {
        db.close();
      }
    },

    async get(key) {
      if (await this._nosupport) {
        return cache.storage.get(key);
      }

      return await this._transaction(async (objectStore) => {
        return await new Promise((resolve, reject) => {
          objectStore.get(key).onsuccess = (event) => {
            resolve(event.target.result);
          };
        });
      }, "readonly");
    },

    async getAll(filter) {
      if (await this._nosupport) {
        return cache.storage.getAll(filter);
      }

      return await this._transaction(async (objectStore) => {
        const result = {};
        return await new Promise((resolve, reject) => {
          objectStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
              resolve(result);
              return;
            }
            if (cache._applyFilter(cursor.key, filter)) {
              result[cursor.key] = cursor.value;
            }
            cursor.continue();
          };
        });
      }, "readonly");
    },

    async set(key, value) {
      if (await this._nosupport) {
        return cache.storage.set(key, value);
      }

      return await this._transaction(async (objectStore) => {
        objectStore.put(value, key);
      }, "readwrite");
    },

    async remove(key) {
      if (await this._nosupport) {
        return cache.storage.remove(key);
      }

      return await this._transaction(async (objectStore) => {
        objectStore.delete(key);
      }, "readwrite");
    },

    async removeAll(filter) {
      if (await this._nosupport) {
        return cache.storage.removeAll(filter);
      }

      return await this._transaction(async (objectStore) => {
        return await new Promise((resolve, reject) => {
          objectStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
              resolve();
              return;
            }
            if (cache._applyFilter(cursor.key, filter)) {
              cursor.delete();
            }
            cursor.continue();
          };
        });
      }, "readwrite");
    },
  },

  sessionStorage: {
    async _serializeObject(obj) {
      return await cache._serializeObject(obj);
    },

    async _deserializeObject(obj) {
      return await cache._deserializeObject(obj);
    },

    async get(key) {
      // @TODO: direct string to object deserialization?
      return await this._deserializeObject(JSON.parse(sessionStorage.getItem(key)));
    },

    async getAll(filter) {
      const items = {};
      for (let i = 0, I = sessionStorage.length; i < I; i++) {
        const key = sessionStorage.key(i);
        if (cache._applyFilter(key, filter)) {
          items[key] = JSON.parse(sessionStorage.getItem(key));
        }
      }
      return await this._deserializeObject(items);
    },

    async set(key, value) {
      // @TODO: direct object to string serialization?
      return sessionStorage.setItem(key, JSON.stringify(await this._serializeObject(value)));
    },

    async remove(key) {
      return sessionStorage.removeItem(key);
    },

    async removeAll(filter) {
      // reverse the order to prevent an error due to index shift after removal
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (cache._applyFilter(key, filter)) {
          sessionStorage.removeItem(key);
        }
      }
    },
  },
};

export {
  serializeObject,
  deserializeObject,
  cache as Cache,
};
