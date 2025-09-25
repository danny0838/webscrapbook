import {MochaQuery as $, assert} from "./unittest.mjs";

import {MapWithDefault} from "../lib/map-with-default.mjs";

describe('lib/map-with-default.mjs', function () {
  describe('MapWithDefault', function () {
    describe('constructor()', function () {
      it('should generate value when getting a non-exist key using the factory function', function () {
        var myMap = new MapWithDefault(() => ({}));
        assert.strictEqual(myMap.has('key'), false);
        assert.deepEqual(myMap.get('key'), {});
        assert.strictEqual(myMap.has('key'), true);
      });

      it('should pass the getting key to the factory function', function () {
        var myMap = new MapWithDefault((key) => ({default: key}));
        assert.strictEqual(myMap.has('mykey'), false);
        assert.deepEqual(myMap.get('mykey'), {default: 'mykey'});
        assert.strictEqual(myMap.has('mykey'), true);
      });

      it('should handle default entries', function () {
        var myMap = new MapWithDefault(() => 'default', [['k1', 'v1'], ['k2', 'v2']]);
        assert.strictEqual(myMap.get('k1'), 'v1');
        assert.strictEqual(myMap.get('k2'), 'v2');
        assert.strictEqual(myMap.has('mykey'), false);
        assert.strictEqual(myMap.get('mykey'), 'default');
        assert.strictEqual(myMap.has('mykey'), true);
      });
    });
  });
});
