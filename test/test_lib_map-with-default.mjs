import {MochaQuery as $, assert} from "./unittest.mjs";

import {MapWithDefault} from "./shared/lib/map-with-default.mjs";

describe('lib/map-with-default.mjs', function () {
  describe('MapWithDefault', function () {
    describe('constructor()', function () {
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
});
