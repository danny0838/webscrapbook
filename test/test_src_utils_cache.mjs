import {MochaQuery as $, assert} from "./unittest.mjs";
import {readFileAsText} from "./shared/utils/common.mjs";

import {Cache} from "./shared/utils/cache.mjs";

const $describe = $(describe);

describe('utils/cache.mjs', function () {
  $describe.skipIf($.noExtensionBrowser)('Cache', function () {
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
        console.error('Failed to delete database "%s": %s', DB_NAME, ex);
        await Cache.removeAll(null, "indexedDB");
      }

      sessionStorage.clear();
    }

    before(cleanUp);

    afterEach(cleanUp);

    for (const STORAGE of ["storage", "indexedDB", "sessionStorage"]) {
      describe(STORAGE, function () {
        describe('set', function () {
          it('key as object', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await Cache.set(key1, "value123", STORAGE);
            await Cache.set(key2, "value456", STORAGE);
            await Cache.set(key2, "value456-2", STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456-2",
            });
          });

          it('key as string', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await Cache.set(JSON.stringify(key1), "value123", STORAGE);
            await Cache.set(JSON.stringify(key2), "value456", STORAGE);
            await Cache.set(JSON.stringify(key2), "value456-2", STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456-2",
            });
          });
        });

        describe('get', function () {
          it('key as object', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await Cache.set(key1, "value123", STORAGE);
            await Cache.set(key2, "value456", STORAGE);
            assert.strictEqual(await Cache.get(key1, STORAGE), "value123");
            assert.strictEqual(await Cache.get(key2, STORAGE), "value456");
          });

          it('key as string', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await Cache.set(key1, "value123", STORAGE);
            await Cache.set(key2, "value456", STORAGE);
            assert.strictEqual(await Cache.get(JSON.stringify(key1), STORAGE), "value123");
            assert.strictEqual(await Cache.get(JSON.stringify(key2), STORAGE), "value456");
          });

          it('should restore basic types as-is', async function () {
            var key = {table: "test", id: "123"};

            // var value = undefined;
            // await Cache.set(key, value, STORAGE);
            // assert.strictEqual(await Cache.get(key, STORAGE), value);

            var value = null;
            await Cache.set(key, value, STORAGE);
            assert.strictEqual(await Cache.get(key, STORAGE), value);

            var value = true;
            await Cache.set(key, value, STORAGE);
            assert.strictEqual(await Cache.get(key, STORAGE), value);

            var value = 123;
            await Cache.set(key, value, STORAGE);
            assert.strictEqual(await Cache.get(key, STORAGE), value);

            var value = "my string";
            await Cache.set(key, value, STORAGE);
            assert.strictEqual(await Cache.get(key, STORAGE), value);

            var value = [123, "abc"];
            await Cache.set(key, value, STORAGE);
            assert.deepEqual(await Cache.get(key, STORAGE), value);

            var value = {abc: 123, def: 456};
            await Cache.set(key, value, STORAGE);
            assert.deepEqual(await Cache.get(key, STORAGE), value);

            var blob = new Blob(["foo"], {type: "text/plain"});
            await Cache.set(key, blob, STORAGE);
            var value = await Cache.get(key, STORAGE);
            assert.strictEqual(blob.type, value.type);
            assert.strictEqual(blob.size, value.size);
            assert.deepEqual(await readFileAsText(blob), await readFileAsText(value));

            var file = new File(["foo"], "myfile", {type: "text/plain", lastModified: Date.now()});
            await Cache.set(key, file, STORAGE);
            var value = await Cache.get(key, STORAGE);
            assert.strictEqual(file.name, value.name);
            assert.strictEqual(file.type, value.type);
            assert.strictEqual(file.size, value.size);
            assert.strictEqual(file.lastModified, value.lastModified);
            assert.deepEqual(await readFileAsText(file), await readFileAsText(value));

            var complex = {
              f1: new Blob(["foo"], {type: "text/plain"}),
              f2: new Blob(["bar"], {type: "text/plain"}),
            };
            await Cache.set(key, complex, STORAGE);
            var value = await Cache.get(key, STORAGE);
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
            await Cache.set(key1, "value123", STORAGE);
            await Cache.set(key2, "value456", STORAGE);
            await Cache.set(key3, "value789", STORAGE);
            await Cache.set(key4, "value012", STORAGE);
          });

          it('filter as undefined', async function () {
            assert.deepEqual(await Cache.getAll(undefined, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as null', async function () {
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object', async function () {
            assert.deepEqual(await Cache.getAll({}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test"}}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await Cache.getAll({includes: {id: "123"}}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test", id: "123"}}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test", id: new Set(["456", "789"])}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test", id: ["456", "789"]}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await Cache.getAll({excludes: {table: "test"}}, STORAGE), {
              [JSON.stringify(key4)]: "value012",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test"}, excludes: {id: "123"}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test"}, excludes: {id: new Set(["123", "789"])}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
            });

            assert.deepEqual(await Cache.getAll({includes: {table: "test"}, excludes: {id: ["123", "789"]}}, STORAGE), {
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

            await Cache.set({id: "1"}, null, STORAGE);
            await Cache.set({id: "2"}, true, STORAGE);
            await Cache.set({id: "3"}, 123, STORAGE);
            await Cache.set({id: "4"}, "my string", STORAGE);
            await Cache.set({id: "5"}, [123, "abc"], STORAGE);
            await Cache.set({id: "6"}, {abc: 123, def: 456}, STORAGE);
            await Cache.set({id: "7"}, blob, STORAGE);
            await Cache.set({id: "8"}, file, STORAGE);
            await Cache.set({id: "9"}, complex, STORAGE);

            var items = await Cache.getAll(null, STORAGE);
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
            await Cache.set(key1, "value123", STORAGE);
            await Cache.set(key2, "value456", STORAGE);
            await Cache.set(key3, "value789", STORAGE);
            await Cache.set(key4, "value012", STORAGE);
          });

          it('keys as object', async function () {
            await Cache.remove(key1, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('keys as string', async function () {
            await Cache.remove(JSON.stringify(key1), STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
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
            await Cache.set(key1, "value123", STORAGE);
            await Cache.set(key2, "value456", STORAGE);
            await Cache.set(key3, "value789", STORAGE);
            await Cache.set(key4, "value012", STORAGE);
          });

          it('filter as undefined', async function () {
            await Cache.removeAll(undefined, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {});
          });

          it('filter as null', async function () {
            await Cache.removeAll(null, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {});
          });

          it('filter as object (empty)', async function () {
            await Cache.removeAll({}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {});
          });

          it('filter as object (includes single key)', async function () {
            await Cache.removeAll({includes: {table: "test"}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (includes multiple keys)', async function () {
            await Cache.removeAll({includes: {table: "test", id: "123"}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (includes Set)', async function () {
            await Cache.removeAll({includes: {table: "test", id: new Set(["456", "789"])}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (includes Array)', async function () {
            await Cache.removeAll({includes: {table: "test", id: ["456", "789"]}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (excludes string)', async function () {
            await Cache.removeAll({excludes: {table: "test"}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });
          });

          it('filter as object (excludes Set)', async function () {
            await Cache.removeAll({includes: {table: "test"}, excludes: {id: new Set(["123", "789"])}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (excludes Array)', async function () {
            await Cache.removeAll({includes: {table: "test"}, excludes: {id: ["123", "789"]}}, STORAGE);
            assert.deepEqual(await Cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });
        });
      });
    }
  });
});
