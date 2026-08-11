import {MochaQuery as $, assert} from "./unittest.mjs";

import * as Mime from "../lib/mime.mjs";

describe('lib/mime.js', function () {
  describe('Mime', function () {
    describe('.extend()', function () {
      let _db;
      let _types;

      before(function () {
        _db = JSON.parse(JSON.stringify(Mime.db));
        _types = JSON.parse(JSON.stringify(Mime.types));
      });

      afterEach(function () {
        Object.keys(Mime.db).forEach(key => delete Mime.db[key]);
        Object.assign(Mime.db, _db);
        Object.keys(Mime.types).forEach(key => delete Mime.types[key]);
        Object.assign(Mime.types, _types);
      });

      it('should generate an empty extensions list if no data is provided', function () {
        Mime.extend('my/mime');
        assert.deepEqual(Mime.db['my/mime'], {extensions: []});
      });

      it('should add extensions to the last', function () {
        // add extensions
        Mime.extend('my/mime', {extensions: ['myext1', 'myext2']});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext1', 'myext2']});
        assert.strictEqual(Mime.types['myext1'], 'my/mime');
        assert.strictEqual(Mime.types['myext2'], 'my/mime');

        // add extensions at last
        Mime.extend('my/mime', {extensions: ['myext3', 'myext4']});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext1', 'myext2', 'myext3', 'myext4']});
        assert.strictEqual(Mime.types['myext1'], 'my/mime');
        assert.strictEqual(Mime.types['myext2'], 'my/mime');
        assert.strictEqual(Mime.types['myext3'], 'my/mime');
        assert.strictEqual(Mime.types['myext4'], 'my/mime');
      });

      it('should add extensions to the first when `important` is truthy', function () {
        // add extensions
        Mime.extend('my/mime', {extensions: ['myext1', 'myext2']});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext1', 'myext2']});
        assert.strictEqual(Mime.types['myext1'], 'my/mime');
        assert.strictEqual(Mime.types['myext2'], 'my/mime');

        // add extensions at first
        Mime.extend('my/mime', {extensions: ['myext3', 'myext4']}, {important: true});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext3', 'myext4', 'myext1', 'myext2']});
        assert.strictEqual(Mime.types['myext1'], 'my/mime');
        assert.strictEqual(Mime.types['myext2'], 'my/mime');
        assert.strictEqual(Mime.types['myext3'], 'my/mime');
        assert.strictEqual(Mime.types['myext4'], 'my/mime');
      });

      it('should prevent duplicated extensions', function () {
        Mime.extend('my/mime', {extensions: ['myext1', 'myext2']});
        Mime.extend('my/mime', {extensions: ['myext2', 'myext3']});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext1', 'myext2', 'myext3']});
      });

      it('should prevent duplicated extensions when `important` is truthy', function () {
        Mime.extend('my/mime', {extensions: ['myext1', 'myext2']});
        Mime.extend('my/mime', {extensions: ['myext2', 'myext3']}, {important: true});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext2', 'myext3', 'myext1']});
      });

      it('should not add to reverse map if `minor` is truthy', function () {
        Mime.extend('my/mime', {extensions: ['myext1', 'myext2']}, {minor: true});
        assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext1', 'myext2']});
        assert.notStrictEqual(Mime.types['myext1'], 'my/mime');
        assert.notStrictEqual(Mime.types['myext2'], 'my/mime');
      });

      it('should add data properties', function () {
        // add properties
        Mime.extend('my/mime', {source: 'foo', charset: 'ASCII', compressible: true});
        assert.deepEqual(Mime.db['my/mime'], {
          extensions: [],
          source: 'foo',
          charset: 'ASCII',
          compressible: true,
        });

        // update properties
        Mime.extend('my/mime', {source: 'bar', charset: 'UTF-8', compressible: false, newprop: 'newvalue'});
        assert.deepEqual(Mime.db['my/mime'], {
          extensions: [],
          source: 'bar',
          charset: 'UTF-8',
          compressible: false,
          newprop: 'newvalue',
        });
      });
    });

    describe('.lookup()', function () {
      it('should work for pure extension', function () {
        assert.strictEqual(Mime.lookup('txt'), 'text/plain');
      });

      it('should work for extension with dot', function () {
        assert.strictEqual(Mime.lookup('.txt'), 'text/plain');
      });

      it('should work for filename', function () {
        assert.strictEqual(Mime.lookup('myfile.txt'), 'text/plain');
      });

      it('should work for multi-dot filename (check last segment)', function () {
        assert.strictEqual(Mime.lookup('myfile.1.2.ext.txt'), 'text/plain');
      });

      it('should work for POSIX path', function () {
        assert.strictEqual(Mime.lookup('/home/myuser/myfile.txt'), 'text/plain');
      });

      it('should work for Windows path', function () {
        assert.strictEqual(Mime.lookup('C:\\Users\\MyUser\\myfile.txt'), 'text/plain');
      });

      it('should work for URL', function () {
        assert.strictEqual(Mime.lookup('http://example.com/myfile.txt'), 'text/plain');
      });

      it('should work for common types', function () {
        assert.strictEqual(Mime.lookup('htm'), 'text/html');
        assert.strictEqual(Mime.lookup('html'), 'text/html');
        assert.strictEqual(Mime.lookup('xht'), 'application/xhtml+xml');
        assert.strictEqual(Mime.lookup('xhtml'), 'application/xhtml+xml');
        assert.strictEqual(Mime.lookup('xml'), 'text/xml');
        assert.strictEqual(Mime.lookup('css'), 'text/css');
        assert.strictEqual(Mime.lookup('js'), 'text/javascript');
        assert.strictEqual(Mime.lookup('mjs'), 'text/javascript');
        assert.strictEqual(Mime.lookup('jpg'), 'image/jpeg');
        assert.strictEqual(Mime.lookup('gif'), 'image/gif');
        assert.strictEqual(Mime.lookup('png'), 'image/png');
        assert.strictEqual(Mime.lookup('svg'), 'image/svg+xml');
        assert.strictEqual(Mime.lookup('ogg'), 'audio/ogg');
        assert.strictEqual(Mime.lookup('oga'), 'audio/ogg');
        assert.strictEqual(Mime.lookup('ogv'), 'video/ogg');
        assert.strictEqual(Mime.lookup('ogx'), 'application/ogg');
      });

      it('should work for extended types', function () {
        assert.strictEqual(Mime.lookup('htz'), 'application/html+zip');
        assert.strictEqual(Mime.lookup('maff'), 'application/x-maff');
      });
    });

    describe('.extension()', function () {
      it('should return the preferred extension for the provided MIME type', function () {
        assert.strictEqual(Mime.extension('text/plain'), 'txt');
      });

      it('should return null for an unknown MIME type', function () {
        assert.strictEqual(Mime.extension('unknown/type'), null);
      });
    });

    describe('.allExtensions()', function () {
      it('should return all extensions for the provided MIME type', function () {
        assert.deepEqual(Mime.allExtensions('text/javascript'), ['js', 'mjs']);
      });

      it('should return [] for an unknown MIME type', function () {
        assert.deepEqual(Mime.allExtensions('unknown/type'), []);
      });

      it('should work for common types', function () {
        var exts = Mime.allExtensions('text/html');
        assert.includeMembers(exts, ['html', 'htm']);

        var exts = Mime.allExtensions('application/xhtml+xml');
        assert.includeMembers(exts, ['xhtml', 'xht']);

        var exts = Mime.allExtensions('text/xml');
        assert.includeMembers(exts, ['xml']);

        var exts = Mime.allExtensions('text/css');
        assert.includeMembers(exts, ['css']);

        var exts = Mime.allExtensions('text/javascript');
        assert.includeMembers(exts, ['js', 'mjs']);

        var exts = Mime.allExtensions('application/javascript');
        assert.includeMembers(exts, ['js']);

        var exts = Mime.allExtensions('image/jpeg');
        assert.includeMembers(exts, ['jpg', 'jpeg']);

        var exts = Mime.allExtensions('image/gif');
        assert.includeMembers(exts, ['gif']);

        var exts = Mime.allExtensions('image/png');
        assert.includeMembers(exts, ['png']);

        var exts = Mime.allExtensions('image/svg+xml');
        assert.includeMembers(exts, ['svg']);

        var exts = Mime.allExtensions('audio/ogg');
        assert.includeMembers(exts, ['oga', 'ogg']);

        var exts = Mime.allExtensions('video/ogg');
        assert.includeMembers(exts, ['ogv']);

        var exts = Mime.allExtensions('application/ogg');
        assert.includeMembers(exts, ['ogx', 'ogg']);
      });

      it('should work for extended extensions', function () {
        var exts = Mime.allExtensions('application/html+zip');
        assert.includeMembers(exts, ['htz']);

        var exts = Mime.allExtensions('application/x-maff');
        assert.includeMembers(exts, ['maff']);
      });
    });

    describe('.isText()', function () {
      it('should return true for a text MIME type', function () {
        // text/*
        assert.isTrue(Mime.isText('text/plain'));
        assert.isTrue(Mime.isText('text/html'));
        assert.isTrue(Mime.isText('text/css'));
        assert.isTrue(Mime.isText('text/javascript'));

        // +xml
        assert.isTrue(Mime.isText('application/xhtml+xml'));
        assert.isTrue(Mime.isText('text/svg+xml'));
        assert.isTrue(Mime.isText('application/rdf+xml'));
        assert.isTrue(Mime.isText('application/xslt+xml'));

        // +json
        assert.isTrue(Mime.isText('application/ld+json'));

        // special text
        assert.isTrue(Mime.isText('application/javascript'));
        assert.isTrue(Mime.isText('application/ecmascript'));
        assert.isTrue(Mime.isText('application/json'));
        assert.isTrue(Mime.isText('application/yaml'));
        assert.isTrue(Mime.isText('application/xml'));
        assert.isTrue(Mime.isText('application/sql'));
        assert.isTrue(Mime.isText('application/rtf'));
      });

      it('should return false for a non-text MIME type', function () {
        // +zip are not text
        assert.isFalse(Mime.isText('application/epub+zip'));

        // others are not text
        assert.isFalse(Mime.isText('image/bmp'));
        assert.isFalse(Mime.isText('image/jpeg'));
        assert.isFalse(Mime.isText('image/gif'));
        assert.isFalse(Mime.isText('image/png'));
        assert.isFalse(Mime.isText('image/webp'));
        assert.isFalse(Mime.isText('image/vnd.microsoft.icon'));
        assert.isFalse(Mime.isText('image/x-icon'));
        assert.isFalse(Mime.isText('audio/mpeg'));
        assert.isFalse(Mime.isText('video/mp4'));
        assert.isFalse(Mime.isText('font/ttf'));
        assert.isFalse(Mime.isText('font/woff'));
        assert.isFalse(Mime.isText('application/zip'));
        assert.isFalse(Mime.isText('application/pdf'));
        assert.isFalse(Mime.isText('application/octet-stream'));
      });
    });

    describe('.isCompressible()', function () {
      it('should return true for text types', async function () {
        assert.isTrue(Mime.isCompressible('text/plain'));
        assert.isTrue(Mime.isCompressible('text/html'));
        assert.isTrue(Mime.isCompressible('text/css'));
        assert.isTrue(Mime.isCompressible('text/javascript'));
        assert.isTrue(Mime.isCompressible('text/markdown'));
      });

      it('should return true for text suffixes', async function () {
        assert.isTrue(Mime.isCompressible('application/xhtml+xml'));
        assert.isTrue(Mime.isCompressible('image/svg+xml'));
        assert.isTrue(Mime.isCompressible('application/ld+json'));
      });

      it('should return true for special types', async function () {
        assert.isTrue(Mime.isCompressible('application/javascript'));
        assert.isTrue(Mime.isCompressible('application/ecmascript'));
        assert.isTrue(Mime.isCompressible('application/x-ecmascript'));
        assert.isTrue(Mime.isCompressible('application/x-javascript'));
        assert.isTrue(Mime.isCompressible('application/json'));
        assert.isTrue(Mime.isCompressible('application/xml'));
        assert.isTrue(Mime.isCompressible('application/yaml'));
        assert.isTrue(Mime.isCompressible('application/rtf'));
        assert.isTrue(Mime.isCompressible('image/bmp'));
        assert.isTrue(Mime.isCompressible('image/x-icon'));
        assert.isTrue(Mime.isCompressible('font/ttf'));
      });

      it('should return false for falsy value', async function () {
        assert.isFalse(Mime.isCompressible());
        assert.isFalse(Mime.isCompressible(null));
        assert.isFalse(Mime.isCompressible(false));
        assert.isFalse(Mime.isCompressible(''));
      });

      it('should return false for binary types', async function () {
        assert.isFalse(Mime.isCompressible('image/jpeg'));
        assert.isFalse(Mime.isCompressible('image/png'));
        assert.isFalse(Mime.isCompressible('application/octet-stream'));
        assert.isFalse(Mime.isCompressible('application/ogg'));
        assert.isFalse(Mime.isCompressible('application/pdf'));
        assert.isFalse(Mime.isCompressible('application/zip'));
        assert.isFalse(Mime.isCompressible('application/x-rar-compressed'));
        assert.isFalse(Mime.isCompressible('application/x-gzip'));
        assert.isFalse(Mime.isCompressible('application/html+zip'));
        assert.isFalse(Mime.isCompressible('application/x-maff'));
      });

      it('should return false for binary suffixes', async function () {
        assert.isFalse(Mime.isCompressible('application/epub+zip'));
      });
    });

  });
});
