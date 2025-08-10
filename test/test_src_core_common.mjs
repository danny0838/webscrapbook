(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./shared/core/common'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './shared/core/common'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.scrapbook,
    );
  }
}(this, function (unittest, scrapbook) {

'use strict';

const {MochaQuery: $, assert, encodeText, cssRegex} = unittest;

const $describe = $(describe);
const $it = $(it);

const r = String.raw;

describe('core/common.js', function () {
  $describe.skipIf($.noExtensionBrowser)('scrapbook.cache', function () {
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
        await scrapbook.cache.removeAll(null, "indexedDB");
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
            await scrapbook.cache.set(key1, "value123", STORAGE);
            await scrapbook.cache.set(key2, "value456", STORAGE);
            await scrapbook.cache.set(key2, "value456-2", STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456-2",
            });
          });

          it('key as string', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await scrapbook.cache.set(JSON.stringify(key1), "value123", STORAGE);
            await scrapbook.cache.set(JSON.stringify(key2), "value456", STORAGE);
            await scrapbook.cache.set(JSON.stringify(key2), "value456-2", STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456-2",
            });
          });
        });

        describe('get', function () {
          it('key as object', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await scrapbook.cache.set(key1, "value123", STORAGE);
            await scrapbook.cache.set(key2, "value456", STORAGE);
            assert.strictEqual(await scrapbook.cache.get(key1, STORAGE), "value123");
            assert.strictEqual(await scrapbook.cache.get(key2, STORAGE), "value456");
          });

          it('key as string', async function () {
            const key1 = {table: "test", id: "123"};
            const key2 = {table: "test", id: "456"};
            await scrapbook.cache.set(key1, "value123", STORAGE);
            await scrapbook.cache.set(key2, "value456", STORAGE);
            assert.strictEqual(await scrapbook.cache.get(JSON.stringify(key1), STORAGE), "value123");
            assert.strictEqual(await scrapbook.cache.get(JSON.stringify(key2), STORAGE), "value456");
          });

          it('should restore basic types as-is', async function () {
            var key = {table: "test", id: "123"};

            // var value = undefined;
            // await scrapbook.cache.set(key, value, STORAGE);
            // assert.strictEqual(await scrapbook.cache.get(key, STORAGE), value);

            var value = null;
            await scrapbook.cache.set(key, value, STORAGE);
            assert.strictEqual(await scrapbook.cache.get(key, STORAGE), value);

            var value = true;
            await scrapbook.cache.set(key, value, STORAGE);
            assert.strictEqual(await scrapbook.cache.get(key, STORAGE), value);

            var value = 123;
            await scrapbook.cache.set(key, value, STORAGE);
            assert.strictEqual(await scrapbook.cache.get(key, STORAGE), value);

            var value = "my string";
            await scrapbook.cache.set(key, value, STORAGE);
            assert.strictEqual(await scrapbook.cache.get(key, STORAGE), value);

            var value = [123, "abc"];
            await scrapbook.cache.set(key, value, STORAGE);
            assert.deepEqual(await scrapbook.cache.get(key, STORAGE), value);

            var value = {abc: 123, def: 456};
            await scrapbook.cache.set(key, value, STORAGE);
            assert.deepEqual(await scrapbook.cache.get(key, STORAGE), value);

            var blob = new Blob(["foo"], {type: "text/plain"});
            await scrapbook.cache.set(key, blob, STORAGE);
            var value = await scrapbook.cache.get(key, STORAGE);
            assert.strictEqual(blob.type, value.type);
            assert.strictEqual(blob.size, value.size);
            assert.deepEqual(await scrapbook.readFileAsText(blob), await scrapbook.readFileAsText(value));

            var file = new File(["foo"], "myfile", {type: "text/plain", lastModified: Date.now()});
            await scrapbook.cache.set(key, file, STORAGE);
            var value = await scrapbook.cache.get(key, STORAGE);
            assert.strictEqual(file.name, value.name);
            assert.strictEqual(file.type, value.type);
            assert.strictEqual(file.size, value.size);
            assert.strictEqual(file.lastModified, value.lastModified);
            assert.deepEqual(await scrapbook.readFileAsText(file), await scrapbook.readFileAsText(value));

            var complex = {
              f1: new Blob(["foo"], {type: "text/plain"}),
              f2: new Blob(["bar"], {type: "text/plain"}),
            };
            await scrapbook.cache.set(key, complex, STORAGE);
            var value = await scrapbook.cache.get(key, STORAGE);
            assert.deepEqual(await scrapbook.readFileAsText(complex.f1), await scrapbook.readFileAsText(value.f1));
            assert.deepEqual(await scrapbook.readFileAsText(complex.f2), await scrapbook.readFileAsText(value.f2));
          });
        });

        describe('getAll', function () {
          const key1 = {table: "test", id: "123"};
          const key2 = {table: "test", id: "456"};
          const key3 = {table: "test", id: "789"};
          const key4 = {table: "test2", id: "012"};

          beforeEach(async function () {
            await scrapbook.cache.set(key1, "value123", STORAGE);
            await scrapbook.cache.set(key2, "value456", STORAGE);
            await scrapbook.cache.set(key3, "value789", STORAGE);
            await scrapbook.cache.set(key4, "value012", STORAGE);
          });

          it('filter as undefined', async function () {
            assert.deepEqual(await scrapbook.cache.getAll(undefined, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as null', async function () {
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object', async function () {
            assert.deepEqual(await scrapbook.cache.getAll({}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test"}}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {id: "123"}}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test", id: "123"}}, STORAGE), {
              [JSON.stringify(key1)]: "value123",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test", id: new Set(["456", "789"])}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test", id: ["456", "789"]}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await scrapbook.cache.getAll({excludes: {table: "test"}}, STORAGE), {
              [JSON.stringify(key4)]: "value012",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test"}, excludes: {id: "123"}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test"}, excludes: {id: new Set(["123", "789"])}}, STORAGE), {
              [JSON.stringify(key2)]: "value456",
            });

            assert.deepEqual(await scrapbook.cache.getAll({includes: {table: "test"}, excludes: {id: ["123", "789"]}}, STORAGE), {
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

            await scrapbook.cache.set({id: "1"}, null, STORAGE);
            await scrapbook.cache.set({id: "2"}, true, STORAGE);
            await scrapbook.cache.set({id: "3"}, 123, STORAGE);
            await scrapbook.cache.set({id: "4"}, "my string", STORAGE);
            await scrapbook.cache.set({id: "5"}, [123, "abc"], STORAGE);
            await scrapbook.cache.set({id: "6"}, {abc: 123, def: 456}, STORAGE);
            await scrapbook.cache.set({id: "7"}, blob, STORAGE);
            await scrapbook.cache.set({id: "8"}, file, STORAGE);
            await scrapbook.cache.set({id: "9"}, complex, STORAGE);

            var items = await scrapbook.cache.getAll(null, STORAGE);
            assert.strictEqual(items[JSON.stringify({id: "1"})], null);
            assert.strictEqual(items[JSON.stringify({id: "2"})], true);
            assert.strictEqual(items[JSON.stringify({id: "3"})], 123);
            assert.strictEqual(items[JSON.stringify({id: "4"})], "my string");
            assert.deepEqual(items[JSON.stringify({id: "5"})], [123, "abc"]);
            assert.deepEqual(items[JSON.stringify({id: "6"})], {abc: 123, def: 456});

            var value = items[JSON.stringify({id: "7"})];
            assert.strictEqual(blob.type, value.type);
            assert.strictEqual(blob.size, value.size);
            assert.strictEqual(await scrapbook.readFileAsText(blob), await scrapbook.readFileAsText(value));

            var value = items[JSON.stringify({id: "8"})];
            assert.strictEqual(file.name, value.name);
            assert.strictEqual(file.type, value.type);
            assert.strictEqual(file.size, value.size);
            assert.strictEqual(file.lastModified, value.lastModified);
            assert.strictEqual(await scrapbook.readFileAsText(file), await scrapbook.readFileAsText(value));

            var value = items[JSON.stringify({id: "9"})];
            assert.deepEqual(await scrapbook.readFileAsText(complex.f1), await scrapbook.readFileAsText(value.f1));
            assert.deepEqual(await scrapbook.readFileAsText(complex.f2), await scrapbook.readFileAsText(value.f2));
          });
        });

        describe('remove', function () {
          const key1 = {table: "test", id: "123"};
          const key2 = {table: "test", id: "456"};
          const key3 = {table: "test", id: "789"};
          const key4 = {table: "test2", id: "012"};

          beforeEach(async function () {
            await scrapbook.cache.set(key1, "value123", STORAGE);
            await scrapbook.cache.set(key2, "value456", STORAGE);
            await scrapbook.cache.set(key3, "value789", STORAGE);
            await scrapbook.cache.set(key4, "value012", STORAGE);
          });

          it('keys as object', async function () {
            await scrapbook.cache.remove(key1, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('keys as string', async function () {
            await scrapbook.cache.remove(JSON.stringify(key1), STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
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
            await scrapbook.cache.set(key1, "value123", STORAGE);
            await scrapbook.cache.set(key2, "value456", STORAGE);
            await scrapbook.cache.set(key3, "value789", STORAGE);
            await scrapbook.cache.set(key4, "value012", STORAGE);
          });

          it('filter as undefined', async function () {
            await scrapbook.cache.removeAll(undefined, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {});
          });

          it('filter as null', async function () {
            await scrapbook.cache.removeAll(null, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {});
          });

          it('filter as object (empty)', async function () {
            await scrapbook.cache.removeAll({}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {});
          });

          it('filter as object (includes single key)', async function () {
            await scrapbook.cache.removeAll({includes: {table: "test"}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (includes multiple keys)', async function () {
            await scrapbook.cache.removeAll({includes: {table: "test", id: "123"}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (includes Set)', async function () {
            await scrapbook.cache.removeAll({includes: {table: "test", id: new Set(["456", "789"])}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (includes Array)', async function () {
            await scrapbook.cache.removeAll({includes: {table: "test", id: ["456", "789"]}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (excludes string)', async function () {
            await scrapbook.cache.removeAll({excludes: {table: "test"}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key2)]: "value456",
              [JSON.stringify(key3)]: "value789",
            });
          });

          it('filter as object (excludes Set)', async function () {
            await scrapbook.cache.removeAll({includes: {table: "test"}, excludes: {id: new Set(["123", "789"])}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });

          it('filter as object (excludes Array)', async function () {
            await scrapbook.cache.removeAll({includes: {table: "test"}, excludes: {id: ["123", "789"]}}, STORAGE);
            assert.deepEqual(await scrapbook.cache.getAll(null, STORAGE), {
              [JSON.stringify(key1)]: "value123",
              [JSON.stringify(key3)]: "value789",
              [JSON.stringify(key4)]: "value012",
            });
          });
        });
      });
    }
  });

  describe('scrapbook.escapeHtmlComment', function () {
    it('basic', function () {
      // starts with ">"
      assert.strictEqual(
        scrapbook.escapeHtmlComment('> a'),
        '\u200B> a',
      );
      assert.strictEqual(
        scrapbook.escapeHtmlComment('\u200B> a'),
        '\u200B\u200B> a',
      );

      // starts with "->"
      assert.strictEqual(
        scrapbook.escapeHtmlComment('-> a'),
        '\u200B-> a',
      );
      assert.strictEqual(
        scrapbook.escapeHtmlComment('\u200B-> a'),
        '\u200B\u200B-> a',
      );

      // contains "-->"
      assert.strictEqual(
        scrapbook.escapeHtmlComment('a --> b'),
        'a -\u200B-> b',
      );
      assert.strictEqual(
        scrapbook.escapeHtmlComment('a -\u200B-> b'),
        'a -\u200B\u200B-> b',
      );

      // contains "--!>"
      assert.strictEqual(
        scrapbook.escapeHtmlComment('a --!> b'),
        'a -\u200B-!> b',
      );
      assert.strictEqual(
        scrapbook.escapeHtmlComment('a -\u200B-!> b'),
        'a -\u200B\u200B-!> b',
      );

      // ends with "<!-"
      assert.strictEqual(
        scrapbook.escapeHtmlComment('a <!-'),
        'a <!\u200B-',
      );
      assert.strictEqual(
        scrapbook.escapeHtmlComment('a <!\u200B-'),
        'a <!\u200B\u200B-',
      );

      // contains "--" (for XML)
      assert.strictEqual(
        scrapbook.escapeHtmlComment('--'),
        '-\u200B-',
      );
      assert.strictEqual(
        scrapbook.escapeHtmlComment('-\u200B-'),
        '-\u200B\u200B-',
      );
    });
  });

  describe('scrapbook.unescapeHtmlComment', function () {
    function checkUnescape(str) {
      var s = str;
      s = scrapbook.escapeHtmlComment(s);
      s = scrapbook.unescapeHtmlComment(s);
      assert.strictEqual(s, str, `"${escape(s)}" not equal to "${escape(str)}"`);

      var s = str;
      s = scrapbook.escapeHtmlComment(s);
      s = scrapbook.escapeHtmlComment(s);
      s = scrapbook.unescapeHtmlComment(s);
      s = scrapbook.unescapeHtmlComment(s);
      assert.strictEqual(s, str, `"${escape(s)}" not equal to "${escape(str)}"`);
    }

    it('basic', function () {
      // basic
      checkUnescape('<b>basic text</b>');

      // starts with ">"
      checkUnescape('> a');

      // starts with "->"
      checkUnescape('-> a');

      // contains "-->"
      checkUnescape('--> b');
      checkUnescape('a --> b');
      checkUnescape('a -->');

      // contains "--!>"
      checkUnescape('--!> b');
      checkUnescape('a --!> b');
      checkUnescape('a --!>');

      // ends with "<!-"
      checkUnescape('a <!-');

      // contains "--" (for XML)
      checkUnescape('a --');
      checkUnescape('a -- b');
      checkUnescape('-- b');
    });
  });

  describe('scrapbook.escapeFilename', function () {
    it('basic', function () {
      // escape " ", "%", "?", "#"
      assert.strictEqual(
        scrapbook.escapeFilename('path 100% with space? and #frag'),
        'path%20100%25%20with%20space?%20and%20%23frag',
      );

      // convert "\" to "/"
      assert.strictEqual(
        scrapbook.escapeFilename(r`this\is\my\path`),
        'this/is/my/path',
      );

      // keep non-ASCII chars
      assert.strictEqual(
        scrapbook.escapeFilename('http://example.com/中文/路徑/文件.txt'),
        'http://example.com/中文/路徑/文件.txt',
      );

      // keep special chars
      assert.strictEqual(
        scrapbook.escapeFilename("!\"$&'()*+,-./:;<=>?@[]^_`{|}~"),
        "!\"$&'()*+,-./:;<=>?@[]^_`{|}~",
      );
    });
  });

  describe('scrapbook.quote', function () {
    it('basic', function () {
      assert.strictEqual(
        scrapbook.quote('中文/路徑/文件.txt'),
        '%E4%B8%AD%E6%96%87/%E8%B7%AF%E5%BE%91/%E6%96%87%E4%BB%B6.txt',
      );
    });
  });

  describe('scrapbook.validateFilename', function () {
    const chars = Array.from({length: 0xA0}).map((_, i) => String.fromCodePoint(i)).join('');

    it('basic', function () {
      // general chars
      assert.strictEqual(
        scrapbook.validateFilename(chars),
        "!_#$%&'()_+,-._0123456789_;_=__@ABCDEFGHIJKLMNOPQRSTUVWXYZ[_]^_`abcdefghijklmnopqrstuvwxyz{_}_",
      );

      // prevent empty
      assert.strictEqual(
        scrapbook.validateFilename(''),
        '_',
      );

      // "~" not allowed by downloads.download() in Chromium
      assert.strictEqual(
        scrapbook.validateFilename('~filename'),
        '_filename',
      );

      // [\xA0\u2000-\u200A\u202F\u205F]: spaces not allowed by downloads.download() in Firefox
      assert.strictEqual(
        scrapbook.validateFilename('file\xA0\u202F\u205Fname'),
        'file___name',
      );
      for (let i = 0x2000, I = 0x200A; i <= I; i++) {
        assert.strictEqual(
          scrapbook.validateFilename(`my${String.fromCodePoint(i)}file`),
          'my_file',
        );
      }

      // keep Unicode chars
      assert.strictEqual(
        scrapbook.validateFilename('中文𠀀'),
        '中文𠀀',
      );
    });

    it("Windows restricts leading/trailing spaces and dots", function () {
      assert.strictEqual(
        scrapbook.validateFilename(' '),
        '_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('  '),
        '_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('  wsb  '),
        'wsb',
      );

      assert.strictEqual(
        scrapbook.validateFilename('.'),
        '_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('..'),
        '_',
      );

      assert.strictEqual(
        scrapbook.validateFilename('.wsb'),
        '_.wsb',
      );
      assert.strictEqual(
        scrapbook.validateFilename('..wsb'),
        '_..wsb',
      );
      assert.strictEqual(
        scrapbook.validateFilename('  ..wsb'),
        '_..wsb',
      );
      assert.strictEqual(
        scrapbook.validateFilename('foo.'),
        'foo',
      );
      assert.strictEqual(
        scrapbook.validateFilename('foo..  '),
        'foo',
      );
    });

    it('Windows special filenames', function () {
      assert.strictEqual(
        scrapbook.validateFilename('con'),
        'con_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('prn'),
        'prn_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('aux'),
        'aux_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('com0'),
        'com0_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('com9'),
        'com9_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('lpt0'),
        'lpt0_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('lpt9'),
        'lpt9_',
      );
      assert.strictEqual(
        scrapbook.validateFilename('con.txt'),
        'con_.txt',
      );
      assert.strictEqual(
        scrapbook.validateFilename('prn.txt'),
        'prn_.txt',
      );
      assert.strictEqual(
        scrapbook.validateFilename('aux.txt'),
        'aux_.txt',
      );
      assert.strictEqual(
        scrapbook.validateFilename('com0.txt'),
        'com0_.txt',
      );
      assert.strictEqual(
        scrapbook.validateFilename('com9.txt'),
        'com9_.txt',
      );
      assert.strictEqual(
        scrapbook.validateFilename('lpt0.txt'),
        'lpt0_.txt',
      );
      assert.strictEqual(
        scrapbook.validateFilename('lpt9.txt'),
        'lpt9_.txt',
      );
    });

    it('force ASCII', function () {
      // general chars
      assert.strictEqual(
        scrapbook.validateFilename(chars, true),
        "!_#$%&'()_+,-._0123456789_;_=__@ABCDEFGHIJKLMNOPQRSTUVWXYZ[_]^_`abcdefghijklmnopqrstuvwxyz{_}_",
      );

      // escape Unicode chars
      assert.strictEqual(
        scrapbook.validateFilename('中文𠀀', true),
        '%E4%B8%AD%E6%96%87%F0%A0%80%80',
      );
    });
  });

  describe('scrapbook.dateToId', function () {
    it('basic', function () {
      // create an ID from a Date object
      assert.strictEqual(
        scrapbook.dateToId(new Date(Date.UTC(2020, 0, 2, 3, 4, 5, 67))),
        '20200102030405067',
      );

      // create an ID from now if no Date object is provided
      var idNow = scrapbook.dateToId(new Date());
      var id = scrapbook.dateToId();
      assert.closeTo(Number(id), Number(idNow), 1000);
    });

    it('round to nearest if date is too large or too small', function () {
      assert.strictEqual(
        scrapbook.dateToId(new Date(Date.UTC(10000, 0, 1, 0, 0, 0, 0))),
        '99991231235959999',
      );
      assert.strictEqual(
        scrapbook.dateToId(new Date(Date.UTC(-1, 0, 1, 0, 0, 0, 0))),
        '00000101000000000',
      );
    });
  });

  describe('scrapbook.idToDate', function () {
    it('basic', function () {
      assert.deepEqual(
        scrapbook.idToDate('20200102030405067'),
        new Date("2020-01-02T03:04:05.067Z"),
      );
    });

    it('return null for invalid ID string', function () {
      assert.strictEqual(
        scrapbook.idToDate('2020010203040506'),
        null,
      );
      assert.strictEqual(
        scrapbook.idToDate('wtf'),
        null,
      );
      assert.strictEqual(
        scrapbook.idToDate(''),
        null,
      );
    });

    it('round to nearest if date is too large or too small', function () {
      assert.deepEqual(
        scrapbook.idToDate('9'.repeat(17)),
        new Date("9999-12-31T23:59:59.999Z"),
      );
      assert.deepEqual(
        scrapbook.idToDate('0'.repeat(17)),
        new Date("0000-01-01T00:00:00.000Z"),
      );
    });
  });

  describe('scrapbook.dateToIdOld', function () {
    it('basic', function () {
      // create an ID from a Date object
      assert.strictEqual(
        scrapbook.dateToIdOld(new Date(2020, 0, 2, 3, 4, 5, 67)),
        '20200102030405',
      );

      // create an ID from now if no Date object is provided
      var idNow = scrapbook.dateToIdOld(new Date());
      var id = scrapbook.dateToIdOld();
      assert.closeTo(Number(id), Number(idNow), 1000);
    });

    it('round to nearest if date is too large or too small', function () {
      assert.strictEqual(
        scrapbook.dateToIdOld(new Date(10000, 0, 1, 0, 0, 0, 0)),
        '99991231235959',
      );
      assert.strictEqual(
        scrapbook.dateToIdOld(new Date(-1, 0, 1, 0, 0, 0, 0)),
        '00000101000000',
      );
    });
  });

  describe('scrapbook.idToDateOld', function () {
    it('basic', function () {
      assert.strictEqual(
        scrapbook.idToDateOld('20200102030405').valueOf(),
        new Date(2020, 0, 2, 3, 4, 5).valueOf(),
      );
    });

    it('return null for invalid ID string', function () {
      assert.strictEqual(
        scrapbook.idToDateOld('202001020304050'),
        null,
      );
      assert.strictEqual(
        scrapbook.idToDateOld('wtf'),
        null,
      );
      assert.strictEqual(
        scrapbook.idToDateOld(''),
        null,
      );
    });

    it('round to nearest if date is too large or too small', function () {
      assert.strictEqual(
        scrapbook.idToDateOld('9'.repeat(14)).valueOf(),
        new Date(9999, 11, 31, 23, 59, 59, 999).valueOf(),
      );

      var date = new Date(0, 0, 1, 0, 0, 0);
      date.setFullYear(0);
      assert.strictEqual(
        scrapbook.idToDateOld('0'.repeat(14)).valueOf(),
        date.valueOf(),
      );
    });
  });

  describe('scrapbook.crop', function () {
    it('charLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // incomplete char should not appear
      assert.strictEqual(scrapbook.crop(string, 14), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, 13), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, 12), 'foo bar 中...');
      assert.strictEqual(scrapbook.crop(string, 11), 'foo bar ...');
      assert.strictEqual(scrapbook.crop(string, 10), 'foo bar...');
      assert.strictEqual(scrapbook.crop(string, 9), 'foo ba...');
      assert.strictEqual(scrapbook.crop(string, 3), '...');
      assert.strictEqual(scrapbook.crop(string, 2), '...');
      assert.strictEqual(scrapbook.crop(string, 1), '...');

      // falsy value means no crop
      assert.strictEqual(scrapbook.crop(string, 0), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, null), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string), 'foo bar 中文𠀀字');
    });

    it('byteLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // incomplete char should not appear
      assert.strictEqual(scrapbook.crop(string, 0, 22), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, 0, 21), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, 0, 20), 'foo bar 中文...');
      assert.strictEqual(scrapbook.crop(string, 0, 19), 'foo bar 中文...');
      assert.strictEqual(scrapbook.crop(string, 0, 18), 'foo bar 中文...');
      assert.strictEqual(scrapbook.crop(string, 0, 17), 'foo bar 中文...');
      assert.strictEqual(scrapbook.crop(string, 0, 16), 'foo bar 中...');
      assert.strictEqual(scrapbook.crop(string, 0, 15), 'foo bar 中...');
      assert.strictEqual(scrapbook.crop(string, 0, 14), 'foo bar 中...');
      assert.strictEqual(scrapbook.crop(string, 0, 13), 'foo bar ...');
      assert.strictEqual(scrapbook.crop(string, 0, 12), 'foo bar ...');
      assert.strictEqual(scrapbook.crop(string, 0, 11), 'foo bar ...');
      assert.strictEqual(scrapbook.crop(string, 0, 10), 'foo bar...');
      assert.strictEqual(scrapbook.crop(string, 0, 4), 'f...');
      assert.strictEqual(scrapbook.crop(string, 0, 3), '...');
      assert.strictEqual(scrapbook.crop(string, 0, 2), '...');
      assert.strictEqual(scrapbook.crop(string, 0, 1), '...');

      // falsy value means no crop
      assert.strictEqual(scrapbook.crop(string, 0, 0), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, 0, null), 'foo bar 中文𠀀字');
      assert.strictEqual(scrapbook.crop(string, 0), 'foo bar 中文𠀀字');
    });

    it('charLimit and sizeLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // crop at the smaller limit
      assert.strictEqual(scrapbook.crop(string, 13, 19), 'foo bar 中文...');
      assert.strictEqual(scrapbook.crop(string, 12, 21), 'foo bar 中...');
    });

    it('custom ellipsis', function () {
      var string = 'foo bar 中文𠀀字';

      assert.strictEqual(scrapbook.crop(string, 12, null, '…'), 'foo bar 中文…');
      assert.strictEqual(scrapbook.crop(string, 11, null, '…'), 'foo bar 中文…');
      assert.strictEqual(scrapbook.crop(string, 10, null, '…'), 'foo bar 中…');
      assert.strictEqual(scrapbook.crop(string, 2, null, '…'), 'f…');
      assert.strictEqual(scrapbook.crop(string, 1, null, '…'), '…');

      assert.strictEqual(scrapbook.crop(string, 12, null, ''), 'foo bar 中文𠀀');
      assert.strictEqual(scrapbook.crop(string, 11, null, ''), 'foo bar 中文');
      assert.strictEqual(scrapbook.crop(string, 10, null, ''), 'foo bar 中文');
      assert.strictEqual(scrapbook.crop(string, 2, null, ''), 'fo');
      assert.strictEqual(scrapbook.crop(string, 1, null, ''), 'f');
    });
  });

  describe('scrapbook.unicodeToUtf8', function () {
    it('basic', function () {
      assert.strictEqual(scrapbook.unicodeToUtf8('\u0000'), '\x00');
      assert.strictEqual(scrapbook.unicodeToUtf8('\u0080'), '\xC2\x80');
      assert.strictEqual(scrapbook.unicodeToUtf8('\u3000'), '\xE3\x80\x80');
      assert.strictEqual(scrapbook.unicodeToUtf8('\uD840\uDC00'), '\xF0\xA0\x80\x80');
      assert.strictEqual(scrapbook.unicodeToUtf8('\u{20000}'), '\xF0\xA0\x80\x80');
      assert.strictEqual(scrapbook.unicodeToUtf8('\u{10FFFF}'), '\xF4\x8F\xBF\xBF');
    });
  });

  describe('scrapbook.utf8ToUnicode', function () {
    it('basic', function () {
      assert.strictEqual(scrapbook.utf8ToUnicode('\x00'), '\u0000');
      assert.strictEqual(scrapbook.utf8ToUnicode('\xC2\x80'), '\u0080');
      assert.strictEqual(scrapbook.utf8ToUnicode('\xE3\x80\x80'), '\u3000');
      assert.strictEqual(scrapbook.utf8ToUnicode('\xF0\xA0\x80\x80'), '\uD840\uDC00');
      assert.strictEqual(scrapbook.utf8ToUnicode('\xF0\xA0\x80\x80'), '\u{20000}');
      assert.strictEqual(scrapbook.utf8ToUnicode('\xF4\x8F\xBF\xBF'), '\u{10FFFF}');
    });
  });

  describe('scrapbook.byteStringToArrayBuffer', function () {
    it('basic', function () {
      // "一天" in Big5
      var buffer = scrapbook.byteStringToArrayBuffer('\xA4\x40\xA4\xD1');
      assert.deepEqual([...new Uint8Array(buffer)], [0xA4, 0x40, 0xA4, 0xD1]);

      // "𠀀" in UTF-8 with BOM
      var buffer = scrapbook.byteStringToArrayBuffer('\xEF\xBB\xBF\xF0\xA0\x80\x80');
      assert.deepEqual([...new Uint8Array(buffer)], [0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80]);

      // "𠀀" in UTF-16BE with BOM
      var buffer = scrapbook.byteStringToArrayBuffer('\xFE\xFF\xD8\x40\xDC\x00');
      assert.deepEqual([...new Uint8Array(buffer)], [0xFE, 0xFF, 0xD8, 0x40, 0xDC, 0x00]);

      // "𠀀" in UTF-16LE with BOM
      var buffer = scrapbook.byteStringToArrayBuffer('\xFF\xFE\x40\xD8\x00\xDC');
      assert.deepEqual([...new Uint8Array(buffer)], [0xFF, 0xFE, 0x40, 0xD8, 0x00, 0xDC]);

      // blob of green bmp
      var bstr = atob('Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');
      var buffer = scrapbook.byteStringToArrayBuffer(bstr);
      assert.deepEqual(
        [...new Uint8Array(buffer)],
        [66, 77, 60, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 6, 0, 0, 0, 18, 11, 0, 0, 18, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0],
      );
    });
  });

  describe('scrapbook.arrayBufferToByteString', function () {
    it('basic', function () {
      // "一天" in Big5
      var buffer = new Uint8Array([0xA4, 0x40, 0xA4, 0xD1]);
      assert.strictEqual(scrapbook.arrayBufferToByteString(buffer), '\xA4\x40\xA4\xD1');

      // "𠀀" in UTF-8 with BOM
      var buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80]);
      assert.strictEqual(scrapbook.arrayBufferToByteString(buffer), '\xEF\xBB\xBF\xF0\xA0\x80\x80');

      // "𠀀" in UTF-16BE with BOM
      var buffer = new Uint8Array([0xFE, 0xFF, 0xD8, 0x40, 0xDC, 0x00]);
      assert.strictEqual(scrapbook.arrayBufferToByteString(buffer), '\xFE\xFF\xD8\x40\xDC\x00');

      // "𠀀" in UTF-16LE with BOM
      var buffer = new Uint8Array([0xFF, 0xFE, 0x40, 0xD8, 0x00, 0xDC]);
      assert.strictEqual(scrapbook.arrayBufferToByteString(buffer), '\xFF\xFE\x40\xD8\x00\xDC');

      // blob of green bmp
      var buffer = new Uint8Array([66, 77, 60, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 6, 0, 0, 0, 18, 11, 0, 0, 18, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
      assert.strictEqual(
        btoa(scrapbook.arrayBufferToByteString(buffer)),
        "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA",
      );
    });
  });

  describe('scrapbook.trim', function () {
    it('basic', function () {
      var strings = ['foo', 'bar', 'baz'];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f']) {
        assert.strictEqual(scrapbook.trim(space + strings.join(space)), strings.join(space));
        assert.strictEqual(scrapbook.trim(strings.join(space) + space), strings.join(space));
        assert.strictEqual(scrapbook.trim(space + strings.join(space) + space), strings.join(space));
        assert.strictEqual(scrapbook.trim(space.repeat(3) + strings.join(space) + space.repeat(3)), strings.join(space));
      }

      // non-ASCII-whitespaces should be ignored
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        var s = space + strings.join(space);
        assert.strictEqual(scrapbook.trim(s), s);

        var s = strings.join(space) + space;
        assert.strictEqual(scrapbook.trim(s), s);

        var s = space + strings.join(space) + space;
        assert.strictEqual(scrapbook.trim(s), s);
      }
    });
  });

  describe('scrapbook.split', function () {
    it('basic', function () {
      var strings = ['foo', 'bar', 'baz'];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f']) {
        assert.deepEqual(scrapbook.split(strings.join(space)), strings);
      }

      // mixed ASCII white spaces
      assert.deepEqual(scrapbook.split(strings.join(' \t\r\n\f')), strings);

      // non-ASCII-whitespaces should be ignored
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        assert.deepEqual(scrapbook.split(strings.join(space)), [strings.join(space)]);
      }
    });

    it('discard empty starting or ending components', function () {
      // starting space
      assert.deepEqual(scrapbook.split(' foo'), ['foo']);

      // ending space
      assert.deepEqual(scrapbook.split('foo '), ['foo']);
    });
  });

  describe('scrapbook.normalizeUrl', function () {
    it('encode chars that requires percent encoding with all upper case', function () {
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/中文`),
        `http://example.com/%E4%B8%AD%E6%96%87`,
      );
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/%e4%b8%ad%e6%96%87`),
        `http://example.com/%E4%B8%AD%E6%96%87`,
      );
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/#中文`),
        `http://example.com/#%E4%B8%AD%E6%96%87`,
      );
    });

    it('encode standalone "%"s', function () {
      // standalone % => %25
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/?123%`),
        `http://example.com/?123%25`,
      );

      // don't touch normal %-encoding
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/?123%20456`),
        `http://example.com/?123%20456`,
      );
    });

    it('decode over-encoded chars, such as [0-9a-z:!()+,;=], in pathname', function () {
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/%70%61%67%65%3d%28%33%29`),
        `http://example.com/page=(3)`,
      );
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/%3a%21%28%29%2b%2c%3b%3d`),
        `http://example.com/:!()+,;=`,
      );
    });

    it('decode unreserved chars [0-9A-Za-z-_.~] in search and hash', function () {
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/?%70%61%67%65%2d%33=(5)`),
        `http://example.com/?page-3=(5)`,
      );
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/?p=%2d%5f%2e%7e`),
        `http://example.com/?p=-_.~`,
      );

      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/#%70%61%67%65%2d%33=(5)`),
        `http://example.com/#page-3=(5)`,
      );
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/#p=%2d%5f%2e%7e`),
        `http://example.com/#p=-_.~`,
      );
    });

    it('empty search/hash is normalized as none', function () {
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/?`),
        `http://example.com/`,
      );
      assert.strictEqual(
        scrapbook.normalizeUrl(`http://example.com/#`),
        `http://example.com/`,
      );
    });
  });

  describe('scrapbook.isUrlAbsolute', function () {
    it('basic', function () {
      // absolute URL cases
      assert.strictEqual(scrapbook.isUrlAbsolute(`http://example.com:8000/foo?bar=baz#frag`), true);
      assert.strictEqual(scrapbook.isUrlAbsolute(`https://example.com/`), true);
      assert.strictEqual(scrapbook.isUrlAbsolute(`file:///c/foo/bar`), true);
      assert.strictEqual(scrapbook.isUrlAbsolute(`about:blank`), true);

      // relative URL cases
      assert.strictEqual(scrapbook.isUrlAbsolute(`image.png`), false);
      assert.strictEqual(scrapbook.isUrlAbsolute(`中文.png`), false);
      assert.strictEqual(scrapbook.isUrlAbsolute(`/image.png`), false);
      assert.strictEqual(scrapbook.isUrlAbsolute(`//example.com/page`), false);
    });

    it('do not throw for non-string', function () {
      assert.strictEqual(scrapbook.isUrlAbsolute(undefined), false);
      assert.strictEqual(scrapbook.isUrlAbsolute(null), false);
    });
  });

  describe('scrapbook.getRelativeUrl', function () {
    it('absolute URLs', function () {
      // different since protocol
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `https://example.com/ref`,
        ),
        `http://example.com/page`,
      );

      // different since host
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://sub.example.com/page`,
          `http://example.com/ref`,
        ),
        `//sub.example.com/page`,
      );

      // different since path
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/ref`,
        ),
        `page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/ref`,
        ),
        `page/`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/ref/`,
        ),
        `../page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/ref/`,
        ),
        `../page/`,
      );

      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/sub/ref`,
        ),
        `../page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/sub/ref`,
        ),
        `../page/`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/sub/ref/`,
        ),
        `../../page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/sub/ref/`,
        ),
        `../../page/`,
      );

      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page`,
          `http://example.com/ref`,
        ),
        `sub/page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page/`,
          `http://example.com/ref`,
        ),
        `sub/page/`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page`,
          `http://example.com/ref/`,
        ),
        `../sub/page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page/`,
          `http://example.com/ref/`,
        ),
        `../sub/page/`,
      );

      // different since search
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page`,
        ),
        `?foo=bar#abc`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/page?foo=bar#abc`,
        ),
        ``,
      );

      // different since hash
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page?foo=bar`,
        ),
        `#abc`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/page#frag`,
        ),
        ``,
      );

      // no difference
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page?foo=bar#abc`,
        ),
        ``,
      );
    });

    it('return original URL if input is absolute and base is relative', function () {
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `image.png`,
        ),
        `http://example.com/page`,
      );
    });

    it('throw if input is realative and base is absolute', function () {
      assert.throws(() => {
        scrapbook.getRelativeUrl(
          `image.png`,
          `http://example.com/page`,
        );
      });
    });

    it('protocol-relative URLs', function () {
      // different since host
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `//sub.example.com/page`,
          `//example.com/ref`,
        ),
        `//sub.example.com/page`,
      );

      // different since path
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `//example.com/page`,
          `//example.com/ref`,
        ),
        `page`,
      );
    });

    it('return original URL if input is protocol-relative and base is not', function () {
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `//sub.example.com/page`,
          `/ref`,
        ),
        `//sub.example.com/page`,
      );
    });

    it('throw if base is protocol-relative and input is not', function () {
      assert.throws(() => {
        scrapbook.getRelativeUrl(
          `/page`,
          `//example.com/ref`,
        );
      });

      assert.throws(() => {
        scrapbook.getRelativeUrl(
          `page`,
          `//example.com/ref`,
        );
      });
    });

    it('root-relative URLs', function () {
      // different since path
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `/page`,
          `/ref`,
        ),
        `page`,
      );
    });

    it('return original URL if input is root-relative and base is not', function () {
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `/page`,
          `ref`,
        ),
        `/page`,
      );
    });

    it('throw if base is root-relative and input is not', function () {
      assert.throws(() => {
        scrapbook.getRelativeUrl(
          `page`,
          `/ref`,
        );
      });
    });

    it('relative URLs (since path)', function () {
      // different since path
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/ref`,
        ),
        `page/`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/ref/`,
        ),
        `../page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/ref/`,
        ),
        `../page/`,
      );

      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/sub/ref`,
        ),
        `../page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/sub/ref`,
        ),
        `../page/`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/sub/ref/`,
        ),
        `../../page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/sub/ref/`,
        ),
        `../../page/`,
      );

      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page`,
          `myroot/ref`,
        ),
        `sub/page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page/`,
          `myroot/ref`,
        ),
        `sub/page/`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page`,
          `myroot/ref/`,
        ),
        `../sub/page`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page/`,
          `myroot/ref/`,
        ),
        `../sub/page/`,
      );

      // different since search
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page`,
        ),
        `?foo=bar#abc`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/page?foo=bar#abc`,
        ),
        ``,
      );

      // different since hash
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page?foo=bar`,
        ),
        `#abc`,
      );
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/page#frag`,
        ),
        ``,
      );

      // no difference
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page?foo=bar#abc`,
        ),
        ``,
      );
    });

    it('relative URLs (missing path or so)', function () {
      // path and no path
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#frag`,
          `?foo1=bar1#frag1`,
        ),
        `myroot/page?foo=bar#frag`,
      );

      // no path and path
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `?foo=bar#frag`,
          `ref`,
        ),
        `?foo=bar#frag`,
      );

      // search and no search
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `?foo=bar#frag`,
          `#frag1`,
        ),
        `?foo=bar#frag`,
      );

      // no search and search
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `#frag`,
          `?foo1=bar1#frag1`,
        ),
        `#frag`,
      );

      // hash and no hash
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          `#frag`,
          ``,
        ),
        `#frag`,
      );

      // no hash and hash
      assert.strictEqual(
        scrapbook.getRelativeUrl(
          ``,
          `#frag1`,
        ),
        ``,
      );
    });
  });

  describe('scrapbook.parseHeaderContentType', function () {
    it('basic', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html`),
        {type: "text/html", parameters: {}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`image/svg+xml`),
        {type: "image/svg+xml", parameters: {}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`image/vnd.microsoft.icon`),
        {type: "image/vnd.microsoft.icon", parameters: {}},
      );
    });

    it('invalid type', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`noslash`),
        {type: "", parameters: {}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/bad?token`),
        {type: "text/bad", parameters: {}},
      );
    });

    it('parameters', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html;charset=utf-8`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset=utf-8; param1=value1; param2=value2`),
        {type: "text/html", parameters: {charset: "utf-8", param1: "value1", param2: "value2"}},
      );
    });

    it('spaces around type and parameter should be ignored', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html  ; charset=utf-8  `),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
    });

    it('spaces around "=" are not allowed by the spec', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset =utf-8`),
        {type: "text/html", parameters: {}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset= utf-8`),
        {type: "text/html", parameters: {charset: ""}},
      );
    });

    it('quotes and escapes', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset="utf-8"`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(r`text/html; field=" my text\\value with \"quote\" "`),
        {type: "text/html", parameters: {field: r` my text\value with "quote" `}},
      );

      // "'" not treated as a quote
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset='utf-8'`),
        {type: "text/html", parameters: {charset: "'utf-8'"}},
      );
    });

    it('type should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`TEXT/HTML`),
        {type: "text/html", parameters: {}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`Text/Html`),
        {type: "text/html", parameters: {}},
      );
    });

    it('parameter name should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; CHARSET=utf-8; MyKey=myvalue`),
        {type: "text/html", parameters: {charset: "utf-8", mykey: "myvalue"}},
      );
    });

    it('duplicated parameters are invalid (ignored)', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset=utf-8; charset=big5`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentType(`text/html; charset=utf-8; CHARSET=big5`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
    });
  });

  describe('scrapbook.parseHeaderContentDisposition', function () {
    it('basic', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=file.html`),
        {type: "inline", parameters: {filename: "file.html"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`unknown; filename=file.html`),
        {type: "unknown", parameters: {filename: "file.html"}},
      );
    });

    it('spaces between parameters and between parname and value should be ignored', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`attachment;filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline  ; filename  =  file.html `),
        {type: "inline", parameters: {filename: "file.html"}},
      );
    });

    it('quotes and escapes', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=" my file.jpg "`),
        {type: "inline", parameters: {filename: " my file.jpg "}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(r`inline; filename="my text\\image \"file\".jpg"`),
        {type: "inline", parameters: {filename: r`my text\image "file".jpg`}},
      );
    });

    it('ext-value as parname*', function () {
      // filename*
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename="US-$ rates"; filename*=iso-8859-1'en'%A3%20rates.bmp`),
        {type: "inline", parameters: {filename: "£ rates.bmp"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''a%E4%B8%ADb%23c.php`),
        {type: "inline", parameters: {filename: "a中b#c.php"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''%22I%20love%20you%22.html`),
        {type: "inline", parameters: {filename: `"I love you".html`}},
      );

      // ignore unsupported encoding
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=big5''a%E4%B8%ADb%23c.php`),
        {type: "inline", parameters: {}},
      );

      // ignore invalid UTF-8 sequence
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''%EB%EE%EC.txt`),
        {type: "inline", parameters: {}},
      );

      // filename* has higher priority than filename regardless of order
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=_.bmp; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp`),
        {type: "inline", parameters: {filename: "中文𠀀.bmp"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp; filename=_.bmp`),
        {type: "inline", parameters: {filename: "中文𠀀.bmp"}},
      );
    });

    it('type should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`ATTACHMENT; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`AttachMent; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
    });

    it('parameter name should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; FILENAME=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; FileName=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=file.bmp; Size=84`),
        {type: "inline", parameters: {filename: "file.bmp", size: "84"}},
      );
    });

    it('duplicated parameters are invalid (ignored)', function () {
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; filename=file.html; filename=file2.html; size=3; size=5`),
        {type: "attachment", parameters: {filename: "file.html", size: "3"}},
      );
      assert.deepEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; filename=file.html; FILENAME=file2.html; size=3; Size=5`),
        {type: "attachment", parameters: {filename: "file.html", size: "3"}},
      );
    });
  });

  describe('scrapbook.parseHeaderRefresh', function () {
    it('basic', function () {
      assert.deepEqual(scrapbook.parseHeaderRefresh(``), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(` `), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(` ;`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(` ,`), {time: undefined, url: undefined});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`url=referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`;url=referred.html`), {time: undefined, url: undefined});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`9`), {time: 9, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`0`), {time: 0, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`3.5.1`), {time: 3, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`-1`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`+1`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`.123.456`), {time: 0, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`.123.456.`), {time: 0, url: ``});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`9 `), {time: 9, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`9;`), {time: 9, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`9,`), {time: 9, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`9 ; `), {time: 9, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`9 , `), {time: 9, url: ``});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1;referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1,referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 ; referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 , referred.html`), {time: 1, url: `referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`-1 referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`+1 referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`. referred.html`), {time: 0, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`.123.456 referred.html`), {time: 0, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`.123.456. referred.html`), {time: 0, url: `referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1:referred.html`), {time: 1, url: ``});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 u=referred.html`), {time: 1, url: `u=referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 u = referred.html`), {time: 1, url: `u = referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url referred.html`), {time: 1, url: `url referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url=referred.html`), {time: 1, url: `referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 "referred.html"`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 'referred.html'`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 "referred.html 123`), {time: 1, url: `referred.html 123`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 "referred.html'123`), {time: 1, url: `referred.html'123`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 "referred.html"123`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 'referred.html"123'`), {time: 1, url: `referred.html"123`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 'referred.html'123`), {time: 1, url: `referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url="referred.html"`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url='referred.html'`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url="referred.html `), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url="referred.html'123`), {time: 1, url: `referred.html'123`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url='referred.html"123'`), {time: 1, url: `referred.html"123`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 url='referred.html'123`), {time: 1, url: `referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1; URL=referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1, URL=referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 ; URL = referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(scrapbook.parseHeaderRefresh(`1 , URL = referred.html`), {time: 1, url: `referred.html`});

      assert.deepEqual(scrapbook.parseHeaderRefresh(`1; uRl=referred.html`), {time: 1, url: `referred.html`});
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.readFileAsArrayBuffer', function () {
    it('basic', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var ab = await scrapbook.readFileAsArrayBuffer(blob);
      assert.deepEqual([...new Uint8Array(ab)], [65, 66, 67, 49, 50, 51, 32, 228, 184, 173, 230, 150, 135, 32, 240, 160, 128, 128]);
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.readFileAsDataURL', function () {
    it('basic', async function () {
      var greenBmp = atob('Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');
      var ab = scrapbook.byteStringToArrayBuffer(greenBmp);
      var blob = new Blob([ab], {type: "image/bmp"});
      var datauri = await scrapbook.readFileAsDataURL(blob);
      assert.strictEqual(datauri, "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA");
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.readFileAsText', function () {
    it('return string in specified charset', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var str = await await scrapbook.readFileAsText(blob, 'UTF-8');
      assert.strictEqual(str, "ABC123 中文 𠀀");
    });

    it('return string in UTF-8 if charset not specified', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var str = await await scrapbook.readFileAsText(blob);
      assert.strictEqual(str, "ABC123 中文 𠀀");
    });

    it('return byte string if charset is falsy', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var str = await await scrapbook.readFileAsText(blob, false);
      assert.strictEqual(scrapbook.utf8ToUnicode(str), "ABC123 中文 𠀀");
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.readFileAsDocument', function () {
    it('basic', async function () {
      var html = `<a href="http://example.com">ABC123 中文 𠀀</a>`;
      var blob = new Blob([html], {type: "text/html; charset=utf-8"});
      var doc = await scrapbook.readFileAsDocument(blob);
      assert.strictEqual(doc.querySelector('a').textContent, 'ABC123 中文 𠀀');
      assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'http://example.com');
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.dataUriToFile', function () {
    it('take filename when useFilename not specified', async function () {
      var datauri = `data:image/bmp;filename=${encodeURIComponent('ABC123中文𠀀')};base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await scrapbook.dataUriToFile(datauri);
      assert.strictEqual(file.name, "ABC123中文𠀀");
      assert.strictEqual(file.type, "image/bmp;filename=abc123%e4%b8%ad%e6%96%87%f0%a0%80%80");
      assert.strictEqual(file.size, 60);

      var datauri = `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await scrapbook.dataUriToFile(datauri);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp");
      assert.strictEqual(file.size, 60);
    });

    it('take filename when useFilename is truthy', async function () {
      var datauri = `data:image/bmp;filename=${encodeURIComponent('ABC123中文𠀀')};base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await scrapbook.dataUriToFile(datauri, true);
      assert.strictEqual(file.name, "ABC123中文𠀀");
      assert.strictEqual(file.type, "image/bmp;filename=abc123%e4%b8%ad%e6%96%87%f0%a0%80%80");
      assert.strictEqual(file.size, 60);

      var datauri = `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await scrapbook.dataUriToFile(datauri, true);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp");
      assert.strictEqual(file.size, 60);
    });

    it('do not take filename when useFilename is falsy', async function () {
      var datauri = `data:image/bmp;filename=${encodeURIComponent('ABC123中文𠀀')};base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await scrapbook.dataUriToFile(datauri, false);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp;filename=abc123%e4%b8%ad%e6%96%87%f0%a0%80%80");
      assert.strictEqual(file.size, 60);

      var datauri = `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await scrapbook.dataUriToFile(datauri, false);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp");
      assert.strictEqual(file.size, 60);
    });
  });

  describe('scrapbook.mimeIsText', function () {
    it('basic', function () {
      // text/*
      assert.strictEqual(scrapbook.mimeIsText('text/plain'), true);
      assert.strictEqual(scrapbook.mimeIsText('text/html'), true);
      assert.strictEqual(scrapbook.mimeIsText('text/css'), true);
      assert.strictEqual(scrapbook.mimeIsText('text/javascript'), true);

      // +xml
      assert.strictEqual(scrapbook.mimeIsText('application/xhtml+xml'), true);
      assert.strictEqual(scrapbook.mimeIsText('text/svg+xml'), true);
      assert.strictEqual(scrapbook.mimeIsText('application/rdf+xml'), true);
      assert.strictEqual(scrapbook.mimeIsText('application/xslt+xml'), true);

      // +json
      assert.strictEqual(scrapbook.mimeIsText('application/ld+json'), true);

      // special text
      assert.strictEqual(scrapbook.mimeIsText('application/javascript'), true);
      assert.strictEqual(scrapbook.mimeIsText('application/ecmascript'), true);
      assert.strictEqual(scrapbook.mimeIsText('application/json'), true);
      assert.strictEqual(scrapbook.mimeIsText('application/xml'), true);
      assert.strictEqual(scrapbook.mimeIsText('application/sql'), true);

      // +zip are not text
      assert.strictEqual(scrapbook.mimeIsText('application/epub+zip'), false);

      // others are not text
      assert.strictEqual(scrapbook.mimeIsText('image/bmp'), false);
      assert.strictEqual(scrapbook.mimeIsText('image/jpeg'), false);
      assert.strictEqual(scrapbook.mimeIsText('image/gif'), false);
      assert.strictEqual(scrapbook.mimeIsText('image/png'), false);
      assert.strictEqual(scrapbook.mimeIsText('image/webp'), false);
      assert.strictEqual(scrapbook.mimeIsText('image/vnd.microsoft.icon'), false);
      assert.strictEqual(scrapbook.mimeIsText('image/x-icon'), false);
      assert.strictEqual(scrapbook.mimeIsText('audio/mpeg'), false);
      assert.strictEqual(scrapbook.mimeIsText('video/mp4'), false);
      assert.strictEqual(scrapbook.mimeIsText('font/ttf'), false);
      assert.strictEqual(scrapbook.mimeIsText('font/woff'), false);
      assert.strictEqual(scrapbook.mimeIsText('application/zip'), false);
      assert.strictEqual(scrapbook.mimeIsText('application/pdf'), false);
      assert.strictEqual(scrapbook.mimeIsText('application/octet-stream'), false);
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.parseCssFile', function () {
    it('priority: 1. BOM', async function () {
      // UTF-8
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-8',
      });

      // UTF-16BE
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-16be');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-16BE',
      });

      // UTF-16LE
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-16le');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-16LE',
      });

      // output BOM only for @charset
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: str,
        charset: 'UTF-8',
      });
    });

    it('priority: 2. header charset', async function () {
      // utf-8
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'utf-8', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      // utf-16be
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-16be');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'utf-16be', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'utf-16be',
      });

      // big5
      var str = '@charset "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'big5', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'big5',
      });

      // ISO-8859-1
      var str = '@charset "UTF-8"; content: "abcÆ©®±¼"';
      var u8ar = await encodeText(str, 'iso-8859-1');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1'), {
        text: '\uFEFF' + str,
        charset: 'ISO-8859-1',
      });

      // output BOM only for @charset
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, 'UTF-8', 'GBK'), {
        text: str,
        charset: 'UTF-8',
      });
    });

    it('priority: 3. @charset', async function () {
      // UTF-8
      var str = '@charset "UTF-8"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: '\uFEFF' + str,
        charset: 'UTF-8',
      });

      // Big5
      var str = '@charset "Big5"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'Big5',
      });

      // fix bad UTF-16 declaration to UTF-8
      var str = '@charset "utf-16BE"; content: "abc中文"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      var str = '@charset "UTF-16le"; content: "abc中文"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      // ignore bad @charset
      var str = '@CHARSET "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'big5'), {
        text: str,
        charset: 'big5',
      });

      var str = "@charset 'UTF-8'; content: 'abc中文'";
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });

      var str = '@charset  "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });
    });

    it('priority: 4. environment charset', async function () {
      // UTF-8
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'UTF-8'), {
        text: str,
        charset: 'UTF-8',
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });
    });

    it('priority: 5. as byte string', async function () {
      // UTF-8
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob), {
        text: scrapbook.arrayBufferToByteString(u8ar),
        charset: null,
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob), {
        text: scrapbook.arrayBufferToByteString(u8ar),
        charset: null,
      });

      // ISO-8859-1
      var str = 'content: "abcÆ©®±¼"';
      var u8ar = await encodeText(str, 'ISO-8859-1');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await scrapbook.parseCssFile(blob), {
        text: scrapbook.arrayBufferToByteString(u8ar),
        charset: null,
      });
    });
  });

  $describe.skipIf($.noBrowser)('scrapbook.rewriteCssFile', function () {
    it('force UTF-8 if charset is known', async function () {
      const rewriter = async css => `${css} /* rewritten */`;

      var data = new Blob([`div::after { content: "中文"; }`], {type: 'text/css'});
      var result = await scrapbook.rewriteCssFile(data, 'utf-8', rewriter);
      assert.strictEqual(result.type.toLowerCase(), 'text/css;charset=utf-8');
      assert.strictEqual(await scrapbook.readFileAsText(result, 'UTF-8'), 'div::after { content: "中文"; } /* rewritten */');
    });

    it('no charset if charset is unknown', async function () {
      const rewriter = async css => `${css} /* rewritten */`;

      var data = new Blob([`div::after { content: "中文"; }`], {type: 'text/css'});
      var result = await scrapbook.rewriteCssFile(data, undefined, rewriter);
      assert.strictEqual(result.type.toLowerCase(), 'text/css');
      assert.strictEqual(await scrapbook.readFileAsText(result, 'UTF-8'), 'div::after { content: "中文"; } /* rewritten */');
    });
  });

  describe('scrapbook.rewriteCssText', function () {
    const optionsImage = {
      rewriteImportUrl: url => ({url}),
      rewriteFontFaceUrl: url => ({url}),
      rewriteBackgroundUrl: url => ({url: `http://example.com/${url}`}),
    };
    const optionsFont = {
      rewriteImportUrl: url => ({url}),
      rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`}),
      rewriteBackgroundUrl: url => ({url}),
    };
    const optionsImport = {
      rewriteImportUrl: url => ({url: `http://example.com/${url}`}),
      rewriteFontFaceUrl: url => ({url}),
      rewriteBackgroundUrl: url => ({url}),
    };

    async function testByteStringRewriting(input, expected, charset) {
      // read as byte string when charset hint is missing
      var u8ar = await encodeText(input, charset);
      var blob = new Blob([u8ar], {type: 'text/css'});
      var {text: parsedText, charset: parsedCharset} = await scrapbook.parseCssFile(blob);

      // rewrite the parsed CSS text
      var bstr = scrapbook.rewriteCssText(parsedText, optionsImage);
      var ab = scrapbook.byteStringToArrayBuffer(bstr);
      var blob = new Blob([ab], {type: 'text/css'});

      // re-read as the original charset
      var {text: output, charset} = await scrapbook.parseCssFile(blob, charset);

      assert.isNull(parsedCharset);
      assert.strictEqual(output, expected);
    }

    it('image', function () {
      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url('image.jpg'); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url("image.jpg"); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // keyframes
      var input = `\
@keyframes mykeyframe {
  from { background-image: url(image.bmp); }
  to { background-image: url("image.bmp"); }
}`;
      var expected = `\
@keyframes mykeyframe {
  from { background-image: url("http://example.com/image.bmp"); }
  to { background-image: url("http://example.com/image.bmp"); }
}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // keep original spaces
      var input = `body{image-background:url(image.jpg);}`;
      var expected = `body{image-background:url("http://example.com/image.jpg");}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  image.jpg  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body\t{\timage-background\t:\turl(\timage.jpg\t)\t;\t}`;
      var expected = `body\t{\timage-background\t:\turl(\t"http://example.com/image.jpg"\t)\t;\t}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  "image.jpg"  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(\t"image.jpg"\t) ; }`;
      var expected = `body { image-background: url(\t"http://example.com/image.jpg"\t) ; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // keep original case
      var input = `body { image-background: URL(image.jpg); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: uRl(image.jpg); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: URL("image.jpg"); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: uRl("image.jpg"); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // spaces only
      var input = `body { image-background: url(); }`;
      var expected = `body { image-background: url("http://example.com/"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url( ); }`;
      var expected = `body { image-background: url( "http://example.com/"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  ); }`;
      var expected = `body { image-background: url(  "http://example.com/"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(   ); }`;
      var expected = `body { image-background: url(   "http://example.com/"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // escape quotes
      var input = `body { image-background: url('i "like" it.jpg'); }`;
      var expected = r`body { image-background: url("http://example.com/i \"like\" it.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // skip comments
      var input = `/*url(image.jpg)*/`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `/*url(image.jpg)*/body { color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body/*url(image.jpg)*/{ color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body {/*url(image.jpg)*/color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color/*url(image.jpg)*/: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color:/*url(image.jpg)*/red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red/*url(image.jpg)*/; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red;/*url(image.jpg)*/}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red; }/*url(image.jpg)*/`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      // misc
      var input = `body { image-background: url(''); }`;
      var expected = `body { image-background: url("http://example.com/"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = r`body { image-background: url(\)); }`;
      var expected = r`body { image-background: url("http://example.com/)"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = r`body { image-background: var(--my-var,url()); }`;
      var expected = r`body { image-background: var(--my-var,url("http://example.com/")); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    it('image ignore unrelated pattern', function () {
      var input = `div::after { content: "url(image.jpg)" }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `[myattr="url(image.jpg)"] { }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { background-image: url("image.jpg"); }`;
      var expected = r`.my\"class\" { background-image: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    it('image ignore unrelated rules', function () {
      var input = `@import "file.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `@import url("file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `@namespace url("file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: certain chars should be escaped or replaced', function () {
      // 0x01~0x1F and 0x7F (except for newlines) should be escaped
      var input = `.mycls { background-image: url("\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0B\x0E\x0F"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\1 \2 \3 \4 \5 \6 \7 \8 \9 \b \e \f "); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `.mycls { background-image: url("\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F\x7F"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // escaped sequence of 0x01~0x1F and 0x7F should keep escaped
      var input = r`.mycls { background-image: url("\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = r`.mycls { background-image: url("\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // null, surrogate, and char code > 0x10FFFF should be replaced with \uFFFD
      var input = r`.mycls { background-image: url("\0 \D800 \DFFF \110000"); }`;
      var expected = `.mycls { background-image: url("http://example.com/\uFFFD\uFFFD\uFFFD\uFFFD"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // other chars should be unescaped
      var input = r`.mycls { background-image: url("\80 \4E00 \20000 \10FFFF "); }`;
      var expected = `.mycls { background-image: url("http://example.com/\u{80}\u{4E00}\u{20000}\u{10FFFF}"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    $it.xfail()('image: bad extra components after a quoted string', function () {
      // bad URL, should be skipped
      var input = r`.mycls { background-image: url("image.jpg"foo); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" foo); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg""foo"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" "foo"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg"'foo'); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" 'foo'); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" url(foo)); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" url("foo")); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: newline in a quoted string', function () {
      // bad string, should be skipped
      var input = r`.mycls { background-image: url("image.jpg
); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('image.jpg
); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`.mycls { background-image: url("my\
image\
.jpg"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/myimage.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = r`.mycls { background-image: url('my\
image\
.jpg'); }`;
      var expected = r`.mycls { background-image: url("http://example.com/myimage.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    $it.xfail()('image: EOF in a quoted string', function () {
      // bad string, should be skipped to the end
      var input = r`.mycls { background-image: url("img.jpg`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("url(img.jpg)`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('img.jpg`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('url(img.jpg)`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    $it.xfail()('image: escaped EOF in a quoted string', function () {
      // bad string, should be skipped to the end
      var input = `.mycls { background-image: url("img.jpg\\`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url("url(img.jpg)\\`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url('img.jpg\\`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url('url(img.jpg)\\`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: bad chars in an unquoted url', function () {
      // bad URL, should be skipped
      var input = r`.mycls { background-image: url(image"foo.jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image"foo".jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image'foo.jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image'foo'.jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image(foo.jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(url(foo).jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: last newline in an unquoted url', function () {
      // last whitespaces, should be stripped
      var input = r`.mycls { background-image: url(image.jpg
); }`;
      var expected = r`.mycls { background-image: url("http://example.com/image.jpg"
); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    it('image: intermediate newline in an unquoted url', function () {
      // bad url, should be skipped
      var input = r`.mycls { background-image: url(image.jpg
foo); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped newline in an unquoted url', function () {
      // bad escape, should be skipped
      var input = r`.mycls { background-image: url(image\
.jpg); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image.jpg\
); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: EOF in an unquoted url', function () {
      // bad url, should be skipped to the end
      var input = `.mycls { background-image: url(img.jpg`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped EOF in an unquoted url', function () {
      // bad escape, should be skipped to the end
      var input = `.mycls { background-image: url(img.jpg\\`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    $it.skipIf($.noBrowser)('image: byte string rewriting', async function () {
      // A CSS file missing a charset hint should be handled as a byte string
      // and be recoverable when read as the original charset.

      await testByteStringRewriting(
        'body { background-image: url("abc中文𠀀"); }',
        'body { background-image: url("http://example.com/abc中文𠀀"); }',
        'UTF-8',
      );

      await testByteStringRewriting(
        'body { background-image: url("archæology±¼.html"); }',
        'body { background-image: url("http://example.com/archæology±¼.html"); }',
        'ISO-8859-1',
      );

      await testByteStringRewriting(
        'body { background-image: url("abc中文"); }',
        'body { background-image: url("http://example.com/abc中文"); }',
        'big5',
      );
    });

    $it.xfail()('image: bad cass of byte string rewriting (UTF-16)', async function () {
      // UTF-16 is not ASCII compatible, and thus reading as byte string is
      // not expected to work. Provide BOM instead.

      await testByteStringRewriting(
        'body { background-image: url("abc中文𠀀"); }',
        'body { background-image: url("http://example.com/abc中文𠀀"); }',
        'UTF-16',
      );
    });

    $it.xfail()('image: bad cases of byte string rewriting (Big5)', async function () {
      await testByteStringRewriting(
        '/* 許功蓋 */ p::after { content: "淚豹"; } /* 璞珮 */',
        '/* 許功蓋 */ p::after { content: "淚豹"; } /* 璞珮 */',
        'big5',
      );

      await testByteStringRewriting(
        'body { background-image: url("許功蓋"); }',
        'body { background-image: url("http://example.com/許功蓋"); }',
        'big5',
      );

      await testByteStringRewriting(
        'body { background-image: url("功蓋天"); }',
        'body { background-image: url("http://example.com/功蓋天"); }',
        'big5',
      );
    });

    it('image record', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
      };

      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: /*scrapbook-orig-url="image.jpg"*/url("http://example.com/image.jpg"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, options), expected);
    });

    it('image async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url: `http://example.com/${url}`}),
      };

      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(await scrapbook.rewriteCssText(input, options), expected);
    });

    it('@font-face', function () {
      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: url('file.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // keep original spaces
      var input = `@font-face{font-family:myfont;src:url(file.woff);}`;
      var expected = `@font-face{font-family:myfont;src:url("http://example.com/file.woff");}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src  : url(  file.woff  )  ; }`;
      var expected = `@font-face { font-family: myfont; src  : url(  "http://example.com/file.woff"  )  ; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\tfile.woff\t)\t;\t}`;
      var expected = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\t"http://example.com/file.woff"\t)\t;\t}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // keep original case
      var input = `@font-face { font-family: myfont; src: URL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: URL("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: UrL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: UrL("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // escape quotes
      var input = `@font-face { font-family: myfont; src: url('i"like"it.woff'); }`;
      var expected = r`@font-face { font-family: myfont; src: url("http://example.com/i\"like\"it.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // skip comments
      var input = `/*@font-face{src:url(file.woff)}*/`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `/*@font-face{src:url(file.woff)}*/body { color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body/*@font-face{src:url(file.woff)}*/{ color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body {/*@font-face{src:url(file.woff)}*/color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color/*@font-face{src:url(file.woff)}*/: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color:/*@font-face{src:url(file.woff)}*/red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color: red/*@font-face{src:url(file.woff)}*/; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color: red;/*@font-face{src:url(file.woff)}*/}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);
    });

    it('@font-face ignore unrelated pattern', function () {
      var input = `div::after { content: "@font-face{src:url(file.woff)}" }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `[myattr="@font-face{src:url(file.woff)}"] { }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { }
@font-face { src: url("file.woff"); }`;
      var expected = r`.my\"class\" { }
@font-face { src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);
    });

    it('@font-face: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`@font-face { font-family: myfont; src: url("my\
font\
.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/myfont.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = r`@font-face { font-family: myfont; src: url('my\
font\
.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/myfont.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsFont), expected);
    });

    it('@font-face record', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: /*scrapbook-orig-url="file.woff"*/url("http://example.com/file.woff"); }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, options), expected);
    });

    it('@font-face async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url: `http://example.com/${url}`}),
        rewriteBackgroundUrl: async url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(await scrapbook.rewriteCssText(input, options), expected);
    });

    it('@import', function () {
      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import 'file.css';`;
      var expected = `@import "http://example.com/file.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url(file.css);`;
      var expected = `@import url("http://example.com/file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url('file.css');`;
      var expected = `@import url("http://example.com/file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url("file.css");`;
      var expected = `@import url("http://example.com/file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // keep original spaces
      var input = `@import   "file.css"  ;`;
      var expected = `@import   "http://example.com/file.css"  ;`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import\t"file.css"\t;`;
      var expected = `@import\t"http://example.com/file.css"\t;`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import   url(  file.css   )  ;`;
      var expected = `@import   url(  "http://example.com/file.css"   )  ;`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import\turl(\tfile.css\t)\t;`;
      var expected = `@import\turl(\t"http://example.com/file.css"\t)\t;`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // keep original case
      var input = `@import URL(file.css);`;
      var expected = `@import URL("http://example.com/file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import URl(file.css);`;
      var expected = `@import URl("http://example.com/file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // escape quotes
      var input = `@import 'I"love"you.css';`;
      var expected = r`@import "http://example.com/I\"love\"you.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url('I"love"you.css');`;
      var expected = r`@import url("http://example.com/I\"love\"you.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // skip comments
      var input = `/*@import url(file.css);*/`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `/*@import url(file.css);*/body { color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body/*@import url(file.css);*/{ color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body {/*@import url(file.css);*/color: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color/*@import url(file.css);*/: red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color:/*@import url(file.css);*/red; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color: red/*@import url(file.css);*/; }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color: red;/*@import url(file.css);*/}`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);
    });

    it('@import ignore unrelated pattern', function () {
      var input = `div::after { content: "@import url(file.css);" }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `[myattr="@import url(file.css);"] { }`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { }
@import "file.css";`;
      var expected = r`.my\"class\" { }
@import "http://example.com/file.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);
    });

    it('@import: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`@import "my\
file\
.css";`;
      var expected = `@import "http://example.com/myfile.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = r`@import 'my\
file\
.css';`;
      var expected = `@import "http://example.com/myfile.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = r`@import url("my\
file\
.css");`;
      var expected = `@import url("http://example.com/myfile.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = r`@import url('my\
file\
.css');`;
      var expected = `@import url("http://example.com/myfile.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, optionsImport), expected);
    });

    it('@import record', function () {
      const options = {
        rewriteImportUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import /*scrapbook-orig-url="file.css"*/"http://example.com/file.css";`;
      assert.strictEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import url(file.css);`;
      var expected = `@import /*scrapbook-orig-url="file.css"*/url("http://example.com/file.css");`;
      assert.strictEqual(scrapbook.rewriteCssText(input, options), expected);
    });

    it('@import async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url: `http://example.com/${url}`}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assert.strictEqual(await scrapbook.rewriteCssText(input, options), expected);
    });

    it('resource map', function () {
      const map = {};
      const options = {
        rewriteImportUrl: url => ({url: `http://import.example.com/${url}`}),
        rewriteFontFaceUrl: url => ({url: `http://font.example.com/${url}`}),
        rewriteBackgroundUrl: url => ({url: `http://image.example.com/${url}`}),
        resourceMap: map,
      };

      var input = `@import "file.css";
@font-face { font-family: myfont; src: url(file.woff); }
body { image-background: url(image.jpg); }
div { image-background: url(image2.jpg); }`;
      var regex = cssRegex`@import "http://import.example.com/file.css";
@font-face { font-family: myfont; src: url("http://font.example.com/file.woff"); }
body { image-background: var(${/(--sb(\d+)-1)/}); }
div { image-background: var(${/(--sb(\d+)-2)/}); }`;
      var result = scrapbook.rewriteCssText(input, options);
      var match = result.match(regex);
      assert.isArray(match);
      assert.strictEqual(match[2], match[4]);
      assert.deepEqual(map, {
        "http://image.example.com/image.jpg": match[1],
        "http://image.example.com/image2.jpg": match[3],
      });
    });
  });

  describe('scrapbook.rewriteSrcset', function () {
    it('sync', function () {
      const rewriter = url => `<${url}>`;

      var testCases = [
        [
          ['http://example.com', '2x'],
          ['https://example.com', '3x'],
          ['image.jpg', '4x'],
          ['//example.com', '5x'],
          ['/image.bmp', '6x'],
          ['about:blank', '7x'],
          ['data:text/plain,foo', '8x'],
        ],
        [
          ['http://example.com', '60w'],
          ['https://example.com', '80w'],
          ['image.jpg', '100w'],
          ['//example.com', '200w'],
          ['/image.bmp', '300w'],
          ['about:blank', '400w'],
          ['data:text/plain,foo', '500w'],
        ],
        [
          ['http://example.com'],
          ['https://example.com', '2x'],
          ['image.jpg', '100w'],
        ],
      ];

      for (const testCase of testCases) {
        // individual ASCII white space
        for (const space of [' ', '\t', '\n', '\r', '\f', ' \t ']) {
          // space required for a URL without descriptor to prevent ambiguity
          if (testCase === testCases[2]) {
            var input = testCase.map(p => p.join(space)).join(',' + space);
            var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',' + space);
            assert.strictEqual(scrapbook.rewriteSrcset(input, rewriter), expected);
            continue;
          }

          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',');
          assert.strictEqual(scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = testCase.map(p => space + [`<${p[0]}>`].concat(p.slice(1)).join(space) + space).join(',');
          assert.strictEqual(scrapbook.rewriteSrcset(input, rewriter), expected);
        }

        // non-ASCII-whitespaces should be ignored (treated as part of the URL)
        for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(scrapbook.rewriteSrcset(input, rewriter), expected);
        }
      }
    });

    it('async', async function () {
      const rewriter = async url => `<${url}>`;

      var testCases = [
        [
          ['http://example.com', '2x'],
          ['https://example.com', '3x'],
          ['image.jpg', '4x'],
          ['//example.com', '5x'],
          ['/image.bmp', '6x'],
          ['about:blank', '7x'],
          ['data:text/plain,foo', '8x'],
        ],
        [
          ['http://example.com', '60w'],
          ['https://example.com', '80w'],
          ['image.jpg', '100w'],
          ['//example.com', '200w'],
          ['/image.bmp', '300w'],
          ['about:blank', '400w'],
          ['data:text/plain,foo', '500w'],
        ],
        [
          ['http://example.com'],
          ['https://example.com', '2x'],
          ['image.jpg', '100w'],
        ],
      ];

      for (const testCase of testCases) {
        // individual ASCII white space
        for (const space of [' ', '\t', '\n', '\r', '\f', ' \t ']) {
          // space required for a URL without descriptor to prevent ambiguity
          if (testCase === testCases[2]) {
            var input = testCase.map(p => p.join(space)).join(',' + space);
            var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',' + space);
            assert.strictEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);
            continue;
          }

          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',');
          assert.strictEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = testCase.map(p => space + [`<${p[0]}>`].concat(p.slice(1)).join(space) + space).join(',');
          assert.strictEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);
        }

        // non-ASCII-whitespaces should be ignored (treated as part of the URL)
        for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);
        }
      }
    });
  });

  describe('scrapbook.rewriteUrls', function () {
    it('sync', function () {
      const rewriter = url => `<${url}>`;

      var urls = [
        'http://example.com',
        'https://example.com',
        '//example.com',
        '/image.bmp',
        'image.jpg',
        'about:blank',
        'data:text/css,',
      ];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f', ' \t ']) {
        const input = urls.join(space);
        const expected = urls.map(url => `<${url}>`).join(' ');
        assert.strictEqual(scrapbook.rewriteUrls(input, rewriter), expected);
      }

      // non-ASCII-whitespaces should be ignored (treated as part of the URL)
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        const input = urls.join(space);
        const expected = `<${input}>`;
        assert.strictEqual(scrapbook.rewriteUrls(input, rewriter), expected);
      }
    });

    it('async', async function () {
      const rewriter = url => `<${url}>`;

      var urls = [
        'http://example.com',
        'https://example.com',
        '//example.com',
        '/image.bmp',
        'image.jpg',
        'about:blank',
        'data:text/css,',
      ];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f', ' \t ']) {
        const input = urls.join(space);
        const expected = urls.map(url => `<${url}>`).join(' ');
        assert.strictEqual(await scrapbook.rewriteUrls(input, rewriter), expected);
      }

      // non-ASCII-whitespaces should be ignored (treated as part of the URL)
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        const input = urls.join(space);
        const expected = `<${input}>`;
        assert.strictEqual(await scrapbook.rewriteUrls(input, rewriter), expected);
      }
    });
  });

  describe('scrapbook.getOffsetInSource', function () {
    it('should correctly handle `node` and `offset`', function () {
      const sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p id="topic">My Title</p>
<p>My <strong>weight</strong> text.</p>
<!-- my <comment> -->
</section>
`;
      const section = sample.content.querySelector('section');

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[0], 0), 9);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[0], 1), 10);

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[1], 0), 24);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[1], 1), 32);

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[2], 0), 36);

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3], 0), 40);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3].childNodes[0], 0), 40);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3].childNodes[0], 3), 43);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3], 1), 43);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3].childNodes[1], 0), 51);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3].childNodes[1], 1), 57);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3], 2), 66);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3].childNodes[2], 0), 66);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3].childNodes[2], 6), 72);
      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[3], 3), 72);

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[4], 0), 76);

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[5], 0), 81);

      assert.strictEqual(scrapbook.getOffsetInSource(section, section.childNodes[6], 0), 98);
    });

    it('should correctly handle special chars in a text node', function () {
      // treated as `1 &lt; 2; 3 &gt; 2; a &amp; b`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
1 &lt; 2; 3 &gt; 2; a &amp; b
<p>My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = scrapbook.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `1 &lt; 2; 3 &gt; 2; a &amp; b`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
1 < 2; 3 > 2; a & b
<p>My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = scrapbook.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');
    });

    it('should correctly handle special chars in an attribute', function () {
      // treated as `title="mytitle"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title=mytitle>My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = scrapbook.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `title="<s>title &amp; name</s>"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title="<s>title & name</s>">My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = scrapbook.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `title="&quot;123&quot;"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title="&quot;123&quot;">My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = scrapbook.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `title="&quot;123&quot;"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title='"123"'>My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = scrapbook.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');
    });

    it('should throw if `parent` does not contain `node`', function () {
      const sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p id="topic">My Title</p>
<p>My <strong>weight</strong> text.</p>
<!-- my <comment> -->
</section>
`;
      const section = sample.content.querySelector('section');

      assert.throws(() => {
        scrapbook.getOffsetInSource(section.querySelector('p'), section.querySelector('p strong'), 0);
      });
    });
  });
});

}));
