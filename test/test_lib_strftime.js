(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./shared/lib/strftime'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './shared/lib/strftime'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.Strftime,
    );
  }
}(this, function (unittest, Strftime) {

'use strict';

const {MochaQuery: $, assert, assertEqual} = unittest;

describe('lib/strftime.js', function () {

  describe('Strftime.format', function () {

    it('isUtc = true', function () {
      var date = new Date(Date.UTC(2020, 1, 1, 0, 0, 0));
      var formatter = new Strftime({date, isUtc: true});
      assertEqual(formatter.format('%Y-%m-%dT%H:%M:%SZ'), '2020-02-01T00:00:00Z');
      assertEqual(formatter.format('%p'), 'AM');
      assertEqual(formatter.format('%%'), '%');
      assertEqual(formatter.format('%z'), '+0000');
    });

    it('isUtc = false', function () {
      var date = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));
      var formatter = new Strftime({date});
      assertEqual(formatter.format('%Y'), date.getFullYear().toString());
      assertEqual(formatter.format('%y'), date.getFullYear().toString().slice(0, -2));
      assertEqual(parseInt(formatter.format('%m'), 10), date.getMonth() + 1);
      assertEqual(parseInt(formatter.format('%d'), 10), date.getDate());
      assertEqual(parseInt(formatter.format('%H'), 10), date.getHours());
      assertEqual(parseInt(formatter.format('%M'), 10), date.getMinutes());
      assertEqual(parseInt(formatter.format('%S'), 10), date.getSeconds());
    });

    it('use current date if not provided', function () {
      var dateNow = new Date();
      var formatter = new Strftime();
      var formatted = formatter.format('%Y-%m-%dT%H:%M:%S%z');
      var date = new Date(formatted);
      assert(Math.abs(date - dateNow) < 3000);
    });

  });

  describe('Strftime.format (static)', function () {

    it('basic', function () {
      var dateNow = new Date();
      var formatted = Strftime.format('%Y-%m-%dT%H:%M:%S%z');
      var date = new Date(formatted);
      assert(Math.abs(date - dateNow) < 3000);
    });

    it('isUtc = true', function () {
      assertEqual(Strftime.format('%z', {isUtc: true}), '+0000');
    });

  });

});

}));
