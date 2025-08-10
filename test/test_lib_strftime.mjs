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

const {MochaQuery: $, assert} = unittest;

describe('lib/strftime.js', function () {
  describe('Strftime.format', function () {
    it('isUtc = true', function () {
      var date = new Date(Date.UTC(2018, 1, 1, 0, 0, 0));
      var formatter = new Strftime({date, isUtc: true});
      assert.strictEqual(formatter.format('%Y-%m-%dT%H:%M:%SZ'), '2018-02-01T00:00:00Z');
      assert.strictEqual(formatter.format('%p'), 'AM');
      assert.strictEqual(formatter.format('%%'), '%');
      assert.strictEqual(formatter.format('%z'), '+0000');
    });

    it('isUtc = false', function () {
      var date = new Date(Date.UTC(2018, 0, 1, 0, 0, 0));
      var formatter = new Strftime({date});
      assert.strictEqual(formatter.format('%Y'), date.getFullYear().toString());
      assert.strictEqual(formatter.format('%y'), date.getFullYear().toString().slice(2));
      assert.strictEqual(parseInt(formatter.format('%m'), 10), date.getMonth() + 1);
      assert.strictEqual(parseInt(formatter.format('%d'), 10), date.getDate());
      assert.strictEqual(parseInt(formatter.format('%H'), 10), date.getHours());
      assert.strictEqual(parseInt(formatter.format('%M'), 10), date.getMinutes());
      assert.strictEqual(parseInt(formatter.format('%S'), 10), date.getSeconds());
    });

    it('use current date if not provided', function () {
      var dateNow = new Date();
      var formatter = new Strftime();
      var formatted = formatter.format('%Y-%m-%dT%H:%M:%S%z');
      var date = new Date(formatted);
      assert.closeTo(date.valueOf(), dateNow.valueOf(), 3000);
    });
  });

  describe('Strftime.format (static)', function () {
    it('basic', function () {
      var dateNow = new Date();
      var formatted = Strftime.format('%Y-%m-%dT%H:%M:%S%z');
      var date = new Date(formatted);
      assert.closeTo(date.valueOf(), dateNow.valueOf(), 3000);
    });

    it('isUtc = true', function () {
      assert.strictEqual(Strftime.format('%z', {isUtc: true}), '+0000');
    });
  });
});

}));
