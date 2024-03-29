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

const {MochaQuery: $, assert, assertEqual} = unittest;

describe('lib/mime.js', function () {

  describe('Mime.extend', function () {
    // Test with invalid MIME types (should be all lower case) and extensions
    // (should not contain the starting ".") to prevent a potential conflict.

    it('no data', function () {
      Mime.extend('MY/MIME1');
      assertEqual(Mime.db['MY/MIME1'], {extensions: []});
    });

    it('data with extensions', function () {
      // add extensions
      Mime.extend('MY/MIME2', {extensions: ['.myext1', '.myext2']});
      assertEqual(Mime.db['MY/MIME2'], {extensions: ['.myext1', '.myext2']});

      // add extensions at last
      Mime.extend('MY/MIME2', {extensions: ['.myext3', '.myext4']});
      assertEqual(Mime.db['MY/MIME2'], {extensions: ['.myext1', '.myext2', '.myext3', '.myext4']});
    });

    it('data with extensions (important = true)', function () {
      // add extensions
      Mime.extend('MY/MIME3', {extensions: ['.myext1', '.myext2']});
      assertEqual(Mime.db['MY/MIME3'], {extensions: ['.myext1', '.myext2']});

      // add extensions at first
      Mime.extend('MY/MIME3', {extensions: ['.myext3', '.myext4']}, {important: true});
      assertEqual(Mime.db['MY/MIME3'], {extensions: ['.myext3', '.myext4', '.myext1', '.myext2']});
    });

    it('data with properties', function () {
      // add properties
      Mime.extend('MY/MIME4', {source: 'foo', charset: 'ASCII', compressible: true});
      assertEqual(Mime.db['MY/MIME4'], {extensions: [], source: 'foo', charset: 'ASCII', compressible: true});

      // update properties
      Mime.extend('MY/MIME4', {source: 'bar', charset: 'UTF-8', compressible: false, newprop: 'newvalue'});
      assertEqual(Mime.db['MY/MIME4'], {extensions: [], source: 'bar', charset: 'UTF-8', compressible: false, newprop: 'newvalue'});
    });

  });

  describe('Mime.lookup', function () {

    it('pure extension', function () {
      assertEqual(Mime.lookup('txt'), 'text/plain');
    });

    it('extension with dot', function () {
      assertEqual(Mime.lookup('.txt'), 'text/plain');
    });

    it('filename', function () {
      assertEqual(Mime.lookup('myfile.txt'), 'text/plain');
    });

    it('multi-dot filename (check last segment)', function () {
      assertEqual(Mime.lookup('myfile.1.2.ext.txt'), 'text/plain');
    });

    it('POSIX path', function () {
      assertEqual(Mime.lookup('/home/myuser/myfile.txt'), 'text/plain');
    });

    it('Windows path', function () {
      assertEqual(Mime.lookup('C:\\Users\\MyUser\\myfile.txt'), 'text/plain');
    });

    it('URL', function () {
      assertEqual(Mime.lookup('http://example.com/myfile.txt'), 'text/plain');
    });

    it('common types', function () {
      assertEqual(Mime.lookup('htm'), 'text/html');
      assertEqual(Mime.lookup('html'), 'text/html');
      assertEqual(Mime.lookup('xht'), 'application/xhtml+xml');
      assertEqual(Mime.lookup('xhtml'), 'application/xhtml+xml');
      assertEqual(Mime.lookup('xml'), 'text/xml');
      assertEqual(Mime.lookup('css'), 'text/css');
      assertEqual(Mime.lookup('js'), 'text/javascript');
      assertEqual(Mime.lookup('mjs'), 'text/javascript');
      assertEqual(Mime.lookup('jpg'), 'image/jpeg');
      assertEqual(Mime.lookup('gif'), 'image/gif');
      assertEqual(Mime.lookup('png'), 'image/png');
      assertEqual(Mime.lookup('svg'), 'image/svg+xml');
      assertEqual(Mime.lookup('ogg'), 'audio/ogg');
      assertEqual(Mime.lookup('oga'), 'audio/ogg');
      assertEqual(Mime.lookup('ogv'), 'video/ogg');
      assertEqual(Mime.lookup('ogx'), 'application/ogg');
    });

    it('extended types', function () {
      assertEqual(Mime.lookup('htz'), 'application/html+zip');
      assertEqual(Mime.lookup('maff'), 'application/x-maff');
    });

  });

  describe('Mime.extension', function () {

    it('basic', function () {
      assertEqual(Mime.extension('text/plain'), 'txt');
    });

  });

  describe('Mime.allExtensions', function () {

    it('common extensions', function () {
      var exts = Mime.allExtensions('text/html');
      assert(['html', 'htm'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('application/xhtml+xml');
      assert(['xhtml', 'xht'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('text/xml');
      assert(['xml'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('text/css');
      assert(['css'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('text/javascript');
      assert(['js', 'mjs'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('application/javascript');
      assert(['js'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('image/jpeg');
      assert(['jpg', 'jpeg'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('image/gif');
      assert(['gif'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('image/png');
      assert(['png'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('image/svg+xml');
      assert(['svg'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('audio/ogg');
      assert(['oga', 'ogg'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('video/ogg');
      assert(['ogv'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('application/ogg');
      assert(['ogx'].every(ext => exts.includes(ext)));
    });

    it('extended extensions', function () {
      var exts = Mime.allExtensions('application/html+zip');
      assert(['htz'].every(ext => exts.includes(ext)));

      var exts = Mime.allExtensions('application/x-maff');
      assert(['maff'].every(ext => exts.includes(ext)));
    });

  });

});

}));
