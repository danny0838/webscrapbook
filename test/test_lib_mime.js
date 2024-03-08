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

    it('basic', function () {
      var exts = Mime.allExtensions('image/jpeg');
      assert(['jpeg', 'jpg'].every(ext => exts.includes(ext)));
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
