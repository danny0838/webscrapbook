import {assert} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";

import {Zip} from "../utils/zip.mjs";

describe('utils/zip.mjs', function () {
  afterEach(function () {
    sinon.restore();
  });

  describe('Zip', function () {
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
        var stub = sinon.stub(Zip.prototype, 'loadAsync');

        var dummyZipFile = {};
        await Zip.loadAsync(dummyZipFile);
        sinon.assert.calledOnceWithExactly(stub, dummyZipFile);
      });
    });
  });
});
