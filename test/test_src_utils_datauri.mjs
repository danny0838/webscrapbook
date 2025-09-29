import {MochaQuery as $, assert} from "./unittest.mjs";

import {dataUriToFile} from "./shared/utils/datauri.mjs";

const $describe = $(describe);

describe('utils/datauri.mjs', function () {
  $describe.skipIf($.noBrowser)('dataUriToFile()', function () {
    it('take filename when useFilename not specified', async function () {
      var datauri = `data:image/bmp;filename=${encodeURIComponent('ABC123中文𠀀')};base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await dataUriToFile(datauri);
      assert.strictEqual(file.name, "ABC123中文𠀀");
      assert.strictEqual(file.type, "image/bmp;filename=abc123%e4%b8%ad%e6%96%87%f0%a0%80%80");
      assert.strictEqual(file.size, 60);

      var datauri = `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await dataUriToFile(datauri);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp");
      assert.strictEqual(file.size, 60);
    });

    it('take filename when useFilename is truthy', async function () {
      var datauri = `data:image/bmp;filename=${encodeURIComponent('ABC123中文𠀀')};base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await dataUriToFile(datauri, true);
      assert.strictEqual(file.name, "ABC123中文𠀀");
      assert.strictEqual(file.type, "image/bmp;filename=abc123%e4%b8%ad%e6%96%87%f0%a0%80%80");
      assert.strictEqual(file.size, 60);

      var datauri = `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await dataUriToFile(datauri, true);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp");
      assert.strictEqual(file.size, 60);
    });

    it('do not take filename when useFilename is falsy', async function () {
      var datauri = `data:image/bmp;filename=${encodeURIComponent('ABC123中文𠀀')};base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await dataUriToFile(datauri, false);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp;filename=abc123%e4%b8%ad%e6%96%87%f0%a0%80%80");
      assert.strictEqual(file.size, 60);

      var datauri = `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`;
      var file = await dataUriToFile(datauri, false);
      assert.strictEqual(file.name, "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp");
      assert.strictEqual(file.type, "image/bmp");
      assert.strictEqual(file.size, 60);
    });
  });
});
