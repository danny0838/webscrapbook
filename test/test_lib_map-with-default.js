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

const {MochaQuery: $, assertEqual} = unittest;

describe('lib/map-with-default.js', function () {

  describe('MapWithDefault', function () {

    it('factory function', function () {
      var myMap = new MapWithDefault(() => ({}));
      assertEqual(myMap.has('key'), false);
      assertEqual(myMap.get('key'), {});
      assertEqual(myMap.has('key'), true);
    });

    it('factory function with key parameter', function () {
      var myMap = new MapWithDefault((key) => ({default: key}));
      assertEqual(myMap.has('mykey'), false);
      assertEqual(myMap.get('mykey'), {default: 'mykey'});
      assertEqual(myMap.has('mykey'), true);
    });

    it('factory function and default entries', function () {
      var myMap = new MapWithDefault(() => 'default', [['k1', 'v1'], ['k2', 'v2']]);
      assertEqual(myMap.get('k1'), 'v1');
      assertEqual(myMap.get('k2'), 'v2');
      assertEqual(myMap.has('mykey'), false);
      assertEqual(myMap.get('mykey'), 'default');
      assertEqual(myMap.has('mykey'), true);
    });

  });

});

}));
