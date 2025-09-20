import {MochaQuery as $, assert} from "./unittest.mjs";
import {readFileAsText} from "./shared/utils/common.mjs";

import {StorageCache, IdbCache, SessionCache} from "./shared/utils/cache.mjs";

const $describe = $(describe);

describe('utils/cache.mjs', function () {
  const DB_NAME = "scrapbook";

  async function dbDelete(dbName) {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = (event) => resolve(event.target.result);
      req.onerror = (event) => reject(event.target.error);
    });
  }

  async function cleanUp() {
    await browser.storage.local.clear();

    try {
      await dbDelete(DB_NAME);
    } catch (ex) {
      throw new Error(`Failed to delete database "${DB_NAME}": ${ex.message}`);
    }

    sessionStorage.clear();
  }

  for (const cache of [StorageCache, IdbCache, SessionCache]) {
    $describe.skipIf($.noExtensionBrowser)(cache.name, function () {
      before(cleanUp);

      afterEach(cleanUp);

      describe('set', function () {
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
      });

      describe('get', function () {
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

      describe('getAll', function () {
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
      });

      describe('remove', function () {
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

      describe('removeAll', function () {
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
});
