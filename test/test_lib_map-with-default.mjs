(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./shared/lib/map-with-default'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './shared/lib/map-with-default'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.MapWithDefault,
    );
  }
}(this, function (unittest, MapWithDefault) {

'use strict';

const {MochaQuery: $, assert} = unittest;

describe('lib/map-with-default.js', function () {
  describe('MapWithDefault', function () {
    it('factory function', function () {
      var myMap = new MapWithDefault(() => ({}));
      assert.strictEqual(myMap.has('key'), false);
      assert.deepEqual(myMap.get('key'), {});
      assert.strictEqual(myMap.has('key'), true);
    });

    it('factory function with key parameter', function () {
      var myMap = new MapWithDefault((key) => ({default: key}));
      assert.strictEqual(myMap.has('mykey'), false);
      assert.deepEqual(myMap.get('mykey'), {default: 'mykey'});
      assert.strictEqual(myMap.has('mykey'), true);
    });

    it('factory function and default entries', function () {
      var myMap = new MapWithDefault(() => 'default', [['k1', 'v1'], ['k2', 'v2']]);
      assert.strictEqual(myMap.get('k1'), 'v1');
      assert.strictEqual(myMap.get('k2'), 'v2');
      assert.strictEqual(myMap.has('mykey'), false);
      assert.strictEqual(myMap.get('mykey'), 'default');
      assert.strictEqual(myMap.has('mykey'), true);
    });
  });
});

}));
