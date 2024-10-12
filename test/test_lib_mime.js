(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./shared/lib/mime'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './shared/lib/mime'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.Mime,
    );
  }
}(this, function (unittest, Mime) {

'use strict';

const {MochaQuery: $, assert} = unittest;

describe('lib/mime.js', function () {
  describe('Mime.extend', function () {
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

    it('no data', function () {
      Mime.extend('my/mime');
      assert.deepEqual(Mime.db['my/mime'], {extensions: []});
    });

    it('data with extensions', function () {
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

    it('data with extensions (important = true)', function () {
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

    it('data with extensions (minor = true)', function () {
      Mime.extend('my/mime', {extensions: ['myext1', 'myext2']}, {minor: true});
      assert.deepEqual(Mime.db['my/mime'], {extensions: ['myext1', 'myext2']});
      assert.notStrictEqual(Mime.types['myext1'], 'my/mime');
      assert.notStrictEqual(Mime.types['myext2'], 'my/mime');
    });

    it('data with properties', function () {
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

  describe('Mime.lookup', function () {
    it('pure extension', function () {
      assert.strictEqual(Mime.lookup('txt'), 'text/plain');
    });

    it('extension with dot', function () {
      assert.strictEqual(Mime.lookup('.txt'), 'text/plain');
    });

    it('filename', function () {
      assert.strictEqual(Mime.lookup('myfile.txt'), 'text/plain');
    });

    it('multi-dot filename (check last segment)', function () {
      assert.strictEqual(Mime.lookup('myfile.1.2.ext.txt'), 'text/plain');
    });

    it('POSIX path', function () {
      assert.strictEqual(Mime.lookup('/home/myuser/myfile.txt'), 'text/plain');
    });

    it('Windows path', function () {
      assert.strictEqual(Mime.lookup('C:\\Users\\MyUser\\myfile.txt'), 'text/plain');
    });

    it('URL', function () {
      assert.strictEqual(Mime.lookup('http://example.com/myfile.txt'), 'text/plain');
    });

    it('common types', function () {
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

    it('extended types', function () {
      assert.strictEqual(Mime.lookup('htz'), 'application/html+zip');
      assert.strictEqual(Mime.lookup('maff'), 'application/x-maff');
    });
  });

  describe('Mime.extension', function () {
    it('basic', function () {
      assert.strictEqual(Mime.extension('text/plain'), 'txt');
    });
  });

  describe('Mime.allExtensions', function () {
    it('common extensions', function () {
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

    it('extended extensions', function () {
      var exts = Mime.allExtensions('application/html+zip');
      assert.includeMembers(exts, ['htz']);

      var exts = Mime.allExtensions('application/x-maff');
      assert.includeMembers(exts, ['maff']);
    });
  });
});

}));
