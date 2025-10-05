import {MochaQuery as $, assert, encodeText, cssRegex} from "./unittest.mjs";

import * as utils from "./shared/utils/common.mjs";

const $describe = $(describe);
const $it = $(it);

const r = String.raw;

describe('utils/common.mjs', function () {
  describe('getDeepProp()', function () {
    it('should parse `parts` separated with "." when passing string', function () {
      var target = {prop: 123};
      assert.deepEqual(utils.getDeepProp(target, "prop"), [target, "prop"]);

      var target = {foo: {bar: {baz: 123}}};
      assert.deepEqual(utils.getDeepProp(target, "foo.bar.baz"), [target.foo.bar, "baz"]);

      var target = {foo: {bar: {baz: {"": 123}}}};
      assert.deepEqual(utils.getDeepProp(target, "foo.bar.baz."), [target.foo.bar.baz, ""]);

      var target = [null, {foo: [{bar: 123}]}];
      assert.deepEqual(utils.getDeepProp(target, "1.foo.0.bar"), [target[1].foo[0], "bar"]);

      var target = [null, {foo: [{bar: [123]}]}];
      assert.deepEqual(utils.getDeepProp(target, "1.foo.0.bar.0"), [target[1].foo[0].bar, "0"]);
    });

    it('should handle `parts` when passing string[]', function () {
      var target = {foo: {"bar.baz": 123}};
      assert.deepEqual(utils.getDeepProp(target, ["foo", "bar.baz"]), [target.foo, "bar.baz"]);

      var target = [null, {foo: [{bar: 123}]}];
      assert.deepEqual(utils.getDeepProp(target, ["1", "foo", "0", "bar"]), [target[1].foo[0], "bar"]);

      var target = [null, {foo: [{bar: [123]}]}];
      assert.deepEqual(utils.getDeepProp(target, ["1", "foo", "0", "bar", "0"]), [target[1].foo[0].bar, "0"]);
    });

    it('should safely handle nullish objects', function () {
      var target;
      assert.deepEqual(utils.getDeepProp(target, "foo"), [undefined, "foo"]);

      var target = {};
      assert.deepEqual(utils.getDeepProp(target, "foo.bar"), [undefined, "bar"]);
      assert.deepEqual(utils.getDeepProp(target, "foo.bar.baz"), [undefined, "baz"]);
    });
  });

  describe('invokeMethod()', function () {
    it('should run `cmd` separated with "." when passing string', function () {
      var target = {method: () => 123};
      assert.strictEqual(utils.invokeMethod(target, "method"), 123);

      var target = {foo: {bar: {baz: () => 123}}};
      assert.strictEqual(utils.invokeMethod(target, "foo.bar.baz"), 123);

      var target = {foo: {bar: {baz: {"": () => 123}}}};
      assert.strictEqual(utils.invokeMethod(target, "foo.bar.baz."), 123);
    });

    it('should handle `cmd` when passing string[]', function () {
      var target = {foo: {"bar.baz": () => 123}};
      assert.strictEqual(utils.invokeMethod(target, ["foo", "bar.baz"]), 123);
    });

    it('should pass the specified arguments', function () {
      var target = {method: (v1, v2, v3) => [v1, v2, v3].join(',')};
      assert.strictEqual(utils.invokeMethod(target, "method", []), ',,');
      assert.strictEqual(utils.invokeMethod(target, "method", [1]), '1,,');
      assert.strictEqual(utils.invokeMethod(target, "method", [1, 2]), '1,2,');
      assert.strictEqual(utils.invokeMethod(target, "method", [1, 2, 3]), '1,2,3');
    });

    it('should treat as no argument when omitted arguments', function () {
      var target = {method: (v1, v2, v3) => [v1, v2, v3].join(',')};
      assert.strictEqual(utils.invokeMethod(target, "method"), ',,');
    });

    it('should throw if target not exist', function () {
      var target;
      assert.throws(() => {
        utils.invokeMethod(target, "method");
      });
    });

    it('should throw if method not exist', function () {
      var target = {};
      assert.throws(() => {
        utils.invokeMethod(target, "method");
      });
    });

    it('should throw if method not function', function () {
      var target = {method: 1};
      assert.throws(() => {
        utils.invokeMethod(target, "method");
      });
    });

    it('should throw if deep method not traceable', function () {
      var target = {foo: 1};
      assert.throws(() => {
        utils.invokeMethod(target, "foo.bar.baz");
      });
    });
  });

  describe('escapeHtmlComment()', function () {
    it('basic', function () {
      // starts with ">"
      assert.strictEqual(
        utils.escapeHtmlComment('> a'),
        '\u200B> a',
      );
      assert.strictEqual(
        utils.escapeHtmlComment('\u200B> a'),
        '\u200B\u200B> a',
      );

      // starts with "->"
      assert.strictEqual(
        utils.escapeHtmlComment('-> a'),
        '\u200B-> a',
      );
      assert.strictEqual(
        utils.escapeHtmlComment('\u200B-> a'),
        '\u200B\u200B-> a',
      );

      // contains "-->"
      assert.strictEqual(
        utils.escapeHtmlComment('a --> b'),
        'a -\u200B-> b',
      );
      assert.strictEqual(
        utils.escapeHtmlComment('a -\u200B-> b'),
        'a -\u200B\u200B-> b',
      );

      // contains "--!>"
      assert.strictEqual(
        utils.escapeHtmlComment('a --!> b'),
        'a -\u200B-!> b',
      );
      assert.strictEqual(
        utils.escapeHtmlComment('a -\u200B-!> b'),
        'a -\u200B\u200B-!> b',
      );

      // ends with "<!-"
      assert.strictEqual(
        utils.escapeHtmlComment('a <!-'),
        'a <!\u200B-',
      );
      assert.strictEqual(
        utils.escapeHtmlComment('a <!\u200B-'),
        'a <!\u200B\u200B-',
      );

      // contains "--" (for XML)
      assert.strictEqual(
        utils.escapeHtmlComment('--'),
        '-\u200B-',
      );
      assert.strictEqual(
        utils.escapeHtmlComment('-\u200B-'),
        '-\u200B\u200B-',
      );
    });
  });

  describe('unescapeHtmlComment()', function () {
    function checkUnescape(str) {
      var s = str;
      s = utils.escapeHtmlComment(s);
      s = utils.unescapeHtmlComment(s);
      assert.strictEqual(s, str, `"${escape(s)}" not equal to "${escape(str)}"`);

      var s = str;
      s = utils.escapeHtmlComment(s);
      s = utils.escapeHtmlComment(s);
      s = utils.unescapeHtmlComment(s);
      s = utils.unescapeHtmlComment(s);
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

  describe('escapeFilename()', function () {
    it('basic', function () {
      // escape " ", "%", "?", "#"
      assert.strictEqual(
        utils.escapeFilename('path 100% with space? and #frag'),
        'path%20100%25%20with%20space?%20and%20%23frag',
      );

      // convert "\" to "/"
      assert.strictEqual(
        utils.escapeFilename(r`this\is\my\path`),
        'this/is/my/path',
      );

      // keep non-ASCII chars
      assert.strictEqual(
        utils.escapeFilename('http://example.com/中文/路徑/文件.txt'),
        'http://example.com/中文/路徑/文件.txt',
      );

      // keep special chars
      assert.strictEqual(
        utils.escapeFilename("!\"$&'()*+,-./:;<=>?@[]^_`{|}~"),
        "!\"$&'()*+,-./:;<=>?@[]^_`{|}~",
      );
    });
  });

  describe('quote()', function () {
    it('basic', function () {
      assert.strictEqual(
        utils.quote('中文/路徑/文件.txt'),
        '%E4%B8%AD%E6%96%87/%E8%B7%AF%E5%BE%91/%E6%96%87%E4%BB%B6.txt',
      );
    });
  });

  describe('validateFilename()', function () {
    const chars = Array.from({length: 0xA0}).map((_, i) => String.fromCodePoint(i)).join('');

    it('basic', function () {
      // general chars
      assert.strictEqual(
        utils.validateFilename(chars),
        "!_#$%&'()_+,-._0123456789_;_=__@ABCDEFGHIJKLMNOPQRSTUVWXYZ[_]^_`abcdefghijklmnopqrstuvwxyz{_}_",
      );

      // prevent empty
      assert.strictEqual(
        utils.validateFilename(''),
        '_',
      );

      // "~" not allowed by downloads.download() in Chromium
      assert.strictEqual(
        utils.validateFilename('~filename'),
        '_filename',
      );

      // [\xA0\u2000-\u200A\u202F\u205F]: spaces not allowed by downloads.download() in Firefox
      assert.strictEqual(
        utils.validateFilename('file\xA0\u202F\u205Fname'),
        'file___name',
      );
      for (let i = 0x2000, I = 0x200A; i <= I; i++) {
        assert.strictEqual(
          utils.validateFilename(`my${String.fromCodePoint(i)}file`),
          'my_file',
        );
      }

      // keep Unicode chars
      assert.strictEqual(
        utils.validateFilename('中文𠀀'),
        '中文𠀀',
      );
    });

    it("Windows restricts leading/trailing spaces and dots", function () {
      assert.strictEqual(
        utils.validateFilename(' '),
        '_',
      );
      assert.strictEqual(
        utils.validateFilename('  '),
        '_',
      );
      assert.strictEqual(
        utils.validateFilename('  wsb  '),
        'wsb',
      );

      assert.strictEqual(
        utils.validateFilename('.'),
        '_',
      );
      assert.strictEqual(
        utils.validateFilename('..'),
        '_',
      );

      assert.strictEqual(
        utils.validateFilename('.wsb'),
        '_.wsb',
      );
      assert.strictEqual(
        utils.validateFilename('..wsb'),
        '_..wsb',
      );
      assert.strictEqual(
        utils.validateFilename('  ..wsb'),
        '_..wsb',
      );
      assert.strictEqual(
        utils.validateFilename('foo.'),
        'foo',
      );
      assert.strictEqual(
        utils.validateFilename('foo..  '),
        'foo',
      );
    });

    it('Windows special filenames', function () {
      assert.strictEqual(
        utils.validateFilename('con'),
        'con_',
      );
      assert.strictEqual(
        utils.validateFilename('prn'),
        'prn_',
      );
      assert.strictEqual(
        utils.validateFilename('aux'),
        'aux_',
      );
      assert.strictEqual(
        utils.validateFilename('com0'),
        'com0_',
      );
      assert.strictEqual(
        utils.validateFilename('com9'),
        'com9_',
      );
      assert.strictEqual(
        utils.validateFilename('lpt0'),
        'lpt0_',
      );
      assert.strictEqual(
        utils.validateFilename('lpt9'),
        'lpt9_',
      );
      assert.strictEqual(
        utils.validateFilename('con.txt'),
        'con_.txt',
      );
      assert.strictEqual(
        utils.validateFilename('prn.txt'),
        'prn_.txt',
      );
      assert.strictEqual(
        utils.validateFilename('aux.txt'),
        'aux_.txt',
      );
      assert.strictEqual(
        utils.validateFilename('com0.txt'),
        'com0_.txt',
      );
      assert.strictEqual(
        utils.validateFilename('com9.txt'),
        'com9_.txt',
      );
      assert.strictEqual(
        utils.validateFilename('lpt0.txt'),
        'lpt0_.txt',
      );
      assert.strictEqual(
        utils.validateFilename('lpt9.txt'),
        'lpt9_.txt',
      );
    });

    it('force ASCII', function () {
      // general chars
      assert.strictEqual(
        utils.validateFilename(chars, true),
        "!_#$%&'()_+,-._0123456789_;_=__@ABCDEFGHIJKLMNOPQRSTUVWXYZ[_]^_`abcdefghijklmnopqrstuvwxyz{_}_",
      );

      // escape Unicode chars
      assert.strictEqual(
        utils.validateFilename('中文𠀀', true),
        '%E4%B8%AD%E6%96%87%F0%A0%80%80',
      );
    });
  });

  describe('dateToId()', function () {
    it('basic', function () {
      // create an ID from a Date object
      assert.strictEqual(
        utils.dateToId(new Date(Date.UTC(2020, 0, 2, 3, 4, 5, 67))),
        '20200102030405067',
      );

      // create an ID from now if no Date object is provided
      var idNow = utils.dateToId(new Date());
      var id = utils.dateToId();
      assert.closeTo(Number(id), Number(idNow), 1000);
    });

    it('round to nearest if date is too large or too small', function () {
      assert.strictEqual(
        utils.dateToId(new Date(Date.UTC(10000, 0, 1, 0, 0, 0, 0))),
        '99991231235959999',
      );
      assert.strictEqual(
        utils.dateToId(new Date(Date.UTC(-1, 0, 1, 0, 0, 0, 0))),
        '00000101000000000',
      );
    });
  });

  describe('idToDate()', function () {
    it('basic', function () {
      assert.deepEqual(
        utils.idToDate('20200102030405067'),
        new Date("2020-01-02T03:04:05.067Z"),
      );
    });

    it('return null for invalid ID string', function () {
      assert.strictEqual(
        utils.idToDate('2020010203040506'),
        null,
      );
      assert.strictEqual(
        utils.idToDate('wtf'),
        null,
      );
      assert.strictEqual(
        utils.idToDate(''),
        null,
      );
    });

    it('round to nearest if date is too large or too small', function () {
      assert.deepEqual(
        utils.idToDate('9'.repeat(17)),
        new Date("9999-12-31T23:59:59.999Z"),
      );
      assert.deepEqual(
        utils.idToDate('0'.repeat(17)),
        new Date("0000-01-01T00:00:00.000Z"),
      );
    });
  });

  describe('dateToIdOld()', function () {
    it('basic', function () {
      // create an ID from a Date object
      assert.strictEqual(
        utils.dateToIdOld(new Date(2020, 0, 2, 3, 4, 5, 67)),
        '20200102030405',
      );

      // create an ID from now if no Date object is provided
      var idNow = utils.dateToIdOld(new Date());
      var id = utils.dateToIdOld();
      assert.closeTo(Number(id), Number(idNow), 1000);
    });

    it('round to nearest if date is too large or too small', function () {
      assert.strictEqual(
        utils.dateToIdOld(new Date(10000, 0, 1, 0, 0, 0, 0)),
        '99991231235959',
      );
      assert.strictEqual(
        utils.dateToIdOld(new Date(-1, 0, 1, 0, 0, 0, 0)),
        '00000101000000',
      );
    });
  });

  describe('idToDateOld()', function () {
    it('basic', function () {
      assert.strictEqual(
        utils.idToDateOld('20200102030405').valueOf(),
        new Date(2020, 0, 2, 3, 4, 5).valueOf(),
      );
    });

    it('return null for invalid ID string', function () {
      assert.strictEqual(
        utils.idToDateOld('202001020304050'),
        null,
      );
      assert.strictEqual(
        utils.idToDateOld('wtf'),
        null,
      );
      assert.strictEqual(
        utils.idToDateOld(''),
        null,
      );
    });

    it('round to nearest if date is too large or too small', function () {
      assert.strictEqual(
        utils.idToDateOld('9'.repeat(14)).valueOf(),
        new Date(9999, 11, 31, 23, 59, 59, 999).valueOf(),
      );

      var date = new Date(0, 0, 1, 0, 0, 0);
      date.setFullYear(0);
      assert.strictEqual(
        utils.idToDateOld('0'.repeat(14)).valueOf(),
        date.valueOf(),
      );
    });
  });

  describe('crop()', function () {
    it('charLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // incomplete char should not appear
      assert.strictEqual(utils.crop(string, 14), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, 13), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, 12), 'foo bar 中...');
      assert.strictEqual(utils.crop(string, 11), 'foo bar ...');
      assert.strictEqual(utils.crop(string, 10), 'foo bar...');
      assert.strictEqual(utils.crop(string, 9), 'foo ba...');
      assert.strictEqual(utils.crop(string, 3), '...');
      assert.strictEqual(utils.crop(string, 2), '...');
      assert.strictEqual(utils.crop(string, 1), '...');

      // falsy value means no crop
      assert.strictEqual(utils.crop(string, 0), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, null), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string), 'foo bar 中文𠀀字');
    });

    it('byteLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // incomplete char should not appear
      assert.strictEqual(utils.crop(string, 0, 22), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, 0, 21), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, 0, 20), 'foo bar 中文...');
      assert.strictEqual(utils.crop(string, 0, 19), 'foo bar 中文...');
      assert.strictEqual(utils.crop(string, 0, 18), 'foo bar 中文...');
      assert.strictEqual(utils.crop(string, 0, 17), 'foo bar 中文...');
      assert.strictEqual(utils.crop(string, 0, 16), 'foo bar 中...');
      assert.strictEqual(utils.crop(string, 0, 15), 'foo bar 中...');
      assert.strictEqual(utils.crop(string, 0, 14), 'foo bar 中...');
      assert.strictEqual(utils.crop(string, 0, 13), 'foo bar ...');
      assert.strictEqual(utils.crop(string, 0, 12), 'foo bar ...');
      assert.strictEqual(utils.crop(string, 0, 11), 'foo bar ...');
      assert.strictEqual(utils.crop(string, 0, 10), 'foo bar...');
      assert.strictEqual(utils.crop(string, 0, 4), 'f...');
      assert.strictEqual(utils.crop(string, 0, 3), '...');
      assert.strictEqual(utils.crop(string, 0, 2), '...');
      assert.strictEqual(utils.crop(string, 0, 1), '...');

      // falsy value means no crop
      assert.strictEqual(utils.crop(string, 0, 0), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, 0, null), 'foo bar 中文𠀀字');
      assert.strictEqual(utils.crop(string, 0), 'foo bar 中文𠀀字');
    });

    it('charLimit and sizeLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // crop at the smaller limit
      assert.strictEqual(utils.crop(string, 13, 19), 'foo bar 中文...');
      assert.strictEqual(utils.crop(string, 12, 21), 'foo bar 中...');
    });

    it('custom ellipsis', function () {
      var string = 'foo bar 中文𠀀字';

      assert.strictEqual(utils.crop(string, 12, null, '…'), 'foo bar 中文…');
      assert.strictEqual(utils.crop(string, 11, null, '…'), 'foo bar 中文…');
      assert.strictEqual(utils.crop(string, 10, null, '…'), 'foo bar 中…');
      assert.strictEqual(utils.crop(string, 2, null, '…'), 'f…');
      assert.strictEqual(utils.crop(string, 1, null, '…'), '…');

      assert.strictEqual(utils.crop(string, 12, null, ''), 'foo bar 中文𠀀');
      assert.strictEqual(utils.crop(string, 11, null, ''), 'foo bar 中文');
      assert.strictEqual(utils.crop(string, 10, null, ''), 'foo bar 中文');
      assert.strictEqual(utils.crop(string, 2, null, ''), 'fo');
      assert.strictEqual(utils.crop(string, 1, null, ''), 'f');
    });
  });

  describe('unicodeToUtf8()', function () {
    it('basic', function () {
      assert.strictEqual(utils.unicodeToUtf8('\u0000'), '\x00');
      assert.strictEqual(utils.unicodeToUtf8('\u0080'), '\xC2\x80');
      assert.strictEqual(utils.unicodeToUtf8('\u3000'), '\xE3\x80\x80');
      assert.strictEqual(utils.unicodeToUtf8('\uD840\uDC00'), '\xF0\xA0\x80\x80');
      assert.strictEqual(utils.unicodeToUtf8('\u{20000}'), '\xF0\xA0\x80\x80');
      assert.strictEqual(utils.unicodeToUtf8('\u{10FFFF}'), '\xF4\x8F\xBF\xBF');
    });
  });

  describe('utf8ToUnicode()', function () {
    it('basic', function () {
      assert.strictEqual(utils.utf8ToUnicode('\x00'), '\u0000');
      assert.strictEqual(utils.utf8ToUnicode('\xC2\x80'), '\u0080');
      assert.strictEqual(utils.utf8ToUnicode('\xE3\x80\x80'), '\u3000');
      assert.strictEqual(utils.utf8ToUnicode('\xF0\xA0\x80\x80'), '\uD840\uDC00');
      assert.strictEqual(utils.utf8ToUnicode('\xF0\xA0\x80\x80'), '\u{20000}');
      assert.strictEqual(utils.utf8ToUnicode('\xF4\x8F\xBF\xBF'), '\u{10FFFF}');
    });
  });

  describe('byteStringToArrayBuffer()', function () {
    it('basic', function () {
      // "一天" in Big5
      var buffer = utils.byteStringToArrayBuffer('\xA4\x40\xA4\xD1');
      assert.deepEqual([...new Uint8Array(buffer)], [0xA4, 0x40, 0xA4, 0xD1]);

      // "𠀀" in UTF-8 with BOM
      var buffer = utils.byteStringToArrayBuffer('\xEF\xBB\xBF\xF0\xA0\x80\x80');
      assert.deepEqual([...new Uint8Array(buffer)], [0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80]);

      // "𠀀" in UTF-16BE with BOM
      var buffer = utils.byteStringToArrayBuffer('\xFE\xFF\xD8\x40\xDC\x00');
      assert.deepEqual([...new Uint8Array(buffer)], [0xFE, 0xFF, 0xD8, 0x40, 0xDC, 0x00]);

      // "𠀀" in UTF-16LE with BOM
      var buffer = utils.byteStringToArrayBuffer('\xFF\xFE\x40\xD8\x00\xDC');
      assert.deepEqual([...new Uint8Array(buffer)], [0xFF, 0xFE, 0x40, 0xD8, 0x00, 0xDC]);

      // blob of green bmp
      var bstr = atob('Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');
      var buffer = utils.byteStringToArrayBuffer(bstr);
      assert.deepEqual(
        [...new Uint8Array(buffer)],
        [66, 77, 60, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 6, 0, 0, 0, 18, 11, 0, 0, 18, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0],
      );
    });
  });

  describe('arrayBufferToByteString()', function () {
    it('basic', function () {
      // "一天" in Big5
      var buffer = new Uint8Array([0xA4, 0x40, 0xA4, 0xD1]);
      assert.strictEqual(utils.arrayBufferToByteString(buffer), '\xA4\x40\xA4\xD1');

      // "𠀀" in UTF-8 with BOM
      var buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80]);
      assert.strictEqual(utils.arrayBufferToByteString(buffer), '\xEF\xBB\xBF\xF0\xA0\x80\x80');

      // "𠀀" in UTF-16BE with BOM
      var buffer = new Uint8Array([0xFE, 0xFF, 0xD8, 0x40, 0xDC, 0x00]);
      assert.strictEqual(utils.arrayBufferToByteString(buffer), '\xFE\xFF\xD8\x40\xDC\x00');

      // "𠀀" in UTF-16LE with BOM
      var buffer = new Uint8Array([0xFF, 0xFE, 0x40, 0xD8, 0x00, 0xDC]);
      assert.strictEqual(utils.arrayBufferToByteString(buffer), '\xFF\xFE\x40\xD8\x00\xDC');

      // blob of green bmp
      var buffer = new Uint8Array([66, 77, 60, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 6, 0, 0, 0, 18, 11, 0, 0, 18, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
      assert.strictEqual(
        btoa(utils.arrayBufferToByteString(buffer)),
        "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA",
      );
    });
  });

  describe('trim()', function () {
    it('basic', function () {
      var strings = ['foo', 'bar', 'baz'];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f']) {
        assert.strictEqual(utils.trim(space + strings.join(space)), strings.join(space));
        assert.strictEqual(utils.trim(strings.join(space) + space), strings.join(space));
        assert.strictEqual(utils.trim(space + strings.join(space) + space), strings.join(space));
        assert.strictEqual(utils.trim(space.repeat(3) + strings.join(space) + space.repeat(3)), strings.join(space));
      }

      // non-ASCII-whitespaces should be ignored
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        var s = space + strings.join(space);
        assert.strictEqual(utils.trim(s), s);

        var s = strings.join(space) + space;
        assert.strictEqual(utils.trim(s), s);

        var s = space + strings.join(space) + space;
        assert.strictEqual(utils.trim(s), s);
      }
    });
  });

  describe('split()', function () {
    it('basic', function () {
      var strings = ['foo', 'bar', 'baz'];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f']) {
        assert.deepEqual(utils.split(strings.join(space)), strings);
      }

      // mixed ASCII white spaces
      assert.deepEqual(utils.split(strings.join(' \t\r\n\f')), strings);

      // non-ASCII-whitespaces should be ignored
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        assert.deepEqual(utils.split(strings.join(space)), [strings.join(space)]);
      }
    });

    it('discard empty starting or ending components', function () {
      // starting space
      assert.deepEqual(utils.split(' foo'), ['foo']);

      // ending space
      assert.deepEqual(utils.split('foo '), ['foo']);
    });
  });

  describe('normalizeUrl()', function () {
    it('encode chars that requires percent encoding with all upper case', function () {
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/中文`),
        `http://example.com/%E4%B8%AD%E6%96%87`,
      );
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/%e4%b8%ad%e6%96%87`),
        `http://example.com/%E4%B8%AD%E6%96%87`,
      );
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/#中文`),
        `http://example.com/#%E4%B8%AD%E6%96%87`,
      );
    });

    it('encode standalone "%"s', function () {
      // standalone % => %25
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/?123%`),
        `http://example.com/?123%25`,
      );

      // don't touch normal %-encoding
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/?123%20456`),
        `http://example.com/?123%20456`,
      );
    });

    it('decode over-encoded chars, such as [0-9a-z:!()+,;=], in pathname', function () {
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/%70%61%67%65%3d%28%33%29`),
        `http://example.com/page=(3)`,
      );
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/%3a%21%28%29%2b%2c%3b%3d`),
        `http://example.com/:!()+,;=`,
      );
    });

    it('decode unreserved chars [0-9A-Za-z-_.~] in search and hash', function () {
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/?%70%61%67%65%2d%33=(5)`),
        `http://example.com/?page-3=(5)`,
      );
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/?p=%2d%5f%2e%7e`),
        `http://example.com/?p=-_.~`,
      );

      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/#%70%61%67%65%2d%33=(5)`),
        `http://example.com/#page-3=(5)`,
      );
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/#p=%2d%5f%2e%7e`),
        `http://example.com/#p=-_.~`,
      );
    });

    it('empty search/hash is normalized as none', function () {
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/?`),
        `http://example.com/`,
      );
      assert.strictEqual(
        utils.normalizeUrl(`http://example.com/#`),
        `http://example.com/`,
      );
    });
  });

  describe('isUrlAbsolute()', function () {
    it('basic', function () {
      // absolute URL cases
      assert.strictEqual(utils.isUrlAbsolute(`http://example.com:8000/foo?bar=baz#frag`), true);
      assert.strictEqual(utils.isUrlAbsolute(`https://example.com/`), true);
      assert.strictEqual(utils.isUrlAbsolute(`file:///c/foo/bar`), true);
      assert.strictEqual(utils.isUrlAbsolute(`about:blank`), true);

      // relative URL cases
      assert.strictEqual(utils.isUrlAbsolute(`image.png`), false);
      assert.strictEqual(utils.isUrlAbsolute(`中文.png`), false);
      assert.strictEqual(utils.isUrlAbsolute(`/image.png`), false);
      assert.strictEqual(utils.isUrlAbsolute(`//example.com/page`), false);
    });

    it('do not throw for non-string', function () {
      assert.strictEqual(utils.isUrlAbsolute(undefined), false);
      assert.strictEqual(utils.isUrlAbsolute(null), false);
    });
  });

  describe('getRelativeUrl()', function () {
    it('absolute URLs', function () {
      // different since protocol
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `https://example.com/ref`,
        ),
        `http://example.com/page`,
      );

      // different since host
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://sub.example.com/page`,
          `http://example.com/ref`,
        ),
        `//sub.example.com/page`,
      );

      // different since path
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/ref`,
        ),
        `page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/ref`,
        ),
        `page/`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/ref/`,
        ),
        `../page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/ref/`,
        ),
        `../page/`,
      );

      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/sub/ref`,
        ),
        `../page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/sub/ref`,
        ),
        `../page/`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/sub/ref/`,
        ),
        `../../page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/sub/ref/`,
        ),
        `../../page/`,
      );

      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/sub/page`,
          `http://example.com/ref`,
        ),
        `sub/page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/sub/page/`,
          `http://example.com/ref`,
        ),
        `sub/page/`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/sub/page`,
          `http://example.com/ref/`,
        ),
        `../sub/page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/sub/page/`,
          `http://example.com/ref/`,
        ),
        `../sub/page/`,
      );

      // different since search
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page`,
        ),
        `?foo=bar#abc`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/page?foo=bar#abc`,
        ),
        ``,
      );

      // different since hash
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page?foo=bar`,
        ),
        `#abc`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/page#frag`,
        ),
        ``,
      );

      // no difference
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page?foo=bar#abc`,
        ),
        ``,
      );
    });

    it('return original URL if input is absolute and base is relative', function () {
      assert.strictEqual(
        utils.getRelativeUrl(
          `http://example.com/page`,
          `image.png`,
        ),
        `http://example.com/page`,
      );
    });

    it('throw if input is realative and base is absolute', function () {
      assert.throws(() => {
        utils.getRelativeUrl(
          `image.png`,
          `http://example.com/page`,
        );
      });
    });

    it('protocol-relative URLs', function () {
      // different since host
      assert.strictEqual(
        utils.getRelativeUrl(
          `//sub.example.com/page`,
          `//example.com/ref`,
        ),
        `//sub.example.com/page`,
      );

      // different since path
      assert.strictEqual(
        utils.getRelativeUrl(
          `//example.com/page`,
          `//example.com/ref`,
        ),
        `page`,
      );
    });

    it('return original URL if input is protocol-relative and base is not', function () {
      assert.strictEqual(
        utils.getRelativeUrl(
          `//sub.example.com/page`,
          `/ref`,
        ),
        `//sub.example.com/page`,
      );
    });

    it('throw if base is protocol-relative and input is not', function () {
      assert.throws(() => {
        utils.getRelativeUrl(
          `/page`,
          `//example.com/ref`,
        );
      });

      assert.throws(() => {
        utils.getRelativeUrl(
          `page`,
          `//example.com/ref`,
        );
      });
    });

    it('root-relative URLs', function () {
      // different since path
      assert.strictEqual(
        utils.getRelativeUrl(
          `/page`,
          `/ref`,
        ),
        `page`,
      );
    });

    it('return original URL if input is root-relative and base is not', function () {
      assert.strictEqual(
        utils.getRelativeUrl(
          `/page`,
          `ref`,
        ),
        `/page`,
      );
    });

    it('throw if base is root-relative and input is not', function () {
      assert.throws(() => {
        utils.getRelativeUrl(
          `page`,
          `/ref`,
        );
      });
    });

    it('relative URLs (since path)', function () {
      // different since path
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page/`,
          `myroot/ref`,
        ),
        `page/`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page`,
          `myroot/ref/`,
        ),
        `../page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page/`,
          `myroot/ref/`,
        ),
        `../page/`,
      );

      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page`,
          `myroot/sub/ref`,
        ),
        `../page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page/`,
          `myroot/sub/ref`,
        ),
        `../page/`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page`,
          `myroot/sub/ref/`,
        ),
        `../../page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page/`,
          `myroot/sub/ref/`,
        ),
        `../../page/`,
      );

      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/sub/page`,
          `myroot/ref`,
        ),
        `sub/page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/sub/page/`,
          `myroot/ref`,
        ),
        `sub/page/`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/sub/page`,
          `myroot/ref/`,
        ),
        `../sub/page`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/sub/page/`,
          `myroot/ref/`,
        ),
        `../sub/page/`,
      );

      // different since search
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page`,
        ),
        `?foo=bar#abc`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page`,
          `myroot/page?foo=bar#abc`,
        ),
        ``,
      );

      // different since hash
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page?foo=bar`,
        ),
        `#abc`,
      );
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page`,
          `myroot/page#frag`,
        ),
        ``,
      );

      // no difference
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page?foo=bar#abc`,
        ),
        ``,
      );
    });

    it('relative URLs (missing path or so)', function () {
      // path and no path
      assert.strictEqual(
        utils.getRelativeUrl(
          `myroot/page?foo=bar#frag`,
          `?foo1=bar1#frag1`,
        ),
        `myroot/page?foo=bar#frag`,
      );

      // no path and path
      assert.strictEqual(
        utils.getRelativeUrl(
          `?foo=bar#frag`,
          `ref`,
        ),
        `?foo=bar#frag`,
      );

      // search and no search
      assert.strictEqual(
        utils.getRelativeUrl(
          `?foo=bar#frag`,
          `#frag1`,
        ),
        `?foo=bar#frag`,
      );

      // no search and search
      assert.strictEqual(
        utils.getRelativeUrl(
          `#frag`,
          `?foo1=bar1#frag1`,
        ),
        `#frag`,
      );

      // hash and no hash
      assert.strictEqual(
        utils.getRelativeUrl(
          `#frag`,
          ``,
        ),
        `#frag`,
      );

      // no hash and hash
      assert.strictEqual(
        utils.getRelativeUrl(
          ``,
          `#frag1`,
        ),
        ``,
      );
    });
  });

  describe('parseHeaderContentType()', function () {
    it('basic', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html`),
        {type: "text/html", parameters: {}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`image/svg+xml`),
        {type: "image/svg+xml", parameters: {}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`image/vnd.microsoft.icon`),
        {type: "image/vnd.microsoft.icon", parameters: {}},
      );
    });

    it('invalid type', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`noslash`),
        {type: "", parameters: {}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`text/bad?token`),
        {type: "text/bad", parameters: {}},
      );
    });

    it('parameters', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html;charset=utf-8`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset=utf-8; param1=value1; param2=value2`),
        {type: "text/html", parameters: {charset: "utf-8", param1: "value1", param2: "value2"}},
      );
    });

    it('spaces around type and parameter should be ignored', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html  ; charset=utf-8  `),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
    });

    it('spaces around "=" are not allowed by the spec', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset =utf-8`),
        {type: "text/html", parameters: {}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset= utf-8`),
        {type: "text/html", parameters: {charset: ""}},
      );
    });

    it('quotes and escapes', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset="utf-8"`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(r`text/html; field=" my text\\value with \"quote\" "`),
        {type: "text/html", parameters: {field: r` my text\value with "quote" `}},
      );

      // "'" not treated as a quote
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset='utf-8'`),
        {type: "text/html", parameters: {charset: "'utf-8'"}},
      );
    });

    it('type should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`TEXT/HTML`),
        {type: "text/html", parameters: {}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`Text/Html`),
        {type: "text/html", parameters: {}},
      );
    });

    it('parameter name should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; CHARSET=utf-8; MyKey=myvalue`),
        {type: "text/html", parameters: {charset: "utf-8", mykey: "myvalue"}},
      );
    });

    it('duplicated parameters are invalid (ignored)', function () {
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset=utf-8; charset=big5`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentType(`text/html; charset=utf-8; CHARSET=big5`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
    });
  });

  describe('parseHeaderContentDisposition()', function () {
    it('basic', function () {
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`attachment; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename=file.html`),
        {type: "inline", parameters: {filename: "file.html"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`unknown; filename=file.html`),
        {type: "unknown", parameters: {filename: "file.html"}},
      );
    });

    it('spaces between parameters and between parname and value should be ignored', function () {
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`attachment;filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline  ; filename  =  file.html `),
        {type: "inline", parameters: {filename: "file.html"}},
      );
    });

    it('quotes and escapes', function () {
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename=" my file.jpg "`),
        {type: "inline", parameters: {filename: " my file.jpg "}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(r`inline; filename="my text\\image \"file\".jpg"`),
        {type: "inline", parameters: {filename: r`my text\image "file".jpg`}},
      );
    });

    it('ext-value as parname*', function () {
      // filename*
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename="US-$ rates"; filename*=iso-8859-1'en'%A3%20rates.bmp`),
        {type: "inline", parameters: {filename: "£ rates.bmp"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename*=UTF-8''a%E4%B8%ADb%23c.php`),
        {type: "inline", parameters: {filename: "a中b#c.php"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename*=UTF-8''%22I%20love%20you%22.html`),
        {type: "inline", parameters: {filename: `"I love you".html`}},
      );

      // ignore unsupported encoding
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename*=big5''a%E4%B8%ADb%23c.php`),
        {type: "inline", parameters: {}},
      );

      // ignore invalid UTF-8 sequence
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename*=UTF-8''%EB%EE%EC.txt`),
        {type: "inline", parameters: {}},
      );

      // filename* has higher priority than filename regardless of order
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename=_.bmp; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp`),
        {type: "inline", parameters: {filename: "中文𠀀.bmp"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp; filename=_.bmp`),
        {type: "inline", parameters: {filename: "中文𠀀.bmp"}},
      );
    });

    it('type should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`ATTACHMENT; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assert.deepEqual(
        utils.parseHeaderContentDisposition(`AttachMent; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
    });

    it('parameter name should be case-insensitive (lower case)', function () {
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`attachment; FILENAME=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assert.deepEqual(
        utils.parseHeaderContentDisposition(`attachment; FileName=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assert.deepEqual(
        utils.parseHeaderContentDisposition(`inline; filename=file.bmp; Size=84`),
        {type: "inline", parameters: {filename: "file.bmp", size: "84"}},
      );
    });

    it('duplicated parameters are invalid (ignored)', function () {
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`attachment; filename=file.html; filename=file2.html; size=3; size=5`),
        {type: "attachment", parameters: {filename: "file.html", size: "3"}},
      );
      assert.deepEqual(
        utils.parseHeaderContentDisposition(`attachment; filename=file.html; FILENAME=file2.html; size=3; Size=5`),
        {type: "attachment", parameters: {filename: "file.html", size: "3"}},
      );
    });
  });

  describe('parseHeaderRefresh()', function () {
    it('basic', function () {
      assert.deepEqual(utils.parseHeaderRefresh(``), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(` `), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(` ;`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(` ,`), {time: undefined, url: undefined});

      assert.deepEqual(utils.parseHeaderRefresh(`referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(`url=referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(`;url=referred.html`), {time: undefined, url: undefined});

      assert.deepEqual(utils.parseHeaderRefresh(`9`), {time: 9, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`0`), {time: 0, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`3.5.1`), {time: 3, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`-1`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(`+1`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(`.123.456`), {time: 0, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`.123.456.`), {time: 0, url: ``});

      assert.deepEqual(utils.parseHeaderRefresh(`9 `), {time: 9, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`9;`), {time: 9, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`9,`), {time: 9, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`9 ; `), {time: 9, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`9 , `), {time: 9, url: ``});

      assert.deepEqual(utils.parseHeaderRefresh(`1 referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1;referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1,referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 ; referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 , referred.html`), {time: 1, url: `referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`-1 referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(`+1 referred.html`), {time: undefined, url: undefined});
      assert.deepEqual(utils.parseHeaderRefresh(`. referred.html`), {time: 0, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`.123.456 referred.html`), {time: 0, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`.123.456. referred.html`), {time: 0, url: `referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`1:referred.html`), {time: 1, url: ``});
      assert.deepEqual(utils.parseHeaderRefresh(`1 u=referred.html`), {time: 1, url: `u=referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 u = referred.html`), {time: 1, url: `u = referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 url referred.html`), {time: 1, url: `url referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`1 url=referred.html`), {time: 1, url: `referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`1 "referred.html"`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 'referred.html'`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 "referred.html 123`), {time: 1, url: `referred.html 123`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 "referred.html'123`), {time: 1, url: `referred.html'123`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 "referred.html"123`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 'referred.html"123'`), {time: 1, url: `referred.html"123`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 'referred.html'123`), {time: 1, url: `referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`1 url="referred.html"`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 url='referred.html'`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 url="referred.html `), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 url="referred.html'123`), {time: 1, url: `referred.html'123`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 url='referred.html"123'`), {time: 1, url: `referred.html"123`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 url='referred.html'123`), {time: 1, url: `referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`1; URL=referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1, URL=referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 ; URL = referred.html`), {time: 1, url: `referred.html`});
      assert.deepEqual(utils.parseHeaderRefresh(`1 , URL = referred.html`), {time: 1, url: `referred.html`});

      assert.deepEqual(utils.parseHeaderRefresh(`1; uRl=referred.html`), {time: 1, url: `referred.html`});
    });
  });

  $describe.skipIf($.noBrowser)('readFileAsArrayBuffer()', function () {
    it('basic', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var ab = await utils.readFileAsArrayBuffer(blob);
      assert.deepEqual([...new Uint8Array(ab)], [65, 66, 67, 49, 50, 51, 32, 228, 184, 173, 230, 150, 135, 32, 240, 160, 128, 128]);
    });
  });

  $describe.skipIf($.noBrowser)('readFileAsDataURL()', function () {
    it('basic', async function () {
      var greenBmp = atob('Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');
      var ab = utils.byteStringToArrayBuffer(greenBmp);
      var blob = new Blob([ab], {type: "image/bmp"});
      var datauri = await utils.readFileAsDataURL(blob);
      assert.strictEqual(datauri, "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA");
    });
  });

  $describe.skipIf($.noBrowser)('readFileAsText()', function () {
    it('return string in specified charset', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var str = await await utils.readFileAsText(blob, 'UTF-8');
      assert.strictEqual(str, "ABC123 中文 𠀀");
    });

    it('return string in UTF-8 if charset not specified', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var str = await await utils.readFileAsText(blob);
      assert.strictEqual(str, "ABC123 中文 𠀀");
    });

    it('return byte string if charset is falsy', async function () {
      var blob = new Blob(["ABC123 中文 𠀀"], {type: "text/plain"});
      var str = await await utils.readFileAsText(blob, false);
      assert.strictEqual(utils.utf8ToUnicode(str), "ABC123 中文 𠀀");
    });
  });

  $describe.skipIf($.noBrowser)('readFileAsDocument()', function () {
    it('basic', async function () {
      var html = `<a href="http://example.com">ABC123 中文 𠀀</a>`;
      var blob = new Blob([html], {type: "text/html; charset=utf-8"});
      var doc = await utils.readFileAsDocument(blob);
      assert.strictEqual(doc.querySelector('a').textContent, 'ABC123 中文 𠀀');
      assert.strictEqual(doc.querySelector('a').getAttribute('href'), 'http://example.com');
    });
  });

  describe('mimeIsText()', function () {
    it('basic', function () {
      // text/*
      assert.strictEqual(utils.mimeIsText('text/plain'), true);
      assert.strictEqual(utils.mimeIsText('text/html'), true);
      assert.strictEqual(utils.mimeIsText('text/css'), true);
      assert.strictEqual(utils.mimeIsText('text/javascript'), true);

      // +xml
      assert.strictEqual(utils.mimeIsText('application/xhtml+xml'), true);
      assert.strictEqual(utils.mimeIsText('text/svg+xml'), true);
      assert.strictEqual(utils.mimeIsText('application/rdf+xml'), true);
      assert.strictEqual(utils.mimeIsText('application/xslt+xml'), true);

      // +json
      assert.strictEqual(utils.mimeIsText('application/ld+json'), true);

      // special text
      assert.strictEqual(utils.mimeIsText('application/javascript'), true);
      assert.strictEqual(utils.mimeIsText('application/ecmascript'), true);
      assert.strictEqual(utils.mimeIsText('application/json'), true);
      assert.strictEqual(utils.mimeIsText('application/xml'), true);
      assert.strictEqual(utils.mimeIsText('application/sql'), true);

      // +zip are not text
      assert.strictEqual(utils.mimeIsText('application/epub+zip'), false);

      // others are not text
      assert.strictEqual(utils.mimeIsText('image/bmp'), false);
      assert.strictEqual(utils.mimeIsText('image/jpeg'), false);
      assert.strictEqual(utils.mimeIsText('image/gif'), false);
      assert.strictEqual(utils.mimeIsText('image/png'), false);
      assert.strictEqual(utils.mimeIsText('image/webp'), false);
      assert.strictEqual(utils.mimeIsText('image/vnd.microsoft.icon'), false);
      assert.strictEqual(utils.mimeIsText('image/x-icon'), false);
      assert.strictEqual(utils.mimeIsText('audio/mpeg'), false);
      assert.strictEqual(utils.mimeIsText('video/mp4'), false);
      assert.strictEqual(utils.mimeIsText('font/ttf'), false);
      assert.strictEqual(utils.mimeIsText('font/woff'), false);
      assert.strictEqual(utils.mimeIsText('application/zip'), false);
      assert.strictEqual(utils.mimeIsText('application/pdf'), false);
      assert.strictEqual(utils.mimeIsText('application/octet-stream'), false);
    });
  });

  $describe.skipIf($.noBrowser)('parseCssFile()', function () {
    it('priority: 1. BOM', async function () {
      // UTF-8
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-8',
      });

      // UTF-16BE
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-16be');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-16BE',
      });

      // UTF-16LE
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-16le');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-16LE',
      });

      // output BOM only for @charset
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: str,
        charset: 'UTF-8',
      });
    });

    it('priority: 2. header charset', async function () {
      // utf-8
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'utf-8', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      // utf-16be
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-16be');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'utf-16be', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'utf-16be',
      });

      // big5
      var str = '@charset "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'big5', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'big5',
      });

      // ISO-8859-1
      var str = '@charset "UTF-8"; content: "abcÆ©®±¼"';
      var u8ar = await encodeText(str, 'iso-8859-1');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'ISO-8859-1'), {
        text: '\uFEFF' + str,
        charset: 'ISO-8859-1',
      });

      // output BOM only for @charset
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, 'UTF-8', 'GBK'), {
        text: str,
        charset: 'UTF-8',
      });
    });

    it('priority: 3. @charset', async function () {
      // UTF-8
      var str = '@charset "UTF-8"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'Big5'), {
        text: '\uFEFF' + str,
        charset: 'UTF-8',
      });

      // Big5
      var str = '@charset "Big5"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'Big5',
      });

      // fix bad UTF-16 declaration to UTF-8
      var str = '@charset "utf-16BE"; content: "abc中文"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      var str = '@charset "UTF-16le"; content: "abc中文"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      // ignore bad @charset
      var str = '@CHARSET "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'big5'), {
        text: str,
        charset: 'big5',
      });

      var str = "@charset 'UTF-8'; content: 'abc中文'";
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });

      var str = '@charset  "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });
    });

    it('priority: 4. environment charset', async function () {
      // UTF-8
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'UTF-8'), {
        text: str,
        charset: 'UTF-8',
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });
    });

    it('priority: 5. as byte string', async function () {
      // UTF-8
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob), {
        text: utils.arrayBufferToByteString(u8ar),
        charset: null,
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob), {
        text: utils.arrayBufferToByteString(u8ar),
        charset: null,
      });

      // ISO-8859-1
      var str = 'content: "abcÆ©®±¼"';
      var u8ar = await encodeText(str, 'ISO-8859-1');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assert.deepEqual(await utils.parseCssFile(blob), {
        text: utils.arrayBufferToByteString(u8ar),
        charset: null,
      });
    });
  });

  $describe.skipIf($.noBrowser)('rewriteCssFile()', function () {
    it('force UTF-8 if charset is known', async function () {
      const rewriter = async css => `${css} /* rewritten */`;

      var data = new Blob([`div::after { content: "中文"; }`], {type: 'text/css'});
      var result = await utils.rewriteCssFile(data, 'utf-8', rewriter);
      assert.strictEqual(result.type.toLowerCase(), 'text/css;charset=utf-8');
      assert.strictEqual(await utils.readFileAsText(result, 'UTF-8'), 'div::after { content: "中文"; } /* rewritten */');
    });

    it('no charset if charset is unknown', async function () {
      const rewriter = async css => `${css} /* rewritten */`;

      var data = new Blob([`div::after { content: "中文"; }`], {type: 'text/css'});
      var result = await utils.rewriteCssFile(data, undefined, rewriter);
      assert.strictEqual(result.type.toLowerCase(), 'text/css');
      assert.strictEqual(await utils.readFileAsText(result, 'UTF-8'), 'div::after { content: "中文"; } /* rewritten */');
    });
  });

  describe('rewriteCssText()', function () {
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
      var {text: parsedText, charset: parsedCharset} = await utils.parseCssFile(blob);

      // rewrite the parsed CSS text
      var bstr = utils.rewriteCssText(parsedText, optionsImage);
      var ab = utils.byteStringToArrayBuffer(bstr);
      var blob = new Blob([ab], {type: 'text/css'});

      // re-read as the original charset
      var {text: output, charset} = await utils.parseCssFile(blob, charset);

      assert.isNull(parsedCharset);
      assert.strictEqual(output, expected);
    }

    it('image', function () {
      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url('image.jpg'); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url("image.jpg"); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

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
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // keep original spaces
      var input = `body{image-background:url(image.jpg);}`;
      var expected = `body{image-background:url("http://example.com/image.jpg");}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  image.jpg  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body\t{\timage-background\t:\turl(\timage.jpg\t)\t;\t}`;
      var expected = `body\t{\timage-background\t:\turl(\t"http://example.com/image.jpg"\t)\t;\t}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  "image.jpg"  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(\t"image.jpg"\t) ; }`;
      var expected = `body { image-background: url(\t"http://example.com/image.jpg"\t) ; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // keep original case
      var input = `body { image-background: URL(image.jpg); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: uRl(image.jpg); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: URL("image.jpg"); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: uRl("image.jpg"); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // spaces only
      var input = `body { image-background: url(); }`;
      var expected = `body { image-background: url("http://example.com/"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url( ); }`;
      var expected = `body { image-background: url( "http://example.com/"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  ); }`;
      var expected = `body { image-background: url(  "http://example.com/"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(   ); }`;
      var expected = `body { image-background: url(   "http://example.com/"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // escape quotes
      var input = `body { image-background: url('i "like" it.jpg'); }`;
      var expected = r`body { image-background: url("http://example.com/i \"like\" it.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // skip comments
      var input = `/*url(image.jpg)*/`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `/*url(image.jpg)*/body { color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body/*url(image.jpg)*/{ color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body {/*url(image.jpg)*/color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body { color/*url(image.jpg)*/: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body { color:/*url(image.jpg)*/red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red/*url(image.jpg)*/; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red;/*url(image.jpg)*/}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red; }/*url(image.jpg)*/`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      // misc
      var input = `body { image-background: url(''); }`;
      var expected = `body { image-background: url("http://example.com/"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = r`body { image-background: url(\)); }`;
      var expected = r`body { image-background: url("http://example.com/)"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = r`body { image-background: var(--my-var,url()); }`;
      var expected = r`body { image-background: var(--my-var,url("http://example.com/")); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);
    });

    it('image ignore unrelated pattern', function () {
      var input = `div::after { content: "url(image.jpg)" }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `[myattr="url(image.jpg)"] { }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { background-image: url("image.jpg"); }`;
      var expected = r`.my\"class\" { background-image: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);
    });

    it('image ignore unrelated rules', function () {
      var input = `@import "file.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `@import url("file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `@namespace url("file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: certain chars should be escaped or replaced', function () {
      // 0x01~0x1F and 0x7F (except for newlines) should be escaped
      var input = `.mycls { background-image: url("\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0B\x0E\x0F"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\1 \2 \3 \4 \5 \6 \7 \8 \9 \b \e \f "); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = `.mycls { background-image: url("\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F\x7F"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // escaped sequence of 0x01~0x1F and 0x7F should keep escaped
      var input = r`.mycls { background-image: url("\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = r`.mycls { background-image: url("\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // null, surrogate, and char code > 0x10FFFF should be replaced with \uFFFD
      var input = r`.mycls { background-image: url("\0 \D800 \DFFF \110000"); }`;
      var expected = `.mycls { background-image: url("http://example.com/\uFFFD\uFFFD\uFFFD\uFFFD"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      // other chars should be unescaped
      var input = r`.mycls { background-image: url("\80 \4E00 \20000 \10FFFF "); }`;
      var expected = `.mycls { background-image: url("http://example.com/\u{80}\u{4E00}\u{20000}\u{10FFFF}"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);
    });

    $it.xfail()('image: bad extra components after a quoted string', function () {
      // bad URL, should be skipped
      var input = r`.mycls { background-image: url("image.jpg"foo); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" foo); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg""foo"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" "foo"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg"'foo'); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" 'foo'); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" url(foo)); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" url("foo")); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: newline in a quoted string', function () {
      // bad string, should be skipped
      var input = r`.mycls { background-image: url("image.jpg
); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('image.jpg
); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`.mycls { background-image: url("my\
image\
.jpg"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/myimage.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);

      var input = r`.mycls { background-image: url('my\
image\
.jpg'); }`;
      var expected = r`.mycls { background-image: url("http://example.com/myimage.jpg"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);
    });

    $it.xfail()('image: EOF in a quoted string', function () {
      // bad string, should be skipped to the end
      var input = r`.mycls { background-image: url("img.jpg`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("url(img.jpg)`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('img.jpg`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('url(img.jpg)`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    $it.xfail()('image: escaped EOF in a quoted string', function () {
      // bad string, should be skipped to the end
      var input = `.mycls { background-image: url("img.jpg\\`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url("url(img.jpg)\\`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url('img.jpg\\`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url('url(img.jpg)\\`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: bad chars in an unquoted url', function () {
      // bad URL, should be skipped
      var input = r`.mycls { background-image: url(image"foo.jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image"foo".jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image'foo.jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image'foo'.jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image(foo.jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(url(foo).jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: last newline in an unquoted url', function () {
      // last whitespaces, should be stripped
      var input = r`.mycls { background-image: url(image.jpg
); }`;
      var expected = r`.mycls { background-image: url("http://example.com/image.jpg"
); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), expected);
    });

    it('image: intermediate newline in an unquoted url', function () {
      // bad url, should be skipped
      var input = r`.mycls { background-image: url(image.jpg
foo); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped newline in an unquoted url', function () {
      // bad escape, should be skipped
      var input = r`.mycls { background-image: url(image\
.jpg); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image.jpg\
); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: EOF in an unquoted url', function () {
      // bad url, should be skipped to the end
      var input = `.mycls { background-image: url(img.jpg`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped EOF in an unquoted url', function () {
      // bad escape, should be skipped to the end
      var input = `.mycls { background-image: url(img.jpg\\`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImage), input);
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
      assert.strictEqual(utils.rewriteCssText(input, options), expected);
    });

    it('image async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url: `http://example.com/${url}`}),
      };

      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assert.strictEqual(await utils.rewriteCssText(input, options), expected);
    });

    it('@font-face', function () {
      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: url('file.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      // keep original spaces
      var input = `@font-face{font-family:myfont;src:url(file.woff);}`;
      var expected = `@font-face{font-family:myfont;src:url("http://example.com/file.woff");}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src  : url(  file.woff  )  ; }`;
      var expected = `@font-face { font-family: myfont; src  : url(  "http://example.com/file.woff"  )  ; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      var input = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\tfile.woff\t)\t;\t}`;
      var expected = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\t"http://example.com/file.woff"\t)\t;\t}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      // keep original case
      var input = `@font-face { font-family: myfont; src: URL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: URL("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: UrL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: UrL("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      // escape quotes
      var input = `@font-face { font-family: myfont; src: url('i"like"it.woff'); }`;
      var expected = r`@font-face { font-family: myfont; src: url("http://example.com/i\"like\"it.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      // skip comments
      var input = `/*@font-face{src:url(file.woff)}*/`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `/*@font-face{src:url(file.woff)}*/body { color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `body/*@font-face{src:url(file.woff)}*/{ color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `body {/*@font-face{src:url(file.woff)}*/color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `body { color/*@font-face{src:url(file.woff)}*/: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `body { color:/*@font-face{src:url(file.woff)}*/red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `body { color: red/*@font-face{src:url(file.woff)}*/; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `body { color: red;/*@font-face{src:url(file.woff)}*/}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);
    });

    it('@font-face ignore unrelated pattern', function () {
      var input = `div::after { content: "@font-face{src:url(file.woff)}" }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      var input = `[myattr="@font-face{src:url(file.woff)}"] { }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { }
@font-face { src: url("file.woff"); }`;
      var expected = r`.my\"class\" { }
@font-face { src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);
    });

    it('@font-face: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`@font-face { font-family: myfont; src: url("my\
font\
.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/myfont.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);

      var input = r`@font-face { font-family: myfont; src: url('my\
font\
.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/myfont.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsFont), expected);
    });

    it('@font-face record', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: /*scrapbook-orig-url="file.woff"*/url("http://example.com/file.woff"); }`;
      assert.strictEqual(utils.rewriteCssText(input, options), expected);
    });

    it('@font-face async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url: `http://example.com/${url}`}),
        rewriteBackgroundUrl: async url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assert.strictEqual(await utils.rewriteCssText(input, options), expected);
    });

    it('@import', function () {
      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import 'file.css';`;
      var expected = `@import "http://example.com/file.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import url(file.css);`;
      var expected = `@import url("http://example.com/file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import url('file.css');`;
      var expected = `@import url("http://example.com/file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import url("file.css");`;
      var expected = `@import url("http://example.com/file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      // keep original spaces
      var input = `@import   "file.css"  ;`;
      var expected = `@import   "http://example.com/file.css"  ;`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import\t"file.css"\t;`;
      var expected = `@import\t"http://example.com/file.css"\t;`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import   url(  file.css   )  ;`;
      var expected = `@import   url(  "http://example.com/file.css"   )  ;`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import\turl(\tfile.css\t)\t;`;
      var expected = `@import\turl(\t"http://example.com/file.css"\t)\t;`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      // keep original case
      var input = `@import URL(file.css);`;
      var expected = `@import URL("http://example.com/file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import URl(file.css);`;
      var expected = `@import URl("http://example.com/file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      // escape quotes
      var input = `@import 'I"love"you.css';`;
      var expected = r`@import "http://example.com/I\"love\"you.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = `@import url('I"love"you.css');`;
      var expected = r`@import url("http://example.com/I\"love\"you.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      // skip comments
      var input = `/*@import url(file.css);*/`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `/*@import url(file.css);*/body { color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `body/*@import url(file.css);*/{ color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `body {/*@import url(file.css);*/color: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `body { color/*@import url(file.css);*/: red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `body { color:/*@import url(file.css);*/red; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `body { color: red/*@import url(file.css);*/; }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `body { color: red;/*@import url(file.css);*/}`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);
    });

    it('@import ignore unrelated pattern', function () {
      var input = `div::after { content: "@import url(file.css);" }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      var input = `[myattr="@import url(file.css);"] { }`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { }
@import "file.css";`;
      var expected = r`.my\"class\" { }
@import "http://example.com/file.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);
    });

    it('@import: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`@import "my\
file\
.css";`;
      var expected = `@import "http://example.com/myfile.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = r`@import 'my\
file\
.css';`;
      var expected = `@import "http://example.com/myfile.css";`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = r`@import url("my\
file\
.css");`;
      var expected = `@import url("http://example.com/myfile.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);

      var input = r`@import url('my\
file\
.css');`;
      var expected = `@import url("http://example.com/myfile.css");`;
      assert.strictEqual(utils.rewriteCssText(input, optionsImport), expected);
    });

    it('@import record', function () {
      const options = {
        rewriteImportUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import /*scrapbook-orig-url="file.css"*/"http://example.com/file.css";`;
      assert.strictEqual(utils.rewriteCssText(input, options), expected);

      var input = `@import url(file.css);`;
      var expected = `@import /*scrapbook-orig-url="file.css"*/url("http://example.com/file.css");`;
      assert.strictEqual(utils.rewriteCssText(input, options), expected);
    });

    it('@import async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url: `http://example.com/${url}`}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assert.strictEqual(await utils.rewriteCssText(input, options), expected);
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
      var result = utils.rewriteCssText(input, options);
      var match = result.match(regex);
      assert.isArray(match);
      assert.strictEqual(match[2], match[4]);
      assert.deepEqual(map, {
        "http://image.example.com/image.jpg": match[1],
        "http://image.example.com/image2.jpg": match[3],
      });
    });
  });

  describe('rewriteSrcset()', function () {
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
            assert.strictEqual(utils.rewriteSrcset(input, rewriter), expected);
            continue;
          }

          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',');
          assert.strictEqual(utils.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = testCase.map(p => space + [`<${p[0]}>`].concat(p.slice(1)).join(space) + space).join(',');
          assert.strictEqual(utils.rewriteSrcset(input, rewriter), expected);
        }

        // non-ASCII-whitespaces should be ignored (treated as part of the URL)
        for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(utils.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(utils.rewriteSrcset(input, rewriter), expected);
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
            assert.strictEqual(await utils.rewriteSrcset(input, rewriter), expected);
            continue;
          }

          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',');
          assert.strictEqual(await utils.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = testCase.map(p => space + [`<${p[0]}>`].concat(p.slice(1)).join(space) + space).join(',');
          assert.strictEqual(await utils.rewriteSrcset(input, rewriter), expected);
        }

        // non-ASCII-whitespaces should be ignored (treated as part of the URL)
        for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(await utils.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = `<${input}>`;
          assert.strictEqual(await utils.rewriteSrcset(input, rewriter), expected);
        }
      }
    });
  });

  describe('rewriteUrls()', function () {
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
        assert.strictEqual(utils.rewriteUrls(input, rewriter), expected);
      }

      // non-ASCII-whitespaces should be ignored (treated as part of the URL)
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        const input = urls.join(space);
        const expected = `<${input}>`;
        assert.strictEqual(utils.rewriteUrls(input, rewriter), expected);
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
        assert.strictEqual(await utils.rewriteUrls(input, rewriter), expected);
      }

      // non-ASCII-whitespaces should be ignored (treated as part of the URL)
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        const input = urls.join(space);
        const expected = `<${input}>`;
        assert.strictEqual(await utils.rewriteUrls(input, rewriter), expected);
      }
    });
  });

  $describe.skipIf($.noBrowser)('getOffsetInSource()', function () {
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

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[0], 0), 9);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[0], 1), 10);

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[1], 0), 24);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[1], 1), 32);

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[2], 0), 36);

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3], 0), 40);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3].childNodes[0], 0), 40);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3].childNodes[0], 3), 43);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3], 1), 43);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3].childNodes[1], 0), 51);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3].childNodes[1], 1), 57);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3], 2), 66);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3].childNodes[2], 0), 66);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3].childNodes[2], 6), 72);
      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[3], 3), 72);

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[4], 0), 76);

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[5], 0), 81);

      assert.strictEqual(utils.getOffsetInSource(section, section.childNodes[6], 0), 98);
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
      var idx = utils.getOffsetInSource(section, section.childNodes[1], 0);
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
      var idx = utils.getOffsetInSource(section, section.childNodes[1], 0);
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
      var idx = utils.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `title="<s>title &amp; name</s>"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title="<s>title & name</s>">My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = utils.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `title="&quot;123&quot;"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title="&quot;123&quot;">My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = utils.getOffsetInSource(section, section.childNodes[1], 0);
      assert.strictEqual(section.outerHTML.slice(idx, idx + 8), 'My Title');

      // treated as `title="&quot;123&quot;"`
      var sample = document.createElement('template');
      sample.innerHTML = `
<section>
<p title='"123"'>My Title</p>
</section>
`;
      var section = sample.content.querySelector('section');
      var idx = utils.getOffsetInSource(section, section.childNodes[1], 0);
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
        utils.getOffsetInSource(section.querySelector('p'), section.querySelector('p strong'), 0);
      });
    });
  });
});
