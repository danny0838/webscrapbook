import {MochaQuery as $, assert} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {unicodeToUtf8, byteStringToArrayBuffer, readFileAsText} from "./shared/utils/common.mjs";

import {
  readBlobAsByteStrings, serializeObject, deserializeObject,
  SerializedBlob,
  BaseCache, StorageCache, IdbCache, SessionCache, Cache,
} from "./shared/utils/cache.mjs";

const $describe = $(describe);

class StubStorage {
  static STUB_OBJ = {
    get: async (keys) => {
      if (keys == null) {
        return Object.fromEntries(this._map.entries());
      }

      if (typeof keys === "string") {
        return {[keys]: this._map.get(keys)};
      }

      if (Array.isArray(keys)) {
        const result = {};
        for (const k of keys) {
          result[k] = this._map.get(k);
        }
        return result;
      }

      const result = {};
      for (const [k, v] of Object.entries(keys)) {
        result[k] = v;
      }
      return result;
    },

    getKeys: async () => {
      return Array.from(this._map.keys());
    },

    set: async (items) => {
      for (const [k, v] of Object.entries(items)) {
        this._map.set(k, v);
      }
    },

    remove: async (keys) => {
      if (typeof keys === 'string') {
        keys = [keys];
      }
      for (const k of keys) {
        this._map.delete(k);
      }
    },

    clear: async () => {
      this._map.clear();
    },
  };

  static _map = new Map();
  static _stub;

  static apply() {
    if (this._stub) { return; }
    this._stub = sinon.stub(browser.storage, "local").value(this.STUB_OBJ);
  }

  static restore() {
    if (!this._stub) { return; }
    this._stub.restore();
    this._stub = null;
  }
}

class StubIdb {
  static DB_NAME = "scrapbook_test";
  static _stub;

  static apply() {
    if (this._stub) { return; }
    this._stub = sinon.stub(IdbCache, "DB_NAME").value(this.DB_NAME);
  }

  static restore() {
    if (!this._stub) { return; }
    this._stub.restore();
    this._stub = null;
  }
}

class StubSessionStorage {
  static STUB_OBJ = Object.defineProperties({}, {
    getItem: {
      value: (key) => {
        return this._map.get(String(key)) ?? null;
      },
    },

    setItem: {
      value: (key, value) => {
        this._map.set(String(key), String(value));
      },
    },

    removeItem: {
      value: (key) => {
        this._map.delete(String(key));
      },
    },

    clear: {
      value: () => {
        this._map.clear();
      },
    },

    key: {
      value: (index) => {
        const keys = Array.from(this._map.keys());
        return keys[index] ?? null;
      },
    },

    length: {
      get: () => {
        return this._map.size;
      },
    },
  });

  static _map = new Map();
  static _stub;

  static apply() {
    if (this._stub) { return; }
    this._stub = sinon.stub(globalThis, "sessionStorage").value(this.STUB_OBJ);
  }

  static restore() {
    if (!this._stub) { return; }
    this._stub.restore();
    this._stub = null;
  }
}

async function dbDelete(dbName) {
  return await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  }).catch((ex) => {
    throw new Error(`Failed to delete database "${dbName}": ${ex.message}`);
  });
}

async function cleanUp() {
  await browser.storage.local.clear();
  await dbDelete(StubIdb.DB_NAME);
  sessionStorage.clear();
}

describe('utils/cache.mjs', function () {
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox?.restore();
  });

  describe('readBlobAsByteStrings()', function () {
    it('should read a Blob as byte strings', async function () {
      var blob = new Blob([new Uint8Array([0xA4, 0x40, 0xA4, 0xD1])], {type: 'text/plain'});
      assert.deepEqual(await readBlobAsByteStrings(blob), ['\xA4\x40\xA4\xD1']);

      var blob = new File([new Uint8Array([0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80])], 'myfile.txt', {type: 'text/plain'});
      assert.deepEqual(await readBlobAsByteStrings(blob), ['\xEF\xBB\xBF\xF0\xA0\x80\x80']);
    });

    it('should split the byte strings at `maxByteString`', async function () {
      var blob = new Blob([new Uint8Array(12)], {type: 'text/plain'});
      assert.deepEqual(await readBlobAsByteStrings(blob, 24), ['\x00'.repeat(12)]);
      assert.deepEqual(await readBlobAsByteStrings(blob, 12), ['\x00'.repeat(12)]);
      assert.deepEqual(await readBlobAsByteStrings(blob, 6), ['\x00'.repeat(6), '\x00'.repeat(6)]);
      assert.deepEqual(await readBlobAsByteStrings(blob, 5), ['\x00'.repeat(5), '\x00'.repeat(5), '\x00'.repeat(2)]);
    });
  });

  describe('serializeObject()', function () {
    it('should serialize Blob', async function () {
      var text = 'foo bar 中文𠀀';
      var blob = new Blob([text], {type: 'text/plain'});
      assert.deepEqual(await serializeObject(blob), {
        __type__: 'Blob',
        type: 'text/plain',
        data: [unicodeToUtf8(text)],
      });

      var bytes = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2Ng/M/wHwAEBQIAs+lPYAAAAABJRU5ErkJggg==');
      var blob = new Blob([byteStringToArrayBuffer(bytes)], {type: 'image/bmp'});
      assert.deepEqual(await serializeObject(blob), {
        __type__: 'Blob',
        type: 'image/bmp',
        data: [bytes],
      });
    });

    it('should serialize File', async function () {
      var lastModified = Date.now();

      var text = 'foo bar 中文𠀀';
      var file = new File([text], 'test.txt', {type: 'text/plain', lastModified});
      assert.deepEqual(await serializeObject(file), {
        __type__: 'File',
        name: 'test.txt',
        type: 'text/plain',
        lastModified,
        data: [unicodeToUtf8(text)],
      });

      var bytes = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2Ng/M/wHwAEBQIAs+lPYAAAAABJRU5ErkJggg==');
      var file = new File([byteStringToArrayBuffer(bytes)], 'image.bmp', {type: 'image/bmp', lastModified});
      assert.deepEqual(await serializeObject(file), {
        __type__: 'File',
        name: 'image.bmp',
        type: 'image/bmp',
        lastModified,
        data: [bytes],
      });
    });

    it('should return the input for other types synchronously', function () {
      assert.strictEqual(serializeObject(undefined), undefined);
      assert.strictEqual(serializeObject(null), null);
      assert.strictEqual(serializeObject(true), true);
      assert.strictEqual(serializeObject(123), 123);
      assert.strictEqual(serializeObject('foo'), 'foo');

      var input = [123, 456];
      assert.strictEqual(serializeObject(input), input);

      var input = {a: 1, b: 2};
      assert.strictEqual(serializeObject(input), input);
    });

    it('should split large byte string', async function () {
      var text = 'foo bar 中文𠀀';
      var blob = new Blob([text], {type: 'text/plain'});
      var bytes = unicodeToUtf8(text);
      assert.deepEqual(await serializeObject(blob, 4), {
        __type__: 'Blob',
        type: 'text/plain',
        data: [
          bytes.substring(0, 4),
          bytes.substring(4, 8),
          bytes.substring(8, 12),
          bytes.substring(12, 16),
          bytes.substring(16, 20),
        ],
      });
    });
  });

  describe('deserializeObject()', function () {
    it('should deserialize Blob synchronously', function () {
      var bytes = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2Ng/M/wHwAEBQIAs+lPYAAAAABJRU5ErkJggg==');
      var blob = new Blob([byteStringToArrayBuffer(bytes)], {type: 'image/bmp'});
      assert.deepEqual(deserializeObject({
        __type__: 'Blob',
        type: 'image/bmp',
        data: [bytes],
      }), blob);
    });

    it('should deserialize File synchronously', function () {
      var lastModified = Date.now();

      var bytes = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2Ng/M/wHwAEBQIAs+lPYAAAAABJRU5ErkJggg==');
      var file = new File([byteStringToArrayBuffer(bytes)], 'image.bmp', {type: 'image/bmp', lastModified});
      assert.deepEqual(deserializeObject({
        __type__: 'File',
        name: 'image.bmp',
        type: 'image/bmp',
        lastModified,
        data: [bytes],
      }), file);
    });

    it('should return the input for other types synchronously', function () {
      assert.strictEqual(deserializeObject(undefined), undefined);
      assert.strictEqual(deserializeObject(null), null);
      assert.strictEqual(deserializeObject(true), true);
      assert.strictEqual(deserializeObject(123), 123);
      assert.strictEqual(deserializeObject('foo'), 'foo');

      var input = [123, 456];
      assert.strictEqual(deserializeObject(input), input);

      var input = {a: 1, b: 2};
      assert.strictEqual(deserializeObject(input), input);
    });
  });

  describe('BaseCache', function () {
    describe('._serializeObject()', function () {
      it('should serialize deep objects', async function () {
        var blob = new Blob(['foo'], {type: 'text/plain'});
        assert.deepEqual(
          await BaseCache._serializeObject({
            file1: blob,
            subdir: [blob, 123],
          }),
          {
            file1: {
              __type__: 'Blob',
              type: 'text/plain',
              data: ['foo'],
            },
            subdir: [
              {
                __type__: 'Blob',
                type: 'text/plain',
                data: ['foo'],
              },
              123,
            ],
          },
        );
      });
    });

    describe('._deserializeObject()', function () {
      it('should deserialize deep objects', async function () {
        var blob = new Blob(['foo'], {type: 'text/plain'});
        assert.deepEqual(
          await BaseCache._deserializeObject({
            file1: {
              __type__: 'Blob',
              type: 'text/plain',
              data: ['foo'],
            },
            subdir: [
              {
                __type__: 'Blob',
                type: 'text/plain',
                data: ['foo'],
              },
              123,
            ],
          }),
          {
            file1: blob,
            subdir: [blob, 123],
          },
        );
      });
    });

    describe('._getKeyStr()', function () {
      it('should return the original string when passing a string', function () {
        assert.deepEqual(BaseCache._getKeyStr('foo bar'), 'foo bar');
      });

      it('should return the JSON string when passing an object', function () {
        var obj = {a: 1, b: 2};
        assert.deepEqual(BaseCache._getKeyStr(obj), JSON.stringify(obj));
      });
    });
  });

  for (const cache of [StorageCache, IdbCache, SessionCache]) {
    $describe.skipIf($.noExtensionBrowser)(cache.name, function () {
      before(async function applyStubs() {
        StubStorage.apply();
        StubIdb.apply();
        StubSessionStorage.apply();
        await cleanUp();
      });

      afterEach(async function clearStubData() {
        await cleanUp();
      });

      after(async function restoreStubs() {
        StubStorage.restore();
        StubIdb.restore();
        StubSessionStorage.restore();
      });

      describe('.set()', function () {
        it('key as object', async function () {
          const key1 = {table: "test", id: "123"};
          const key2 = {table: "test", id: "456"};
          await cache.set(key1, "value123");
          await cache.set(key2, "value456");
          await cache.set(key2, "value456-2");
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456-2",
          });
        });

        it('key as string', async function () {
          const key1 = {table: "test", id: "123"};
          const key2 = {table: "test", id: "456"};
          await cache.set(JSON.stringify(key1), "value123");
          await cache.set(JSON.stringify(key2), "value456");
          await cache.set(JSON.stringify(key2), "value456-2");
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456-2",
          });
        });

        switch (cache) {
          case StorageCache: {
            context('when `_serializeObjectNeeded` is truthy', function () {
              it('should store serialized data', async function () {
                const stub = sandbox.stub(StorageCache, "_serializeObjectNeeded").value(true);
                const spy = sandbox.spy(BaseCache, "_serializeObject");

                const key1 = {table: "test", id: "123"};
                const blob = new Blob(['foo bar'], {type: 'text/plain'});
                await cache.set(key1, blob);

                assert.deepEqual(await browser.storage.local.get(null), {
                  [JSON.stringify(key1)]: await SerializedBlob.fromBlob(blob),
                });
                sinon.assert.calledOnceWithExactly(spy, blob);
              });
            });

            context('when `_serializeObjectNeeded` is falsy', function () {
              it('should store the input data', async function () {
                const stub = sandbox.stub(StorageCache, "_serializeObjectNeeded").value(false);
                const spy = sandbox.spy(BaseCache, "_serializeObject");

                const key1 = {table: "test", id: "123"};
                const blob = new Blob(['foo bar'], {type: 'text/plain'});
                await cache.set(key1, blob);

                assert.deepEqual(await browser.storage.local.get(null), {
                  [JSON.stringify(key1)]: blob,
                });
                sinon.assert.notCalled(spy);
              });
            });

            break;
          }
          case SessionCache: {
            it('should store jsonified serialized data', async function () {
              const spy = sandbox.spy(BaseCache, "_serializeObject");

              const key1 = {table: "test", id: "123"};
              const blob = new Blob(['foo bar'], {type: 'text/plain'});
              await cache.set(key1, blob);

              assert.strictEqual(sessionStorage.length, 1);
              assert.deepEqual(
                sessionStorage.getItem(JSON.stringify(key1)),
                JSON.stringify(await SerializedBlob.fromBlob(blob)),
              );
              sinon.assert.calledOnceWithExactly(spy, blob);
            });

            break;
          }
        }
      });

      describe('.get()', function () {
        it('key as object', async function () {
          const key1 = {table: "test", id: "123"};
          const key2 = {table: "test", id: "456"};
          await cache.set(key1, "value123");
          await cache.set(key2, "value456");
          assert.strictEqual(await cache.get(key1), "value123");
          assert.strictEqual(await cache.get(key2), "value456");
        });

        it('key as string', async function () {
          const key1 = {table: "test", id: "123"};
          const key2 = {table: "test", id: "456"};
          await cache.set(key1, "value123");
          await cache.set(key2, "value456");
          assert.strictEqual(await cache.get(JSON.stringify(key1)), "value123");
          assert.strictEqual(await cache.get(JSON.stringify(key2)), "value456");
        });

        it('should restore basic types as-is', async function () {
          var key = {table: "test", id: "123"};

          // var value = undefined;
          // await cache.set(key, value);
          // assert.strictEqual(await cache.get(key), value);

          var value = null;
          await cache.set(key, value);
          assert.strictEqual(await cache.get(key), value);

          var value = true;
          await cache.set(key, value);
          assert.strictEqual(await cache.get(key), value);

          var value = 123;
          await cache.set(key, value);
          assert.strictEqual(await cache.get(key), value);

          var value = "my string";
          await cache.set(key, value);
          assert.strictEqual(await cache.get(key), value);

          var value = [123, "abc"];
          await cache.set(key, value);
          assert.deepEqual(await cache.get(key), value);

          var value = {abc: 123, def: 456};
          await cache.set(key, value);
          assert.deepEqual(await cache.get(key), value);

          var blob = new Blob(["foo"], {type: "text/plain"});
          await cache.set(key, blob);
          var value = await cache.get(key);
          assert.strictEqual(blob.type, value.type);
          assert.strictEqual(blob.size, value.size);
          assert.deepEqual(await readFileAsText(blob), await readFileAsText(value));

          var file = new File(["foo"], "myfile", {type: "text/plain", lastModified: Date.now()});
          await cache.set(key, file);
          var value = await cache.get(key);
          assert.strictEqual(file.name, value.name);
          assert.strictEqual(file.type, value.type);
          assert.strictEqual(file.size, value.size);
          assert.strictEqual(file.lastModified, value.lastModified);
          assert.deepEqual(await readFileAsText(file), await readFileAsText(value));

          var complex = {
            f1: new Blob(["foo"], {type: "text/plain"}),
            f2: new Blob(["bar"], {type: "text/plain"}),
          };
          await cache.set(key, complex);
          var value = await cache.get(key);
          assert.deepEqual(await readFileAsText(complex.f1), await readFileAsText(value.f1));
          assert.deepEqual(await readFileAsText(complex.f2), await readFileAsText(value.f2));
        });
      });

      const getAllTests = function () {
        const key1 = {table: "test", id: "123"};
        const key2 = {table: "test", id: "456"};
        const key3 = {table: "test", id: "789"};
        const key4 = {table: "test2", id: "012"};

        beforeEach(async function () {
          await cache.set(key1, "value123");
          await cache.set(key2, "value456");
          await cache.set(key3, "value789");
          await cache.set(key4, "value012");
        });

        it('filter as undefined', async function () {
          assert.deepEqual(await cache.getAll(undefined), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as null', async function () {
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as object', async function () {
          assert.deepEqual(await cache.getAll({}), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test"}}), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
          });

          assert.deepEqual(await cache.getAll({includes: {id: "123"}}), {
            [JSON.stringify(key1)]: "value123",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test", id: "123"}}), {
            [JSON.stringify(key1)]: "value123",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test", id: new Set(["456", "789"])}}), {
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test", id: ["456", "789"]}}), {
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
          });

          assert.deepEqual(await cache.getAll({excludes: {table: "test"}}), {
            [JSON.stringify(key4)]: "value012",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test"}, excludes: {id: "123"}}), {
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test"}, excludes: {id: new Set(["123", "789"])}}), {
            [JSON.stringify(key2)]: "value456",
          });

          assert.deepEqual(await cache.getAll({includes: {table: "test"}, excludes: {id: ["123", "789"]}}), {
            [JSON.stringify(key2)]: "value456",
          });
        });

        it('should restore basic types as-is', async function () {
          var blob = new Blob(["foo"], {type: "text/plain"});
          var file = new File(["foo"], "myfile", {type: "text/plain", lastModified: Date.now()});
          var complex = {
            f1: new Blob(["foo"], {type: "text/plain"}),
            f2: new Blob(["bar"], {type: "text/plain"}),
          };

          await cache.set({id: "1"}, null);
          await cache.set({id: "2"}, true);
          await cache.set({id: "3"}, 123);
          await cache.set({id: "4"}, "my string");
          await cache.set({id: "5"}, [123, "abc"]);
          await cache.set({id: "6"}, {abc: 123, def: 456});
          await cache.set({id: "7"}, blob);
          await cache.set({id: "8"}, file);
          await cache.set({id: "9"}, complex);

          var items = await cache.getAll(null);
          assert.strictEqual(items[JSON.stringify({id: "1"})], null);
          assert.strictEqual(items[JSON.stringify({id: "2"})], true);
          assert.strictEqual(items[JSON.stringify({id: "3"})], 123);
          assert.strictEqual(items[JSON.stringify({id: "4"})], "my string");
          assert.deepEqual(items[JSON.stringify({id: "5"})], [123, "abc"]);
          assert.deepEqual(items[JSON.stringify({id: "6"})], {abc: 123, def: 456});

          var value = items[JSON.stringify({id: "7"})];
          assert.strictEqual(blob.type, value.type);
          assert.strictEqual(blob.size, value.size);
          assert.strictEqual(await readFileAsText(blob), await readFileAsText(value));

          var value = items[JSON.stringify({id: "8"})];
          assert.strictEqual(file.name, value.name);
          assert.strictEqual(file.type, value.type);
          assert.strictEqual(file.size, value.size);
          assert.strictEqual(file.lastModified, value.lastModified);
          assert.strictEqual(await readFileAsText(file), await readFileAsText(value));

          var value = items[JSON.stringify({id: "9"})];
          assert.deepEqual(await readFileAsText(complex.f1), await readFileAsText(value.f1));
          assert.deepEqual(await readFileAsText(complex.f2), await readFileAsText(value.f2));
        });
      };

      if (cache === StorageCache) {
        describe('.getAll()', function () {
          context('with `browser.storage.local.getKeys`', getAllTests);

          context('without `browser.storage.local.getKeys`', function () {
            let getKeysStub;

            before(function () {
              getKeysStub = sinon.stub(browser.storage.local, "getKeys");
            });

            after(function () {
              getKeysStub.restore();
            });

            getAllTests.call(this);
          });
        });
      } else {
        describe('.getAll()', getAllTests);
      }

      describe('.remove()', function () {
        const key1 = {table: "test", id: "123"};
        const key2 = {table: "test", id: "456"};
        const key3 = {table: "test", id: "789"};
        const key4 = {table: "test2", id: "012"};

        beforeEach(async function () {
          await cache.set(key1, "value123");
          await cache.set(key2, "value456");
          await cache.set(key3, "value789");
          await cache.set(key4, "value012");
        });

        it('keys as object', async function () {
          await cache.remove(key1);
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('keys as string', async function () {
          await cache.remove(JSON.stringify(key1));
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });
      });

      describe('.removeAll()', function () {
        const key1 = {table: "test", id: "123"};
        const key2 = {table: "test", id: "456"};
        const key3 = {table: "test", id: "789"};
        const key4 = {table: "test2", id: "012"};

        beforeEach(async function () {
          await cache.set(key1, "value123");
          await cache.set(key2, "value456");
          await cache.set(key3, "value789");
          await cache.set(key4, "value012");
        });

        it('filter as undefined', async function () {
          await cache.removeAll(undefined);
          assert.deepEqual(await cache.getAll(null), {});
        });

        it('filter as null', async function () {
          await cache.removeAll(null);
          assert.deepEqual(await cache.getAll(null), {});
        });

        it('filter as object (empty)', async function () {
          await cache.removeAll({});
          assert.deepEqual(await cache.getAll(null), {});
        });

        it('filter as object (includes single key)', async function () {
          await cache.removeAll({includes: {table: "test"}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as object (includes multiple keys)', async function () {
          await cache.removeAll({includes: {table: "test", id: "123"}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as object (includes Set)', async function () {
          await cache.removeAll({includes: {table: "test", id: new Set(["456", "789"])}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as object (includes Array)', async function () {
          await cache.removeAll({includes: {table: "test", id: ["456", "789"]}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as object (excludes string)', async function () {
          await cache.removeAll({excludes: {table: "test"}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key2)]: "value456",
            [JSON.stringify(key3)]: "value789",
          });
        });

        it('filter as object (excludes Set)', async function () {
          await cache.removeAll({includes: {table: "test"}, excludes: {id: new Set(["123", "789"])}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });

        it('filter as object (excludes Array)', async function () {
          await cache.removeAll({includes: {table: "test"}, excludes: {id: ["123", "789"]}});
          assert.deepEqual(await cache.getAll(null), {
            [JSON.stringify(key1)]: "value123",
            [JSON.stringify(key3)]: "value789",
            [JSON.stringify(key4)]: "value012",
          });
        });
      });
    });
  }

  $describe.skipIf($.noExtensionBrowser)('Cache', function () {
    describe('.set()', function () {
      for (const [STORAGE, cache] of Object.entries(Cache.caches)) {
        it(`should call ${cache.name} method when passing "${STORAGE}"`, async function () {
          const stub = sandbox.stub(cache, "set");

          const key = {table: "test", id: "123"};
          await Cache.set(key, "value123", STORAGE);
          sinon.assert.calledOnceWithExactly(stub, key, "value123");
        });
      }
    });

    describe('.get()', function () {
      for (const [STORAGE, cache] of Object.entries(Cache.caches)) {
        it(`should call ${cache.name} method when passing "${STORAGE}"`, async function () {
          const stub = sandbox.stub(cache, "get");

          const key = {table: "test", id: "123"};
          await Cache.get(key, STORAGE);
          sinon.assert.calledOnceWithExactly(stub, key);
        });
      }
    });

    describe('.getAll()', function () {
      for (const [STORAGE, cache] of Object.entries(Cache.caches)) {
        it(`should call ${cache.name} method when passing "${STORAGE}"`, async function () {
          const stub = sandbox.stub(cache, "getAll");

          const filter = {};
          await Cache.getAll(filter, STORAGE);
          sinon.assert.calledOnceWithExactly(stub, filter);
        });
      }
    });

    describe('.remove()', function () {
      for (const [STORAGE, cache] of Object.entries(Cache.caches)) {
        it(`should call ${cache.name} method when passing "${STORAGE}"`, async function () {
          const stub = sandbox.stub(cache, "remove");

          const key = {table: "test", id: "123"};
          await Cache.remove(key, STORAGE);
          sinon.assert.calledOnceWithExactly(stub, key);
        });
      }
    });

    describe('.removeAll()', function () {
      for (const [STORAGE, cache] of Object.entries(Cache.caches)) {
        it(`should call ${cache.name} method when passing "${STORAGE}"`, async function () {
          const stub = sandbox.stub(cache, "removeAll");

          const filter = {};
          await Cache.removeAll(filter, STORAGE);
          sinon.assert.calledOnceWithExactly(stub, filter);
        });
      }
    });
  });
});
