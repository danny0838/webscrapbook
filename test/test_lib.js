describe('Test libraries', function () {

// ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
describe('lib/referrer.js', function () {

  describe('Referrer.toString', function () {

    it('basic', function () {
      // no-referrer
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "no-referrer",
        false,
      ).toString() === "");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "no-referrer",
        false,
      ).toString() === "");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "no-referrer",
        false,
      ).toString() === "");

      // origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "origin",
        false,
      ).toString() === "https://example.com:8000/");

      // unsafe-url
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "unsafe-url",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "unsafe-url",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "unsafe-url",
        false,
      ).toString() === "https://example.com:8000/page?search=1");

      // origin-when-cross-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/");

      // same-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "same-origin",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "same-origin",
        false,
      ).toString() === "");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "same-origin",
        false,
      ).toString() === "");

      // no-referrer-when-downgrade
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "no-referrer-when-downgrade",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "no-referrer-when-downgrade",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "no-referrer-when-downgrade",
        false,
      ).toString() === "");

      // strict-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "strict-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "strict-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "strict-origin",
        false,
      ).toString() === "");

      // strict-origin-when-cross-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "strict-origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "strict-origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "strict-origin-when-cross-origin",
        false,
      ).toString() === "");
    });

    it('spoof = true', function () {
      assert(new Referrer(
        "https://mozilla.org",
        "https://user:pw@example.com:8000/page?search=1#frag",
        "strict-origin-when-cross-origin",
        true,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://mozilla.org",
        "https://user:pw@example.com:8000/page?search=1#frag",
        "strict-origin",
        true,
      ).toString() === "https://example.com:8000/");
    });

  });

  describe('Referrer.isSameOrigin', function () {

    it('basic', function () {
      assert(new Referrer(
        "https://example.com/page",
        "https://example.com/otherpage",
      ).isSameOrigin === true);
      assert(new Referrer(
        "https://example.com/page",
        "https://example.com:8000/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "https://example.com/page",
        "https://sub.example.com/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://sub.example.com/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "file:///var/www/page",
        "file:///var/www/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "data:text/plain,abc123",
        "data:text/plain,def456",
      ).isSameOrigin === false);
    });

  });

  describe('Referrer.isDownGrade', function () {

    it('HTTPS to ...', function () {
      assert(new Referrer(
        "https://example.com/page",
        "https://example.com/otherpage",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "https://mozilla.org",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://example.com/page",
      ).isDownGrade === true);
    });

    it('HTTP to anywhere is not a downgrade', function () {
      assert(new Referrer(
        "http://example.com/page",
        "http://example.com/otherpage",
      ).isDownGrade === false);
      assert(new Referrer(
        "http://example.com/page",
        "http://mozilla.org",
      ).isDownGrade === false);
      assert(new Referrer(
        "http://example.com/page",
        "https://example.com/page",
      ).isDownGrade === false);
    });

    it('HTTPS to a potentially trustworthy URL is not a downgrade', function () {
      assert(new Referrer(
        "https://example.com/page",
        "http://localhost/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://127.0.0.1/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://127.255.255.254/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://[::1]/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "file:///vars/www/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "data:text/plain,abc123",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "about:blank",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "about:srcdoc",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        new URL(browser.runtime.getURL('')).href,
      ).isDownGrade === false);
    });

  });

});

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
        scrapbook.escapeFilename(String.raw`this\is\my\path`),
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

    it('relative URLs (since path)', function () {
      // different since path
      assertEqual(
        scrapbook.getRelativeUrl(
          `myroot/page`,
          `myroot/ref`,
        ),
        `page`,
      );
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
        scrapbook.parseHeaderContentType(String.raw`text/html; field=" my text\\value with \"quote\" "`),
        {type: "text/html", parameters: {field: String.raw` my text\value with "quote" `}},
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
        scrapbook.parseHeaderContentDisposition(String.raw`inline; filename="my text\\image \"file\".jpg"`),
        {type: "inline", parameters: {filename: String.raw`my text\image "file".jpg`}},
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

  describe('scrapbook.rewriteCssFile', function () {

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

    it('image', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url: `http://example.com/${url}`}),
      };

      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `body { image-background: url('image.jpg'); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `body { image-background: url("image.jpg"); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

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
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // keep original spaces
      var input = `body{image-background:url(image.jpg);}`;
      var expected = `body{image-background:url("http://example.com/image.jpg");}`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `body { image-background: url(  image.jpg  ) ; }`;
      var expected = `body { image-background: url(  "http://example.com/image.jpg"  ) ; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `body\t{\timage-background\t:\turl(\timage.jpg\t)\t;\t}`;
      var expected = `body\t{\timage-background\t:\turl(\t"http://example.com/image.jpg"\t)\t;\t}`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // keep original case
      var input = `body { image-background: URL(image.jpg); }`;
      var expected = `body { image-background: URL("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `body { image-background: uRl(image.jpg); }`;
      var expected = `body { image-background: uRl("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // escape quotes
      var input = `body { image-background: url('i "like" it.jpg'); }`;
      var expected = String.raw`body { image-background: url("http://example.com/i \"like\" it.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // skip comments
      var input = `/*url(image.jpg)*/`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `/*url(image.jpg)*/body { color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body/*url(image.jpg)*/{ color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body {/*url(image.jpg)*/color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color/*url(image.jpg)*/: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color:/*url(image.jpg)*/red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red/*url(image.jpg)*/; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red;/*url(image.jpg)*/}`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red; }/*url(image.jpg)*/`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    $it.xfail()('image ignore unrelated pattern', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url: `http://example.com/${url}`}),
      };

      var input = `div::after { content: "url(image.jpg)" }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `[myattr="url(image.jpg)"] { }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    it('image ignore unrelated rules', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url: `http://example.com/${url}`}),
      };

      var input = `@import "file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `@import url("file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    it('image complicated cases', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url: `http://example.com/${url}`}),
      };

      var input = String.raw`.my\"class\" { background-image: url("image.jpg"); }`;
      var expected = String.raw`.my\"class\" { background-image: url("http://example.com/image.jpg"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);
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

    it('@font-face', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@font-face { font-family: myfont; src: url(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@font-face { font-family: myfont; src: url('file.woff'); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@font-face { font-family: myfont; src: url("file.woff"); }`;
      var expected = `@font-face { font-family: myfont; src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // keep original spaces
      var input = `@font-face{font-family:myfont;src:url(file.woff);}`;
      var expected = `@font-face{font-family:myfont;src:url("http://example.com/file.woff");}`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@font-face { font-family: myfont; src  : url(  file.woff  )  ; }`;
      var expected = `@font-face { font-family: myfont; src  : url(  "http://example.com/file.woff"  )  ; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\tfile.woff\t)\t;\t}`;
      var expected = `\t@font-face\t{\tfont-family\t:\tmyfont\t;\tsrc\t:\turl(\t"http://example.com/file.woff"\t)\t;\t}`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // keep original case
      var input = `@font-face { font-family: myfont; src: URL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: URL("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@font-face { font-family: myfont; src: UrL(file.woff); }`;
      var expected = `@font-face { font-family: myfont; src: UrL("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // escape quotes
      var input = `@font-face { font-family: myfont; src: url('i"like"it.woff'); }`;
      var expected = String.raw`@font-face { font-family: myfont; src: url("http://example.com/i\"like\"it.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // skip comments
      var input = `/*@font-face{src:url(file.woff)}*/`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `/*@font-face{src:url(file.woff)}*/body { color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body/*@font-face{src:url(file.woff)}*/{ color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body {/*@font-face{src:url(file.woff)}*/color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color/*@font-face{src:url(file.woff)}*/: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color:/*@font-face{src:url(file.woff)}*/red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red/*@font-face{src:url(file.woff)}*/; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red;/*@font-face{src:url(file.woff)}*/}`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    $it.xfail()('@font-face ignore unrelated pattern', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `div::after { content: "@font-face{src:url(file.woff)}" }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `[myattr="@font-face{src:url(file.woff)}"] { }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    it('@font-face complicated cases', function () {
      const options = {
        rewriteImportUrl: url => ({url}),
        rewriteFontFaceUrl: url => ({url: `http://example.com/${url}`}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = String.raw`.my\"class\" { }
@font-face { src: url("file.woff"); }`;
      var expected = String.raw`.my\"class\" { }
@font-face { src: url("http://example.com/file.woff"); }`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);
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

    it('@import', function () {
      const options = {
        rewriteImportUrl: url => ({url: `http://example.com/${url}`}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `@import "file.css";`;
      var expected = `@import "http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import 'file.css';`;
      var expected = `@import "http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import url(file.css);`;
      var expected = `@import url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import url('file.css');`;
      var expected = `@import url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import url("file.css");`;
      var expected = `@import url("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // keep original spaces
      var input = `@import   "file.css"  ;`;
      var expected = `@import   "http://example.com/file.css"  ;`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import\t"file.css"\t;`;
      var expected = `@import\t"http://example.com/file.css"\t;`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import   url(  file.css   )  ;`;
      var expected = `@import   url(  "http://example.com/file.css"   )  ;`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import\turl(\tfile.css\t)\t;`;
      var expected = `@import\turl(\t"http://example.com/file.css"\t)\t;`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // keep original case
      var input = `@import URL(file.css);`;
      var expected = `@import URL("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import URl(file.css);`;
      var expected = `@import URl("http://example.com/file.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // escape quotes
      var input = `@import 'I"love"you.css';`;
      var expected = String.raw`@import "http://example.com/I\"love\"you.css";`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      var input = `@import url('I"love"you.css');`;
      var expected = String.raw`@import url("http://example.com/I\"love\"you.css");`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);

      // skip comments
      var input = `/*@import url(file.css);*/`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `/*@import url(file.css);*/body { color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body/*@import url(file.css);*/{ color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body {/*@import url(file.css);*/color: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color/*@import url(file.css);*/: red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color:/*@import url(file.css);*/red; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red/*@import url(file.css);*/; }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `body { color: red;/*@import url(file.css);*/}`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    $it.xfail()('@import ignore unrelated pattern', function () {
      const options = {
        rewriteImportUrl: url => ({url: `http://example.com/${url}`}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = `div::after { content: "@import url(file.css);" }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);

      var input = `[myattr="@import url(file.css);"] { }`;
      assertEqual(scrapbook.rewriteCssText(input, options), input);
    });

    it('@import complicated cases', function () {
      const options = {
        rewriteImportUrl: url => ({url: `http://example.com/${url}`}),
        rewriteFontFaceUrl: url => ({url}),
        rewriteBackgroundUrl: url => ({url}),
      };

      var input = String.raw`.my\"class\" { }
@import "file.css";`;
      var expected = String.raw`.my\"class\" { }
@import "http://example.com/file.css";`;
      assertEqual(scrapbook.rewriteCssText(input, options), expected);
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

    it('async', async function () {
      const options = {
        rewriteImportUrl: async url => ({url}),
        rewriteFontFaceUrl: async url => ({url}),
        rewriteBackgroundUrl: async url => ({url: `http://example.com/${url}`}),
      };

      var input = `body { image-background: url(image.jpg); }`;
      var expected = `body { image-background: url("http://example.com/image.jpg"); }`;
      assertEqual(await scrapbook.rewriteCssText(input, options), expected);
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
        for (const space of [' ', '   ']) {
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
          var input = testCase.map(p => p.join(space)).join(',');
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
        for (const space of [' ', '   ']) {
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
          var input = testCase.map(p => p.join(space)).join(',');
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

describe('capturer/common.js', function () {

  describe('capturer.getRedirectedUrl', function () {

    it("use the redirected URL hash if it exists", function () {
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#", ""),
        "http://example.com/page#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#", ""),
        "http://example.com/page?id=123#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#", "#frag"),
        "http://example.com/page#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#", "#frag"),
        "http://example.com/page?id=123#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#foo", ""),
        "http://example.com/page#foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#foo", ""),
        "http://example.com/page?id=123#foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#foo", "#frag"),
        "http://example.com/page#foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#foo", "#frag"),
        "http://example.com/page?id=123#foo",
      );
    });

    it("use the original URL hash if the redirected URL has no hash", function () {
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page", ""),
        "http://example.com/page",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", ""),
        "http://example.com/page?id=123",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page", "#"),
        "http://example.com/page#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", "#"),
        "http://example.com/page?id=123#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page", "#frag"),
        "http://example.com/page#frag",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", "#frag"),
        "http://example.com/page?id=123#frag",
      );
    });

    it("don't include hash for data URL", function () {
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo#", ""),
        "data:text/html,foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo#", "#frag"),
        "data:text/html,foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo", ""),
        "data:text/html,foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo", "#frag"),
        "data:text/html,foo",
      );
    });

  });

  describe('capturer.resolveRelativeUrl', function () {

    it("resolve a relative URL using the base URL", function () {
      assertEqual(
        capturer.resolveRelativeUrl("mypage.html", "http://example.com/"),
        "http://example.com/mypage.html",
      );
      assertEqual(
        capturer.resolveRelativeUrl("mypage.html?id=123", "http://example.com/"),
        "http://example.com/mypage.html?id=123",
      );
      assertEqual(
        capturer.resolveRelativeUrl("mypage.html?id=123#frag", "http://example.com/"),
        "http://example.com/mypage.html?id=123#frag",
      );
      assertEqual(
        capturer.resolveRelativeUrl("?id=123", "http://example.com/"),
        "http://example.com/?id=123",
      );
      assertEqual(
        capturer.resolveRelativeUrl("?", "http://example.com/"),
        "http://example.com/?",
      );
    });

    it("don't resolve an empty URL", function () {
      assertEqual(
        capturer.resolveRelativeUrl("", "http://example.com/"),
        "",
      );
    });

    it("don't resolve a pure hash URL", function () {
      assertEqual(
        capturer.resolveRelativeUrl("#hash", "http://example.com/"),
        "#hash",
      );
      assertEqual(
        capturer.resolveRelativeUrl("#", "http://example.com/"),
        "#",
      );
    });

  });

  describe('capturer.isAboutUrl', function () {

    it("true for exactly about:srcdoc", function () {
      assertEqual(
        capturer.isAboutUrl("about:srcdoc"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc/subdir"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc?"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc?id=123"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc#"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc#frag"),
        false,
      );
    });

    it("true for about:blank", function () {
      assertEqual(
        capturer.isAboutUrl("about:blank"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank/subdir"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank?"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank?id=123"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank#"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank#frag"),
        true,
      );
    });

    it("false for other URLs", function () {
      assertEqual(
        capturer.isAboutUrl("about:invalid"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:newtab"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("http://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("https://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("ws://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("wss://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("file:///foo/bar"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("data:text/html,foo"),
        false,
      );
    });

  });

  describe('capturer.getErrorUrl', function () {
    const optionsBasic = {};
    const optionsLinkUnsavedUri = {"capture.linkUnsavedUri": true};

    it("rewrite http:, https:, file:, and about:", function () {
      assertEqual(
        capturer.getErrorUrl("http://example.com/?id=123#456", optionsBasic),
        "urn:scrapbook:download:error:http://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("https://example.com/?id=123#456", optionsBasic),
        "urn:scrapbook:download:error:https://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("file:///foo/bar", optionsBasic),
        "urn:scrapbook:download:error:file:///foo/bar",
      );
      assertEqual(
        capturer.getErrorUrl("about:blank", optionsBasic),
        "urn:scrapbook:download:error:about:blank",
      );
      assertEqual(
        capturer.getErrorUrl("about:srcdoc", optionsBasic),
        "urn:scrapbook:download:error:about:srcdoc",
      );
    });

    it("strip details for data: and blob:", function () {
      assertEqual(
        capturer.getErrorUrl("data:text/css,foo", optionsBasic),
        "urn:scrapbook:download:error:data:",
      );
      assertEqual(
        capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsBasic),
        "urn:scrapbook:download:error:blob:",
      );
    });

    it("don't rewrite other protocols", function () {
      assertEqual(
        capturer.getErrorUrl("ftp://example.com/file.png", optionsBasic),
        "ftp://example.com/file.png",
      );
      assertEqual(
        capturer.getErrorUrl("ws://example.com/?id=123", optionsBasic),
        "ws://example.com/?id=123",
      );
      assertEqual(
        capturer.getErrorUrl("wss://example.com/?id=123", optionsBasic),
        "wss://example.com/?id=123",
      );
      assertEqual(
        capturer.getErrorUrl("urn:scrapbook:download:error:http://example.com", optionsBasic),
        "urn:scrapbook:download:error:http://example.com",
      );
    });

    it("don't rewrite if capture.linkUnsavedUri is truthy", function () {
      assertEqual(
        capturer.getErrorUrl("http://example.com/?id=123#456", optionsLinkUnsavedUri),
        "http://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("https://example.com/?id=123#456", optionsLinkUnsavedUri),
        "https://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("file:///foo/bar", optionsLinkUnsavedUri),
        "file:///foo/bar",
      );
      assertEqual(
        capturer.getErrorUrl("about:blank", optionsLinkUnsavedUri),
        "about:blank",
      );
      assertEqual(
        capturer.getErrorUrl("about:srcdoc", optionsLinkUnsavedUri),
        "about:srcdoc",
      );

      assertEqual(
        capturer.getErrorUrl("data:text/css,foo", optionsLinkUnsavedUri),
        "data:text/css,foo",
      );
      assertEqual(
        capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsLinkUnsavedUri),
        "blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c",
      );
    });

  });

  describe('capturer.CssSelectorTokenizer.run', function () {
    const tokenizer = new capturer.CssSelectorTokenizer();

    it('basic selectors', function () {
      assertEqual(tokenizer.run(''), []);
      assertEqual(tokenizer.run('body'), [
        {type: 'name', value: 'body', depth: 0},
      ]);
      assertEqual(tokenizer.run('*'), [
        {type: 'operator', value: '*', depth: 0},
      ]);
      assertEqual(tokenizer.run('#my-id'), [
        {type: 'operator', value: '#', depth: 0},
        {type: 'name', value: 'my-id', depth: 0},
      ]);
      assertEqual(tokenizer.run('.my-class'), [
        {type: 'operator', value: '.', depth: 0},
        {type: 'name', value: 'my-class', depth: 0},
      ]);

      // escaped string
      assertEqual(tokenizer.run(String.raw`#\*`), [
        {type: 'operator', value: '#', depth: 0},
        {type: 'name', value: String.raw`\*`, depth: 0},
      ]);

      assertEqual(tokenizer.run(String.raw`.my\.class\4E00 \20000 \10FFFF x`), [
        {type: 'operator', value: '.', depth: 0},
        {type: 'name', value: String.raw`my\.class\4E00 \20000 \10FFFF x`, depth: 0},
      ]);
    });

    it('attribute selector ([attr="..."])', function () {
      // attr only
      assertEqual(tokenizer.run('[myattr]'), [
        {type: 'selector', value: '[myattr]', depth: 0},
      ]);

      // attr and value
      assertEqual(tokenizer.run('[myattr=myvalue]'), [
        {type: 'selector', value: '[myattr=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr~=myvalue]'), [
        {type: 'selector', value: '[myattr~=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr|=myvalue]'), [
        {type: 'selector', value: '[myattr|=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr^=myvalue]'), [
        {type: 'selector', value: '[myattr^=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr$=myvalue]'), [
        {type: 'selector', value: '[myattr$=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr*=myvalue]'), [
        {type: 'selector', value: '[myattr*=myvalue]', depth: 0},
      ]);

      // attr and value with modifier
      assertEqual(tokenizer.run('[myattr=myvalue i]'), [
        {type: 'selector', value: '[myattr=myvalue i]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr=myvalue s]'), [
        {type: 'selector', value: '[myattr=myvalue s]', depth: 0},
      ]);

      // quoted value
      assertEqual(tokenizer.run('[myattr="my complex value"]'), [
        {type: 'selector', value: '[myattr="my complex value"]', depth: 0},
      ]);

      // quoted value with escaping
      assertEqual(tokenizer.run(String.raw`[myattr=" my escaped\value and \"quoted\" ones "]`), [
        {type: 'selector', value: String.raw`[myattr=" my escaped\value and \"quoted\" ones "]`, depth: 0},
      ]);

      // quoted value with modifier
      assertEqual(tokenizer.run('[myattr="my complex value" i]'), [
        {type: 'selector', value: '[myattr="my complex value" i]', depth: 0},
      ]);

      // combine with other selectors
      assertEqual(tokenizer.run('div [myattr]'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'selector', value: '[myattr]', depth: 0},
      ]);
    });

    it('descendant combinator (" ")', function () {
      assertEqual(tokenizer.run('div span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div    span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);

      assertEqual(tokenizer.run('div\tspan'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: '\t', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);

      assertEqual(tokenizer.run('div \t span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '\t', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);

      // non-ascii white space is a name rather than a combinator
      assertEqual(tokenizer.run('div　span'), [
        {type: 'name', value: 'div　span', depth: 0},
      ]);
      assertEqual(tokenizer.run('.my-class　span'), [
        {type: 'operator', value: '.', depth: 0},
        {type: 'name', value: 'my-class　span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div 　 span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: '　', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
    });

    it('other combinators', function () {
      assertEqual(tokenizer.run('div > span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '>', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div + span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '+', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div ~ span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '~', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div || span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '||', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
    });

    it('pseudo-class', function () {
      // simple
      assertEqual(tokenizer.run(':root'), [
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'root', depth: 0},
      ]);

      // vander prefix
      assertEqual(tokenizer.run(':-webkit-autofill'), [
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: '-webkit-autofill', depth: 0},
      ]);

      // chained
      assertEqual(tokenizer.run('a:hover:visited'), [
        {type: 'name', value: 'a', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'hover', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'visited', depth: 0},
      ]);

      // parenthesized
      assertEqual(tokenizer.run('td:nth-child(-n + 3)'), [
        {type: 'name', value: 'td', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'nth-child', depth: 0},
        {type: 'operator', value: '(', depth: 0},
        {type: 'name', value: '-n', depth: 1},
        {type: 'operator', value: ' ', depth: 1},
        {type: 'operator', value: '+', depth: 1},
        {type: 'operator', value: ' ', depth: 1},
        {type: 'name', value: '3', depth: 1},
        {type: 'operator', value: ')', depth: 0},
      ]);

      // recursive
      assertEqual(tokenizer.run('a:not([href])'), [
        {type: 'name', value: 'a', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'not', depth: 0},
        {type: 'operator', value: '(', depth: 0},
        {type: 'selector', value: '[href]', depth: 1},
        {type: 'operator', value: ')', depth: 0},
      ]);
      assertEqual(tokenizer.run('p:is(#id1, :is(#id2))'), [
        {type: 'name', value: 'p', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'is', depth: 0},
        {type: 'operator', value: '(', depth: 0},
        {type: 'operator', value: '#', depth: 1},
        {type: 'name', value: 'id1', depth: 1},
        {type: 'operator', value: ',', depth: 1},
        {type: 'operator', value: ' ', depth: 1},
        {type: 'operator', value: ':', depth: 1},
        {type: 'name', value: 'is', depth: 1},
        {type: 'operator', value: '(', depth: 1},
        {type: 'operator', value: '#', depth: 2},
        {type: 'name', value: 'id2', depth: 2},
        {type: 'operator', value: ')', depth: 1},
        {type: 'operator', value: ')', depth: 0},
      ]);
    });

    it('pseudo-element', function () {
      // simple
      assertEqual(tokenizer.run('p::before'), [
        {type: 'name', value: 'p', depth: 0},
        {type: 'operator', value: '::', depth: 0},
        {type: 'name', value: 'before', depth: 0},
      ]);

      // recursive
      assertEqual(tokenizer.run('p::slotted(*)'), [
        {type: 'name', value: 'p', depth: 0},
        {type: 'operator', value: '::', depth: 0},
        {type: 'name', value: 'slotted', depth: 0},
        {type: 'operator', value: '(', depth: 0},
        {type: 'operator', value: '*', depth: 1},
        {type: 'operator', value: ')', depth: 0},
      ]);
    });

    it('namespaced type selector', function () {
      assertEqual(tokenizer.run('|a'), [
        {type: 'operator', value: '|', depth: 0},
        {type: 'name', value: 'a', depth: 0},
      ]);
      assertEqual(tokenizer.run('svg|a'), [
        {type: 'name', value: 'svg', depth: 0},
        {type: 'operator', value: '|', depth: 0},
        {type: 'name', value: 'a', depth: 0},
      ]);
      assertEqual(tokenizer.run('*|a'), [
        {type: 'operator', value: '*', depth: 0},
        {type: 'operator', value: '|', depth: 0},
        {type: 'name', value: 'a', depth: 0},
      ]);
      assertEqual(tokenizer.run('svg|*'), [
        {type: 'name', value: 'svg', depth: 0},
        {type: 'operator', value: '|', depth: 0},
        {type: 'operator', value: '*', depth: 0},
      ]);
    });

    it('namespaced attribute selector', function () {
      assertEqual(tokenizer.run('[|attr]'), [
        {type: 'selector', value: '[|attr]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[svg|attr]'), [
        {type: 'selector', value: '[svg|attr]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[*|attr]'), [
        {type: 'selector', value: '[*|attr]', depth: 0},
      ]);

      assertEqual(tokenizer.run('[*|attr=value]'), [
        {type: 'selector', value: '[*|attr=value]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[*|attr="value"]'), [
        {type: 'selector', value: '[*|attr="value"]', depth: 0},
      ]);
    });

  });

  describe('capturer.CssSelectorTokenizer.tokensToString', function () {
    const tokenizer = new capturer.CssSelectorTokenizer();

    it('basic', function () {
      assertEqual(tokenizer.tokensToString([
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]), 'div span');
    });

  });

  describe('capturer.DocumentCssHandler.getSelectorText', function () {
    const getSelectorText = capturer.DocumentCssHandler.getSelectorText;

    it('basic', function () {
      var rules = getRulesFromCssText(`div, span { background-color: lime; }`);
      assertEqual(getSelectorText(rules[0]), 'div, span');
    });

    $it.skipIf($.noNestingCss)('prepend :is() wrapped parent selector text for a nested rule', function () {
      var rules = getRulesFromCssText(`\
div, span {
  a {
    b {}
  }
}`);
      assertEqual(getSelectorText(rules[0]), 'div, span');
      assertEqual(getSelectorText(rules[0].cssRules[0]), ':is(div, span) a');
      assertEqual(getSelectorText(rules[0].cssRules[0].cssRules[0]), ':is(:is(div, span) a) b');
    });

    $it.skipIf($.noNestingCss)('replace "&" with :is() wrapped parent selector text for a nested rule', function () {
      var rules = getRulesFromCssText(`\
div, span {
  & .case1 {}
  &.case2 {}
  .case3 & {}
  .case4& {}
  & .case5 & & {}
}`);
      assertEqual(getSelectorText(rules[0]), 'div, span');
      assertEqual(getSelectorText(rules[0].cssRules[0]), ':is(div, span) .case1');
      assertEqual(getSelectorText(rules[0].cssRules[1]), ':is(div, span).case2');
      assertEqual(getSelectorText(rules[0].cssRules[2]), '.case3 :is(div, span)');
      assertEqual(getSelectorText(rules[0].cssRules[3]), '.case4:is(div, span)');
      assertEqual(getSelectorText(rules[0].cssRules[4]), ':is(div, span) .case5 :is(div, span) :is(div, span)');
    });

    $it.skipIf($.noNestingCss)('escaped "&" should not be rewritten', function () {
      var rules = getRulesFromCssText(String.raw`blockquote { .my\&class {} }`);
      assertEqual(getSelectorText(rules[0].cssRules[0]), String.raw`:is(blockquote) .my\&class`);
    });

    $it.skipIf($.noNestingCss)('"&" in [attr=""] should not be rewritten', function () {
      var rules = getRulesFromCssText(String.raw`blockquote { [myattr="a & b"] {} }`);
      assertEqual(getSelectorText(rules[0].cssRules[0]), String.raw`:is(blockquote) [myattr="a & b"]`);
    });

  });

  describe('capturer.DocumentCssHandler.getVerifyingSelector', function () {
    const getVerifyingSelector = capturer.DocumentCssHandler.getVerifyingSelector;

    const testGetVerifyingSelector = (selector1, selector2, validate = true) => {
      if (validate) {
        try {
          selector1 && document.querySelector(selector1);
        } catch (ex) {
          throw new Error(`Invalid testing CSS selector: ${selector1}`);
        }
        try {
          selector2 && document.querySelector(selector2);
        } catch (ex) {
          throw new Error(`Invalid control CSS selector: ${selector2}`);
        }
      }
      assertEqual(getVerifyingSelector(selector1), selector2);
    };

    it('basic', function () {
      // general selectors
      testGetVerifyingSelector('*', '*');
      testGetVerifyingSelector('div#id, span.class', 'div#id, span.class');
      testGetVerifyingSelector('[attr], [attr=value], [attr="value"]', '[attr], [attr=value], [attr="value"]');
      testGetVerifyingSelector('& body', '& body', false);

      // common pseudo-classes
      testGetVerifyingSelector('a:hover', 'a');
      testGetVerifyingSelector('a:active', 'a');
      testGetVerifyingSelector('a:link', 'a');
      testGetVerifyingSelector('a:visited', 'a');

      testGetVerifyingSelector('div:empty', 'div');

      testGetVerifyingSelector('form :enabled', 'form *');
      testGetVerifyingSelector('form :disabled', 'form *');

      testGetVerifyingSelector('form:focus', 'form');
      testGetVerifyingSelector('form:focus-within', 'form');

      testGetVerifyingSelector('input:checked', 'input');
      testGetVerifyingSelector('input:indeterminate', 'input');

      testGetVerifyingSelector('input:required', 'input');
      testGetVerifyingSelector('input:optional', 'input');

      testGetVerifyingSelector('input:valid', 'input');
      testGetVerifyingSelector('input:invalid', 'input');

      testGetVerifyingSelector('input:in-range', 'input');
      testGetVerifyingSelector('input:out-of-range', 'input');

      testGetVerifyingSelector(':lang(en) > q', '* > q');
      testGetVerifyingSelector(':dir(ltr)', '*', false);

      testGetVerifyingSelector('a:not([href]):not([target])', 'a');

      // common pseudo-elements
      testGetVerifyingSelector('a::before', 'a');
      testGetVerifyingSelector('a::after', 'a');
      testGetVerifyingSelector('p::first-line', 'p');
      testGetVerifyingSelector('input::placeholder', 'input');
      testGetVerifyingSelector('::slotted(span)', '*');
      testGetVerifyingSelector('tabbed-custom-element::part(tab)', 'tabbed-custom-element', false);

      // combined pseudo-classes/elements
      testGetVerifyingSelector('a:hover::before', 'a');

      // pseudo-elements that are not guaranteed to work after rewritten
      testGetVerifyingSelector(':host', '');
      testGetVerifyingSelector(':host > div', '');
      testGetVerifyingSelector(':host(.class)', '');
      testGetVerifyingSelector(':host(.class) > div', '');
      testGetVerifyingSelector(':host-context(.class)', '', false);
      testGetVerifyingSelector(':host-context(.class) > div', '', false);

      // allowed pseudo-classes
      testGetVerifyingSelector(':root', ':root');
      testGetVerifyingSelector(':scope', ':scope');
      testGetVerifyingSelector(':scope > body > div', ':scope > body > div');
      testGetVerifyingSelector(':is(div, span)', ':is(div, span)', false);
      testGetVerifyingSelector(':where(div, span)', ':where(div, span)', false);
      testGetVerifyingSelector('h1:has(+ h2, + h3, + h4)', 'h1:has(+ h2, + h3, + h4)', false);

      testGetVerifyingSelector('p:first-child', 'p:first-child');
      testGetVerifyingSelector('p:last-child', 'p:last-child');
      testGetVerifyingSelector('div:first-of-type', 'div:first-of-type');
      testGetVerifyingSelector('div:last-of-type', 'div:last-of-type');
      testGetVerifyingSelector('li:only-child', 'li:only-child');
      testGetVerifyingSelector('li:only-of-type', 'li:only-of-type');
      testGetVerifyingSelector('li:nth-child(even)', 'li:nth-child(even)');
      testGetVerifyingSelector('li:nth-last-child(2)', 'li:nth-last-child(2)');
      testGetVerifyingSelector('li:nth-of-type(3n + 1)', 'li:nth-of-type(3n + 1)');
      testGetVerifyingSelector('li:nth-last-of-type(3)', 'li:nth-last-of-type(3)');

      // (...) inside an allowed pseudo-class should be recursively rewritten
      testGetVerifyingSelector(':is(:hover, a:active)', ':is(*, a)', false);
      testGetVerifyingSelector(':is(:is(:link, :visited), button:active)', ':is(:is(*, *), button)', false);

      // namespace for type selector should be removed
      testGetVerifyingSelector('svg|a span', 'a span', false);
      testGetVerifyingSelector('*|a span', 'a span');
      testGetVerifyingSelector('|a span', 'a span');
      testGetVerifyingSelector('svg|* span', '* span', false);
      testGetVerifyingSelector('*|* span', '* span');
      testGetVerifyingSelector('|* span', '* span');

      // namespace for attribute selector
      testGetVerifyingSelector('[|attr]', '[|attr]');
      testGetVerifyingSelector('[svg|attr]', '[svg|attr]', false);
      testGetVerifyingSelector('[*|attr]', '[*|attr]');

      // column combinator should not be treated as namespace
      testGetVerifyingSelector('col||td', 'col||td', false);
      testGetVerifyingSelector('col || td', 'col || td', false);
    });

  });

  describe('capturer.DocumentCssHandler.getRulesFromCssText', function () {
    const getRulesFromCssText = capturer.DocumentCssHandler.getRulesFromCssText;

    it('basic', function () {
      var rules = getRulesFromCssText(`\
@media screen and (min-width: 300px), print {
  body {
    font-size: 1.5em;
    line-height: 2em;
  }
}`);

      assert(rules[0] instanceof CSSMediaRule);
      assertEqual(rules[0].media[0], 'screen and (min-width: 300px)');
      assertEqual(rules[0].media[1], 'print');

      assert(rules[0].cssRules[0] instanceof CSSStyleRule);
      assertEqual(rules[0].cssRules[0].selectorText, 'body');
      assertEqual(rules[0].cssRules[0].style.getPropertyValue('font-size'), '1.5em');
      assertEqual(rules[0].cssRules[0].style.getPropertyValue('line-height'), '2em');
    });

    it('common browser syntax check', function () {
      // attribute selector: name with quotes is not allowed
      var rules = getRulesFromCssText(`["myattr"] { }`);
      assertEqual(rules[0], undefined);

      // attribute selector: value with mixed literal and quotes is not allowed
      var rules = getRulesFromCssText(`[myattr=my"quoted"value] { }`);
      assertEqual(rules[0], undefined);

      // attribute selector: value with non-escaped operator is not allowed
      var rules = getRulesFromCssText(`[myattr=@namespace] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=div{color:red}] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=var(--my-var)] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=my|value] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=foo=bar] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=xlink:href] { }`);
      assertEqual(rules[0], undefined);

      // space/comment around the namespace separator is not allowed
      var rules = getRulesFromCssText(`svg | a { }`);
      assertEqual(rules[0], undefined);

      // space/comment between pseudo-class/element name and parenthesis is not allowed
      var rules = getRulesFromCssText(`:not (p) { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`::slotted (p) { }`);
      assertEqual(rules[0], undefined);

      // space/comment between function name and parenthesis is not allowed
      var rules = getRulesFromCssText(`p { background-image: url (image.jpg); }`);
      assertEqual(rules[0].cssText, `p { }`);

      var rules = getRulesFromCssText(`p::after { content: attr (id); }`);
      assertEqual(rules[0].cssText, `p::after { }`);

      var rules = getRulesFromCssText(`p { color: var (--my-var); }`);
      assertEqual(rules[0].cssText, `p { }`);

      // comment inside a function is not allowed in some cases
      var rules = getRulesFromCssText(`p { background-image: url(/* comment */"image.jpg"); }`);
      assertEqual(rules[0].cssText, `p { }`);

      var rules = getRulesFromCssText(`p { background-image: url(image.jpg/* comment */); }`);
      assertEqual(rules[0].cssText, `p { }`);

      // space/comment inside a function is allowed in some cases
      var rules = getRulesFromCssText(`p { background-image: url("image.jpg"  ); }`);
      assertEqual(rules[0].cssText, `p { background-image: url("image.jpg"); }`);

      var rules = getRulesFromCssText(`p { background-image: url("image.jpg"/* comment */); }`);
      assertEqual(rules[0].cssText, `p { background-image: url("image.jpg"); }`);

      var rules = getRulesFromCssText(`p::after { content: attr(  id  ); }`);
      assertEqual(rules[0].cssText, `p::after { content: attr(id); }`);
    });

    $(it).xfailIf(
      userAgent.is('chromium') && userAgent.major < 101,
      'var(...) is tidied in Chromium < 101 (possibly upper?)',
    )('browser syntax check/tidy for var()', function () {
      var rules = getRulesFromCssText(`p { color: var(  --myvar ); }`);
      assertEqual(rules[0].cssText, `p { color: var(  --myvar ); }`);

      var rules = getRulesFromCssText(`p { color: var(/* comment */--myvar); }`);
      assertEqual(rules[0].cssText, `p { color: var(/* comment */--myvar); }`);

      var rules = getRulesFromCssText(`p { color: var(--myvar/* comment */); }`);
      assertEqual(rules[0].cssText, `p { color: var(--myvar/* comment */); }`);
    });

    it('common browser tidy', function () {
      // semicolon after rule is added
      var rules = getRulesFromCssText(`body { color: red }`);
      assertEqual(rules[0].cssText, `body { color: red; }`);

      // space between operators are added
      var rules = getRulesFromCssText(`body>div{color:red;}`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`p{}`);
      assertEqual(rules[0].cssText, `p { }`);

      // extra spaces are removed
      var rules = getRulesFromCssText(`   body    div    {  color  :   red  ;  }  `);
      assertEqual(rules[0].cssText, `body div { color: red; }`);

      var rules = getRulesFromCssText(`[  myattr  ] { }`);
      assertEqual(rules[0].selectorText, `[myattr]`);

      var rules = getRulesFromCssText(`[  myattr  =  myvalue  ] { }`);
      assertEqual(rules[0].selectorText, `[myattr="myvalue"]`);

      var rules = getRulesFromCssText(`[  myattr  =  " myvalue "  ] { }`);
      assertEqual(rules[0].selectorText, `[myattr=" myvalue "]`);

      var rules = getRulesFromCssText(`:not( div ) { }`);
      assertEqual(rules[0].selectorText, `:not(div)`);

      // comments are removed (in the same way of spaces)
      var rules = getRulesFromCssText(`/* comment */ body > div { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body /* comment */ > div { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > /* comment */ div { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div /* comment */ { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { /* comment */ color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color /* comment */ : red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : /* comment */ red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : red /* comment */; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : red; /* comment */ }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : red; } /* comment */`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`[ /* comment */ myattr="myvalue"] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`[myattr /* comment */ ="myvalue"] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`[myattr= /* comment */ "myvalue"] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`[myattr="myvalue" /* comment */ ] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`:not( /* comment */ div) { }`);
      assertEqual(rules[0].cssText, `:not(div) { }`);

      var rules = getRulesFromCssText(`:not(div /* comment */ ) { }`);
      assertEqual(rules[0].cssText, `:not(div) { }`);

      // unpaired comments are removed
      var rules = getRulesFromCssText(`body > div { color: red; } /* comment`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      // attribute selector: value is double quoted
      var rules = getRulesFromCssText(`[myattr=myvalue] { }`);
      assertEqual(rules[0].selectorText, `[myattr="myvalue"]`);

      var rules = getRulesFromCssText(`[myattr='my value'] { }`);
      assertEqual(rules[0].selectorText, `[myattr="my value"]`);

      // property value is double quoted
      var rules = getRulesFromCssText(`p::after { content: 'my value'; }`);
      assertEqual(rules[0].cssText, `p::after { content: "my value"; }`);

      // quoting: double quotes and backslashes are escaped
      var rules = getRulesFromCssText(String.raw`[a=\"my\"attr\\value] { }`);
      assertEqual(rules[0].selectorText, String.raw`[a="\"my\"attr\\value"]`);

      var rules = getRulesFromCssText(String.raw`[a='"my" attr\\value'] { }`);
      assertEqual(rules[0].selectorText, String.raw`[a="\"my\" attr\\value"]`);

      // quoting: ASCII control chars (0x01~0x19) are hex-escaped with lower case and space
      var rules = getRulesFromCssText(String.raw`[myattr=\1\2\3\4\5\6\7\8\9\A\B\C\D\E\F] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr="\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "]`);

      var rules = getRulesFromCssText(String.raw`[myattr=\10\11\12\13\14\15\16\17\18\19\7F] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr="\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \7f "]`);

      // quoting: other ASCII symbols are unescaped
      var rules = getRulesFromCssText(String.raw`[myattr=\20\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr=" !\"#$%&'()*+,-./"]`);

      var rules = getRulesFromCssText(String.raw`[myattr=\3A\3B\3C\3D\3E\3F\40\5B\5D\5E\5F\7B\7C\7D\7E] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr=":;<=>?@[]^_{|}~"]`);

      // quoting: Unicode chars are unescaped
      var rules = getRulesFromCssText(String.raw`[myattr=\80\81\9E\9F] { }`);
      assertEqual(rules[0].selectorText, `[myattr="\x80\x81\x9E\x9F"]`);

      var rules = getRulesFromCssText(String.raw`[myattr="\3000 \4E00 \20000 \100000"] { }`);
      assertEqual(rules[0].selectorText, `[myattr="\u3000\u4E00\u{20000}\u{100000}"]`);
    });

  });
});

});  // Test libraries
