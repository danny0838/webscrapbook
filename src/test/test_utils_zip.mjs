import {assert} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";

import {Zip, zjs} from "../utils/zip.mjs";

describe('utils/zip.mjs', function () {
  afterEach(function () {
    sinon.restore();
  });

  describe('Zip', function () {
    async function zipFactory() {
      var zip = new Zip();
      zip.file('a/b/c.txt', 'foo');
      zip.file('a/e/f.txt', 'bar');
      return await zip.generateAsync({type: 'blob'});
    }

    async function zipFactoryPhysical() {
      var zip = new Zip();
      zip.file('a/b/c.txt', 'foo', {createFolders: true});
      zip.file('a/e/f.txt', 'bar', {createFolders: true});
      return await zip.generateAsync({type: 'blob'});
    }

    describe('#file()', function () {
      context('passing (string)', function () {
        it('should return a ZipObjectReader when file exists', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var file = zip.file('a/b/c.txt');
          assert.strictEqual(file.name, 'a/b/c.txt');
          assert.strictEqual(file.dir, false);
          assert.strictEqual(await (await file.async('blob')).text(), 'foo');
        });

        it('should return undefined when file not exists', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          assert.isUndefined(zip.file('nonexist'));
        });

        it('should match subpath from root', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var zip1 = zip.folder('a/');
          var file = zip1.file('b/c.txt');
          assert.strictEqual(file.name, 'a/b/c.txt');
          assert.strictEqual(file.dir, false);
          assert.strictEqual(await (await file.async('blob')).text(), 'foo');
        });
      });

      context('passing (regex)', function () {
        it('should return ZipObjectReader[]', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var [file1, file2] = zip.file(/^a/);

          assert.strictEqual(file1.name, 'a/b/c.txt');
          assert.strictEqual(file1.dir, false);
          assert.strictEqual(await (await file1.async('blob')).text(), 'foo');

          assert.strictEqual(file2.name, 'a/e/f.txt');
          assert.strictEqual(file2.dir, false);
          assert.strictEqual(await (await file2.async('blob')).text(), 'bar');
        });

        it('should return [] when no matching', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          assert.deepEqual(zip.file(/^nonexist/), []);
        });

        it('should match subpath from root', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var zip1 = zip.folder('a/');
          var [file1] = zip1.file(/^b/);

          assert.strictEqual(file1.name, 'a/b/c.txt');
          assert.strictEqual(file1.dir, false);
          assert.strictEqual(await (await file1.async('blob')).text(), 'foo');
        });
      });

      context('passing (string, data)', function () {
        it('should create a new file and return self', async function () {
          var zip = new Zip();
          var zip1 = zip.file('a/b/c.txt', 'foo');
          assert.strictEqual(zip1, zip);
          assert.deepEqual(Object.keys(zip1.files), ['a/b/c.txt']);
        });

        it('should create at subpath from root', async function () {
          var zip = new Zip();
          var zip1 = zip.folder('a/');
          var zip2 = zip1.file('b/c.txt', 'foo');
          assert.strictEqual(zip2, zip1);
          assert.deepEqual(Object.keys(zip2.files), ['a/b/c.txt']);
        });

        it('should accept string as data', async function () {
          var zip = new Zip();
          zip.file('file.txt', 'foo');
          var zipfile = await zip.generateAsync({type: 'blob'});

          var zip = await Zip.loadAsync(zipfile);
          var file = zip.file('file.txt');
          assert.strictEqual(await (await file.async('blob')).text(), 'foo');
        });

        it('should accept Blob as data', async function () {
          var zip = new Zip();
          zip.file('file.txt', new Blob(['foo']));
          var zipfile = await zip.generateAsync({type: 'blob'});

          var zip = await Zip.loadAsync(zipfile);
          var file = zip.file('file.txt');
          assert.strictEqual(await (await file.async('blob')).text(), 'foo');
        });

        it('should accept Uint8Array as data', async function () {
          var zip = new Zip();
          zip.file('file.txt', new Uint8Array([0x66, 0x6F, 0x6F]));
          var zipfile = await zip.generateAsync({type: 'blob'});

          var zip = await Zip.loadAsync(zipfile);
          var file = zip.file('file.txt');
          assert.strictEqual(await (await file.async('blob')).text(), 'foo');
        });

        it('should accept null as empty data', async function () {
          var zip = new Zip();
          zip.file('file.txt', null);
          var zipfile = await zip.generateAsync({type: 'blob'});

          var zip = await Zip.loadAsync(zipfile);
          var file = zip.file('file.txt');
          assert.strictEqual(await (await file.async('blob')).text(), '');
        });

        it('should accept undefined as empty data', async function () {
          var zip = new Zip();
          zip.file('file.txt', undefined);
          var zipfile = await zip.generateAsync({type: 'blob'});

          var zip = await Zip.loadAsync(zipfile);
          var file = zip.file('file.txt');
          assert.strictEqual(await (await file.async('blob')).text(), '');
        });
      });
    });

    describe('#folder()', function () {
      context('passing (string)', function () {
        it('should return a new Zip with the subpath as root', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var zip1 = zip.folder('a/');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'a/');

          var zip1 = zip.folder('a/b/');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'a/b/');

          var zip1 = zip.folder('nonexist/');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'nonexist/');
        });

        it('should treat `subpath` as `subpath/`', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var zip1 = zip.folder('a');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'a/');

          var zip1 = zip.folder('a/b');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'a/b/');

          var zip1 = zip.folder('nonexist');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'nonexist/');
        });

        it('should match subpath from root', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          var zip1 = zip.folder('a/');
          assert.instanceOf(zip1, Zip);
          assert.strictEqual(zip1.root, 'a/');

          var zip2 = zip1.folder('b/');
          assert.instanceOf(zip2, Zip);
          assert.strictEqual(zip2.root, 'a/b/');

          var zip3 = zip2.folder('c/');
          assert.instanceOf(zip3, Zip);
          assert.strictEqual(zip3.root, 'a/b/c/');

          var zip4 = zip3.folder('d/');
          assert.instanceOf(zip4, Zip);
          assert.strictEqual(zip4.root, 'a/b/c/d/');
        });
      });

      context('passing (regex)', function () {
        it('should return ZipObjectReader[] for matching physical folders', async function () {
          var zipfile = await zipFactoryPhysical();
          var zip = await Zip.loadAsync(zipfile);
          var [folder1, folder2, folder3] = zip.folder(/^a\//);

          assert.strictEqual(folder1.name, 'a/');
          assert.strictEqual(folder1.dir, true);

          assert.strictEqual(folder2.name, 'a/b/');
          assert.strictEqual(folder2.dir, true);

          assert.strictEqual(folder3.name, 'a/e/');
          assert.strictEqual(folder3.dir, true);
        });

        it('should return [] if no matching physical folders', async function () {
          var zipfile = await zipFactory();
          var zip = await Zip.loadAsync(zipfile);
          assert.deepEqual(zip.folder(/^a\//), []);
        });

        it('should match subpath from root', async function () {
          var zipfile = await zipFactoryPhysical();
          var zip = await Zip.loadAsync(zipfile);
          var zip1 = zip.folder('a/');
          var [folder1] = zip1.folder(/^b\//);
          assert.strictEqual(folder1.name, 'a/b/');
          assert.strictEqual(folder1.dir, true);
        });
      });
    });

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

      it('should not generate parent folders when `createFolders` is omitted', async function () {
        var date = new Date('2025-01-01T00:00:00+08:00');
        var zip = new Zip();
        zip.file('a/b/c.txt', 'foo', {date});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        assert.hasAllKeys(zip.files, ['a/b/c.txt']);
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
        var file = zip.files['file.txt'];
        assert.strictEqual(file._entry.compressionMethod, 0);
        assert.strictEqual(file._entry.compressedSize, file._entry.uncompressedSize);
      });

      it('should compress content when `compression` is `DEFLATE`', async function () {
        var zip = new Zip();
        zip.file('file.txt', 'foo', {compression: 'DEFLATE'});
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        var file = zip.files['file.txt'];
        assert.strictEqual(file._entry.compressionMethod, 8);
        assert.notStrictEqual(file._entry.compressedSize, file._entry.uncompressedSize);
      });

      it('should not include content for a folder', async function () {
        var zip = new Zip();
        zip.file('folder/', null);
        var zipfile = await zip.generateAsync({type: 'blob'});

        var zip = await Zip.loadAsync(zipfile);
        var folder = zip.files['folder/'];
        assert.strictEqual(folder._entry.compressionMethod, 0);
        assert.strictEqual(folder._entry.compressedSize, 0);
        assert.strictEqual(folder._entry.uncompressedSize, 0);
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
