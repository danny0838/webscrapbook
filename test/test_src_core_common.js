(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./t/common'),
      require('./shared/core/common'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './t/common', './shared/core/common'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.utils,
      global.scrapbook,
    );
  }
}(this, function (unittest, utils, scrapbook) {

'use strict';

const {MochaQuery: $, assert, assertEqual, assertThrows, encodeText, cssRegex} = unittest;
const $describe = $(describe);
const $it = $(it);
const {userAgent} = utils;

const r = String.raw;

describe('core/common.js', function () {

  describe('scrapbook.escapeFilename', function () {

    it('basic', function () {
      // escape " ", "%", "?", "#"
      assertEqual(
        scrapbook.escapeFilename('path 100% with space? and #frag'),
        'path%20100%25%20with%20space?%20and%20%23frag',
      );

      // convert "\" to "/"
      assertEqual(
        scrapbook.escapeFilename(r`this\is\my\path`),
        'this/is/my/path',
      );

      // keep non-ASCII chars
      assertEqual(
        scrapbook.escapeFilename('http://example.com/中文/路徑/文件.txt'),
        'http://example.com/中文/路徑/文件.txt',
      );

      // keep special chars
      assertEqual(
        scrapbook.escapeFilename("!\"$&'()*+,-./:;<=>?@[]^_`{|}~"),
        "!\"$&'()*+,-./:;<=>?@[]^_`{|}~",
      );
    });

  });

  describe('scrapbook.quote', function () {

    it('basic', function () {
      assertEqual(
        scrapbook.quote('中文/路徑/文件.txt'),
        '%E4%B8%AD%E6%96%87/%E8%B7%AF%E5%BE%91/%E6%96%87%E4%BB%B6.txt',
      );
    });

  });

  describe('scrapbook.validateFilename', function () {
    const chars = Array.from({length: 0xA0}).map((_, i) => String.fromCodePoint(i)).join('');

    it('basic', function () {
      // general chars
      assertEqual(
        scrapbook.validateFilename(chars),
        "!_#$%&'()_+,-._0123456789_;_=__@ABCDEFGHIJKLMNOPQRSTUVWXYZ[_]^_`abcdefghijklmnopqrstuvwxyz{_}_",
      );

      // prevent empty
      assertEqual(
        scrapbook.validateFilename(''),
        '_',
      );

      // "~" not allowed by downloads.download() in Chromium
      assertEqual(
        scrapbook.validateFilename('~filename'),
        '_filename',
      );

      // [\xA0\u2000-\u200A\u202F\u205F]: spaces not allowed by downloads.download() in Firefox
      assertEqual(
        scrapbook.validateFilename('file\xA0\u202F\u205Fname'),
        'file___name',
      );
      for (let i = 0x2000, I = 0x200A; i <= I; i++) {
        assertEqual(
          scrapbook.validateFilename(`my${String.fromCodePoint(i)}file`),
          'my_file',
        );
      }

      // keep Unicode chars
      assertEqual(
        scrapbook.validateFilename('中文𠀀'),
        '中文𠀀',
      );
    });

    it("Windows restricts leading/trailing spaces and dots", function () {
      assertEqual(
        scrapbook.validateFilename(' '),
        '_',
      );
      assertEqual(
        scrapbook.validateFilename('  '),
        '_',
      );
      assertEqual(
        scrapbook.validateFilename('  wsb  '),
        'wsb',
      );

      assertEqual(
        scrapbook.validateFilename('.'),
        '_',
      );
      assertEqual(
        scrapbook.validateFilename('..'),
        '_',
      );

      assertEqual(
        scrapbook.validateFilename('.wsb'),
        '_.wsb',
      );
      assertEqual(
        scrapbook.validateFilename('..wsb'),
        '_..wsb',
      );
      assertEqual(
        scrapbook.validateFilename('  ..wsb'),
        '_..wsb',
      );
      assertEqual(
        scrapbook.validateFilename('foo.'),
        'foo',
      );
      assertEqual(
        scrapbook.validateFilename('foo..  '),
        'foo',
      );
    });

    it('Windows special filenames', function () {
      assertEqual(
        scrapbook.validateFilename('con'),
        'con_',
      );
      assertEqual(
        scrapbook.validateFilename('prn'),
        'prn_',
      );
      assertEqual(
        scrapbook.validateFilename('aux'),
        'aux_',
      );
      assertEqual(
        scrapbook.validateFilename('com0'),
        'com0_',
      );
      assertEqual(
        scrapbook.validateFilename('com9'),
        'com9_',
      );
      assertEqual(
        scrapbook.validateFilename('lpt0'),
        'lpt0_',
      );
      assertEqual(
        scrapbook.validateFilename('lpt9'),
        'lpt9_',
      );
      assertEqual(
        scrapbook.validateFilename('con.txt'),
        'con_.txt',
      );
      assertEqual(
        scrapbook.validateFilename('prn.txt'),
        'prn_.txt',
      );
      assertEqual(
        scrapbook.validateFilename('aux.txt'),
        'aux_.txt',
      );
      assertEqual(
        scrapbook.validateFilename('com0.txt'),
        'com0_.txt',
      );
      assertEqual(
        scrapbook.validateFilename('com9.txt'),
        'com9_.txt',
      );
      assertEqual(
        scrapbook.validateFilename('lpt0.txt'),
        'lpt0_.txt',
      );
      assertEqual(
        scrapbook.validateFilename('lpt9.txt'),
        'lpt9_.txt',
      );
    });

    it('force ASCII', function () {
      // general chars
      assertEqual(
        scrapbook.validateFilename(chars, true),
        "!_#$%&'()_+,-._0123456789_;_=__@ABCDEFGHIJKLMNOPQRSTUVWXYZ[_]^_`abcdefghijklmnopqrstuvwxyz{_}_",
      );

      // escape Unicode chars
      assertEqual(
        scrapbook.validateFilename('中文𠀀', true),
        '%E4%B8%AD%E6%96%87%F0%A0%80%80',
      );
    });

  });

  describe('scrapbook.dateToId', function () {

    it('basic', function () {
      // create an ID from a Date object
      assertEqual(
        scrapbook.dateToId(new Date(Date.UTC(2020, 0, 2, 3, 4, 5, 67))),
        '20200102030405067',
      );

      // create an ID from now if no Date object is provided
      var idNow = scrapbook.dateToId(new Date());
      var id = scrapbook.dateToId();
      assert(parseInt(id, 10) - parseInt(idNow, 10) < 1000);
    });

    it('round to nearest if date is too large or too small', function () {
      assertEqual(
        scrapbook.dateToId(new Date(Date.UTC(10000, 0, 1, 0, 0, 0, 0))),
        '99991231235959999',
      );
      assertEqual(
        scrapbook.dateToId(new Date(Date.UTC(-1, 0, 1, 0, 0, 0, 0))),
        '00000101000000000',
      );
    });

  });

  describe('scrapbook.idToDate', function () {

    it('basic', function () {
      assertEqual(
        scrapbook.idToDate('20200102030405067'),
        "2020-01-02T03:04:05.067Z",
      );
    });

    it('return null for invalid ID string', function () {
      assertEqual(
        scrapbook.idToDate('2020010203040506'),
        null,
      );
      assertEqual(
        scrapbook.idToDate('wtf'),
        null,
      );
      assertEqual(
        scrapbook.idToDate(''),
        null,
      );
    });

    it('round to nearest if date is too large or too small', function () {
      assertEqual(
        scrapbook.idToDate('9'.repeat(17)),
        "9999-12-31T23:59:59.999Z",
      );
      assertEqual(
        scrapbook.idToDate('0'.repeat(17)),
        "0000-01-01T00:00:00.000Z",
      );
    });

  });

  describe('scrapbook.dateToIdOld', function () {

    it('basic', function () {
      // create an ID from a Date object
      assertEqual(
        scrapbook.dateToIdOld(new Date(2020, 0, 2, 3, 4, 5, 67)),
        '20200102030405',
      );

      // create an ID from now if no Date object is provided
      var idNow = scrapbook.dateToIdOld(new Date());
      var id = scrapbook.dateToIdOld();
      assert(parseInt(id, 10) - parseInt(idNow, 10) < 1000);
    });

    it('round to nearest if date is too large or too small', function () {
      assertEqual(
        scrapbook.dateToIdOld(new Date(10000, 0, 1, 0, 0, 0, 0)),
        '99991231235959',
      );
      assertEqual(
        scrapbook.dateToIdOld(new Date(-1, 0, 1, 0, 0, 0, 0)),
        '00000101000000',
      );
    });

  });

  describe('scrapbook.idToDateOld', function () {

    it('basic', function () {
      assertEqual(
        scrapbook.idToDateOld('20200102030405').valueOf(),
        new Date(2020, 0, 2, 3, 4, 5).valueOf(),
      );
    });

    it('return null for invalid ID string', function () {
      assertEqual(
        scrapbook.idToDateOld('202001020304050'),
        null,
      );
      assertEqual(
        scrapbook.idToDateOld('wtf'),
        null,
      );
      assertEqual(
        scrapbook.idToDateOld(''),
        null,
      );
    });

    it('round to nearest if date is too large or too small', function () {
      assertEqual(
        scrapbook.idToDateOld('9'.repeat(14)).valueOf(),
        new Date(9999, 11, 31, 23, 59, 59, 999).valueOf(),
      );

      var date = new Date(0, 0, 1, 0, 0, 0);
      date.setFullYear(0);
      assertEqual(
        scrapbook.idToDateOld('0'.repeat(14)).valueOf(),
        date.valueOf(),
      );
    });

  });

  describe('scrapbook.crop', function () {

    it('charLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // incomplete char should not appear
      assertEqual(scrapbook.crop(string, 14), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, 13), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, 12), 'foo bar 中...');
      assertEqual(scrapbook.crop(string, 11), 'foo bar ...');
      assertEqual(scrapbook.crop(string, 10), 'foo bar...');
      assertEqual(scrapbook.crop(string, 9), 'foo ba...');
      assertEqual(scrapbook.crop(string, 3), '...');
      assertEqual(scrapbook.crop(string, 2), '...');
      assertEqual(scrapbook.crop(string, 1), '...');

      // falsy value means no crop
      assertEqual(scrapbook.crop(string, 0), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, null), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string), 'foo bar 中文𠀀字');
    });

    it('byteLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // incomplete char should not appear
      assertEqual(scrapbook.crop(string, 0, 22), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, 0, 21), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, 0, 20), 'foo bar 中文...');
      assertEqual(scrapbook.crop(string, 0, 19), 'foo bar 中文...');
      assertEqual(scrapbook.crop(string, 0, 18), 'foo bar 中文...');
      assertEqual(scrapbook.crop(string, 0, 17), 'foo bar 中文...');
      assertEqual(scrapbook.crop(string, 0, 16), 'foo bar 中...');
      assertEqual(scrapbook.crop(string, 0, 15), 'foo bar 中...');
      assertEqual(scrapbook.crop(string, 0, 14), 'foo bar 中...');
      assertEqual(scrapbook.crop(string, 0, 13), 'foo bar ...');
      assertEqual(scrapbook.crop(string, 0, 12), 'foo bar ...');
      assertEqual(scrapbook.crop(string, 0, 11), 'foo bar ...');
      assertEqual(scrapbook.crop(string, 0, 10), 'foo bar...');
      assertEqual(scrapbook.crop(string, 0, 4), 'f...');
      assertEqual(scrapbook.crop(string, 0, 3), '...');
      assertEqual(scrapbook.crop(string, 0, 2), '...');
      assertEqual(scrapbook.crop(string, 0, 1), '...');

      // falsy value means no crop
      assertEqual(scrapbook.crop(string, 0, 0), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, 0, null), 'foo bar 中文𠀀字');
      assertEqual(scrapbook.crop(string, 0), 'foo bar 中文𠀀字');
    });

    it('charLimit and sizeLimit', function () {
      var string = 'foo bar 中文𠀀字';

      // crop at the smaller limit
      assertEqual(scrapbook.crop(string, 13, 19), 'foo bar 中文...');
      assertEqual(scrapbook.crop(string, 12, 21), 'foo bar 中...');
    });

    it('custom ellipsis', function () {
      var string = 'foo bar 中文𠀀字';

      assertEqual(scrapbook.crop(string, 12, null, '…'), 'foo bar 中文…');
      assertEqual(scrapbook.crop(string, 11, null, '…'), 'foo bar 中文…');
      assertEqual(scrapbook.crop(string, 10, null, '…'), 'foo bar 中…');
      assertEqual(scrapbook.crop(string, 2, null, '…'), 'f…');
      assertEqual(scrapbook.crop(string, 1, null, '…'), '…');

      assertEqual(scrapbook.crop(string, 12, null, ''), 'foo bar 中文𠀀');
      assertEqual(scrapbook.crop(string, 11, null, ''), 'foo bar 中文');
      assertEqual(scrapbook.crop(string, 10, null, ''), 'foo bar 中文');
      assertEqual(scrapbook.crop(string, 2, null, ''), 'fo');
      assertEqual(scrapbook.crop(string, 1, null, ''), 'f');
    });

  });

  describe('scrapbook.unicodeToUtf8', function () {

    it('basic', function () {
      assertEqual(scrapbook.unicodeToUtf8('\u0000'), '\x00');
      assertEqual(scrapbook.unicodeToUtf8('\u0080'), '\xC2\x80');
      assertEqual(scrapbook.unicodeToUtf8('\u3000'), '\xE3\x80\x80');
      assertEqual(scrapbook.unicodeToUtf8('\uD840\uDC00'), '\xF0\xA0\x80\x80');
      assertEqual(scrapbook.unicodeToUtf8('\u{20000}'), '\xF0\xA0\x80\x80');
      assertEqual(scrapbook.unicodeToUtf8('\u{10FFFF}'), '\xF4\x8F\xBF\xBF');
    });

  });

  describe('scrapbook.utf8ToUnicode', function () {

    it('basic', function () {
      assertEqual(scrapbook.utf8ToUnicode('\x00'), '\u0000');
      assertEqual(scrapbook.utf8ToUnicode('\xC2\x80'), '\u0080');
      assertEqual(scrapbook.utf8ToUnicode('\xE3\x80\x80'), '\u3000');
      assertEqual(scrapbook.utf8ToUnicode('\xF0\xA0\x80\x80'), '\uD840\uDC00');
      assertEqual(scrapbook.utf8ToUnicode('\xF0\xA0\x80\x80'), '\u{20000}');
      assertEqual(scrapbook.utf8ToUnicode('\xF4\x8F\xBF\xBF'), '\u{10FFFF}');
    });

  });

  describe('scrapbook.byteStringToArrayBuffer', function () {

    it('basic', function () {
      // "一天" in Big5
      var buffer = scrapbook.byteStringToArrayBuffer('\xA4\x40\xA4\xD1');
      assertEqual(Array.from(new Uint8Array(buffer)), [0xA4, 0x40, 0xA4, 0xD1]);

      // "𠀀" in UTF-8 with BOM
      var buffer = scrapbook.byteStringToArrayBuffer('\xEF\xBB\xBF\xF0\xA0\x80\x80');
      assertEqual(Array.from(new Uint8Array(buffer)), [0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80]);

      // "𠀀" in UTF-16BE with BOM
      var buffer = scrapbook.byteStringToArrayBuffer('\xFE\xFF\xD8\x40\xDC\x00');
      assertEqual(Array.from(new Uint8Array(buffer)), [0xFE, 0xFF, 0xD8, 0x40, 0xDC, 0x00]);

      // "𠀀" in UTF-16LE with BOM
      var buffer = scrapbook.byteStringToArrayBuffer('\xFF\xFE\x40\xD8\x00\xDC');
      assertEqual(Array.from(new Uint8Array(buffer)), [0xFF, 0xFE, 0x40, 0xD8, 0x00, 0xDC]);
    });

  });

  describe('scrapbook.arrayBufferToByteString', function () {

    it('basic', function () {
      // "一天" in Big5
      var buffer = new Uint8Array([0xA4, 0x40, 0xA4, 0xD1]);
      assertEqual(scrapbook.arrayBufferToByteString(buffer), '\xA4\x40\xA4\xD1');

      // "𠀀" in UTF-8 with BOM
      var buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0xF0, 0xA0, 0x80, 0x80]);
      assertEqual(scrapbook.arrayBufferToByteString(buffer), '\xEF\xBB\xBF\xF0\xA0\x80\x80');

      // "𠀀" in UTF-16BE with BOM
      var buffer = new Uint8Array([0xFE, 0xFF, 0xD8, 0x40, 0xDC, 0x00]);
      assertEqual(scrapbook.arrayBufferToByteString(buffer), '\xFE\xFF\xD8\x40\xDC\x00');

      // "𠀀" in UTF-16LE with BOM
      var buffer = new Uint8Array([0xFF, 0xFE, 0x40, 0xD8, 0x00, 0xDC]);
      assertEqual(scrapbook.arrayBufferToByteString(buffer), '\xFF\xFE\x40\xD8\x00\xDC');
    });

  });

  describe('scrapbook.trim', function () {

    it('basic', function () {
      var strings = ['foo', 'bar', 'baz'];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f']) {
        assertEqual(scrapbook.trim(space + strings.join(space)), strings.join(space));
        assertEqual(scrapbook.trim(strings.join(space) + space), strings.join(space));
        assertEqual(scrapbook.trim(space + strings.join(space) + space), strings.join(space));
        assertEqual(scrapbook.trim(space.repeat(3) + strings.join(space) + space.repeat(3)), strings.join(space));
      }

      // non-ASCII-whitespaces should be ignored
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        var s = space + strings.join(space);
        assertEqual(scrapbook.trim(s), s);

        var s = strings.join(space) + space;
        assertEqual(scrapbook.trim(s), s);

        var s = space + strings.join(space) + space;
        assertEqual(scrapbook.trim(s), s);
      }
    });

  });

  describe('scrapbook.split', function () {

    it('basic', function () {
      var strings = ['foo', 'bar', 'baz'];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f']) {
        assertEqual(scrapbook.split(strings.join(space)), strings);
      }

      // mixed ASCII white spaces
      assertEqual(scrapbook.split(strings.join(' \t\r\n\f')), strings);

      // non-ASCII-whitespaces should be ignored
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        assertEqual(scrapbook.split(strings.join(space)), [strings.join(space)]);
      }
    });

    it('discard empty starting or ending components', function () {
      // starting space
      assertEqual(scrapbook.split(' foo'), ['foo']);

      // ending space
      assertEqual(scrapbook.split('foo '), ['foo']);
    });

  });

  describe('scrapbook.normalizeUrl', function () {

    it('encode chars that requires percent encoding with all upper case', function () {
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/中文`),
        `http://example.com/%E4%B8%AD%E6%96%87`,
      );
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/%e4%b8%ad%e6%96%87`),
        `http://example.com/%E4%B8%AD%E6%96%87`,
      );
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/#中文`),
        `http://example.com/#%E4%B8%AD%E6%96%87`,
      );
    });

    it('encode standalone "%"s', function () {
      // standalone % => %25
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/?123%`),
        `http://example.com/?123%25`,
      );

      // don't touch normal %-encoding
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/?123%20456`),
        `http://example.com/?123%20456`,
      );
    });

    it('decode over-encoded chars, such as [0-9a-z:!()+,;=], in pathname', function () {
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/%70%61%67%65%3d%28%33%29`),
        `http://example.com/page=(3)`,
      );
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/%3a%21%28%29%2b%2c%3b%3d`),
        `http://example.com/:!()+,;=`,
      );
    });

    it('decode unreserved chars [0-9A-Za-z\-_.~] in search and hash', function () {
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/?%70%61%67%65%2d%33=(5)`),
        `http://example.com/?page-3=(5)`,
      );
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/?p=%2d%5f%2e%7e`),
        `http://example.com/?p=-_.~`,
      );

      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/#%70%61%67%65%2d%33=(5)`),
        `http://example.com/#page-3=(5)`,
      );
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/#p=%2d%5f%2e%7e`),
        `http://example.com/#p=-_.~`,
      );
    });

    it('empty search/hash is normalized as none', function () {
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/?`),
        `http://example.com/`,
      );
      assertEqual(
        scrapbook.normalizeUrl(`http://example.com/#`),
        `http://example.com/`,
      );
    });

  });

  describe('scrapbook.isUrlAbsolute', function () {

    it('basic', function () {
      // absolute URL cases
      assertEqual(scrapbook.isUrlAbsolute(`http://example.com:8000/foo?bar=baz#frag`), true);
      assertEqual(scrapbook.isUrlAbsolute(`https://example.com/`), true);
      assertEqual(scrapbook.isUrlAbsolute(`file:///c/foo/bar`), true);
      assertEqual(scrapbook.isUrlAbsolute(`about:blank`), true);

      // relative URL cases
      assertEqual(scrapbook.isUrlAbsolute(`image.png`), false);
      assertEqual(scrapbook.isUrlAbsolute(`中文.png`), false);
      assertEqual(scrapbook.isUrlAbsolute(`/image.png`), false);
      assertEqual(scrapbook.isUrlAbsolute(`//example.com/page`), false);
    });

    it('do not throw for non-string', function () {
      assertEqual(scrapbook.isUrlAbsolute(undefined), false);
      assertEqual(scrapbook.isUrlAbsolute(null), false);
    });

  });

  describe('scrapbook.getRelativeUrl', function () {

    it('absolute URLs', function () {
      // different since protocol
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `https://example.com/ref`,
        ),
        `http://example.com/page`,
      );

      // different since host
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://sub.example.com/page`,
          `http://example.com/ref`,
        ),
        `//sub.example.com/page`,
      );

      // different since path
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/ref`,
        ),
        `page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/ref`,
        ),
        `page/`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/ref/`,
        ),
        `../page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/ref/`,
        ),
        `../page/`,
      );

      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/sub/ref`,
        ),
        `../page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/sub/ref`,
        ),
        `../page/`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/sub/ref/`,
        ),
        `../../page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page/`,
          `http://example.com/sub/ref/`,
        ),
        `../../page/`,
      );

      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page`,
          `http://example.com/ref`,
        ),
        `sub/page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page/`,
          `http://example.com/ref`,
        ),
        `sub/page/`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page`,
          `http://example.com/ref/`,
        ),
        `../sub/page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/sub/page/`,
          `http://example.com/ref/`,
        ),
        `../sub/page/`,
      );

      // different since search
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page`,
        ),
        `?foo=bar#abc`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/page?foo=bar#abc`,
        ),
        ``,
      );

      // different since hash
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page?foo=bar`,
        ),
        `#abc`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `http://example.com/page#frag`,
        ),
        ``,
      );

      // no difference
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page?foo=bar#abc`,
          `http://example.com/page?foo=bar#abc`,
        ),
        ``,
      );
    });

    it('return original URL if input is absolute and base is relative', function () {
      assertEqual(
        scrapbook.getRelativeUrl(
          `http://example.com/page`,
          `image.png`,
        ),
        `http://example.com/page`,
      );
    });

    it('throw if input is realative and base is absolute', function () {
      assertThrows(() => {
        scrapbook.getRelativeUrl(
          `image.png`,
          `http://example.com/page`,
        );
      });
    });

    it('protocol-relative URLs', function () {
      // different since host
      assertEqual(
        scrapbook.getRelativeUrl(
          `//sub.example.com/page`,
          `//example.com/ref`,
        ),
        `//sub.example.com/page`,
      );

      // different since path
      assertEqual(
        scrapbook.getRelativeUrl(
          `//example.com/page`,
          `//example.com/ref`,
        ),
        `page`,
      );
    });

    it('return original URL if input is protocol-relative and base is not', function () {
      assertEqual(
        scrapbook.getRelativeUrl(
          `//sub.example.com/page`,
          `/ref`,
        ),
        `//sub.example.com/page`,
      );
    });

    it('throw if base is protocol-relative and input is not', function () {
      assertThrows(() => {
        scrapbook.getRelativeUrl(
          `/page`,
          `//example.com/ref`,
        );
      });

      assertThrows(() => {
        scrapbook.getRelativeUrl(
          `page`,
          `//example.com/ref`,
        );
      });
    });

    it('root-relative URLs', function () {
      // different since path
      assertEqual(
        scrapbook.getRelativeUrl(
          `/page`,
          `/ref`,
        ),
        `page`,
      );
    });

    it('return original URL if input is root-relative and base is not', function () {
      assertEqual(
        scrapbook.getRelativeUrl(
          `/page`,
          `ref`,
        ),
        `/page`,
      );
    });

    it('throw if base is root-relative and input is not', function () {
      var error = (() => {
        try {
          scrapbook.getRelativeUrl(
            `page`,
            `/ref`,
          );
        } catch (ex) {
          return ex;
        }
      })();
      assert(error);
    });

    it('relative URLs (since path)', function () {
      // different since path
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/ref`,
        ),
        `page/`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/ref/`,
        ),
        `../page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/ref/`,
        ),
        `../page/`,
      );

      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/sub/ref`,
        ),
        `../page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/sub/ref`,
        ),
        `../page/`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/sub/ref/`,
        ),
        `../../page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page/`,
          `myroot/sub/ref/`,
        ),
        `../../page/`,
      );

      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page`,
          `myroot/ref`,
        ),
        `sub/page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page/`,
          `myroot/ref`,
        ),
        `sub/page/`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page`,
          `myroot/ref/`,
        ),
        `../sub/page`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/sub/page/`,
          `myroot/ref/`,
        ),
        `../sub/page/`,
      );

      // different since search
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page`,
        ),
        `?foo=bar#abc`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/page?foo=bar#abc`,
        ),
        ``,
      );

      // different since hash
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page?foo=bar`,
        ),
        `#abc`,
      );
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/page#frag`,
        ),
        ``,
      );

      // no difference
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#abc`,
          `myroot/page?foo=bar#abc`,
        ),
        ``,
      );
    });

    it('relative URLs (missing path or so)', function () {
      // path and no path
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page?foo=bar#frag`,
          `?foo1=bar1#frag1`,
        ),
        `myroot/page?foo=bar#frag`,
      );

      // no path and path
      assertEqual(
        scrapbook.getRelativeUrl(
          `?foo=bar#frag`,
          `ref`,
        ),
        `?foo=bar#frag`,
      );

      // search and no search
      assertEqual(
        scrapbook.getRelativeUrl(
          `?foo=bar#frag`,
          `#frag1`,
        ),
        `?foo=bar#frag`,
      );

      // no search and search
      assertEqual(
        scrapbook.getRelativeUrl(
          `#frag`,
          `?foo1=bar1#frag1`,
        ),
        `#frag`,
      );

      // hash and no hash
      assertEqual(
        scrapbook.getRelativeUrl(
          `#frag`,
          ``,
        ),
        `#frag`,
      );

      // no hash and hash
      assertEqual(
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
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html`),
        {type: "text/html", parameters: {}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`image/svg+xml`),
        {type: "image/svg+xml", parameters: {}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`image/vnd.microsoft.icon`),
        {type: "image/vnd.microsoft.icon", parameters: {}},
      );
    });

    it('invalid type', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`noslash`),
        {type: "", parameters: {}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`text/bad?token`),
        {type: "text/bad", parameters: {}},
      );
    });

    it('parameters', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html;charset=utf-8`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset=utf-8; param1=value1; param2=value2`),
        {type: "text/html", parameters: {charset: "utf-8", param1: "value1", param2: "value2"}},
      );
    });

    it('spaces around type and parameter should be ignored', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html  ; charset=utf-8  `),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
    });

    it('spaces around "=" are not allowed by the spec', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset =utf-8`),
        {type: "text/html", parameters: {}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset= utf-8`),
        {type: "text/html", parameters: {charset: ""}},
      );
    });

    it('quotes and escapes', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset="utf-8"`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(r`text/html; field=" my text\\value with \"quote\" "`),
        {type: "text/html", parameters: {field: r` my text\value with "quote" `}},
      );

      // "'" not treated as a quote
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset='utf-8'`),
        {type: "text/html", parameters: {charset: "'utf-8'"}},
      );
    });

    it('type should be case-insensitive (lower case)', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`TEXT/HTML`),
        {type: "text/html", parameters: {}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`Text/Html`),
        {type: "text/html", parameters: {}},
      );
    });

    it('parameter name should be case-insensitive (lower case)', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; CHARSET=utf-8; MyKey=myvalue`),
        {type: "text/html", parameters: {charset: "utf-8", mykey: "myvalue"}},
      );
    });

    it('duplicated parameters are invalid (ignored)', function () {
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset=utf-8; charset=big5`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentType(`text/html; charset=utf-8; CHARSET=big5`),
        {type: "text/html", parameters: {charset: "utf-8"}},
      );
    });
  });

  describe('scrapbook.parseHeaderContentDisposition', function () {

    it('basic', function () {
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=file.html`),
        {type: "inline", parameters: {filename: "file.html"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`unknown; filename=file.html`),
        {type: "unknown", parameters: {filename: "file.html"}},
      );
    });

    it('spaces between parameters and between parname and value should be ignored', function () {
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`attachment;filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline  ; filename  =  file.html `),
        {type: "inline", parameters: {filename: "file.html"}},
      );
    });

    it('quotes and escapes', function () {
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=" my file.jpg "`),
        {type: "inline", parameters: {filename: " my file.jpg "}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(r`inline; filename="my text\\image \"file\".jpg"`),
        {type: "inline", parameters: {filename: r`my text\image "file".jpg`}},
      );
    });

    it('ext-value as parname*', function () {
      // filename*
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename="US-$ rates"; filename*=iso-8859-1'en'%A3%20rates.bmp`),
        {type: "inline", parameters: {filename: "£ rates.bmp"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''a%E4%B8%ADb%23c.php`),
        {type: "inline", parameters: {filename: "a中b#c.php"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''%22I%20love%20you%22.html`),
        {type: "inline", parameters: {filename: `"I love you".html`}},
      );

      // ignore unsupported encoding
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=big5''a%E4%B8%ADb%23c.php`),
        {type: "inline", parameters: {}},
      );

      // ignore invalid UTF-8 sequence
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''%EB%EE%EC.txt`),
        {type: "inline", parameters: {}},
      );

      // filename* has higher priority than filename regardless of order
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=_.bmp; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp`),
        {type: "inline", parameters: {filename: "中文𠀀.bmp"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp; filename=_.bmp`),
        {type: "inline", parameters: {filename: "中文𠀀.bmp"}},
      );
    });

    it('type should be case-insensitive (lower case)', function () {
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`ATTACHMENT; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assertEqual(
        scrapbook.parseHeaderContentDisposition(`AttachMent; filename=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );
    });

    it('parameter name should be case-insensitive (lower case)', function () {
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; FILENAME=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assertEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; FileName=file.html`),
        {type: "attachment", parameters: {filename: "file.html"}},
      );

      assertEqual(
        scrapbook.parseHeaderContentDisposition(`inline; filename=file.bmp; Size=84`),
        {type: "inline", parameters: {filename: "file.bmp", size: "84"}},
      );
    });

    it('duplicated parameters are invalid (ignored)', function () {
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; filename=file.html; filename=file2.html; size=3; size=5`),
        {type: "attachment", parameters: {filename: "file.html", size: "3"}},
      );
      assertEqual(
        scrapbook.parseHeaderContentDisposition(`attachment; filename=file.html; FILENAME=file2.html; size=3; Size=5`),
        {type: "attachment", parameters: {filename: "file.html", size: "3"}},
      );
    });

  });

  describe('scrapbook.parseHeaderRefresh', function () {

    it('basic', function () {
      assertEqual(scrapbook.parseHeaderRefresh(``), {});
      assertEqual(scrapbook.parseHeaderRefresh(` `), {});
      assertEqual(scrapbook.parseHeaderRefresh(` ;`), {});
      assertEqual(scrapbook.parseHeaderRefresh(` ,`), {});

      assertEqual(scrapbook.parseHeaderRefresh(`referred.html`), {});
      assertEqual(scrapbook.parseHeaderRefresh(`url=referred.html`), {});
      assertEqual(scrapbook.parseHeaderRefresh(`;url=referred.html`), {});

      assertEqual(scrapbook.parseHeaderRefresh(`9`), {time: 9, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`0`), {time: 0, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`3.5.1`), {time: 3, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`-1`), {});
      assertEqual(scrapbook.parseHeaderRefresh(`+1`), {});
      assertEqual(scrapbook.parseHeaderRefresh(`.123.456`), {time: 0, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`.123.456.`), {time: 0, url: ``});

      assertEqual(scrapbook.parseHeaderRefresh(`9 `), {time: 9, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`9;`), {time: 9, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`9,`), {time: 9, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`9 ; `), {time: 9, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`9 , `), {time: 9, url: ``});

      assertEqual(scrapbook.parseHeaderRefresh(`1 referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1;referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1,referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 ; referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 , referred.html`), {time: 1, url: `referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`-1 referred.html`), {});
      assertEqual(scrapbook.parseHeaderRefresh(`+1 referred.html`), {});
      assertEqual(scrapbook.parseHeaderRefresh(`. referred.html`), {time: 0, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`.123.456 referred.html`), {time: 0, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`.123.456. referred.html`), {time: 0, url: `referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`1:referred.html`), {time: 1, url: ``});
      assertEqual(scrapbook.parseHeaderRefresh(`1 u=referred.html`), {time: 1, url: `u=referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 u = referred.html`), {time: 1, url: `u = referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 url referred.html`), {time: 1, url: `url referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`1 url=referred.html`), {time: 1, url: `referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`1 "referred.html"`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 'referred.html'`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 "referred.html 123`), {time: 1, url: `referred.html 123`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 "referred.html'123`), {time: 1, url: `referred.html'123`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 "referred.html"123`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 'referred.html"123'`), {time: 1, url: `referred.html"123`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 'referred.html'123`), {time: 1, url: `referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`1 url="referred.html"`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 url='referred.html'`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 url="referred.html `), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 url="referred.html'123`), {time: 1, url: `referred.html'123`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 url='referred.html"123'`), {time: 1, url: `referred.html"123`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 url='referred.html'123`), {time: 1, url: `referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`1; URL=referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1, URL=referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 ; URL = referred.html`), {time: 1, url: `referred.html`});
      assertEqual(scrapbook.parseHeaderRefresh(`1 , URL = referred.html`), {time: 1, url: `referred.html`});

      assertEqual(scrapbook.parseHeaderRefresh(`1; uRl=referred.html`), {time: 1, url: `referred.html`});
    });

  });

  describe('scrapbook.mimeIsText', function () {

    it('basic', function () {
      // text/*
      assertEqual(scrapbook.mimeIsText('text/plain'), true);
      assertEqual(scrapbook.mimeIsText('text/html'), true);
      assertEqual(scrapbook.mimeIsText('text/css'), true);
      assertEqual(scrapbook.mimeIsText('text/javascript'), true);

      // +xml
      assertEqual(scrapbook.mimeIsText('application/xhtml+xml'), true);
      assertEqual(scrapbook.mimeIsText('text/svg+xml'), true);
      assertEqual(scrapbook.mimeIsText('application/rdf+xml'), true);
      assertEqual(scrapbook.mimeIsText('application/xslt+xml'), true);

      // +json
      assertEqual(scrapbook.mimeIsText('application/ld+json'), true);

      // special text
      assertEqual(scrapbook.mimeIsText('application/javascript'), true);
      assertEqual(scrapbook.mimeIsText('application/ecmascript'), true);
      assertEqual(scrapbook.mimeIsText('application/json'), true);
      assertEqual(scrapbook.mimeIsText('application/xml'), true);
      assertEqual(scrapbook.mimeIsText('application/sql'), true);

      // +zip are not text
      assertEqual(scrapbook.mimeIsText('application/epub+zip'), false);

      // others are not text
      assertEqual(scrapbook.mimeIsText('image/bmp'), false);
      assertEqual(scrapbook.mimeIsText('image/jpeg'), false);
      assertEqual(scrapbook.mimeIsText('image/gif'), false);
      assertEqual(scrapbook.mimeIsText('image/png'), false);
      assertEqual(scrapbook.mimeIsText('image/webp'), false);
      assertEqual(scrapbook.mimeIsText('image/vnd.microsoft.icon'), false);
      assertEqual(scrapbook.mimeIsText('image/x-icon'), false);
      assertEqual(scrapbook.mimeIsText('audio/mpeg'), false);
      assertEqual(scrapbook.mimeIsText('video/mp4'), false);
      assertEqual(scrapbook.mimeIsText('font/ttf'), false);
      assertEqual(scrapbook.mimeIsText('font/woff'), false);
      assertEqual(scrapbook.mimeIsText('application/zip'), false);
      assertEqual(scrapbook.mimeIsText('application/pdf'), false);
      assertEqual(scrapbook.mimeIsText('application/octet-stream'), false);
    });

  });

  $describe.skipIf($.noBrowser)('scrapbook.parseCssFile', function () {

    it('priority: 1. BOM', async function () {
      // UTF-8
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-8',
      });

      // UTF-16BE
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-16be');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-16BE',
      });

      // UTF-16LE
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-16le');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'UTF-16LE',
      });

      // output BOM only for @charset
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText('\uFEFF' + str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1', 'GBK'), {
        text: str,
        charset: 'UTF-8',
      });
    });

    it('priority: 2. header charset', async function () {
      // utf-8
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'utf-8', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      // utf-16be
      var str = '@charset "Big5"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-16be');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'utf-16be', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'utf-16be',
      });

      // big5
      var str = '@charset "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'big5', 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'big5',
      });

      // ISO-8859-1
      var str = '@charset "UTF-8"; content: "abcÆ©®±¼"';
      var u8ar = await encodeText(str, 'iso-8859-1');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'ISO-8859-1'), {
        text: '\uFEFF' + str,
        charset: 'ISO-8859-1',
      });

      // output BOM only for @charset
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, 'UTF-8', 'GBK'), {
        text: str,
        charset: 'UTF-8',
      });
    });

    it('priority: 3. @charset', async function () {
      // UTF-8
      var str = '@charset "UTF-8"; content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: '\uFEFF' + str,
        charset: 'UTF-8',
      });

      // Big5
      var str = '@charset "Big5"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'GBK'), {
        text: '\uFEFF' + str,
        charset: 'Big5',
      });

      // fix bad UTF-16 declaration to UTF-8
      var str = '@charset "utf-16BE"; content: "abc中文"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      var str = '@charset "UTF-16le"; content: "abc中文"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob), {
        text: '\uFEFF' + str,
        charset: 'utf-8',
      });

      // ignore bad @charset
      var str = '@CHARSET "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'big5'), {
        text: str,
        charset: 'big5',
      });

      var str = "@charset 'UTF-8'; content: 'abc中文'";
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });

      var str = '@charset  "UTF-8"; content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });
    });

    it('priority: 4. environment charset', async function () {
      // UTF-8
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'UTF-8'), {
        text: str,
        charset: 'UTF-8',
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob, null, 'Big5'), {
        text: str,
        charset: 'Big5',
      });
    });

    it('priority: 5. as byte string', async function () {
      // UTF-8
      var str = 'content: "abc中文𠀀"';
      var u8ar = await encodeText(str, 'utf-8');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob), {
        text: scrapbook.arrayBufferToByteString(u8ar),
        charset: null,
      });

      // Big5
      var str = 'content: "abc中文"';
      var u8ar = await encodeText(str, 'big5');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob), {
        text: scrapbook.arrayBufferToByteString(u8ar),
        charset: null,
      });

      // ISO-8859-1
      var str = 'content: "abcÆ©®±¼"';
      var u8ar = await encodeText(str, 'ISO-8859-1');
      var blob = new Blob([u8ar], {type: 'text/css'});
      assertEqual(await scrapbook.parseCssFile(blob), {
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
      assertEqual(result.type.toLowerCase(), 'text/css;charset=utf-8');
      assertEqual(await scrapbook.readFileAsText(result, 'UTF-8'), 'div::after { content: "中文"; } /* rewritten */');
    });

    it('no charset if charset is unknown', async function () {
      const rewriter = async css => `${css} /* rewritten */`;

      var data = new Blob([`div::after { content: "中文"; }`], {type: 'text/css'});
      var result = await scrapbook.rewriteCssFile(data, undefined, rewriter);
      assertEqual(result.type.toLowerCase(), 'text/css');
      assertEqual(await scrapbook.readFileAsText(result, 'UTF-8'), 'div::after { content: "中文"; } /* rewritten */');
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

      assertEqual(output, expected);
    }

    it('image', function () {
      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url('image.jpg'); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url("image.jpg"); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

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
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // keep original spaces
      var input = `body{image-background:url(image.jpg);}`;
      var expected = `body{image-background:url("http://example.com/image.jpg");}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  image.jpg  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body\t{\timage-background\t:\turl(\timage.jpg\t)\t;\t}`;
      var expected = `body\t{\timage-background\t:\turl(\t"http://example.com/image.jpg"\t)\t;\t}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(  "image.jpg"  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: url(\t"image.jpg"\t) ; }`;
      var expected = `body { image-background: url(\t"http://example.com/image.jpg"\t) ; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // keep original case
      var input = `body { image-background: URL(image.jpg); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: uRl(image.jpg); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: URL("image.jpg"); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `body { image-background: uRl("image.jpg"); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // escape quotes
      var input = `body { image-background: url('i "like" it.jpg'); }`;
      var expected = r`body { image-background: url("http://example.com/i \"like\" it.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // skip comments
      var input = `/*url(image.jpg)*/`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `/*url(image.jpg)*/body { color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body/*url(image.jpg)*/{ color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body {/*url(image.jpg)*/color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color/*url(image.jpg)*/: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color:/*url(image.jpg)*/red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red/*url(image.jpg)*/; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red;/*url(image.jpg)*/}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `body { color: red; }/*url(image.jpg)*/`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image ignore unrelated pattern', function () {
      var input = `div::after { content: "url(image.jpg)" }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `[myattr="url(image.jpg)"] { }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { background-image: url("image.jpg"); }`;
      var expected = r`.my\"class\" { background-image: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    it('image ignore unrelated rules', function () {
      var input = `@import "file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `@import url("file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `@namespace url("file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: certain chars should be escaped or replaced', function () {
      // 0x01~0x1F and 0x7F (except for newlines) should be escaped
      var input = `.mycls { background-image: url("\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0B\x0E\x0F"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\1 \2 \3 \4 \5 \6 \7 \8 \9 \b \e \f "); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = `.mycls { background-image: url("\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F\x7F"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // escaped sequence of 0x01~0x1F and 0x7F should keep escaped
      var input = r`.mycls { background-image: url("\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = r`.mycls { background-image: url("\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      var expected = r`.mycls { background-image: url("http://example.com/\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // null, surrogate, and char code > 0x10FFFF should be replaced with \uFFFD
      var input = r`.mycls { background-image: url("\0 \D800 \DFFF \110000"); }`;
      var expected = `.mycls { background-image: url("http://example.com/\uFFFD\uFFFD\uFFFD\uFFFD"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      // other chars should be unescaped
      var input = r`.mycls { background-image: url("\80 \4E00 \20000 \10FFFF "); }`;
      var expected = `.mycls { background-image: url("http://example.com/\u{80}\u{4E00}\u{20000}\u{10FFFF}"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    $it.xfail()('image: bad extra components after a quoted string', function () {
      // bad URL, should be skipped
      var input = r`.mycls { background-image: url("image.jpg"foo); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" foo); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg""foo"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" "foo"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg"'foo'); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" 'foo'); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" url(foo)); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("image.jpg" url("foo")); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: newline in a quoted string', function () {
      // bad string, should be skipped
      var input = r`.mycls { background-image: url("image.jpg
); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('image.jpg
); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`.mycls { background-image: url("my\
image\
.jpg"); }`;
      var expected = r`.mycls { background-image: url("http://example.com/myimage.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);

      var input = r`.mycls { background-image: url('my\
image\
.jpg'); }`;
      var expected = r`.mycls { background-image: url("http://example.com/myimage.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    $it.xfail()('image: EOF in a quoted string', function () {
      // bad string, should be skipped to the end
      var input = r`.mycls { background-image: url("img.jpg`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url("url(img.jpg)`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('img.jpg`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url('url(img.jpg)`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    $it.xfail()('image: escaped EOF in a quoted string', function () {
      // bad string, should be skipped to the end
      var input = `.mycls { background-image: url("img.jpg\\`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url("url(img.jpg)\\`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url('img.jpg\\`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = `.mycls { background-image: url('url(img.jpg)\\`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: bad chars in an unquoted url', function () {
      // bad URL, should be skipped
      var input = r`.mycls { background-image: url(image"foo.jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image"foo".jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image'foo.jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image'foo'.jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image(foo.jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(url(foo).jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: last newline in an unquoted url', function () {
      // last whitespaces, should be stripped
      var input = r`.mycls { background-image: url(image.jpg
); }`;
      var expected = r`.mycls { background-image: url("http://example.com/image.jpg"
); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), expected);
    });

    it('image: intermediate newline in an unquoted url', function () {
      // bad url, should be skipped
      var input = r`.mycls { background-image: url(image.jpg
foo); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped newline in an unquoted url', function () {
      // bad escape, should be skipped
      var input = r`.mycls { background-image: url(image\
.jpg); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);

      var input = r`.mycls { background-image: url(image.jpg\
); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: EOF in an unquoted url', function () {
      // bad url, should be skipped to the end
      var input = `.mycls { background-image: url(img.jpg`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
    });

    it('image: escaped EOF in an unquoted url', function () {
      // bad escape, should be skipped to the end
      var input = `.mycls { background-image: url(img.jpg\\`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImage), input);
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
      assertEqual(scrapbook.rewriteCssText(input, options), expected);
    });

    it('image async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url: `http://example.com/${url}`}),
      };

      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(await scrapbook.rewriteCssText(input, options), expected);
    });

    it('@font-face', function () {
      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: url('file.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // keep original spaces
      var input = `@font-face{font-family:myfont;src:url(file.woff);}`;
      var expected = `@font-face{font-family:myfont;src:url("http://example.com/file.woff");}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src  : url(  file.woff  )  ; }`;
      var expected = `@font-face { font-family: myfont; src  : url(  "http://example.com/file.woff"  )  ; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\tfile.woff\t)\t;\t}`;
      var expected = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\t"http://example.com/file.woff"\t)\t;\t}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // keep original case
      var input = `@font-face { font-family: myfont; src: URL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: URL("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = `@font-face { font-family: myfont; src: UrL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: UrL("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // escape quotes
      var input = `@font-face { font-family: myfont; src: url('i"like"it.woff'); }`;
      var expected = r`@font-face { font-family: myfont; src: url("http://example.com/i\"like\"it.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      // skip comments
      var input = `/*@font-face{src:url(file.woff)}*/`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `/*@font-face{src:url(file.woff)}*/body { color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body/*@font-face{src:url(file.woff)}*/{ color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body {/*@font-face{src:url(file.woff)}*/color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color/*@font-face{src:url(file.woff)}*/: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color:/*@font-face{src:url(file.woff)}*/red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color: red/*@font-face{src:url(file.woff)}*/; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `body { color: red;/*@font-face{src:url(file.woff)}*/}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);
    });

    it('@font-face ignore unrelated pattern', function () {
      var input = `div::after { content: "@font-face{src:url(file.woff)}" }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      var input = `[myattr="@font-face{src:url(file.woff)}"] { }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { }
@font-face { src: url("file.woff"); }`;
      var expected = r`.my\"class\" { }
@font-face { src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);
    });

    it('@font-face: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`@font-face { font-family: myfont; src: url("my\
font\
.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/myfont.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);

      var input = r`@font-face { font-family: myfont; src: url('my\
font\
.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/myfont.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsFont), expected);
    });

    it('@font-face record', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: /*scrapbook-orig-url="file.woff"*/url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);
    });

    it('@font-face async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url: `http://example.com/${url}`}),
        rewriteBackgroundUrl: async url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(await scrapbook.rewriteCssText(input, options), expected);
    });

    it('@import', function () {
      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import 'file.css';`;
      var expected = `@import "http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url(file.css);`;
      var expected = `@import url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url('file.css');`;
      var expected = `@import url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url("file.css");`;
      var expected = `@import url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // keep original spaces
      var input = `@import   "file.css"  ;`;
      var expected = `@import   "http://example.com/file.css"  ;`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import\t"file.css"\t;`;
      var expected = `@import\t"http://example.com/file.css"\t;`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import   url(  file.css   )  ;`;
      var expected = `@import   url(  "http://example.com/file.css"   )  ;`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import\turl(\tfile.css\t)\t;`;
      var expected = `@import\turl(\t"http://example.com/file.css"\t)\t;`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // keep original case
      var input = `@import URL(file.css);`;
      var expected = `@import URL("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import URl(file.css);`;
      var expected = `@import URl("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // escape quotes
      var input = `@import 'I"love"you.css';`;
      var expected = r`@import "http://example.com/I\"love\"you.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = `@import url('I"love"you.css');`;
      var expected = r`@import url("http://example.com/I\"love\"you.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      // skip comments
      var input = `/*@import url(file.css);*/`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `/*@import url(file.css);*/body { color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body/*@import url(file.css);*/{ color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body {/*@import url(file.css);*/color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color/*@import url(file.css);*/: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color:/*@import url(file.css);*/red; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color: red/*@import url(file.css);*/; }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `body { color: red;/*@import url(file.css);*/}`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);
    });

    it('@import ignore unrelated pattern', function () {
      var input = `div::after { content: "@import url(file.css);" }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      var input = `[myattr="@import url(file.css);"] { }`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), input);

      // don't break normal rewriting
      var input = r`.my\"class\" { }
@import "file.css";`;
      var expected = r`.my\"class\" { }
@import "http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);
    });

    it('@import: escaped newline in a quoted string', function () {
      // escaped newlines should be stripped
      var input = r`@import "my\
file\
.css";`;
      var expected = `@import "http://example.com/myfile.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = r`@import 'my\
file\
.css';`;
      var expected = `@import "http://example.com/myfile.css";`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = r`@import url("my\
file\
.css");`;
      var expected = `@import url("http://example.com/myfile.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);

      var input = r`@import url('my\
file\
.css');`;
      var expected = `@import url("http://example.com/myfile.css");`;
      assertEqual(scrapbook.rewriteCssText(input, optionsImport), expected);
    });

    it('@import record', function () {
      const options = {
        rewriteImportUrl: url => ({url: `http://example.com/${url}`, recordUrl: url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import /*scrapbook-orig-url="file.css"*/"http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import url(file.css);`;
      var expected = `@import /*scrapbook-orig-url="file.css"*/url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);
    });

    it('@import async', async function () {
      var options = {
        rewriteImportUrl: async url => ({url: `http://example.com/${url}`}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assertEqual(await scrapbook.rewriteCssText(input, options), expected);
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
      assert(match);
      assertEqual(match[2], match[4]);
      assertEqual(map, {
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
            assertEqual(scrapbook.rewriteSrcset(input, rewriter), expected);
            continue;
          }

          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',');
          assertEqual(scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = testCase.map(p => space + [`<${p[0]}>`].concat(p.slice(1)).join(space) + space).join(',');
          assertEqual(scrapbook.rewriteSrcset(input, rewriter), expected);
        }

        // non-ASCII-whitespaces should be ignored (treated as part of the URL)
        for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = `<${input}>`;
          assertEqual(scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = `<${input}>`;
          assertEqual(scrapbook.rewriteSrcset(input, rewriter), expected);
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
            assertEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);
            continue;
          }

          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = testCase.map(p => [`<${p[0]}>`].concat(p.slice(1)).join(space)).join(',');
          assertEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = testCase.map(p => space + [`<${p[0]}>`].concat(p.slice(1)).join(space) + space).join(',');
          assertEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);
        }

        // non-ASCII-whitespaces should be ignored (treated as part of the URL)
        for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
          // least spaces
          var input = testCase.map(p => p.join(space)).join(',');
          var expected = `<${input}>`;
          assertEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);

          // more spaces
          var input = testCase.map(p => space + p.join(space) + space).join(',');
          var expected = `<${input}>`;
          assertEqual(await scrapbook.rewriteSrcset(input, rewriter), expected);
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
        'data:text/css,'
      ];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f', ' \t ']) {
        const input = urls.join(space);
        const expected = urls.map(url => `<${url}>`).join(' ');
        assertEqual(scrapbook.rewriteUrls(input, rewriter), expected);
      }

      // non-ASCII-whitespaces should be ignored (treated as part of the URL)
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        const input = urls.join(space);
        const expected = `<${input}>`;
        assertEqual(scrapbook.rewriteUrls(input, rewriter), expected);
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
        'data:text/css,'
      ];

      // individual ASCII white space
      for (const space of [' ', '\t', '\n', '\r', '\f', ' \t ']) {
        const input = urls.join(space);
        const expected = urls.map(url => `<${url}>`).join(' ');
        assertEqual(await scrapbook.rewriteUrls(input, rewriter), expected);
      }

      // non-ASCII-whitespaces should be ignored (treated as part of the URL)
      for (const space of ['\u00A0', '\u2009', '\u200A', '\u200B', '\u3000', '\uFEFF']) {
        const input = urls.join(space);
        const expected = `<${input}>`;
        assertEqual(await scrapbook.rewriteUrls(input, rewriter), expected);
      }
    });

  });

});

}));
