import {assert} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";

import {Zip, zjs} from "../utils/zip.mjs";

describe('utils/zip.mjs', function () {
  afterEach(function () {
    sinon.restore();
  });

  describe('Zip', function () {
    describe('#generateAsync()', function () {
      function getDateTimeBytes(date) {
        let dosTime = date.getHours();
        dosTime = dosTime << 6;
        dosTime = dosTime | date.getMinutes();
        dosTime = dosTime << 5;
        dosTime = dosTime | Math.ceil(date.getSeconds() / 2);

        let dosDate = date.getFullYear() - 1980;
        dosDate = dosDate << 4;
        dosDate = dosDate | (date.getMonth() + 1);
        dosDate = dosDate << 5;
        dosDate = dosDate | date.getDate();

        const u8ar = new Uint8Array(4);
        const view = new DataView(u8ar.buffer);
        view.setUint16(0, dosTime, true);
        view.setUint16(2, dosDate, true);
        return u8ar;
      }

      it('should store local DOS datetime for entries', async function () {
        // even seconds is saved as-is
        var date = new Date('2025-01-01T00:00:00.123-06:00');
        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = new zjs.ZipReader(new zjs.BlobReader(zipfile));
        var entry = (await zip.getEntries())[0];
        assert.strictEqual(entry.lastModDate.toISOString(), '2025-01-01T06:00:00.000Z');

        var u8ar = new Uint8Array(4);
        var view = new DataView(u8ar.buffer);
        view.setInt32(0, entry.rawLastModDate, true);
        assert.deepEqual(u8ar, getDateTimeBytes(date));

        // odd seconds is rounded up
        var date = new Date('2025-01-01T00:00:01.123-06:00');
        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = new zjs.ZipReader(new zjs.BlobReader(zipfile));
        var entry = (await zip.getEntries())[0];
        assert.strictEqual(entry.lastModDate.toISOString(), '2025-01-01T06:00:01.000Z');

        var u8ar = new Uint8Array(4);
        var view = new DataView(u8ar.buffer);
        view.setInt32(0, entry.rawLastModDate, true);
        assert.deepEqual(u8ar, getDateTimeBytes(date));
      });

      it('should store precise datetime with extended timestamp for entries', async function () {
        var date = new Date('2025-01-01T00:00:01.123-06:00');
        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = new zjs.ZipReader(new zjs.BlobReader(zipfile));
        var entry = (await zip.getEntries())[0];
        assert.strictEqual(entry.lastModDate.toISOString(), '2025-01-01T06:00:01.000Z');
        assert.exists(entry.extraFieldExtendedTimestamp);
        assert.notExists(entry.extraFieldNTFS);
      });

      it('should store precise datetime with NTFS extra field for entries after 2038', async function () {
        var date = new Date('2040-01-01T00:00:01.123-06:00');
        var zip = new Zip();
        zip.file('file.txt', 'foo', {date});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = new zjs.ZipReader(new zjs.BlobReader(zipfile));
        var entry = (await zip.getEntries())[0];
        assert.strictEqual(entry.lastModDate.toISOString(), '2040-01-01T06:00:01.123Z');
        assert.notExists(entry.extraFieldExtendedTimestamp);
        assert.exists(entry.extraFieldNTFS);
      });

      it('should store filename as UTF-8 for entries', async function () {
        var zip = new Zip();
        zip.file('中文𠀀.txt', 'foo');
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = new zjs.ZipReader(new zjs.BlobReader(zipfile));
        var entry = (await zip.getEntries())[0];
        assert.strictEqual(entry.filename, '中文𠀀.txt');
      });

      it('should store comment as UTF-8 for entries', async function () {
        var zip = new Zip();
        zip.file('file.txt', 'foo', {comment: '中文𠀀'});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = new zjs.ZipReader(new zjs.BlobReader(zipfile));
        var entry = (await zip.getEntries())[0];
        assert.strictEqual(entry.comment, '中文𠀀');
      });

      it('should generate parent folders when `createFolders` is omitted', async function () {
        var date = new Date('2025-01-01T00:00:00+08:00');
        var zip = new Zip();
        zip.file('a/b/c.txt', 'foo', {date});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        assert.hasAllKeys(zip.files, ['a/', 'a/b/', 'a/b/c.txt']);
        assert.approximately(zip.files['a/'].date.valueOf(), Date.now(), 2000);
        assert.approximately(zip.files['a/b/'].date.valueOf(), Date.now(), 2000);
        assert.strictEqual(zip.files['a/b/c.txt'].date.valueOf(), date.valueOf());
      });

      it('should generate parent folders when `createFolders` is truthy', async function () {
        var date = new Date('2025-01-01T00:00:00+08:00');
        var zip = new Zip();
        zip.file('a/b/c.txt', 'foo', {date, createFolders: true});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        assert.hasAllKeys(zip.files, ['a/', 'a/b/', 'a/b/c.txt']);
        assert.approximately(zip.files['a/'].date.valueOf(), Date.now(), 2000);
        assert.approximately(zip.files['a/b/'].date.valueOf(), Date.now(), 2000);
        assert.strictEqual(zip.files['a/b/c.txt'].date.valueOf(), date.valueOf());
      });

      it('should not generate parent folders when `createFolders` is falsy', async function () {
        var date = new Date('2025-01-01T00:00:00+08:00');
        var zip = new Zip();
        zip.file('a/b/c.txt', 'foo', {date, createFolders: false});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        assert.hasAllKeys(zip.files, ['a/b/c.txt']);
        assert.strictEqual(zip.files['a/b/c.txt'].date.valueOf(), date.valueOf());
      });

      it('should not compress content when `compression` is `STORE`', async function () {
        var zip = new Zip();
        zip.file('file.txt', 'foo', {compression: 'STORE'});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        assert.strictEqual(zip.files['file.txt']._entry.compressionMethod, 0);
        assert.strictEqual(zip.files['file.txt']._entry.compressedSize, zip.files['file.txt']._entry.uncompressedSize);
      });

      it('should compress content when `compression` is `DEFLATE`', async function () {
        var zip = new Zip();
        zip.file('file.txt', 'foo', {compression: 'DEFLATE'});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        assert.strictEqual(zip.files['file.txt']._entry.compressionMethod, 8);
        assert.notStrictEqual(zip.files['file.txt']._entry.compressedSize, zip.files['file.txt']._entry.uncompressedSize);
      });
    });

    describe('#loadAsync()', function () {
      it('should load DOS datetime as local timezone for entries', async function () {
        var date = new Date('2025-01-01T00:00:00-06:00');
        var zip = new zjs.ZipWriter(new zjs.BlobWriter());
        await zip.add('file.txt', new zjs.TextReader('foo'), {lastModDate: date, extendedTimestamp: false});
        var zipfile = await zip.close();

        var zip = await new Zip().loadAsync(zipfile);
        assert.instanceOf(zip, Zip);
        assert.strictEqual(zip.files['file.txt'].date.toISOString(), '2025-01-01T06:00:00.000Z');
      });
    });

    describe('.loadAsync()', function () {
      it('should create an instance of the same class and call with same arguments', async function () {
        var zip = new zjs.ZipWriter(new zjs.BlobWriter());
        await zip.add('file.txt', new zjs.TextReader('foo'));
        var zipfile = await zip.close();

        var spy = sinon.spy(Zip.prototype, 'loadAsync');
        var zip = await Zip.loadAsync(zipfile);
        assert.instanceOf(zip, Zip);
        sinon.assert.calledOnceWithExactly(spy, zipfile);
      });
    });
  });
});
