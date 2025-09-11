import {assert} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";

import {Zip} from "./shared/utils/zip.mjs";

describe('utils/zip.mjs', function () {
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox?.restore();
  });

  describe('Zip', function () {
    describe('#file()', function () {
      context('when input data is a Blob', function () {
        it('should save a text file as DEFLATE with compression level 9', function () {
          var zip = new Zip();

          zip.file('file', new Blob(['foo'], {type: 'text/plain'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'text/html'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'text/css'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'text/javascript'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'text/xml'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'application/javascript'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'application/json'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'application/xml'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});

          zip.file('file', new Blob(['foo'], {type: 'image/svg+xml'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'DEFLATE', compressionOptions: {level: 9}});
        });

        it('should save a non-text file as STORE', function () {
          var zip = new Zip();

          zip.file('file', new Blob(['foo'], {type: 'application/octet-stream'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'STORE', compressionOptions: null});

          zip.file('file', new Blob(['foo'], {type: 'image/jpeg'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'STORE', compressionOptions: null});

          zip.file('file', new Blob(['foo'], {type: 'image/gif'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'STORE', compressionOptions: null});

          zip.file('file', new Blob(['foo'], {type: 'image/png'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'STORE', compressionOptions: null});

          zip.file('file', new Blob(['foo'], {type: 'application/pdf'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'STORE', compressionOptions: null});

          zip.file('file', new Blob(['foo'], {type: 'application/zip'}));
          assert.deepEqual(zip.files['file'].options, {compression: 'STORE', compressionOptions: null});
        });

        it('should generate a new `options` if not provided', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          assert.strictEqual(zip.file(file, data), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {compression: 'DEFLATE', compressionOptions: {level: 9}}]);
        });

        it('should generate a new `options` with merged keys if provided', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          var options = {key1: 'value1'};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {key1: 'value1', compression: 'DEFLATE', compressionOptions: {level: 9}}]);
          assert.notStrictEqual(spy.lastCall.args[2], options);
        });

        it('should generate a new `options.compressionOptions` with merged keys if provided', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          var options = {compressionOptions: {comment: 'test'}};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {compression: 'DEFLATE', compressionOptions: {comment: 'test', level: 9}}]);
          assert.notStrictEqual(spy.lastCall.args[2], options);
          assert.notStrictEqual(spy.lastCall.args[2].compressionOptions, options.compressionOptions);
        });

        it('should pass input `options.compressionOptions` if level defined', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          var options = {compressionOptions: {level: 6}};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {compression: 'DEFLATE', compressionOptions: {level: 6}}]);
          assert.notStrictEqual(spy.lastCall.args[2], options);
          assert.strictEqual(spy.lastCall.args[2].compressionOptions, options.compressionOptions);
        });

        it('should do nothing if `options.compreession` is defined', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          var options = {compression: 'DEFLATE'};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {compression: 'DEFLATE'}]);
          assert.strictEqual(spy.lastCall.args[2], options);

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          var options = {compression: 'STORE'};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {compression: 'STORE'}]);
          assert.strictEqual(spy.lastCall.args[2], options);

          var zip = new Zip();
          var file = 'file1';
          var data = new Blob(['foo'], {type: 'text/plain'});
          var options = {compression: null};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, {compression: null}]);
          assert.strictEqual(spy.lastCall.args[2], options);
        });
      });

      context('when input data is not a Blob', function () {
        it('should call `JSZip.file` with same input', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();

          var file = 'file1';
          var data = 'foo';
          assert.strictEqual(zip.file(file, data), zip);
          assert.deepEqual(spy.lastCall.args, [file, data]);

          var file = 'file2';
          var data = new Uint8Array([12, 34, 56]);
          var options = undefined;
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, options]);

          var file = 'file3';
          var data = Promise.resolve('bar');
          var options = {compression: 'DEFLATE'};
          assert.strictEqual(zip.file(file, data, options), zip);
          assert.deepEqual(spy.lastCall.args, [file, data, options]);
        });
      });

      context('when no input data', function () {
        it('should call `JSZip.file` with same input', function () {
          var spy = sandbox.spy(globalThis.JSZip.prototype, 'file');

          var zip = new Zip();
          zip.file('file', 'foo');
          assert.strictEqual(zip.file('file'), zip.files['file']);
          assert.deepEqual(spy.lastCall.args, ['file']);
        });
      });
    });

    describe('#generateAsync()', function () {
      function toLittleEndian(num, byteLength) {
        const bytes = [];
        for (let i = 0; i < byteLength; i++) {
          const shift = 8 * i;
          const byte = (num >> shift) & 0xff;
          bytes.push(byte);
        }
        return bytes;
      }

      function getDateTimeBytes(date) {
        let dosTime = date.getHours();
        dosTime = dosTime << 6;
        dosTime = dosTime | date.getMinutes();
        dosTime = dosTime << 5;
        dosTime = dosTime | date.getSeconds() / 2;

        let dosDate = date.getFullYear() - 1980;
        dosDate = dosDate << 4;
        dosDate = dosDate | (date.getMonth() + 1);
        dosDate = dosDate << 5;
        dosDate = dosDate | date.getDate();

        return [...toLittleEndian(dosTime, 2), ...toLittleEndian(dosDate, 2)];
      }

      function getDateTimeBytes2(date) {
        let dosTime = date.getUTCHours();
        dosTime = dosTime << 6;
        dosTime = dosTime | date.getUTCMinutes();
        dosTime = dosTime << 5;
        dosTime = dosTime | date.getUTCSeconds() / 2;

        let dosDate = date.getUTCFullYear() - 1980;
        dosDate = dosDate << 4;
        dosDate = dosDate | (date.getUTCMonth() + 1);
        dosDate = dosDate << 5;
        dosDate = dosDate | date.getUTCDate();

        return [...toLittleEndian(dosTime, 2), ...toLittleEndian(dosDate, 2)];
      }

      it('should store local time for the generated ZIP file', async function () {
        var date = new Date('2025-01-01T00:00:00-06:00');

        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        assert.strictEqual(zip.files['file.txt'].date.toISOString(), '2025-01-01T06:00:00.000Z');

        var u8ar = await zip.generateAsync({type: 'uint8array'});
        assert.deepEqual(u8ar.slice(10, 14), new Uint8Array(getDateTimeBytes(date)));

        // should get same result in multiple runs
        var u8ar2 = await zip.generateAsync({type: 'uint8array'});
        assert.deepEqual(u8ar2, u8ar);
      });

      it('should store UTC time for the generated ZIP file when `fixModifiedTime` not set', async function () {
        var date = new Date('2025-01-01T00:00:00-06:00');

        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        assert.strictEqual(zip.files['file.txt'].date.toISOString(), '2025-01-01T06:00:00.000Z');

        var u8ar = await zip.generateAsync({type: 'uint8array', fixModifiedTime: false});
        assert.deepEqual(u8ar.slice(10, 14), new Uint8Array(getDateTimeBytes2(date)));

        // should get same result in multiple runs
        var u8ar2 = await zip.generateAsync({type: 'uint8array', fixModifiedTime: false});
        assert.deepEqual(u8ar2, u8ar);
      });
    });

    describe('#loadAsync()', function () {
      function fixDateTime(date) {
        return new Date(date.valueOf() + date.getTimezoneOffset() * 60 * 1000);
      }

      it('should load as local time from a ZIP file', async function () {
        var date = new Date('2025-01-01T00:00:00-06:00');

        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        var u8ar = await zip.generateAsync({type: 'uint8array'});

        var zip2 = await new Zip().loadAsync(u8ar);
        assert.instanceOf(zip2, Zip);
        assert.strictEqual(zip2.files['file.txt'].date.toISOString(), '2025-01-01T06:00:00.000Z');
      });

      it('should load as UTC time from a ZIP file when `fixModifiedTime` not set', async function () {
        var date = new Date('2025-01-01T00:00:00-06:00');

        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        var u8ar = await zip.generateAsync({type: 'uint8array'});

        var zip2 = await new Zip().loadAsync(u8ar, {fixModifiedTime: false});
        assert.instanceOf(zip2, Zip);
        assert.strictEqual(fixDateTime(zip2.files['file.txt'].date).toISOString(), '2025-01-01T06:00:00.000Z');
      });
    });

    describe('.loadAsync()', function () {
      it('should create an instance of the same class', async function () {
        var _zip = new Zip();
        _zip.file('file.txt', 'foo');
        var zipfile = await _zip.generateAsync({type: 'uint8array'});

        var zip = await Zip.loadAsync(zipfile);
        assert.instanceOf(zip, Zip);
      });

      it('should call with same arguments', async function () {
        var stub = sandbox.stub(Zip.prototype, 'loadAsync');

        var dummyZipFile = {};
        await Zip.loadAsync(dummyZipFile);
        sinon.assert.calledOnceWithExactly(stub, dummyZipFile);
      });
    });
  });
});
