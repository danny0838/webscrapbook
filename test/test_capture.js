(function (global, factory) {
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      global,
      require('./lib/unittest'),
      require('./shared/lib/jszip'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './shared/lib/jszip'],
      (...args) => {
        return factory(global, ...args);
      },
    );
  } else {
    // Browser globals
    factory(
      global,
      global.unittest,
      global.JSZip,
    );
  }
}(this, function (global, unittest, JSZip) {

'use strict';

const {
  MochaQuery: $, assert,
  userAgent,
  xhr, readFileAsText, readFileAsArrayBuffer, readFileAsDataURL, readFileAsDocument,
  getRulesFromCssText, getToken, escapeRegExp, regex, rawRegex, cssRegex,
} = unittest;

const $describe = $(describe);
const $it = $(it);

const r = String.raw;

const baseOptions = {
  "capture.saveTo": "memory",
  "capture.saveAs": "zip",
  "capture.saveAsciiFilename": false,
  "capture.saveOverwrite": false,
  "capture.saveFileAsHtml": false,
  "capture.saveDataUriAsFile": true,
  "capture.saveDataUriAsSrcdoc": true,
  "capture.saveResourcesSequentially": false,
  "capture.resourceSizeLimit": null,
  "capture.image": "save",
  "capture.imageBackground": "save",
  "capture.favicon": "save",
  "capture.faviconAttrs": "",
  "capture.canvas": "save",
  "capture.audio": "save",
  "capture.video": "save",
  "capture.embed": "save",
  "capture.object": "save",
  "capture.applet": "save",
  "capture.frame": "save",
  "capture.frameRename": true,
  "capture.font": "save",
  "capture.style": "save",
  "capture.styleInline": "save",
  "capture.rewriteCss": "url",
  "capture.mergeCssResources": false,
  "capture.script": "save",
  "capture.noscript": "save",
  "capture.contentSecurityPolicy": "remove",
  "capture.preload": "remove",
  "capture.prefetch": "remove",
  "capture.base": "blank",
  "capture.formStatus": "keep",
  "capture.shadowDom": "save",
  "capture.adoptedStyleSheet": "save",
  "capture.removeHidden": "none",
  "capture.linkUnsavedUri": false,
  "capture.downLink.file.mode": "none",
  "capture.downLink.file.extFilter": "",
  "capture.downLink.doc.depth": null,
  "capture.downLink.doc.delay": null,
  "capture.downLink.doc.mode": "source",
  "capture.downLink.doc.urlFilter": "",
  "capture.downLink.urlFilter": "",
  "capture.downLink.urlExtra": "",
  "capture.referrerPolicy": "",
  "capture.referrerSpoofSource": false,
  "capture.recordDocumentMeta": true,
  "capture.recordRewrites": false,
  "capture.insertInfoBar": false,
  "capture.helpersEnabled": false,
  "capture.helpers": "",
  "capture.remoteTabDelay": null,
  "capture.deleteErasedOnCapture": false,
  "capture.deleteErasedOnSave": false,
};

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const MAF = "http://maf.mozdev.org/metadata/rdf#";

/**
 * A helper function to assert whether scrapbook record exists.
 *
 * @param {Node} rootNode - the node to check
 * @param {Object} [options]
 * @param {boolean} [options.deep] - whether to iterate descendant nodes.
 * @param {string|Object} [options.filter] - the filter.
 */
function assertNoRecord(rootNode, {deep = true, filter = 'any'} = {}) {
  if (typeof filter === 'string') {
    filter = {
      any: {
        regexAttr: /^(?:\w+:)?data-scrapbook-orig-/,
        regexCmt: /^scrapbook-orig-/,
      },
      scrapbook: {
        regexAttr: /^(?:\w+:)?data-scrapbook-orig-(?:null-)?attr-data-scrapbook-/,
        regexCmt: null,
      },
    }[filter];
  }
  const {regexAttr, regexCmt} = filter;

  const doc = rootNode.ownerDocument || rootNode;
  const walker = doc.createNodeIterator(rootNode);
  let node;
  while (node = walker.nextNode()) {
    switch (node.nodeType) {
      // element
      case 1: {
        if (!regexAttr) { break; }
        for (const {nodeName: attr} of node.attributes) {
          assert(!attr.match(regexAttr), `"${attr}" should not exist on element ${node.nodeName}`);
        }
        break;
      }
      // comment
      case 8: {
        if (!regexCmt) { break; }
        const cmt = node.nodeValue;
        assert(!cmt.match(regexCmt), `comment ${JSON.stringify(cmt)} should not exist`);
        break;
      }
    }
    if (!deep) { break; }
  }
}

describe('Capture tests', function () {
  before(async function () {
    await Promise.all([
      checkBackendServer(),
      checkTestServer(),
      checkExtension(),
    ]);
  });

  describe('basic structure', function () {
    /**
     * capturer.saveDocument
     * capturer.downloadBlob
     */
    describe('HTML', function () {
      it('capture.saveAs = htz', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "zip",
        });

        var blob = await capture({
          url: `${localhost}/capture_html/index.html`,
          options,
        });
        assert.strictEqual(blob.type, "application/html+zip");

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip);

        var indexFile = zip.file('index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        assert.strictEqual(doc.contentType, "text/html");
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.strictEqual(doc.doctype.name, "html");
        assert.strictEqual(doc.doctype.publicId, "");
        assert.strictEqual(doc.doctype.systemId, "");

        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');

        var imgElem = doc.querySelectorAll('img')[0];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'red.bmp');
        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var imgElem = doc.querySelectorAll('img')[1];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'blue.bmp');
        var imgFile = zip.file('blue.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
      });

      it('capture.saveAs = maff', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "maff",
        });

        var blob = await capture({
          url: `${localhost}/capture_html/index.html`,
          options,
        });
        assert.strictEqual(blob.type, "application/x-maff");

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip);
        var topdir = Object.keys(zip.files)[0];
        assert.isTrue(zip.files[topdir].dir);
        assert(topdir.match(regex`^\d{17}/$`));

        var rdfFile = zip.file(topdir + 'index.rdf');
        assert.exists(rdfFile);
        var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
        var doc = await readFileAsDocument(rdfBlob);
        assert.exists(doc);
        var elem = doc.getElementsByTagNameNS(MAF, "title")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'ABC 中文 𠀀 にほんご');
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8');

        var indexFile = zip.file(topdir + 'index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        assert.strictEqual(doc.contentType, "text/html");
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.strictEqual(doc.doctype.name, "html");
        assert.strictEqual(doc.doctype.publicId, "");
        assert.strictEqual(doc.doctype.systemId, "");

        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');

        var imgElem = doc.querySelectorAll('img')[0];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'red.bmp');
        var imgFile = zip.file(topdir + 'red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var imgElem = doc.querySelectorAll('img')[1];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'blue.bmp');
        var imgFile = zip.file(topdir + 'blue.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
      });

      it('capture.saveAs = singleHtml', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "singleHtml",
        });

        var blob = await capture({
          url: `${localhost}/capture_html/index.html`,
          options,
        });
        assert(blob.type.match(rawRegex`${'^'}text/html${'(?:;|$)'}`));

        var doc = await readFileAsDocument(blob);
        assert.exists(doc);
        assert.strictEqual(doc.contentType, "text/html");
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.strictEqual(doc.doctype.name, "html");
        assert.strictEqual(doc.doctype.publicId, "");
        assert.strictEqual(doc.doctype.systemId, "");

        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');

        var imgElem = doc.querySelectorAll('img')[0];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var imgElem = doc.querySelectorAll('img')[1];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'data:image/bmp;filename=blue.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
      });
    });

    /**
     * capturer.saveDocument
     * capturer.downloadBlob
     */
    describe('XHTML', function () {
      it('capture.saveAs = htz', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "zip",
        });

        var blob = await capture({
          url: `${localhost}/capture_xhtml/index.xhtml`,
          options,
        });
        assert.strictEqual(blob.type, "application/html+zip");

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip);

        var indexFile = zip.file('index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]');
        assert.exists(metaRefreshElem);

        var indexFile = zip.file('index.xhtml');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        assert.strictEqual(doc.contentType, "application/xhtml+xml");
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.strictEqual(doc.doctype.name, "html");
        assert.strictEqual(doc.doctype.publicId, "-//W3C//DTD XHTML 1.1//EN");
        assert.strictEqual(doc.doctype.systemId, "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd");

        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');

        var imgElem = doc.querySelectorAll('img')[0];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'red.bmp');
        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var imgElem = doc.querySelectorAll('img')[1];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'blue.bmp');
        var imgFile = zip.file('blue.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
      });

      it('capture.saveAs = maff', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "maff",
        });
        var blob = await capture({
          url: `${localhost}/capture_xhtml/index.xhtml`,
          options,
        });
        assert.strictEqual(blob.type, "application/x-maff");
        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip);
        var topdir = Object.keys(zip.files)[0];
        assert.isTrue(zip.files[topdir].dir);

        var rdfFile = zip.file(topdir + 'index.rdf');
        assert.exists(rdfFile);
        var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
        var doc = await readFileAsDocument(rdfBlob);
        assert.exists(doc);
        var elem = doc.getElementsByTagNameNS(MAF, "title")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'ABC 中文 𠀀 にほんご');
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.xhtml');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8');

        var indexFile = zip.file(topdir + 'index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content="0; url=index.xhtml"]');
        assert.exists(metaRefreshElem);

        var indexFile = zip.file(topdir + 'index.xhtml');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        assert.strictEqual(doc.contentType, "application/xhtml+xml");
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.strictEqual(doc.doctype.name, "html");
        assert.strictEqual(doc.doctype.publicId, "-//W3C//DTD XHTML 1.1//EN");
        assert.strictEqual(doc.doctype.systemId, "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd");

        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');

        var imgElem = doc.querySelectorAll('img')[0];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'red.bmp');
        var imgFile = zip.file(topdir + 'red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var imgElem = doc.querySelectorAll('img')[1];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'blue.bmp');
        var imgFile = zip.file(topdir + 'blue.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
      });

      it('capture.saveAs = singleHtml', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "singleHtml",
        });
        var blob = await capture({
          url: `${localhost}/capture_xhtml/index.xhtml`,
          options,
        });
        assert(blob.type.match(rawRegex`${'^'}application/xhtml+xml${'(?:;|$)'}`));

        var doc = await readFileAsDocument(blob);
        assert.exists(doc);
        assert.strictEqual(doc.contentType, "application/xhtml+xml");
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.strictEqual(doc.doctype.name, "html");
        assert.strictEqual(doc.doctype.publicId, "-//W3C//DTD XHTML 1.1//EN");
        assert.strictEqual(doc.doctype.systemId, "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd");

        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.title, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector('p').textContent, 'ABC 中文 𠀀 にほんご');

        var imgElem = doc.querySelectorAll('img')[0];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var imgElem = doc.querySelectorAll('img')[1];
        assert.exists(imgElem);
        assert.strictEqual(imgElem.getAttribute('src'), 'data:image/bmp;filename=blue.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA');
      });
    });

    /**
     * capturer.captureFile
     */
    describe('file (capture.saveFileAsHtml = false)', function () {
      it('capture.saveAs = htz', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "zip",
          "capture.saveFileAsHtml": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_file/file.bmp`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=file.bmp"]'));
        assert.exists(doc.querySelector('a[href="file.bmp"]'));
        assert.notExists(doc.querySelector('img'));

        var savedFile = zip.file('file.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
      });

      it('capture.saveAs = maff', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "maff",
          "capture.saveFileAsHtml": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_file/file.bmp`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var topdir = Object.keys(zip.files)[0];

        var rdfFile = zip.file(topdir + 'index.rdf');
        var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
        var doc = await readFileAsDocument(rdfBlob);
        assert.exists(doc);
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html

        var indexFile = zip.file(topdir + 'index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=file.bmp"]'));
        assert.exists(doc.querySelector('a[href="file.bmp"]'));
        assert.notExists(doc.querySelector('img'));

        var savedFile = zip.file(topdir + 'file.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
      });

      it('capture.saveAs = singleHtml', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "singleHtml",
          "capture.saveFileAsHtml": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_file/file.bmp`,
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.exists(doc);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        var metaRefreshElem = doc.querySelector('meta[http-equiv="refresh"][content]');
        assert.exists(metaRefreshElem);
        assert.strictEqual(metaRefreshElem.getAttribute('content'),
          "0; url=data:image/bmp;filename=file.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
        assert.notExists(doc.querySelector('a[href="file.bmp"]')); // do NOT generate anchor to avoid long content
        assert.notExists(doc.querySelector('img'));
      });

      it('record charset for text files (Big5)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "maff",
          "capture.saveFileAsHtml": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_file/big5.py`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var topdir = Object.keys(zip.files)[0];

        var rdfFile = zip.file(topdir + 'index.rdf');
        var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
        var doc = await readFileAsDocument(rdfBlob);
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html

        var indexFile = zip.file(topdir + 'index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-charset'), 'Big5');
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=big5.py"]'));

        var savedFile = zip.file(topdir + 'big5.py');
        var text = (await readFileAsText(await savedFile.async('blob'), "Big5")).trim();
        assert.strictEqual(text, "Big5 中文內容");
      });

      it('record charset for text files (UTF-8 BOM)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "maff",
          "capture.saveFileAsHtml": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_file/utf8.txt`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var topdir = Object.keys(zip.files)[0];

        var rdfFile = zip.file(topdir + 'index.rdf');
        var rdfBlob = new Blob([await rdfFile.async('blob')], {type: "application/rdf+xml"});
        var doc = await readFileAsDocument(rdfBlob);
        var elem = doc.getElementsByTagNameNS(MAF, "indexfilename")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'index.html');
        var elem = doc.getElementsByTagNameNS(MAF, "charset")[0];
        assert.strictEqual(elem.getAttributeNS(RDF, "resource"), 'UTF-8'); // for index.html

        var indexFile = zip.file(topdir + 'index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-charset'), 'UTF-8');
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=utf8.txt"]'));

        var savedFile = zip.file(topdir + 'utf8.txt');
        var text = (await readFileAsText(await savedFile.async('blob'))).trim();
        // The UTF-8 BOM is not included here.
        assert.strictEqual(text, "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
      });
    });

    describe('file (capture.saveFileAsHtml = true)', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveFileAsHtml": true,
      });

      it('bmp: save as a web page containing the image', async function () {
        var blob = await capture({
          url: `${localhost}/capture_file/file.bmp`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notStrictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.notExists(doc.querySelector('meta[http-equiv="refresh"]'));
        assert.exists(doc.body.querySelector('img'));
      });

      it('txt: save as a web page with UTF-8 encoding (Big5)', async function () {
        var blob = await capture({
          url: `${localhost}/capture_file/big5.py`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.characterSet, "UTF-8");
        assert.notStrictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.notExists(doc.querySelector('meta[http-equiv="refresh"]'));
        var preElem = doc.body.querySelector('pre');
        assert.strictEqual(preElem.textContent.trim(), "Big5 中文內容");
      });

      it('txt: save as a web page with UTF-8 encoding (UTF-8 BOM)', async function () {
        var blob = await capture({
          url: `${localhost}/capture_file/utf8.txt`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notStrictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.notExists(doc.querySelector('meta[http-equiv="refresh"]'));
        var preElem = doc.body.querySelector('pre');
        assert.strictEqual(preElem.textContent.trim(), "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
      });
    });
  });

  describe('filename', function () {
    describe('basic', function () {
      /**
       * scrapbook.validateFilename
       * scrapbook.escapeFilename
       */
      it('should rewrite special chars and rename forbidden filenames', async function () {
        const EXPECTED_FILENAMES = [
          "file01",
          "file02 file02",
          "_",
          "中文 !_#$%&'()_+,-__;_=__@[_]^_`{_}",
          "123ABCabc中文 !#$%&'()+,-;=@[]^_`{}",

          "_file03",
          "file04___file04",
          "file05_______________file05",
          "file06file06",

          "file07",
          "file08",
          "file09",
          "file10",
          "_.bin01",
          "_..bin02",
          "con_",
          "prn_",
          "aux_",
          "nul_",
          "com0_",
          "lpt0_",
          "con_.txt",
          "prn_.txt",
          "aux_.txt",
          "nul_.txt",
          "com0_.txt",
          "lpt0_.txt",
        ];

        var blob = await capture({
          url: `${localhost}/capture_filename/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        for (const fn of EXPECTED_FILENAMES) {
          assert.exists(zip.file(fn));
        }

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgs = doc.querySelectorAll('img');
        EXPECTED_FILENAMES.forEach((fn, i) => {
          fn = fn.replace(/[ %#]+/g, m => encodeURIComponent(m));
          assert.strictEqual(imgs[i].getAttribute('src'), fn);
        });
      });

      /**
       * capturer.getUniqueFilename
       * capturer.captureInfo.*.files
       */
      it('should rename WebScrapBook-related special filenames', async function () {
        var blob = await capture({
          url: `${localhost}/capture_filename_forbidden/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index-1.json"));
        assert.exists(zip.file("index-1.dat"));
        assert.exists(zip.file("index-1.rdf"));
        assert.exists(zip.file("^metadata^-1"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), "index-1.json");
        assert.strictEqual(imgs[1].getAttribute('src'), "index-1.dat");
        assert.strictEqual(imgs[2].getAttribute('src'), "index-1.rdf");
        assert.strictEqual(imgs[3].getAttribute('src'), "^metadata^-1");
      });
    });

    describe('capture.saveAsciiFilename', function () {
      it('capture.saveAsciiFilename = false', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAsciiFilename": false,
        });
        var blob = await capture({
          url: `${localhost}/capture_saveAsciiFilename/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('123ABCabc_中文_𠀀.bmp'));
        assert.exists(zip.file('123ABCabc_中文_𠀀-2.bmp'));
        assert.exists(zip.file('123ABCabc_中文_𠀀.css'));
        assert.exists(zip.file('123ABCabc_中文_𠀀.woff'));
        assert.exists(zip.file('123%.dat'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), "123ABCabc_中文_𠀀.bmp");
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), "123ABCabc_中文_𠀀.css");
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@import url("123ABCabc_中文_𠀀.css");
@font-face { font-family: myFont; src: url("123ABCabc_中文_𠀀.woff"); }
p { background-image: url("123ABCabc_中文_𠀀.bmp"); }`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), "123ABCabc_中文_𠀀.bmp");
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('srcset'), "123ABCabc_中文_𠀀.bmp 1x, 123ABCabc_中文_𠀀-2.bmp 2x");
        assert.strictEqual(doc.querySelectorAll('img')[2].getAttribute('src'), "123%25.dat");
      });

      it('capture.saveAsciiFilename = true', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAsciiFilename": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_saveAsciiFilename/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.bmp'));
        assert.exists(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80-2.bmp'));
        assert.exists(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.css'));
        assert.exists(zip.file('123ABCabc_%E4%B8%AD%E6%96%87_%F0%A0%80%80.woff'));
        assert.exists(zip.file('123%.dat'));

        // URLs in the page need to be encoded to represent a percent char,
        // and thus the output looks like %25xx%25xx...
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'), "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp");
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.css");
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@import url("123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.css");
@font-face { font-family: myFont; src: url("123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.woff"); }
p { background-image: url("123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp"); }`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp");
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('srcset'), "123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580.bmp 1x, 123ABCabc_%25E4%25B8%25AD%25E6%2596%2587_%25F0%25A0%2580%2580-2.bmp 2x");
        assert.strictEqual(doc.querySelectorAll('img')[2].getAttribute('src'), "123%25.dat");
      });
    });

    describe('URL', function () {
      /**
       * capturer.downloadFile
       */
      it('should save URLs that differ only in hash to an identical file', async function () {
        var blob = await capture({
          url: `${localhost}/capture_rename/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `green.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `green.bmp#123`);
        assert.strictEqual(doc.querySelectorAll('img')[2].getAttribute('src'), `green.bmp#456`);
      });

      /**
       * capturer.fetch
       */
      it('should normalize URLs before fetching', async function () {
        var blob = await capture({
          url: `${localhost}/capture_rename_normalize/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 3);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("abc.bmp"));
        assert.exists(zip.file("123ABCabc中文 !#$%&'()+,-;=@[]^_`{}_.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
        assert.strictEqual(imgs[1].getAttribute('src'), "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
        assert.strictEqual(imgs[2].getAttribute('src'), "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
        assert.strictEqual(imgs[3].getAttribute('src'), "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
        assert.strictEqual(imgs[4].getAttribute('src'), "123ABCabc中文%20!%23$%25&'()+,-;=@[]^_`{}_.bmp");
        assert.strictEqual(imgs[5].getAttribute('src'), "abc.bmp#abc%E4%B8%AD%E6%96%87%");
        assert.strictEqual(imgs[6].getAttribute('src'), "abc.bmp#ab%63%e4%b8%ad%e6%96%87%25");
      });
    });

    describe('HTTP header', function () {
      /**
       * Check saved filename is correctly determined by HTTP header
       * (filename, filename with encoding, or content-type)
       *
       * Check plain text file encoding is correctly recorded
       */
      it('should honor the filename and charset from the HTTP header', async function () {
        var blob = await capture({
          url: `${localhost}/capture_header/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        // filename
        var savedFile = zip.file('file.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

        // FILENAME
        var savedFile = zip.file('file2.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

        // filename = "..."
        var savedFile = zip.file('file _X_.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

        // filename=...; filename*=iso-8859-1'en'...
        var savedFile = zip.file('£ rates.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

        // filename*=UTF-8''...; filename=...
        var savedFile = zip.file('中文𠀀.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");

        // content-type; no file extension (should generate one)
        var savedFile = zip.file('noext.bmp');
        assert.exists(savedFile);
        var b64 = (await readFileAsDataURL(await savedFile.async('blob'))).replace(/^.*,/, "");
        assert.strictEqual(b64, "Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
      });

      /**
       * If filename by URL path or header doesn't match its MIME type,
       * a fixing extension should be appended.
       *
       * capturer.downloadFile
       */
      it("should append a fixed extension when the MIME type does not match", async function () {
        var blob = await capture({
          url: `${localhost}/capture_header_mime/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute("src"), "image_bmp.py.bmp");
        assert.exists(zip.file("image_bmp.py.bmp"));
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute("src"), "image_svg.py.svg");
        assert.exists(zip.file("image_svg.py.svg"));

        // extension validation should be case-insensitive
        assert.strictEqual(doc.querySelectorAll('img')[2].getAttribute("src"), "image.SVG");
        assert.exists(zip.file("image.SVG"));

        // a well-known MIME may have a new-age extension not known yet, don't overfix
        assert.strictEqual(doc.querySelectorAll('img')[3].getAttribute("src"), "newext.mp1");
        assert.exists(zip.file("newext.mp1"));

        // always attempt to fix for a file without extension
        assert.strictEqual(doc.querySelectorAll('img')[4].getAttribute("src"), "noext.doc");
        assert.exists(zip.file("noext.doc"));

        // allow empty extension for universal MIME types, e.g. application/octet-stream
        assert.strictEqual(doc.querySelectorAll('img')[5].getAttribute("src"), "noextoctet");
        assert.exists(zip.file("noextoctet"));

        assert.strictEqual(doc.querySelectorAll('link')[0].getAttribute("href"), "stylesheet.py.css");
        assert.exists(zip.file("stylesheet.py.css"));
        assert.strictEqual(doc.querySelectorAll('script')[0].getAttribute("src"), "script.py.js");
        assert.exists(zip.file("script.py.js"));
      });
    });

    describe('should handle redirects correctly', function () {
      /**
       * capturer.captureDocument
       */
      it('should use filename from the redirected URL and hash from source', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frameRename": false,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_redirect/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('link').getAttribute('href'), `style.css#abc`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `green.bmp#abc`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `frame.html#abc`);
      });

      /**
       * Hash in the "Location" header should be ignored.
       *
       * @TODO: Browser usually use the "Location" header hash if it exists and use
       * the source URL hash if not. As the response URL of XMLHttpRequest and
       * fetch API doesn't contain hash, we use the source URL hash currently.
       */
      it('should ignore hash in the `Location` header', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frameRename": false,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_redirect_hash/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('link').getAttribute('href'), `style.css#abc`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `green.bmp#abc`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `frame.html#abc`);
      });
    });
  });

  describe('data URL', function () {
    describe('basic', function () {
      it('capture.saveDataUriAsFile = false', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveDataUriAsFile": false,
        });
        var blob = await capture({
          url: `${localhost}/capture_dataUri/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), "data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@import url("data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
@font-face { font-family: myFont; src: url("data:font/woff;base64,"); }
p { background-image: url("data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA 1x, data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA 2x");
      });

      it('capture.saveDataUriAsFile = true', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveDataUriAsFile": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_dataUri/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('2206b4fb7241bdce17a71015c888e3de66c2b5c9.css'));
        assert.exists(zip.file('da39a3ee5e6b4b0d3255bfef95601890afd80709.woff'));
        assert.exists(zip.file('ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp'));
        assert.exists(zip.file('4c46aef7be4ed4dda8cb2e887ae3ca7a8702fa16.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), "2206b4fb7241bdce17a71015c888e3de66c2b5c9.css");
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@import url("2206b4fb7241bdce17a71015c888e3de66c2b5c9.css");
@font-face { font-family: myFont; src: url("da39a3ee5e6b4b0d3255bfef95601890afd80709.woff"); }
p { background-image: url("ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp"); }`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), "ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp");
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), "ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp 1x, 4c46aef7be4ed4dda8cb2e887ae3ca7a8702fa16.bmp 2x");
      });

      it('should ignore capture.saveDataUriAsFile if capture.saveAs = singleHtml', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsFile": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_dataUri/basic.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), "data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@import url("data:text/css;charset=UTF-8,body%7Bfont-size:20px;%7D");
@font-face { font-family: myFont; src: url("data:font/woff;base64,"); }
p { background-image: url("data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA");
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), "data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA 1x, data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAA/wAAAAAA 2x");
      });

      it('should take parameters in data URL if capture.saveDataUriAsFile = true', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveDataUriAsFile": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_dataUri_params/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.rdf.css"));
        assert.exists(zip.file("index.dat.css"));
        assert.exists(zip.file("^metadata^.css"));

        assert.exists(zip.file("abc.html"));
        assert.exists(zip.file("abc.xml"));
        assert.exists(zip.file("abc.bmp"));
        assert.exists(zip.file("abc.jpg"));
        assert.exists(zip.file("abc.gif"));
        assert.exists(zip.file("abc.png"));
        assert.exists(zip.file("abc.svg"));
        assert.exists(zip.file("abc.wav"));
        assert.exists(zip.file("abcd.wav"));
        assert.exists(zip.file("abc.mp3"));
        assert.exists(zip.file("abc.oga"));
        assert.exists(zip.file("abc.ogx"));
        assert.exists(zip.file("abc.mpga"));
        assert.exists(zip.file("abc.mp4"));
        assert.exists(zip.file("abc.webm"));
        assert.exists(zip.file("abc.ogv"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var links = doc.querySelectorAll('link');
        assert.strictEqual(links[0].getAttribute('href'), "index.rdf.css");
        assert.strictEqual(links[1].getAttribute('href'), "index.dat.css");
        assert.strictEqual(links[2].getAttribute('href'), "^metadata^.css");

        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), "abc.html");
        assert.strictEqual(imgs[1].getAttribute('src'), "abc.xml");
        assert.strictEqual(imgs[2].getAttribute('src'), "abc.bmp");
        assert.strictEqual(imgs[3].getAttribute('src'), "abc.jpg");
        assert.strictEqual(imgs[4].getAttribute('src'), "abc.gif");
        assert.strictEqual(imgs[5].getAttribute('src'), "abc.png");
        assert.strictEqual(imgs[6].getAttribute('src'), "abc.svg");
        assert.strictEqual(imgs[7].getAttribute('src'), "abc.wav");
        assert.strictEqual(imgs[8].getAttribute('src'), "abcd.wav");
        assert.strictEqual(imgs[9].getAttribute('src'), "abc.mp3");
        assert.strictEqual(imgs[10].getAttribute('src'), "abc.oga");
        assert.strictEqual(imgs[11].getAttribute('src'), "abc.ogx");
        assert.strictEqual(imgs[12].getAttribute('src'), "abc.mpga");
        assert.strictEqual(imgs[13].getAttribute('src'), "abc.mp4");
        assert.strictEqual(imgs[14].getAttribute('src'), "abc.webm");
        assert.strictEqual(imgs[15].getAttribute('src'), "abc.ogv");
      });
    });

    /**
     * capturer.downloadFile
     * capturer.DocumentCssHandler
     */
    describe('CSS with data URL source', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "save",
        "capture.font": "save",
        "capture.imageBackground": "save",
      });

      it('relative (unresolvable): should output original URL (capture.saveDataUriAsFile = false)', async function () {
        options["capture.saveDataUriAsFile"] = false;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_css/resolve_css_1.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var url = doc.querySelector('link').getAttribute('href');
        var text = (await xhr({url, responseType: "text"})).response;
        assert.strictEqual(text, `\
@import "null.css";
@font-face { font-family: invalid; src: url("null.woff"); }
#invalid { background-image: url("red.bmp"); }`);
      });

      it('relative (unresolvable): should output original URL (capture.saveDataUriAsFile = true)', async function () {
        options["capture.saveDataUriAsFile"] = true;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_css/resolve_css_1.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 2); // main + link css

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var cssFile = zip.file(doc.querySelector('link').getAttribute('href'));
        var text = (await readFileAsText(await cssFile.async('blob'))).trim();
        assert.strictEqual(text, `\
@import "null.css";
@font-face { font-family: invalid; src: url("null.woff"); }
#invalid { background-image: url("red.bmp"); }`);
      });

      it('absolute: should convert to data URL when capture.saveDataUriAsFile = false', async function () {
        options["capture.saveDataUriAsFile"] = false;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_css/resolve_css_2.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var url = doc.querySelector('link').getAttribute('href');
        var text = (await xhr({url, responseType: "text"})).response;
        assert.strictEqual(text, `\
@import "data:text/css;charset=UTF-8;filename=null.css,";
@font-face { font-family: myFont; src: url("data:font/woff;filename=null.woff;base64,"); }
p { background-image: url("data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA"); }`);
      });

      it('absolute: should save as file when capture.saveDataUriAsFile = true', async function () {
        options["capture.saveDataUriAsFile"] = true;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_css/resolve_css_2.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('null.css'));
        assert.exists(zip.file('null.woff'));
        assert.exists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var cssFile = zip.file(doc.querySelector('link').getAttribute('href'));
        var text = (await readFileAsText(await cssFile.async('blob'))).trim();
        assert.strictEqual(text, `\
@import "null.css";
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("red.bmp"); }`);
      });
    });

    /**
     * capturer.captureDocument
     */
    describe('frame with data URL source: basic', function () {
      $it.xfail()('should capture the current content of a data URL frame', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveDataUriAsFile": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame_dynamic/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index_1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('p').textContent, 'page content modified');
      });
    });

    describe('frame with data URL source: URL resolution', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.frame": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.doc.depth": 1,
        "capture.downLink.urlFilter": "",
      });

      it('relative (unresolvable): should output original URL (capture.saveDataUriAsFile = false, capture.saveDataUriAsSrcdoc = false)', async function () {
        options["capture.saveDataUriAsFile"] = false;
        options["capture.saveDataUriAsSrcdoc"] = false;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame/resolve_frame_1.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 2);  // index.html, index.json

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = doc.querySelector('iframe').getAttribute('src');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
        assert.exists(frameDoc.querySelector('meta[property="og:image"][content="null.bmp"]'));
        assert.exists(frameDoc.querySelector('link[rel~="icon"][href="null.bmp"]'));
        assert.exists(frameDoc.querySelector('link[rel="stylesheet"][href="null.css"]'));
        assert.exists(frameDoc.querySelector('script[src="null.js"]'));
        assert.exists(frameDoc.querySelector('img[src="null.bmp"]'));
        assert.exists(frameDoc.querySelector('img[srcset="null.bmp 1x, null.bmp 2x"]'));
        assert.exists(frameDoc.querySelector('picture source[srcset="null.bmp"]'));
        assert.exists(frameDoc.querySelector('input[type="image"][src="null.bmp"]'));
        assert.strictEqual(frameDoc.querySelector('div').getAttribute('style'), `background: url("null.bmp");`);
        assert.exists(frameDoc.querySelector('table[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('tr[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('th[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('td[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('audio[src="null.mp3"]'));
        assert.exists(frameDoc.querySelector('audio source[src="null.ogg"]'));
        assert.exists(frameDoc.querySelector('video[src="null.mp4"][poster="null.bmp"]'));
        assert.exists(frameDoc.querySelector('video source[src="null.webm"]'));
        assert.exists(frameDoc.querySelector('embed[src="null.swf"]'));
        assert.exists(frameDoc.querySelector('object[data="null.swf"]'));
        assert.exists(frameDoc.querySelector('applet[code="null.class"][archive="null.jar"]'));
        assert.exists(frameDoc.querySelector('a[href="null.txt"]'));
        assert.exists(frameDoc.querySelector('a[href="null.html"]'));
      });

      it('relative (unresolvable): should output original URL (capture.saveDataUriAsFile = false, capture.saveDataUriAsSrcdoc = true)', async function () {
        options["capture.saveDataUriAsFile"] = false;
        options["capture.saveDataUriAsSrcdoc"] = true;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame/resolve_frame_1.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 2);  // index.html, index.json

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(doc.querySelector('iframe').getAttribute('srcdoc'))}`;
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
        assert.exists(frameDoc.querySelector('meta[property="og:image"][content="null.bmp"]'));
        assert.exists(frameDoc.querySelector('link[rel~="icon"][href="null.bmp"]'));
        assert.exists(frameDoc.querySelector('link[rel="stylesheet"][href="null.css"]'));
        assert.exists(frameDoc.querySelector('script[src="null.js"]'));
        assert.exists(frameDoc.querySelector('img[src="null.bmp"]'));
        assert.exists(frameDoc.querySelector('img[srcset="null.bmp 1x, null.bmp 2x"]'));
        assert.exists(frameDoc.querySelector('picture source[srcset="null.bmp"]'));
        assert.exists(frameDoc.querySelector('input[type="image"][src="null.bmp"]'));
        assert.strictEqual(frameDoc.querySelector('div').getAttribute('style'), `background: url("null.bmp");`);
        assert.exists(frameDoc.querySelector('table[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('tr[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('th[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('td[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('audio[src="null.mp3"]'));
        assert.exists(frameDoc.querySelector('audio source[src="null.ogg"]'));
        assert.exists(frameDoc.querySelector('video[src="null.mp4"][poster="null.bmp"]'));
        assert.exists(frameDoc.querySelector('video source[src="null.webm"]'));
        assert.exists(frameDoc.querySelector('embed[src="null.swf"]'));
        assert.exists(frameDoc.querySelector('object[data="null.swf"]'));
        assert.exists(frameDoc.querySelector('applet[code="null.class"][archive="null.jar"]'));
        assert.exists(frameDoc.querySelector('a[href="null.txt"]'));
        assert.exists(frameDoc.querySelector('a[href="null.html"]'));
      });

      it('relative (unresolvable): should output original URL (capture.saveDataUriAsFile = true)', async function () {
        options["capture.saveDataUriAsFile"] = true;
        options["capture.saveDataUriAsSrcdoc"] = false;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame/resolve_frame_1.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = doc.querySelector('iframe').getAttribute('src');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
        assert.exists(frameDoc.querySelector('meta[property="og:image"][content="null.bmp"]'));
        assert.exists(frameDoc.querySelector('link[rel~="icon"][href="null.bmp"]'));
        assert.exists(frameDoc.querySelector('link[rel="stylesheet"][href="null.css"]'));
        assert.exists(frameDoc.querySelector('script[src="null.js"]'));
        assert.exists(frameDoc.querySelector('img[src="null.bmp"]'));
        assert.exists(frameDoc.querySelector('img[srcset="null.bmp 1x, null.bmp 2x"]'));
        assert.exists(frameDoc.querySelector('picture source[srcset="null.bmp"]'));
        assert.exists(frameDoc.querySelector('input[type="image"][src="null.bmp"]'));
        assert.strictEqual(frameDoc.querySelector('div').getAttribute('style'), `background: url("null.bmp");`);
        assert.exists(frameDoc.querySelector('table[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('tr[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('th[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('td[background="null.bmp"]'));
        assert.exists(frameDoc.querySelector('audio[src="null.mp3"]'));
        assert.exists(frameDoc.querySelector('audio source[src="null.ogg"]'));
        assert.exists(frameDoc.querySelector('video[src="null.mp4"][poster="null.bmp"]'));
        assert.exists(frameDoc.querySelector('video source[src="null.webm"]'));
        assert.exists(frameDoc.querySelector('embed[src="null.swf"]'));
        assert.exists(frameDoc.querySelector('object[data="null.swf"]'));
        assert.exists(frameDoc.querySelector('applet[code="null.class"][archive="null.jar"]'));
        assert.exists(frameDoc.querySelector('a[href="null.txt"]'));
        assert.exists(frameDoc.querySelector('a[href="null.html"]'));
      });

      it('absolute: should resolve and convert to data URL if capture.saveDataUriAsFile = false and capture.saveDataUriAsSrcdoc = false', async function () {
        // in-depth page is linked to source since it cannot be saved as data URL
        options["capture.saveDataUriAsFile"] = false;
        options["capture.saveDataUriAsSrcdoc"] = false;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame/resolve_frame_2.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 2);  // index.html, index.json

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = doc.querySelector('iframe').getAttribute('src');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
        assert.strictEqual(frameDoc.querySelectorAll('a')[0].getAttribute('href'), `data:text/plain;filename=file.txt,Linked%20file.`);
        assert.strictEqual(frameDoc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_dataUri_frame/page.html`);
      });

      it('absolute: should save as srcdoc (resources as file) if capture.saveDataUriAsFile = false and capture.saveDataUriAsSrcdoc = true', async function () {
        options["capture.saveDataUriAsFile"] = false;
        options["capture.saveDataUriAsSrcdoc"] = true;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame/resolve_frame_2.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("red.bmp"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("page.html"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(doc.querySelector('iframe').getAttribute('srcdoc'))}`;
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
        assert.exists(frameDoc.querySelector('img[src="red.bmp"]'));
        assert.exists(frameDoc.querySelector('a[href="file.txt"]'));
        assert.exists(frameDoc.querySelector('a[href="page.html"]'));
      });

      it('absolute: should save as file if capture.saveDataUriAsFile = true', async function () {
        options["capture.saveDataUriAsFile"] = true;
        options["capture.saveDataUriAsSrcdoc"] = false;

        var blob = await capture({
          url: `${localhost}/capture_dataUri_frame/resolve_frame_2.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("red.bmp"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("page.html"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = doc.querySelector('iframe').getAttribute('src');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="data:"]'));
        assert.exists(frameDoc.querySelector('img[src="red.bmp"]'));
        assert.exists(frameDoc.querySelector('a[href="file.txt"]'));
        assert.exists(frameDoc.querySelector('a[href="page.html"]'));
      });
    });
  });

  describe('single HTML', function () {
    /**
     * capturer.captureDocument
     * capturer.downloadBlob
     */
    it('should use UTF-8 encoding for CSS and base64 for binary files', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveAs": "singleHtml",
        "capture.mergeCssResources": false,
        "capture.image": "save",
        "capture.frame": "save",
        "capture.imageBackground": "save",
      });

      var blob = await capture({
        url: `${localhost}/capture_singleHtml_encoding/index.html`,
        options,
      });

      var doc = await readFileAsDocument(blob);

      assert.strictEqual(doc.querySelectorAll('style')[0].textContent.trim(), `\
#internal { background: url("data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA"); }
#internal::after { content: "內部"; }`);
      assert.strictEqual(doc.querySelector('link').getAttribute('href'), `\
data:text/css;charset=UTF-8;filename=link.css,%23external%20%7B%20background:%20url(%22data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA%22);%20%7D%0A%23external::after%20%7B%20content:%20%22外部%22;%20%7D%0A`);
      assert.strictEqual(doc.querySelectorAll('style')[1].textContent.trim(), `\
@import "data:text/css;charset=UTF-8;filename=import.css,%23import%20%7B%20background:%20url(%22data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA%22);%20%7D%0A%23import::after%20%7B%20content:%20%22匯入%22;%20%7D%0A";`);
      assert.strictEqual(doc.querySelector('img').getAttribute('src'), `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
      assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `data:text/plain;filename=big5.txt,Big5%A4%A4%A4%E5%A4%BA%AEe`);

      var srcdocBlob = new Blob([doc.querySelectorAll('iframe')[0].getAttribute('srcdoc')], {type: "text/html;charset=UTF-8"});
      var srcdoc = await readFileAsDocument(srcdocBlob);
      assert.strictEqual(srcdoc.querySelector('style').textContent.trim(), `\
#internal { background: url("data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA"); }
#internal::after { content: "內部"; }`);
assert.strictEqual(srcdoc.querySelector('img').getAttribute('src'), `data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`);
    });

    it('should use non-uniquified filename for generated data URLs', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveAs": "singleHtml",
      });

      var blob = await capture({
        url: `${localhost}/capture_singleHtml_filename/index.html`,
        options,
      });

      var doc = await readFileAsDocument(blob);
      var imgs = doc.querySelectorAll('img');

      assert.strictEqual(imgs[0].getAttribute('src'), `data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`);
      assert.strictEqual(imgs[1].getAttribute('src'), `data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`);
      assert.strictEqual(imgs[2].getAttribute('src'), `data:image/bmp;filename=green.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA`);
    });

    it('should generate resource map when capture.mergeCssResources = true', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.mergeCssResources": true,
        "capture.saveAs": "singleHtml",
        "capture.imageBackground": "save",
        "capture.font": "save",
      });

      var blob = await capture({
        url: `${localhost}/capture_singleHtml_mergeCss/index.html`,
        options,
      });

      var doc = await readFileAsDocument(blob);
      var styles = doc.querySelectorAll('style');

      var o = getRulesFromCssText(doc.querySelector('style[data-scrapbook-elem="css-resource-map"]').textContent)[0].style;
      var map = Array.prototype.reduce.call(o, (a, c) => {
        a[`var(${c})`] = o.getPropertyValue(c);
        return a;
      }, {});

      // @import cannot use CSS variable
      var cssText = styles[0].textContent.trim();
      assert(cssText.match(rawRegex`${'^'}@import "data:${'[^"]+'}";${'$'}`));

      // @font-face src cannot use CSS variable
      var cssText = styles[1].textContent.trim();
      assert(cssText.match(rawRegex`src: url("data:${'[^")]+'}");`));

      // link
      var cssText = (await xhr({
        url: doc.querySelector('link').getAttribute('href').trim(),
        responseType: 'text',
      })).response.trim();
      var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
      assert.notStrictEqual(cssText, cssText2);
      assert.strictEqual(cssText2, `#link { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

      // internal
      var cssText = styles[2].textContent.trim();
      var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
      assert.notStrictEqual(cssText, cssText2);
      assert.strictEqual(cssText2, `#internal { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

      // internal keyframe
      var cssText = styles[3].textContent.trim();
      var cssText2 = cssText.replace(/var\(--sb\d+-\d+\)/g, x => map[x] || x);
      assert.notStrictEqual(cssText, cssText2);
      assert.strictEqual(cssText2, `\
@keyframes spin {
  from { transform: rotate(0turn); background-image: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }
  to { transform: rotate(1turn); }
}`);
    });

    it('should not generate resource map when capture.mergeCssResources = false', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.mergeCssResources": false,
        "capture.saveAs": "singleHtml",
        "capture.imageBackground": "save",
        "capture.font": "save",
      });

      var blob = await capture({
        url: `${localhost}/capture_singleHtml_mergeCss/index.html`,
        options,
      });

      var doc = await readFileAsDocument(blob);
      var styles = doc.querySelectorAll('style');

      assert.notExists(doc.querySelector('style[data-scrapbook-elem="css-resource-map"]'));

      // @import cannot use CSS variable
      var cssText = styles[0].textContent.trim();
      assert(cssText.match(rawRegex`${'^'}@import "data:${'[^"]+'}";${'$'}`));

      // @font-face src cannot use CSS variable
      var cssText = styles[1].textContent.trim();
      assert(cssText.match(rawRegex`src: url("data:${'[^")]+'}");`));

      // link
      var cssText = (await xhr({
        url: doc.querySelector('link').getAttribute('href').trim(),
        responseType: 'text',
      })).response.trim();
      assert.strictEqual(cssText, `#link { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

      // internal
      var cssText = styles[2].textContent.trim();
      assert.strictEqual(cssText, `#internal { background: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }`);

      // internal keyframe
      var cssText = styles[3].textContent.trim();
      assert.strictEqual(cssText, `\
@keyframes spin {
  from { transform: rotate(0turn); background-image: url("data:image/bmp;filename=yellow.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP//AAAA"); }
  to { transform: rotate(1turn); }
}`);
    });
  });

  describe('blob: URL', function () {
    /**
     * capturer.downloadFile
     * capturer.fetchCSS
     */
    it('should save blob URLs', async function () {
      var blob = await capture({
        url: `${localhost}/capture_blob/basic.html`,
        options: baseOptions,
      }, {delay: 500});

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;
      var m;

      var re = regex`${uuid}\.css`;
      assert(m = doc.querySelector('link').getAttribute('href').match(re));

      var re = rawRegex`@import url("${regex`(${uuid}\.css)`}");
@font-face { font-family: linkFont; src: url("${regex`(${uuid}\.woff)`}"); }
#link-font { font-family: linkFont; }
#link-bg { background-image: url("${regex`(${uuid}\.bmp)`}"); }`;
      var cssFile = zip.file(m[0]);
      var cssText = await readFileAsText(await cssFile.async('blob'));
      assert(m = cssText.trim().match(re));
      var fontFn = m[2];
      var imgFn = m[3];

      var re = rawRegex`@font-face { font-family: linkImportFont; src: url("${regex`(${uuid}\.woff)`}"); }
#link-import-font { font-family: linkImportFont; }
#link-import-bg { background-image: url("${regex`(${uuid}\.bmp)`}"); }`;
      var cssFile = zip.file(m[1]);
      var cssText = await readFileAsText(await cssFile.async('blob'));
      assert(m = cssText.trim().match(re));
      assert.strictEqual(m[1], fontFn);
      assert.strictEqual(m[2], imgFn);

      var re = rawRegex`@font-face { font-family: styleFont; src: url("${regex`(${uuid}\.woff)`}"); }
#style-font { font-family: styleFont; }
#style-bg { background-image: url("${regex`(${uuid}\.bmp)`}"); }`;
      assert(m = doc.querySelector('style').textContent.trim().match(re));
      assert.strictEqual(m[1], fontFn);
      assert.strictEqual(m[2], imgFn);

      assert.strictEqual(doc.querySelector('img').getAttribute('src'), imgFn);
    });

    /**
     * capturer.downloadFile
     * capturer.fetchCSS
     */
    it('should replace with error URL for revoked blob URLs (cannot save)', async function () {
      var blob = await capture({
        url: `${localhost}/capture_blob_revoked/revoked.html`,
        options: baseOptions,
      }, {delay: 1000});

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.strictEqual(doc.querySelector('link').getAttribute('href'), 'urn:scrapbook:download:error:blob:');
      assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@font-face { font-family: styleFont; src: url("urn:scrapbook:download:error:blob:"); }
#style-font { font-family: styleFont; }
#style-bg { background-image: url("urn:scrapbook:download:error:blob:"); }`);
      assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'urn:scrapbook:download:error:blob:');
    });

    it('should save blob URLs in an iframe', async function () {
      var blob = await capture({
        url: `${localhost}/capture_blob_frame/basic.html`,
        options: baseOptions,
      }, {delay: 500});

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), 'index_1.html');

      var indexFile = zip.file('index_1.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;
      var re = regex`${uuid}\.bmp`;
      assert(doc.querySelector('img').getAttribute('src').match(re));
    });
  });

  describe('about: URL', function () {
    /**
     * capturer.captureDocument
     * capturer.DocumentCssHandler.rewriteCssText
     */
    it('should keep about: URLs as-is', async function () {
      var blob = await capture({
        url: `${localhost}/capture_about/basic.html`,
        options: baseOptions,
      });
      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      assert.strictEqual(doc.querySelector('link').getAttribute('href'), 'blank');
      assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@import url("blank");
@font-face { font-family: myFont; src: url("about:blank"); }
p { background-image: url("about:blank"); }`);
      assert.strictEqual(doc.querySelector('img[src]').getAttribute('src'), 'about:blank');
      assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), 'about:blank 1x, about:invalid 2x');

      var cssFile = zip.file('blank');
      var text = (await readFileAsText(await cssFile.async('blob'))).trim();
      assert.strictEqual(text, '');
    });
  });

  /**
   * capturer.captureDocument
   */
  describe('capture selection', function () {
    it('select elements', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      var selectedParentElem = doc.querySelector('#selection');
      assert.exists(selectedParentElem);
      assert.exists(doc.querySelector('#selected'));
      assert.exists(doc.querySelector('img[src="green.bmp"]'));
      assert.exists(zip.file("green.bmp"));

      assert.strictEqual(selectedParentElem.firstChild.nodeType, 8);
      assert.strictEqual(selectedParentElem.firstChild.nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(selectedParentElem.lastChild.nodeType, 8);
      assert.strictEqual(selectedParentElem.lastChild.nodeValue, '/scrapbook-capture-selected');

      // non-selected elements and resources
      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));

      // should contain doctype and full head
      assert.exists(doc.doctype);
      assert.exists(doc.querySelector('head style'));
    });

    it('select an element', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection_element.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      var selectedElem = doc.querySelector('#selection');
      assert.exists(selectedElem);
      assert.exists(doc.querySelector('#selected'));
      assert.exists(doc.querySelector('img[src="green.bmp"]'));
      assert.exists(zip.file("green.bmp"));

      assert.strictEqual(selectedElem.previousSibling.nodeType, 8);
      assert.strictEqual(selectedElem.previousSibling.nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(selectedElem.nextSibling.nodeType, 8);
      assert.strictEqual(selectedElem.nextSibling.nodeValue, '/scrapbook-capture-selected');

      // non-selected elements and resources
      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));

      // should contain doctype and full head
      assert.exists(doc.doctype);
      assert.exists(doc.querySelector('head style'));
    });

    it('select in a text node', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection_text.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      assert.exists(doc.querySelector('#selection'));
      assert.exists(doc.querySelector('#selected'));
      assert.strictEqual(doc.querySelector('#selected').textContent, 'elect');
      assert.strictEqual(doc.querySelector('#selected').firstChild.nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').firstChild.nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected').lastChild.nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').lastChild.nodeValue, '/scrapbook-capture-selected');

      // non-selected elements and resources
      assert.notExists(doc.querySelector('img[src="green.bmp"]'));
      assert.notExists(zip.file("green.bmp"));

      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));

      // should contain doctype and full head
      assert.exists(doc.doctype);
      assert.exists(doc.querySelector('head style'));
    });

    it('select in a comment node', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection_comment.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      assert.exists(doc.querySelector('#selection'));
      assert.exists(doc.querySelector('#selected'));
      assert.strictEqual(doc.querySelector('#selected').childNodes[1].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[1].nodeValue, 'men');
      assert.strictEqual(doc.querySelector('#selected').firstChild.nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').firstChild.nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected').lastChild.nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').lastChild.nodeValue, '/scrapbook-capture-selected');

      // non-selected elements and resources
      assert.notExists(doc.querySelector('img[src="green.bmp"]'));
      assert.notExists(zip.file("green.bmp"));

      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));

      // should contain doctype and full head
      assert.exists(doc.doctype);
      assert.exists(doc.querySelector('head style'));
    });

    it('select in a CDATA node (for XHTML)', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection_cdata.xhtml`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.xhtml');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      assert.exists(doc.querySelector('#selection'));
      assert.exists(doc.querySelector('#selected'));
      assert.strictEqual(doc.querySelector('#selected').childNodes[1].nodeType, 4);
      assert.strictEqual(doc.querySelector('#selected').childNodes[1].nodeValue, '< y >');
      assert.strictEqual(doc.querySelector('#selected').firstChild.nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').firstChild.nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected').lastChild.nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').lastChild.nodeValue, '/scrapbook-capture-selected');

      // non-selected elements and resources
      assert.notExists(doc.querySelector('img[src="green.bmp"]'));
      assert.notExists(zip.file("green.bmp"));

      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));

      // should contain doctype and full head
      assert.exists(doc.doctype);
      assert.exists(doc.querySelector('head style'));
    });

    $it.skipIf($.noMultipleSelection)('multiple ranges', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection_multiple.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      assert.exists(doc.querySelector('#selection'));
      assert.exists(doc.querySelector('#selected'));
      assert.exists(doc.querySelector('img[src="green.bmp"]'));
      assert.exists(zip.file("green.bmp"));

      assert.exists(doc.querySelector('#selection2'));
      assert.exists(doc.querySelector('#selected2'));
      assert.exists(doc.querySelector('img[src="yellow.bmp"]'));
      assert.exists(zip.file("yellow.bmp"));

      // non-selected elements and resources
      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#middle'));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));
    });

    $it.skipIf($.noMultipleSelection)('multiple ranges in text/comment nodes: should insert splitters', async function () {
      var blob = await capture({
        url: `${localhost}/capture_selection/selection_multiple_text.xhtml`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);

      var indexFile = zip.file('index.xhtml');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
      var doc = await readFileAsDocument(indexBlob);

      // selected elements and resources
      assert.exists(doc.querySelector('#selection'));
      assert.exists(doc.querySelector('#selected'));

      assert.strictEqual(doc.querySelector('#selected').childNodes[0].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[0].nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected').childNodes[1].nodeType, 3);
      assert.strictEqual(doc.querySelector('#selected').childNodes[1].nodeValue, 'elect');
      assert.strictEqual(doc.querySelector('#selected').childNodes[2].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[2].nodeValue, '/scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected').childNodes[3].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[3].nodeValue, 'scrapbook-capture-selected-splitter');
      assert.strictEqual(doc.querySelector('#selected').childNodes[4].nodeType, 3);
      assert.strictEqual(doc.querySelector('#selected').childNodes[4].nodeValue, ' … ');
      assert.strictEqual(doc.querySelector('#selected').childNodes[5].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[5].nodeValue, '/scrapbook-capture-selected-splitter');
      assert.strictEqual(doc.querySelector('#selected').childNodes[6].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[6].nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected').childNodes[7].nodeType, 3);
      assert.strictEqual(doc.querySelector('#selected').childNodes[7].nodeValue, 'con');
      assert.strictEqual(doc.querySelector('#selected').childNodes[8].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected').childNodes[8].nodeValue, '/scrapbook-capture-selected');

      assert.exists(doc.querySelector('#selection2'));
      assert.exists(doc.querySelector('#selected2'));

      assert.strictEqual(doc.querySelector('#selected2').childNodes[0].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[0].nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[1].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[1].nodeValue, 'men');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[2].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[2].nodeValue, '/scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[3].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[3].nodeValue, 'scrapbook-capture-selected-splitter');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[4].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[4].nodeValue, ' … ');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[5].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[5].nodeValue, '/scrapbook-capture-selected-splitter');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[6].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[6].nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[7].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[7].nodeValue, 'str');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[8].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[8].nodeValue, '/scrapbook-capture-selected');

      assert.strictEqual(doc.querySelector('#selected2').childNodes[9].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[9].nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[10].nodeType, 4);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[10].nodeValue, 'x');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[11].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[11].nodeValue, '/scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[12].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[12].nodeValue, 'scrapbook-capture-selected-splitter');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[13].nodeType, 3);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[13].nodeValue, ' … ');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[14].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[14].nodeValue, '/scrapbook-capture-selected-splitter');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[15].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[15].nodeValue, 'scrapbook-capture-selected');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[16].nodeType, 4);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[16].nodeValue, 'z');
      assert.strictEqual(doc.querySelector('#selected2').childNodes[17].nodeType, 8);
      assert.strictEqual(doc.querySelector('#selected2').childNodes[17].nodeValue, '/scrapbook-capture-selected');

      // non-selected elements and resources
      assert.notExists(doc.querySelector('img[src="green.bmp"]'));
      assert.notExists(zip.file("green.bmp"));

      assert.notExists(doc.querySelector('#previous'));
      assert.notExists(doc.querySelector('img[src="red.bmp"]'));
      assert.notExists(zip.file("red.bmp"));

      assert.notExists(doc.querySelector('#next'));
      assert.notExists(doc.querySelector('img[src="blue.bmp"]'));
      assert.notExists(zip.file("blue.bmp"));
    });
  });

  describe('headless capture', function () {
    /**
     * A delay time for tab capture is required to wait for favicon loading complete.
     *
     * capturer.captureTab
     * capturer.captureRemote
     */
    describe('basic', function () {
      it('capture source for tab: should infer title from tab', async function () {
        var blob = await capture({
          url: `${localhost}/capture_headless/tab-info.html`,
          mode: "source",
          options: baseOptions,
        }, {delay: 500});

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-title'), "My Title");
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-icon'));
        assert.notExists(doc.querySelector(`title`));
        assert.notExists(doc.querySelector(`link[rel~="icon"]`));
        assert.notExists(zip.file("red.bmp"));
      });

      it('capture bookmark for tab: should infer title from tab', async function () {
        var blob = await capture({
          url: `${localhost}/capture_headless/tab-info.html`,
          mode: "bookmark",
          options: baseOptions,
        }, {delay: 100});

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-title'));
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-icon'));
        assert.strictEqual(doc.querySelector(`title`).textContent, "My Title");
        assert.notExists(doc.querySelector(`link[rel~="icon"]`));
      });

      it('capture source for tab frame 0', async function () {
        var blob = await capture({
          url: `${localhost}/capture_headless/tab-info.html`,
          frameId: 0,
          mode: "source",
          options: baseOptions,
        }, {delay: 100});

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-title'));
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-icon'));
        assert.notExists(doc.querySelector(`title`));
        assert.notExists(doc.querySelector(`link[rel~="icon"]`));
        assert.notExists(zip.file("red.bmp"));
      });

      it('capture bookmark for tab frame 0', async function () {
        var blob = await capture({
          url: `${localhost}/capture_headless/tab-info.html`,
          frameId: 0,
          mode: "bookmark",
          options: baseOptions,
        }, {delay: 100});

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-title'));
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-icon'));
        assert.notExists(doc.querySelector(`title`));
        assert.notExists(doc.querySelector(`link[rel~="icon"]`));
      });

      it('capture source for URL', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless/tab-info.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-title'));
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-icon'));
        assert.notExists(doc.querySelector(`title`));
        assert.notExists(doc.querySelector(`link[rel~="icon"]`));
        assert.notExists(zip.file("red.bmp"));
      });

      it('capture bookmark for URL', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless/tab-info.html`,
          mode: "bookmark",
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-title'));
        assert.notExists(doc.documentElement.getAttribute('data-scrapbook-icon'));
        assert.notExists(doc.querySelector(`title`));
        assert.notExists(doc.querySelector(`link[rel~="icon"]`));
      });

      it('capture source for URL (attachment): should save as file', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless_attachment/attachment.py`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("red.bmp"));

        var indexFile = zip.file('index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), "file");
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=attachment.html"]'));

        var indexFile = zip.file('attachment.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));
      });

      it('capture source for URL (refresh to attachment): should save as file', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless_attachment/refresh.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("red.bmp"));

        var indexFile = zip.file('index.html');
        assert.exists(indexFile);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), "file");
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=attachment.html"]'));

        var indexFile = zip.file('attachment.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));
      });
    });

    /**
     * capturer.captureUrl
     * scrapbook.parseHeaderRefresh
     */
    describe('should save refreshed target for zero-time meta refresh', function () {
      it('time = 0: should save the refreshed page', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless_metaRefresh/time-0.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.body.innerHTML, "refresh target page");
      });

      it('time = 0, url="": should circular error', async function () {
        var result = await captureHeadless({
          url: `${localhost}/capture_headless_metaRefresh/time-0-self.html`,
          options: baseOptions,
        }, {rawResponse: true});
        assert.exists(result.error);
      });

      it('time > 0: should save the original page and rewrite attribute', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless_metaRefresh/time-non-0.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('meta[http-equiv]').getAttribute('content'), `1; url=${localhost}/capture_headless_metaRefresh/referred.html`);
      });

      it("invalid: should keep original attribute", async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_headless_metaRefresh/invalid.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('meta[http-equiv]').getAttribute('content'), "+1 referred.html");
      });
    });
  });

  /**
   * capturer.captureBookmark
   */
  describe('capture bookmark', function () {
    describe('basic', function () {
      it('for tab: should fetch title and favicon', async function () {
        var blob = await capture({
          url: `${localhost}/capture_bookmark/basic.html`,
          mode: "bookmark",
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);
        var html = doc.documentElement;
        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_bookmark/basic.html`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assert.strictEqual(html.getAttribute('data-scrapbook-type'), 'bookmark');

        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector(`meta[http-equiv="refresh"]`).getAttribute('content'), `0; url=${localhost}/capture_bookmark/basic.html`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `${localhost}/capture_bookmark/basic.html`);
        assert.strictEqual(
          doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'),
          `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`,
        );
      });

      it('for URL: should fetch title and favicon', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_bookmark/basic.html`,
          mode: "bookmark",
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);
        var html = doc.documentElement;
        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_bookmark/basic.html`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assert.strictEqual(html.getAttribute('data-scrapbook-type'), 'bookmark');

        assert.strictEqual(doc.querySelector('title').textContent, 'ABC 中文 𠀀 にほんご');
        assert.strictEqual(doc.querySelector(`meta[http-equiv="refresh"]`).getAttribute('content'), `0; url=${localhost}/capture_bookmark/basic.html`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `${localhost}/capture_bookmark/basic.html`);
        assert.strictEqual(
          doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'),
          `data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA`,
        );
      });

      it('for URL (attachment): should ignore title and favicon', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_bookmark/basic.py`,
          mode: "bookmark",
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);
        var html = doc.documentElement;
        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_bookmark/basic.py`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assert.strictEqual(html.getAttribute('data-scrapbook-type'), 'bookmark');

        assert.notExists(doc.querySelector('title'));
        assert.strictEqual(doc.querySelector(`meta[http-equiv="refresh"]`).getAttribute('content'), `0; url=${localhost}/capture_bookmark/basic.py`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `${localhost}/capture_bookmark/basic.py`);
        assert.notExists(doc.querySelector('link[rel="shortcut icon"]'));
      });
    });

    describe('should save as a bookmark item without file if capture.saveTo = server', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveTo": "server",
        "capture.saveAs": "folder",
      });

      it('for tab: should fetch title and favicon', async function () {
        var response = await capture({
          url: `${localhost}/capture_bookmark/basic.html`,
          mode: "bookmark",
          options,
        }, {rawResponse: true});
        var {timeId: itemId} = response;

        var {data: [response]} = await backendRequest({
          body: {
            a: 'query',
            f: 'json',
            q: JSON.stringify({
              book: '',
              cmd: 'get_item',
              args: [itemId],
            }),
            details: 1,
          },
          csrfToken: true,
        }).then(r => r.json());
        assert.deepInclude(response.meta, {
          index: "",
          title: "ABC 中文 𠀀 にほんご",
          type: "bookmark",
          create: itemId,
          source: `${localhost}/capture_bookmark/basic.html`,
          icon: "../tree/favicon/ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp",
        });
      });

      it('for URL: should fetch title and favicon', async function () {
        var response = await captureHeadless({
          url: `${localhost}/capture_bookmark/basic.html`,
          mode: "bookmark",
          options,
        }, {rawResponse: true});
        var {timeId: itemId} = response;

        var {data: [response]} = await backendRequest({
          body: {
            a: 'query',
            f: 'json',
            q: JSON.stringify({
              book: '',
              cmd: 'get_item',
              args: [itemId],
            }),
            details: 1,
          },
          csrfToken: true,
        }).then(r => r.json());
        assert.deepInclude(response.meta, {
          index: "",
          title: "ABC 中文 𠀀 にほんご",
          type: "bookmark",
          create: itemId,
          source: `${localhost}/capture_bookmark/basic.html`,
          icon: "../tree/favicon/ecb6e0b0acec8b20d5f0360a52fe336a7a7cb475.bmp",
        });
      });

      it('for URL (attachment): should ignore title and favicon', async function () {
        var response = await captureHeadless({
          url: `${localhost}/capture_bookmark/basic.py`,
          mode: "bookmark",
          options,
        }, {rawResponse: true});
        var {timeId: itemId} = response;

        var {data: [response]} = await backendRequest({
          body: {
            a: 'query',
            f: 'json',
            q: JSON.stringify({
              book: '',
              cmd: 'get_item',
              args: [itemId],
            }),
            details: 1,
          },
          csrfToken: true,
        }).then(r => r.json());
        assert.deepInclude(response.meta, {
          index: "",
          type: "bookmark",
          create: itemId,
          source: `${localhost}/capture_bookmark/basic.py`,
        });
        assert.doesNotHaveAnyKeys(response.meta, ['title', 'icon']);
      });
    });
  });

  describe('meta element', function () {
    /**
     * capturer.captureDocument
     * capturer.saveDocument
     */
    describe('meta charset', function () {
      it('meta[charset]: should rewrite first to UTF-8', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_charset/big5.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.title, 'ABC 中文');

        var metaElems = doc.querySelectorAll('meta');
        assert.strictEqual(metaElems[0].getAttribute('charset'), `UTF-8`);
        assert.strictEqual(metaElems[1].getAttribute('charset'), `GBK`);

        var imgElem = doc.querySelectorAll('img')[0];
        assert.strictEqual(imgElem.getAttribute('src'), `圖片.bmp`);

        var imgElem = doc.querySelectorAll('img')[1];
        assert.strictEqual(imgElem.getAttribute('src'), `圖片.bmp`);
      });

      it('meta[http-equiv="content-type"][content*="charset"]: should rewrite first to UTF-8', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_charset/big5-old.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.title, 'ABC 中文');

        var metaElems = doc.querySelectorAll('meta');
        assert.strictEqual(metaElems[0].getAttribute('content'), `text/html; charset=UTF-8`);
        assert.strictEqual(metaElems[1].getAttribute('content'), `text/html; charset=GBK`);

        var imgElem = doc.querySelectorAll('img')[0];
        assert.strictEqual(imgElem.getAttribute('src'), `圖片.bmp`);

        var imgElem = doc.querySelectorAll('img')[1];
        assert.strictEqual(imgElem.getAttribute('src'), `圖片.bmp`);
      });

      it('meta[http-equiv="content-type"][content*="charset"] with complicated syntax: should rewrite first to UTF-8', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_charset/big5-old2.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.title, 'ABC 中文');

        var metaElems = doc.querySelectorAll('meta');
        assert.strictEqual(metaElems[0].getAttribute('content'), r`text/javascript; KEY=VALUE`);
        assert.strictEqual(metaElems[1].getAttribute('content'), r`text/plain; charset=UTF-8; data=foo123; data2="中文\"789\""`);
        assert.strictEqual(metaElems[2].getAttribute('content'), r`text/css; CHARSET="GBK"; data=中文123`);
      });

      it('no meta, HTTP header Big5: should generate meta[charset="UTF-8"]', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_charset/big5-header.py`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.title, 'ABC 中文');
        assert.exists(doc.querySelector('meta[charset="UTF-8"]'));

        var imgElem = doc.querySelectorAll('img')[0];
        assert.strictEqual(imgElem.getAttribute('src'), `圖片.bmp`);

        var imgElem = doc.querySelectorAll('img')[1];
        assert.strictEqual(imgElem.getAttribute('src'), `圖片.bmp`);
      });
    });

    /**
     * capturer.captureDocument
     */
    describe('meta refresh', function () {
      it('should rewrite URL in meta refresh', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_refresh/basic.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
        assert.strictEqual(mrs[0].getAttribute('content'), `30`);
        assert.strictEqual(mrs[1].getAttribute('content'), `30; url=#`);
        assert.strictEqual(mrs[2].getAttribute('content'), `30; url=#123`);
        assert.strictEqual(mrs[3].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh/basic.html?id=123`);
        assert.strictEqual(mrs[4].getAttribute('content'), `30`);
        assert.strictEqual(mrs[5].getAttribute('content'), `30; url=#`);
        assert.strictEqual(mrs[6].getAttribute('content'), `30; url=#123`);
        assert.strictEqual(mrs[7].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh/basic.html?id=123`);
        assert.strictEqual(mrs[8].getAttribute('content'), `20; url=${localhost}/capture_meta_refresh/referred.html`);
        assert.strictEqual(mrs[9].getAttribute('content'), `20; url=${localhost}/capture_meta_refresh/referred.html#`);
        assert.strictEqual(mrs[10].getAttribute('content'), `20; url=${localhost}/capture_meta_refresh/referred.html#123`);
        assert.strictEqual(mrs[11].getAttribute('content'), `20; url=${localhost}/capture_meta_refresh/referred.html?id=123`);
        assert.strictEqual(mrs[12].getAttribute('content'), `15; url=http://example.com/`);
        assert.strictEqual(mrs[13].getAttribute('content'), `15; url=http://example.com/#`);
        assert.strictEqual(mrs[14].getAttribute('content'), `15; url=http://example.com/#123`);
        assert.strictEqual(mrs[15].getAttribute('content'), `15; url=http://example.com/?id=123`);
      });

      it('capture selection: should rewrite URL to original page if targeting a non-captured part in self page', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_refresh_selection/delayed21.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
        assert.strictEqual(mrs[0].getAttribute('content'), `30`);
        assert.strictEqual(mrs[1].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html#123`);
        assert.strictEqual(mrs[2].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html?id=123`);
        assert.strictEqual(mrs[3].getAttribute('content'), `30`);
        assert.strictEqual(mrs[4].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html#123`);
        assert.strictEqual(mrs[5].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh_selection/delayed21.html?id=123`);
        assert.strictEqual(mrs[6].getAttribute('content'), `20; url=${localhost}/capture_meta_refresh_selection/referred.html`);
        assert.strictEqual(mrs[7].getAttribute('content'), `15; url=http://example.com/`);
      });

      it('capture selection: should rewrite URL to captured page if targeting a captured part in self page', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_refresh_selection/delayed22.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
        assert.strictEqual(mrs[0].getAttribute('content'), `30`);
        assert.strictEqual(mrs[1].getAttribute('content'), `30; url=#123`);
        assert.strictEqual(mrs[2].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh_selection/delayed22.html?id=123`);
        assert.strictEqual(mrs[3].getAttribute('content'), `30`);
        assert.strictEqual(mrs[4].getAttribute('content'), `30; url=#123`);
        assert.strictEqual(mrs[5].getAttribute('content'), `30; url=${localhost}/capture_meta_refresh_selection/delayed22.html?id=123`);
        assert.strictEqual(mrs[6].getAttribute('content'), `20; url=${localhost}/capture_meta_refresh_selection/referred.html`);
        assert.strictEqual(mrs[7].getAttribute('content'), `15; url=http://example.com/`);
      });

      it('should honor base[href] when resolving URL (time = 0: capture refreshed target)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_base/refresh0.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector(`html[data-scrapbook-source="${localhost}/capture_meta_refresh_base/subdir/target.html?id=123#456"]`));
      });

      it('should honor base[href] when resolving URL (time != 0: capture original page and rewrite attribute)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_base/refresh1.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var mrs = doc.querySelectorAll('meta[http-equiv="refresh"]');
        assert.strictEqual(mrs[0].getAttribute('content'), `1; url=${localhost}/capture_meta_refresh_base/subdir/target.html?id=123#456`);
      });

      it('should capture the refresh target for zero-time meta refresh to page (mode = source)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_mode/refresh.html`,
          mode: 'source',
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_meta_refresh_mode/target.html#abc`);
      });

      it('should capture the refresh target for zero-time meta refresh to page (mode = bookmark)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_mode/refresh.html`,
          mode: 'bookmark',
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_meta_refresh_mode/target.html#abc`);
      });

      it('should capture the refresh target for zero-time meta refresh to file (mode = source)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_mode_file/refresh.html`,
          mode: 'source',
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), "file");
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_meta_refresh_mode_file/target.txt#abc`);
      });

      it('should capture the refresh target for zero-time meta refresh to file (mode = bookmark)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_mode_file/refresh.html`,
          mode: 'bookmark',
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_meta_refresh_mode_file/target.txt#abc`);
      });

      it('should ignore meta refresh in noscript (mode = source)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_noscript/refresh.html`,
          mode: 'source',
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_meta_refresh_noscript/refresh.html`);
      });

      it('should ignore meta refresh in noscript (mode = bookmark)', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_meta_refresh_noscript/refresh.html`,
          mode: 'bookmark',
          options: baseOptions,
        });

        var doc = await readFileAsDocument(blob);

        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_meta_refresh_noscript/refresh.html`);
      });
    });

    describe('CSP', function () {
      it('should keep meta CSP and nonce attribute if capture.contentSecurityPolicy = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.contentSecurityPolicy": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_meta_csp/csp.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('meta[http-equiv]').getAttribute('content'), `default-src 'nonce-2726c7f26c';`);
        assert.strictEqual(doc.querySelector('link').getAttribute('nonce'), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('style').getAttribute('nonce'), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('script[src]').getAttribute('nonce'), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('script:not([src])').getAttribute('nonce'), `2726c7f26c`);
      });

      it('should remove meta CSP and nonce attribute if capture.contentSecurityPolicy = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.contentSecurityPolicy": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_meta_csp/csp.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('meta[http-equiv]'));
        assert(!doc.querySelector('link').hasAttribute('nonce'));
        assert(!doc.querySelector('style').hasAttribute('nonce'));
        assert(!doc.querySelector('script[src]').hasAttribute('nonce'));
        assert(!doc.querySelector('script:not([src])').hasAttribute('nonce'));
      });
    });

    describe('shadow DOM', function () {
      it('should ignore meta elements in shadow DOM', async function () {
        var blob = await capture({
          url: `${localhost}/capture_meta_shadow/meta.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // a default meta[charset] should be generated
        assert.exists(doc.querySelector('meta[charset="UTF-8"]:not([http-equiv]):not([content])'));

        var host = doc.querySelector('[data-scrapbook-shadowdom]');
        assert.strictEqual(host.getAttribute("data-scrapbook-shadowdom").trim(), `\
<meta charset="Big5">
<meta http-equiv="content-type" content="text/html; charset=Big5">
<meta http-equiv="Content-Security-Policy" content="default-src 'nonce-2726c7f26c';">
<meta http-equiv="refresh" content="0; url=nonexist.html">`);
      });
    });
  });

  describe('base element', function () {
    describe('should handle base elements according to capture.base', function () {
      it('should rewrite href attribute if capture.base = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.base": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_base/base.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var bases = doc.querySelectorAll('base');
        assert.strictEqual(bases[0].getAttribute('href'), `http://example.com/`);
        assert.strictEqual(bases[0].getAttribute('target'), `_blank`);
        assert.strictEqual(bases[1].getAttribute('href'), `${localhost}/capture_base/subdir/dummy.html`);
        assert.strictEqual(bases[2].getAttribute('href'), `${localhost}/capture_base/base.html?id=123`);
        assert.strictEqual(bases[3].getAttribute('href'), `${localhost}/capture_base/base.html#foo`);
        assert.strictEqual(bases[4].getAttribute('href'), `${localhost}/capture_base/base.html`);
      });

      it('should remove href attribute if capture.base = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.base": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_base/base.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var bases = doc.querySelectorAll('base');
        assert(!bases[0].hasAttribute('href'));
        assert.strictEqual(bases[0].getAttribute('target'), `_blank`);
        assert(!bases[1].hasAttribute('href'));
        assert(!bases[2].hasAttribute('href'));
        assert(!bases[3].hasAttribute('href'));
        assert(!bases[4].hasAttribute('href'));
      });

      it('should remove base element if capture.base = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.base": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_base/base.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var bases = doc.querySelectorAll('base');
        assert(!bases.length);
      });
    });

    /**
     * capturer.resolveRelativeUrl
     * capturer.captureDocument
     */
    describe('should rewrite URLs when base set to another directory', function () {
      /**
       * Check if the URL for general saved resource is rewritten correctly
       * when base is set to another directory.
       *
       * We take image for instance, and other resources should work same
       * since they share same implementation.
       */
      it('basic', async function () {
        var blob = await capture({
          url: `${localhost}/capture_base_rewrite/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("green.bmp"));
        assert.exists(zip.file("yellow.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `green.bmp`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `green.bmp 1x, yellow.bmp 2x`);
      });

      it('special: "", hash, search, and URL pointing to main html page (bad practice)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
        });

        var blob = await capture({
          url: `${localhost}/capture_base_rewrite_special/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index-1.html"));
        assert.exists(zip.file("index-2.html"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), ``);
        assert.strictEqual(imgs[1].getAttribute('src'), `#123`);
        assert.strictEqual(imgs[2].getAttribute('src'), `index-1.html`); // html page saved as img
        assert.strictEqual(imgs[3].getAttribute('src'), `index-2.html`); // html page saved as img
      });
    });

    describe('should honor base when resolving URLs appearing after it', function () {
      for (const base of ["save", "blank", "remove"]) {
        it(`basic (capture.base = ${base})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.base": base,
          });
          var blob = await capture({
            url: `${localhost}/capture_base_dynamic/basic.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          assert.strictEqual(doc.querySelector('img[src]').getAttribute('src'), `img_src.py`);
          assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `img_srcset.py 2x`);
          assert.strictEqual(doc.querySelector('picture source').getAttribute('srcset'), `picture_source.py`);
          assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute('src'), `input_image.py`);
          assert.strictEqual(doc.querySelector('table').getAttribute('background'), `table_background.py`);

          assert.strictEqual(doc.querySelector('a').getAttribute('href'), `${localhost}/capture_base_dynamic/resources/anchor.py`);
          assert.strictEqual(doc.querySelector('form').getAttribute('action'), `${localhost}/capture_base_dynamic/resources/form.py`);
          assert.strictEqual(doc.querySelector('form input[type="image"]').getAttribute('formaction'), `${localhost}/capture_base_dynamic/resources/input-image.py`);
          assert.strictEqual(doc.querySelector('form input[type="submit"]').getAttribute('formaction'), `${localhost}/capture_base_dynamic/resources/input-submit.py`);
          assert.strictEqual(doc.querySelector('form button').getAttribute('formaction'), `${localhost}/capture_base_dynamic/resources/button.py`);
          assert.strictEqual(doc.querySelector('q').getAttribute('cite'), `${localhost}/capture_base_dynamic/resources/q.py`);

          var file = zip.file('img_src.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/basic.html`);

          var file = zip.file('img_srcset.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/basic.html`);

          var file = zip.file('picture_source.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/basic.html`);

          var file = zip.file('input_image.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/basic.html`);

          var file = zip.file('table_background.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/basic.html`);
        });
      }

      for (const rewriteCss of ["url", "tidy", "match"]) {
        for (const styleRes of ["save", "save-used"]) {
          /**
           * Check if CSS-related URLs after base[href] are handled correctly.
           */
          $it.xfailIf(
            userAgent.is('chromium') && userAgent.major < 96,
            'referrer for an imported CSS is erroneously set to document base in Chromium < 96',
          )(`CSS (capture.rewriteCss = ${rewriteCss}, capture.{imageBackground,font} = ${styleRes})`, async function () {
            var options = Object.assign({}, baseOptions, {
              "capture.rewriteCss": rewriteCss,
              "capture.imageBackground": styleRes,
              "capture.font": styleRes,
            });
            var blob = await capture({
              url: `${localhost}/capture_base_dynamic_css/basic.html`,
              options,
            });
            var zip = await new JSZip().loadAsync(blob);

            var file = zip.file('link.py.css');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert(text.match(
              cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/basic.html"; }
@font-face { font-family: linkFont; src: url("link_font.py"); }
#link-font { font-family: linkFont; }
#link-bg { background-image: url("link_bg.py"); }`,
            ));

            var file = zip.file('link_font.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/link.py`);

            var file = zip.file('link_bg.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/link.py`);

            var file = zip.file('style_import.py.css');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert(text.match(
              cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/basic.html"; }
@font-face { font-family: styleImportFont; src: url("style_import_font.py"); }
#style-import-font { font-family: styleImportFont; }
#style-import-bg { background-image: url("style_import_bg.py"); }`,
            ));

            var file = zip.file('style_import_font.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

            var file = zip.file('style_import_bg.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

            var file = zip.file('style_font.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/basic.html`);

            var file = zip.file('style_bg.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/basic.html`);

            var file = zip.file('inline.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/basic.html`);
          });
        }
      }

      for (const func of ["capture", "captureHeadless"]) {
        it(`frame (capture.frame = save) (${func})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.base": "blank",
            "capture.frame": "save",
          });
          var blob = await global[func]({
            url: `${localhost}/capture_base_dynamic_frame/srcdoc_basic.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index_1.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('img').getAttribute('src'), `img_src.py.svg`);

          var file = zip.file('img_src.py.svg');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_basic.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

          var indexFile = zip.file('index_2.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('link').getAttribute('href'), `link.py.css`);

          // @TODO:
          // The result of the tab capture depends on the referrer the browser sent.
          // Some browsers do not handle default referrer policy for the srcdoc
          // iframe correctly:
          // - e.g. Chromium 121: default referrer policy is unsafe-url
          //   (iframe[referrerpolicy] not taken).
          // - e.g. Firefox 123: default referrer policy is no-referrer.
          // We only check for headless as the referrer is totally controlled by WSB.
          if (func === "captureHeadless") {
            var file = zip.file('link.py.css');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `:root { --referrer: "${localhost}/" }`);
          }
        });

        it(`frame (capture.frame = link) (${func})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.base": "blank",
            "capture.frame": "link",
          });
          var blob = await global[func]({
            url: `${localhost}/capture_base_dynamic_frame/srcdoc_basic.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var frame = doc.querySelector('iframe');
          var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
          var srcdoc = await readFileAsDocument(srcdocBlob);
          var text = decodeURIComponent(srcdoc.querySelector('img').getAttribute('src'));
          assert.strictEqual(text, `data:image/svg+xml;filename=img_src.py.svg,\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_basic.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

          // see above `URL after base, capture.frame = save` case
          if (func === "captureHeadless") {
            var frame = doc.querySelectorAll('iframe')[1];
            var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
            var srcdoc = await readFileAsDocument(srcdocBlob);
            var text = decodeURIComponent(srcdoc.querySelector('link').getAttribute('href'));
            assert.strictEqual(text, `data:text/css;charset=UTF-8;filename=link.py.css,:root { --referrer: "${localhost}/" }`);
          }
        });
      }
    });

    describe('should ignore base when resolving URLs appearing before it (against spec)', function () {
      for (const base of ["save", "blank", "remove"]) {
        it(`basic (capture.base = ${base})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.base": base,
          });
          var blob = await capture({
            url: `${localhost}/capture_base_dynamic/bad.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          assert.strictEqual(doc.querySelector('img[src]').getAttribute('src'), `img_src.py`);
          assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `img_srcset.py 2x`);
          assert.strictEqual(doc.querySelector('picture source').getAttribute('srcset'), `picture_source.py`);
          assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute('src'), `input_image.py`);
          assert.strictEqual(doc.querySelector('table').getAttribute('background'), `table_background.py`);

          assert.strictEqual(doc.querySelector('a').getAttribute('href'), `${localhost}/capture_base_dynamic/resources/resources/anchor.py`);
          assert.strictEqual(doc.querySelector('form').getAttribute('action'), `${localhost}/capture_base_dynamic/resources/resources/form.py`);
          assert.strictEqual(doc.querySelector('form input[type="image"]').getAttribute('formaction'), `${localhost}/capture_base_dynamic/resources/resources/input-image.py`);
          assert.strictEqual(doc.querySelector('form input[type="submit"]').getAttribute('formaction'), `${localhost}/capture_base_dynamic/resources/resources/input-submit.py`);
          assert.strictEqual(doc.querySelector('form button').getAttribute('formaction'), `${localhost}/capture_base_dynamic/resources/resources/button.py`);
          assert.strictEqual(doc.querySelector('q').getAttribute('cite'), `${localhost}/capture_base_dynamic/resources/resources/q.py`);

          var file = zip.file('img_src.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/bad.html`);

          var file = zip.file('img_srcset.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/bad.html`);

          var file = zip.file('picture_source.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/bad.html`);

          var file = zip.file('input_image.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/bad.html`);

          var file = zip.file('table_background.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_base_dynamic/bad.html`);
        });
      }

      for (const rewriteCss of ["url", "tidy", "match"]) {
        for (const styleRes of ["save", "save-used"]) {
          $it.xfailIf(
            userAgent.is('chromium') && userAgent.major < 96,
            'referrer for an imported CSS is erroneously set to document base in Chromium < 96',
          )(`CSS (capture.rewriteCss = ${rewriteCss}, capture.{imageBackground,font} = ${styleRes})`, async function () {
            var options = Object.assign({}, baseOptions, {
              "capture.rewriteCss": rewriteCss,
              "capture.imageBackground": styleRes,
              "capture.font": styleRes,
            });
            var blob = await capture({
              url: `${localhost}/capture_base_dynamic_css/bad.html`,
              options,
            });
            var zip = await new JSZip().loadAsync(blob);

            var file = zip.file('link.py.css');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert(text.match(
              cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/bad.html"; }
@font-face { font-family: linkFont; src: url("link_font.py"); }
#link-font { font-family: linkFont; }
#link-bg { background-image: url("link_bg.py"); }`,
            ));

            var file = zip.file('link_font.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/link.py`);

            var file = zip.file('link_bg.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/link.py`);

            var file = zip.file('style_import.py.css');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert(text.match(
              cssRegex`:root { --referrer: "${escapeRegExp(localhost)}/capture_base_dynamic_css/bad.html"; }
@font-face { font-family: styleImportFont; src: url("style_import_font.py"); }
#style-import-font { font-family: styleImportFont; }
#style-import-bg { background-image: url("style_import_bg.py"); }`,
            ));

            var file = zip.file('style_import_font.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

            var file = zip.file('style_import_bg.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/resources/style_import.py`);

            var file = zip.file('style_font.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/bad.html`);

            var file = zip.file('style_bg.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/bad.html`);

            var file = zip.file('inline.py');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `${localhost}/capture_base_dynamic_css/bad.html`);
          });
        }
      }

      for (const func of ["capture", "captureHeadless"]) {
        it(`frame (capture.frame = save) (${func})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.base": "blank",
            "capture.frame": "save",
          });
          var blob = await global[func]({
            url: `${localhost}/capture_base_dynamic_frame/srcdoc_bad.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index_1.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('img').getAttribute('src'), `img_src.py.svg`);

          var file = zip.file('img_src.py.svg');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_bad.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

          // see above `URL after base, capture.frame = save` case
          if (func === "captureHeadless") {
            var file = zip.file('link.py.css');
            var text = (await readFileAsText(await file.async('blob'))).trim();
            assert.strictEqual(text, `:root { --referrer: "${localhost}/" }`);
          }
        });

        it(`frame (capture.frame = link) (${func})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.base": "blank",
            "capture.frame": "link",
          });
          var blob = await global[func]({
            url: `${localhost}/capture_base_dynamic_frame/srcdoc_bad.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var frame = doc.querySelector('iframe');
          var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
          var srcdoc = await readFileAsDocument(srcdocBlob);
          var text = decodeURIComponent(srcdoc.querySelector('img').getAttribute('src'));
          assert.strictEqual(text, `data:image/svg+xml;filename=img_src.py.svg,\
<!-- referrer: ${localhost}/capture_base_dynamic_frame/srcdoc_bad.html -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>`);

          // see above `URL after base, capture.frame = save` case
          if (func === "captureHeadless") {
            var frame = doc.querySelectorAll('iframe')[1];
            var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
            var srcdoc = await readFileAsDocument(srcdocBlob);
            var text = decodeURIComponent(srcdoc.querySelector('link').getAttribute('href'));
            assert.strictEqual(text, `data:text/css;charset=UTF-8;filename=link.py.css,:root { --referrer: "${localhost}/" }`);
          }
        });
      }
    });

    /**
     * Seems impossible to get the real source URL of the resources before src
     * etc. has been changed.
     */
    describe('base change after resources loaded', function () {
      it('capture (source): should resolve URLs using base (not changed since no scripts are run)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.base": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_base_dynamic_scripted/base.html`,
          mode: "source",
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var imgFile = zip.file('img.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');  // green

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), "img.bmp");
      });

      $it.xfail()('capture (tab): should resolve URLs using the pre-changed base', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.base": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_base_dynamic_scripted/base.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var imgFile = zip.file('img.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA');  // green

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), "img.bmp");
      });
    });
  });

  describe('favicon', function () {
    describe('should handle favicon according to capture.favicon', function () {
      it('capture.favicon = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElem = doc.querySelector('link[rel~="icon"]');
        assert.strictEqual(iconElem.getAttribute('href'), `red.bmp`);
      });

      it('capture.favicon = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElem = doc.querySelector('link[rel~="icon"]');
        assert.strictEqual(iconElem.getAttribute('href'), `${localhost}/capture_favicon/red.bmp`);
      });

      it('capture.favicon = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElem = doc.querySelector('link[rel~="icon"]');
        assert(!iconElem.hasAttribute('href'));
      });

      it('capture.favicon = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElem = doc.querySelector('link[rel~="icon"]');
        assert.notExists(iconElem);
      });

      it('capture.favicon = save (bookmark)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.strictEqual(
          doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'),
          'data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA',
        );
      });

      it('capture.favicon = link (bookmark)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.querySelector('link[rel~="icon"]'));
      });

      it('capture.favicon = blank (bookmark)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.querySelector('link[rel~="icon"]'));
      });

      it('capture.favicon = remove (bookmark)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.querySelector('link[rel~="icon"]'));
      });
    });

    describe('should fetch site favicon when no favicon is defined', function () {
      before('generate /favicon.ico', async function () {
        const response = await fetch(`${localhost}/favicon.py?a=create`);
        assert.isTrue(response.ok);
      });

      after('delete /favicon.ico', async function () {
        const response = await fetch(`${localhost}/favicon.py?a=delete`);
        assert.isTrue(response.ok);
      });

      var options = Object.assign({}, baseOptions, {
        "capture.favicon": "save",
      });

      it('should fetch site favicon when mode = tab', async function () {
        var blob = await capture({
          url: `${localhost}/capture_favicon_site/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('favicon.ico'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElem = doc.querySelector('link[rel~="icon"]');
        assert.strictEqual(iconElem.getAttribute('href'), `favicon.ico`);
      });

      it('should fetch site favicon for document when mode = bookmark', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_favicon_site/favicon.html`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.strictEqual(
          doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'),
          'data:image/x-icon;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA',
        );
      });

      it("should ignore site favicon for attachment when mode = bookmark", async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_favicon_site/favicon.py`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.notExists(doc.querySelector('link[rel="shortcut icon"]'));
      });

      it('should ignore site favicon if page favicon exists (mode = tab)', async function () {
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));
        assert.notExists(zip.file('favicon.ico'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElem = doc.querySelector('link[rel~="icon"]');
        assert.strictEqual(iconElem.getAttribute('href'), `red.bmp`);
      });

      it('should ignore site favicon if page favicon exists (mode = bookmark)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_favicon/favicon.html`,
          mode: "bookmark",
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert.strictEqual(
          doc.querySelector('link[rel="shortcut icon"]').getAttribute('href'),
          'data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA',
        );
      });
    });

    describe('should rewrite additional `link`s according to capture.faviconAttrs', function () {
      it('capture.faviconAttrs = "apple-touch-icon apple-touch-icon-precomposed"', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "save",
          "capture.faviconAttrs": "apple-touch-icon apple-touch-icon-precomposed",
        });
        var blob = await capture({
          url: `${localhost}/capture_faviconAttrs/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));
        assert.exists(zip.file('yellow.bmp'));
        assert.exists(zip.file('green.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElems = doc.querySelectorAll('link[rel]');
        assert.strictEqual(iconElems[0].getAttribute('href'), `red.bmp`);
        assert.strictEqual(iconElems[1].getAttribute('href'), `yellow.bmp`);
        assert.strictEqual(iconElems[2].getAttribute('href'), `green.bmp`);
      });

      it('capture.faviconAttrs = "apple-touch-icon"', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "save",
          "capture.faviconAttrs": "apple-touch-icon",
        });
        var blob = await capture({
          url: `${localhost}/capture_faviconAttrs/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));
        assert.exists(zip.file('yellow.bmp'));
        assert.notExists(zip.file('green.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElems = doc.querySelectorAll('link[rel]');
        assert.strictEqual(iconElems[0].getAttribute('href'), `red.bmp`);
        assert.strictEqual(iconElems[1].getAttribute('href'), `yellow.bmp`);
        assert.strictEqual(iconElems[2].getAttribute('href'), `${localhost}/capture_faviconAttrs/green.bmp`);
      });

      it('capture.faviconAttrs = ""', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.favicon": "save",
          "capture.faviconAttrs": "",
        });
        var blob = await capture({
          url: `${localhost}/capture_faviconAttrs/favicon.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));
        assert.notExists(zip.file('yellow.bmp'));
        assert.notExists(zip.file('green.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var iconElems = doc.querySelectorAll('link[rel]');
        assert.strictEqual(iconElems[0].getAttribute('href'), `red.bmp`);
        assert.strictEqual(iconElems[1].getAttribute('href'), `${localhost}/capture_faviconAttrs/yellow.bmp`);
        assert.strictEqual(iconElems[2].getAttribute('href'), `${localhost}/capture_faviconAttrs/green.bmp`);
      });
    });
  });

  describe('CSS', function () {
    /**
     * capturer.captureDocument
     */
    describe('should handle internal, external, and imported CSS according to capture.style', function () {
      it('capture.style = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_style/style.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("external.css"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `#internal { background: yellow; }`);
        assert.strictEqual(doc.querySelector('link').getAttribute('href'), `external.css`);

        var cssFile = zip.file('external.css');
        var text = (await readFileAsText(await cssFile.async('blob'))).trim();
        assert.strictEqual(text, `#external { background: yellow; }`);
      });

      it('capture.style = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_style/style.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `#internal { background: yellow; }`);
        assert.strictEqual(doc.querySelector('link').getAttribute('href'), `${localhost}/capture_css_style/external.css`);
      });

      it('capture.style = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_style/style.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('style').textContent.trim(), ``);
        assert(!doc.querySelector('link').hasAttribute('href'));
      });

      it('capture.style = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_style/style.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('style'));
        assert.notExists(doc.querySelector('link'));
      });
    });

    /**
     * capturer.captureDocument
     */
    describe('should handle inline CSS according to capture.styleInline', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "remove",
      });

      it('capture.styleInline = save', async function () {
        options["capture.styleInline"] = "save";

        var blob = await capture({
          url: `${localhost}/capture_css_styleInline/styleInline.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("green.bmp"));
        assert.notExists(zip.file("font.woff"));
        assert.notExists(zip.file("import.css"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var elems = doc.querySelectorAll('blockquote');
        assert.strictEqual(elems[0].getAttribute('style'), `background: yellow;`);
        assert.strictEqual(elems[1].getAttribute('style'), `background: url("green.bmp");`);
        assert.strictEqual(elems[2].getAttribute('style'), `@font-face { font-family: myFont; src: url("./font.woff"); }`);
        assert.strictEqual(elems[3].getAttribute('style'), `@import "./import.css";`);
      });

      it('capture.styleInline = blank', async function () {
        options["capture.styleInline"] = "blank";

        var blob = await capture({
          url: `${localhost}/capture_css_styleInline/styleInline.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var elems = doc.querySelectorAll('blockquote');
        assert.strictEqual(elems[0].getAttribute('style'), ``);
        assert.strictEqual(elems[1].getAttribute('style'), ``);
        assert.strictEqual(elems[2].getAttribute('style'), ``);
        assert.strictEqual(elems[3].getAttribute('style'), ``);
      });

      it('capture.styleInline = remove', async function () {
        options["capture.styleInline"] = "remove";

        var blob = await capture({
          url: `${localhost}/capture_css_styleInline/styleInline.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var elems = doc.querySelectorAll('blockquote');
        assert(!elems[0].hasAttribute('style'));
        assert(!elems[1].hasAttribute('style'));
        assert(!elems[2].hasAttribute('style'));
        assert(!elems[3].hasAttribute('style'));
      });
    });

    /**
     * capturer.captureDocument
     * capturer.DocumentCssHandler.isBrowserPick
     */
    describe('should handle default and alternative stylesheets correctly', function () {
      describe('default', function () {
        it('should save as-is when the default (persistent and preferred) stylesheets group is picked', async function () {
          var blob = await capture({
            url: `${localhost}/capture_css_disabled/default.html`,
            options: baseOptions,
          }, {delay: 100});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
          assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[1].matches('[href="default.css"][title]:not([rel~="alternate"])'));
          assert(styleElems[2].matches('[href="default2.css"][title]:not([rel~="alternate"])'));
          assert(styleElems[3].matches('[href="alternative.css"][title][rel~="alternate"]'));
          assert(styleElems[4].matches('[href="alternative2.css"][title][rel~="alternate"]'));
          var styleElem = doc.querySelector('style');
          assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), `#internal { background: yellow; }`);

          assert.exists(zip.file("persistent.css"));
          assert.exists(zip.file("default.css"));
          assert.exists(zip.file("default2.css"));
          assert.exists(zip.file("alternative.css"));
          assert.exists(zip.file("alternative2.css"));
        });
      });

      describe('alternative', function () {
        $it.xfailIf(
          userAgent.is('chromium'),
          'browser pick of alternative stylesheet is not supported in Chromium',
        )('should save as-is when an alternative stylesheets group is picked', async function () {
          var blob = await capture({
            url: `${localhost}/capture_css_disabled/picked.html`,
            options: baseOptions,
          }, {delay: 800});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
          assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[1].matches('[href="default.css"][title]:not([rel~="alternate"])'));
          assert(styleElems[2].matches('[href="default2.css"][title]:not([rel~="alternate"])'));
          assert(styleElems[3].matches('[href="alternative.css"][title][rel~="alternate"]'));
          assert(styleElems[4].matches('[href="alternative2.css"][title][rel~="alternate"]'));
          var styleElem = doc.querySelector('style');
          assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), `#internal { background: yellow; }`);

          assert.exists(zip.file("persistent.css"));
          assert.exists(zip.file("default.css"));
          assert.exists(zip.file("default2.css"));
          assert.exists(zip.file("alternative.css"));
          assert.exists(zip.file("alternative2.css"));
        });

        $it.skipIf(
          !userAgent.is('chromium'),
        )('should save enabled stylesheets and all alternative stylesheets in Chromium', async function () {
          // Chromium has a bug that the disabled propery of an alternative stylesheet
          // is always false, although they are actually not applied. Save all
          // alternative stylesheets as the fallback behavior for better cross-platform
          // interoperability.
          //
          // ref: https://issues.chromium.org/issues/41460238
          var blob = await capture({
            url: `${localhost}/capture_css_disabled/picked.html`,
            options: baseOptions,
          }, {delay: 800});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
          assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[1].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          assert(styleElems[2].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          assert(styleElems[3].matches('[href="alternative.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
          assert(styleElems[4].matches('[href="alternative2.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
          var styleElem = doc.querySelector('style');
          assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), `#internal { background: yellow; }`);

          assert.exists(zip.file("persistent.css"));
          assert.notExists(zip.file("default.css"));
          assert.notExists(zip.file("default2.css"));
          assert.exists(zip.file("alternative.css"));
          assert.exists(zip.file("alternative2.css"));
        });
      });

      describe('picked by scripts', function () {
        $it.xfailIf(
          userAgent.is('chromium'),
          'disabled property of an alternative stylesheet is misleading in Chromium',
        )('should mark and skip saving disabled stylesheets when sparsely picked by scripts', async function () {
          var blob = await capture({
            url: `${localhost}/capture_css_disabled/scripted1.html`,
            options: baseOptions,
          }, {delay: 300});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
          assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[1].matches('[href="default.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[2].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          assert(styleElems[3].matches('[href="alternative.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[4].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          var styleElem = doc.querySelector('style');
          assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), `#internal { background: yellow; }`);

          assert.exists(zip.file("persistent.css"));
          assert.exists(zip.file("default.css"));
          assert.notExists(zip.file("default2.css"));
          assert.exists(zip.file("alternative.css"));
          assert.notExists(zip.file("alternative2.css"));

          var blob = await capture({
            url: `${localhost}/capture_css_disabled/scripted2.html`,
            options: baseOptions,
          }, {delay: 300});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElem = doc.querySelector('link[rel~="stylesheet"]');
          assert(styleElem.matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          var styleElem = doc.querySelector('style');
          assert(styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), ``);

          assert.notExists(zip.file("persistent.css"));
        });

        $it.skipIf(
          !userAgent.is('chromium'),
        )('should save enabled stylesheets and all alternative stylesheets in Chromium', async function () {
          var blob = await capture({
            url: `${localhost}/capture_css_disabled/scripted1.html`,
            options: baseOptions,
          }, {delay: 300});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('link[rel~="stylesheet"]');
          assert(styleElems[0].matches('[href="persistent.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[1].matches('[href="default.css"]:not([title]):not([rel~="alternate"])'));
          assert(styleElems[2].matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          assert(styleElems[3].matches('[href="alternative.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
          assert(styleElems[4].matches('[href="alternative2.css"]:not([title])[rel~="alternate"]:not([data-scrapbook-css-disabled])'));
          var styleElem = doc.querySelector('style');
          assert(!styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), `#internal { background: yellow; }`);

          assert.exists(zip.file("persistent.css"));
          assert.exists(zip.file("default.css"));
          assert.notExists(zip.file("default2.css"));
          assert.exists(zip.file("alternative.css"));
          assert.exists(zip.file("alternative2.css"));

          var blob = await capture({
            url: `${localhost}/capture_css_disabled/scripted2.html`,
            options: baseOptions,
          }, {delay: 300});
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElem = doc.querySelector('link[rel~="stylesheet"]');
          assert(styleElem.matches(':not([href]):not([title]):not([rel~="alternate"])[data-scrapbook-css-disabled]'));
          var styleElem = doc.querySelector('style');
          assert(styleElem.matches('[data-scrapbook-css-disabled]'));
          assert.strictEqual(styleElem.textContent.trim(), ``);

          assert.notExists(zip.file("persistent.css"));
        });
      });
    });

    /**
     * capturer.DocumentCssHandler
     */
    describe('should rewrite CSS content according to capture.rewriteCss', function () {
      describe('basic', function () {
        it('capture.rewriteCss = url', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("imported.css"));
          assert.exists(zip.file("sansation_light.woff"));
          assert.exists(zip.file("green.bmp"));
          assert.exists(zip.file("unsupported-1.bmp"));
          assert.exists(zip.file("unsupported-2.bmp"));
          assert.exists(zip.file("unsupported-3.bmp"));
          assert.exists(zip.file("unsupported-4.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[0].textContent.trim(), `\
@import "imported.css";
@font-face { font-family: fontface; src: url("sansation_light.woff"); }
#background { background: url("green.bmp"); }`);

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@media print {
  #media { color: green; }
}`);

          assert.strictEqual(styleElems[2].textContent.trim(), `\
@keyframes demo {
  from { transform: translateX(-5px); }
  to { transform: translateX(40px); }
}
#keyframes { animation: demo 3s linear infinite; }`);

          assert.strictEqual(styleElems[3].textContent.trim(), `\
@supports (--myvar: green) {
  :root {
    --myvar: green;
  }
  #supports {
    color: var(--myvar);
  }
}`);

          assert.strictEqual(styleElems[4].textContent.trim(), `\
@namespace svg url(http://www.w3.org/2000/svg);
svg|a text, text svg|a {
  fill: blue;
  text-decoration: underline;
}`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
/* unsupported rules */
#unsupported {
  *background: url("unsupported-1.bmp"); /* IE7 */
  _background: url("unsupported-2.bmp"); /* IE6 */
  -o-background: url("unsupported-3.bmp"); /* vandor prefix */
  unknown: url("unsupported-4.bmp"); /* unknown */
}`);

          assert.strictEqual(doc.querySelector('blockquote').getAttribute('style'), `\
background: blue; background: url("green.bmp");`);
        });

        it('capture.rewriteCss = tidy', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "tidy",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("imported.css"));
          assert.exists(zip.file("sansation_light.woff"));
          assert.exists(zip.file("green.bmp"));
          assert.notExists(zip.file("unsupported-1.bmp"));
          assert.notExists(zip.file("unsupported-2.bmp"));
          assert.notExists(zip.file("unsupported-3.bmp"));
          assert.notExists(zip.file("unsupported-4.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          var regex = cssRegex`@import url("imported.css");
@font-face { font-family: fontface; src: url("sansation_light.woff"); }
#background { background: ${'(?=.*?'}url("green.bmp")${').*?'}; }`;
          assert(styleElems[0].textContent.trim().match(regex));

          var regex = cssRegex`@media print {
  #media { color: green; }
}`;
          assert(styleElems[1].textContent.trim().match(regex));

          var regex = cssRegex`@keyframes demo {
  0% { transform: translateX(-5px); }
  100% { transform: translateX(40px); }
}
#keyframes { animation: ${/(?=.*?\b3s\b)(?=.*?\bdemo\b)(?=.*?\blinear\b)(?=.*?\binfinite\b).*?/}; }`;
          assert(styleElems[2].textContent.trim().match(regex));

          var regex = cssRegex`@supports (--myvar: green) {
  :root { --myvar: green; }
  #supports { color: var(--myvar); }
}`;
          assert(styleElems[3].textContent.trim().match(regex));

          var regex = cssRegex`@namespace svg url("http://www.w3.org/2000/svg");
svg|a text, text svg|a { fill: blue; text-decoration: underline; }`;
          assert(styleElems[4].textContent.trim().match(regex));

          var regex = cssRegex`#unsupported { }`;
          assert(styleElems[5].textContent.trim().match(regex));

          var regex = cssRegex`background: ${'(?=.*?'}url("green.bmp")${').*?'};`;
          assert(doc.querySelector('blockquote').getAttribute('style').match(regex));
        });

        it('capture.rewriteCss = match', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("imported.css"));
          assert.exists(zip.file("sansation_light.woff"));
          assert.exists(zip.file("green.bmp"));
          assert.notExists(zip.file("unsupported-1.bmp"));
          assert.notExists(zip.file("unsupported-2.bmp"));
          assert.notExists(zip.file("unsupported-3.bmp"));
          assert.notExists(zip.file("unsupported-4.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          var regex = cssRegex`@import url("imported.css");
@font-face { font-family: fontface; src: url("sansation_light.woff"); }
#background { background: ${'(?=.*?'}url("green.bmp")${').*?'}; } `;
          assert(styleElems[0].textContent.trim().match(regex));

          var regex = cssRegex`@media print {
  #media { color: green; }
}`;
          assert(styleElems[1].textContent.trim().match(regex));

          var regex = cssRegex`@keyframes demo {
  0% { transform: translateX(-5px); }
  100% { transform: translateX(40px); }
}
#keyframes { animation: ${/(?=.*?\b3s\b)(?=.*?\bdemo\b)(?=.*?\blinear\b)(?=.*?\binfinite\b).*/}; }`;
          assert(styleElems[2].textContent.trim().match(regex));

          var regex = cssRegex`@supports (--myvar: green ) {
  :root { --myvar: green; }
  #supports { color: var(--myvar); }
}`;
          assert(styleElems[3].textContent.trim().match(regex));

          var regex = cssRegex`@namespace svg url("http://www.w3.org/2000/svg");
svg|a text, text svg|a { fill: blue; text-decoration: underline; }`;
          assert(styleElems[4].textContent.trim().match(regex));

          var regex = cssRegex`#unsupported { }`;
          assert(styleElems[5].textContent.trim().match(regex));

          var regex = cssRegex`background: ${'(?=.*?'}url("green.bmp")${').*?'};`;
          assert(doc.querySelector('blockquote').getAttribute('style').match(regex));
        });

        it('capture.rewriteCss = none', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "none",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.lengthOf(Object.keys(zip.files), 1);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[0].textContent.trim(), `\
@import "rewrite/imported.css";
@font-face { font-family: fontface; src: url(rewrite/sansation_light.woff); }
#background { background: url(rewrite/green.bmp); }`);

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@media print {
  #media { color: green; }
}`);

          assert.strictEqual(styleElems[2].textContent.trim(), `\
@keyframes demo {
  from { transform: translateX(-5px); }
  to { transform: translateX(40px); }
}
#keyframes { animation: demo 3s linear infinite; }`);

          assert.strictEqual(styleElems[3].textContent.trim(), `\
@supports (--myvar: green) {
  :root {
    --myvar: green;
  }
  #supports {
    color: var(--myvar);
  }
}`);

          assert.strictEqual(styleElems[4].textContent.trim(), `\
@namespace svg url(http://www.w3.org/2000/svg);
svg|a text, text svg|a {
  fill: blue;
  text-decoration: underline;
}`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
/* unsupported rules */
#unsupported {
  *background: url(rewrite/unsupported-1.bmp); /* IE7 */
  _background: url(rewrite/unsupported-2.bmp); /* IE6 */
  -o-background: url(rewrite/unsupported-3.bmp); /* vandor prefix */
  unknown: url(rewrite/unsupported-4.bmp); /* unknown */
}`);

          assert.strictEqual(doc.querySelector('blockquote').getAttribute('style'), `\
background: blue; background: url(rewrite/green.bmp);`);
        });
      });

      describe('namespace', function () {
        it('namsepaced element selector', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_namespace/element.xhtml`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.xhtml');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[0].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
myns|elem-1 { background-color: lime; }`);

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@namespace url("http://example.com/myns");
elem-2 { background-color: lime; }`);

          assert.strictEqual(styleElems[2].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
myns|elem-3 { background-color: lime; }`);

          assert.strictEqual(styleElems[3].textContent.trim(), `\
@namespace url("http://example.com/myns");
elem-4 { background-color: lime; }`);

          assert.strictEqual(styleElems[4].textContent.trim(), `\
@namespace myns url("http://example.com/myns");`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
@namespace url("http://example.com/myns");`);
        });

        it('namsepaced attribute selector', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_namespace/attribute.xhtml`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.xhtml');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[0].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
[myns|attr1] { background-color: lime; }`);

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@namespace url("http://example.com/myns");
[attr2] { background-color: lime; }`);

          assert.strictEqual(styleElems[2].textContent.trim(), `\
@namespace myns url("http://example.com/myns");
[myns|attr3] { background-color: lime; }`);

          assert.strictEqual(styleElems[3].textContent.trim(), `\
@namespace url("http://example.com/myns");
[attr4] { background-color: lime; }`);

          assert.strictEqual(styleElems[4].textContent.trim(), `\
@namespace myns url("http://example.com/myns");`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
@namespace url("http://example.com/myns");`);
        });
      });

      describe('@supports', function () {
        it('capture.rewriteCss = url', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@supports (display: block) {
  #case1 {
    background-image: url("case1.bmp");
  }
}`,
          );

          assert.strictEqual(styleElems[2].textContent.trim(), `\
@supports (display: nonexist) {
  #case2 {
    background-image: url("case2.bmp");
  }
}`,
          );
        });

        it('capture.rewriteCss = tidy', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "tidy",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert(styleElems[1].textContent.trim().match(
            cssRegex`@supports (display: block) {
  #case1 { background-image: url("case1.bmp"); }
}`,
          ));

          assert(styleElems[2].textContent.trim().match(
            cssRegex`@supports (display: nonexist) {
  #case2 { background-image: url("case2.bmp"); }
}`,
          ));
        });

        it('capture.rewriteCss = match', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert(styleElems[1].textContent.trim().match(
            cssRegex`@supports (display: block) {
  #case1 { background-image: url("case1.bmp"); }
}`,
          ));

          assert(styleElems[2].textContent.trim().match(
            cssRegex`@supports (display: nonexist) {
  #case2 { background-image: url("case2.bmp"); }
}`,
          ));
        });

        it('capture.rewriteCss = none', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "none",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_supports/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@supports (display: block) {
  #case1 {
    background-image: url(resources/case1.bmp);
  }
}`,
          );

          assert.strictEqual(styleElems[2].textContent.trim(), `\
@supports (display: nonexist) {
  #case2 {
    background-image: url(resources/case2.bmp);
  }
}`,
          );
        });
      });

      $describe.skipIf($.noAtCounterStyle)('@counter-style', function () {
        it('capture.rewriteCss = url', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@counter-style mycounter {
  system: cyclic;
  suffix: " ";
  symbols: url("1.bmp") url("2.bmp") url("3.bmp");
  symbols: Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ Ⓕ Ⓖ;
}`,
          );
        });

        it('capture.rewriteCss = tidy', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "tidy",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert(doc.querySelector('style').textContent.trim().match(
            cssRegex`@counter-style mycounter {${
              '(?=[\\s\\S]*?'}system: cyclic;${')'}${
              '(?=[\\s\\S]*?'}suffix: "${' '}";${')'}${
              '(?=[\\s\\S]*?'}symbols: Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ Ⓕ Ⓖ;${')'}${
              '[\\s\\S]*?'}}`,
          ));
        });

        it('capture.rewriteCss = match', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert(doc.querySelector('style').textContent.trim().match(
            cssRegex`@counter-style mycounter {${
              '(?=[\\s\\S]*?'}system: cyclic;${')'}${
              '(?=[\\s\\S]*?'}suffix: "${' '}";${')'}${
              '(?=[\\s\\S]*?'}symbols: Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ Ⓕ Ⓖ;${')'}${
              '[\\s\\S]*?'}}`,
          ));
        });

        it('capture.rewriteCss = none', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "none",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_counter_style/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@counter-style mycounter {
  system: cyclic;
  suffix: " ";
  symbols: url(./resources/1.bmp) url(./resources/2.bmp) url(./resources/3.bmp);
  symbols: Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ Ⓕ Ⓖ;
}`,
          );
        });
      });

      $describe.skipIf($.noAtLayer)('@layer', function () {
        it('capture.rewriteCss = match', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_at_layer/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert(styleElems[1].textContent.trim().match(
            cssRegex`@layer base, special;
@layer special {
  #case1 { background-image: url("case1s.bmp"); }
}
@layer base {
  #case1 { background-image: url("case1b.bmp"); }
}`,
          ));

          assert(styleElems[2].textContent.trim().match(
            cssRegex`@layer special2 {
  #case2 { background-image: url("case2s.bmp"); }
}
@layer base2 {
  #case2 { background-image: url("case2b.bmp"); }
}`,
          ));
        });
      });

      describe('DOM matching for capture.rewriteCss = match', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file("green.bmp"));
          assert.notExists(zip.file("unsupported-1.bmp"));
          assert.notExists(zip.file("unsupported-2.bmp"));
          assert.notExists(zip.file("unsupported-3.bmp"));
          assert.notExists(zip.file("unsupported-4.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[0].textContent.trim(), '');

          assert.strictEqual(styleElems[1].textContent.trim(), '');

          var regex = cssRegex`@keyframes demo {
  0% { transform: translateX(-5px); }
  100% { transform: translateX(40px); }
}`;
          assert(styleElems[2].textContent.trim().match(regex));

          var regex = cssRegex`@supports (--myvar: green ) {
  :root { --myvar: green; }
}`;
          assert(styleElems[3].textContent.trim().match(regex));

          var regex = cssRegex`${'^'}@namespace svg url("http://www.w3.org/2000/svg");${'$'}`;
          assert(styleElems[4].textContent.trim().match(regex));

          assert.strictEqual(styleElems[5].textContent.trim(), ``);
        });

        it('pseudo', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match_pseudo/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[0].textContent.trim(), `:hover { }`);

          assert.strictEqual(styleElems[1].textContent.trim(), `#pseudo1::before { }`);

          assert.strictEqual(styleElems[2].textContent.trim(), `#pseudo2:not([hidden]) { }`);

          assert.strictEqual(styleElems[3].textContent.trim(), `#pseudo3:not(blockquote) { }`);

          assert.strictEqual(styleElems[4].textContent.trim(), `[id="pseudo4"]:not([hidden]) { }`);

          assert.strictEqual(styleElems[5].textContent.trim(), `[id="pseudo5"]:not(blockquote) { }`);

          assert.strictEqual(styleElems[6].textContent.trim(), `#pseudo6 :nth-of-type(1) { }`);

          assert.strictEqual(styleElems[7].textContent.trim(), ``);

          assert.strictEqual(styleElems[8].textContent.trim(), `:root > body > #pseudo8 { }`);

          assert.strictEqual(styleElems[9].textContent.trim(), ``);

          assert.strictEqual(styleElems[10].textContent.trim(), `:scope > body > #pseudo10 { }`);

          assert.strictEqual(styleElems[11].textContent.trim(), ``);
        });

        $it.skipIf($.noIsPseudo)('pseudo :is', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match_pseudo/rewrite_is.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[1].textContent.trim(), `#pseudo1:is(blockquote) { }`);

          assert.strictEqual(styleElems[2].textContent.trim(), ``);

          assert.strictEqual(styleElems[3].textContent.trim(), `:is(#pseudo3):not([hidden]) { }`);

          assert.strictEqual(styleElems[4].textContent.trim(), `:is(#pseudo4):not(blockquote) { }`);

          assert.strictEqual(styleElems[5].textContent.trim(), `:where(nonexist, #pseudo5) { }`);
        });

        it('pseudo :host in shadow DOM', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_host.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var host = doc.querySelector('#host1');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style:nth-of-type(2)').textContent.trim(), `\
:host { background-color: lime; }
:host #elem1 { background-color: yellow; }
:host #elem2:hover { background-color: yellow; }
:host > #elem3 { background-color: yellow; }
:host > #elem4:hover { background-color: yellow; }`);

          var host = doc.querySelector('#host2');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style:nth-of-type(2)').textContent.trim(), `\
:host(#host2) { background-color: lime; }
:host(#host2) #elem1 { background-color: yellow; }
:host(#host2) #elem2:hover { background-color: yellow; }
:host(#host2) > #elem3 { background-color: yellow; }
:host(#host2) > #elem4:hover { background-color: yellow; }`);

          var host = doc.querySelector('#host3');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style:nth-of-type(2)').textContent.trim(), `\
:host(#nonexist) { background-color: lime; }
:host(#nonexist) #elem1 { background-color: yellow; }
:host(#nonexist) #elem2:hover { background-color: yellow; }
:host(#nonexist) > #elem3 { background-color: yellow; }
:host(#nonexist) > #elem4:hover { background-color: yellow; }`);
        });

        $it.skipIf($.noHostContextPseudo)('pseudo :host-context in shadow DOM', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_host_context.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var host = doc.querySelector('#host1');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style:nth-of-type(2)').textContent.trim(), `\
:host-context(body) { background-color: lime; }
:host-context(body) #elem1 { background-color: yellow; }
:host-context(body) #elem2:hover { background-color: yellow; }
:host-context(body) > #elem3 { background-color: yellow; }
:host-context(body) > #elem4:hover { background-color: yellow; }`);

          var host = doc.querySelector('#host2');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style:nth-of-type(2)').textContent.trim(), `\
:host-context(#nonexist) { background-color: lime; }
:host-context(#nonexist) #elem1 { background-color: yellow; }
:host-context(#nonexist) #elem2:hover { background-color: yellow; }
:host-context(#nonexist) > #elem3 { background-color: yellow; }
:host-context(#nonexist) > #elem4:hover { background-color: yellow; }`);
        });

        it('pseudo ::slotted in shadow DOM', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_slotted.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var host = doc.querySelector('#person1');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style').textContent.trim(), `\
::slotted(*) { background-color: yellow; }
::slotted(p) { text-decoration: underline; }
div > ::slotted(*) { font-size: 1.2em; }`);

          var host = doc.querySelector('#person2');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style').textContent.trim(), `\
::slotted(*) { background-color: yellow; }
::slotted(p) { text-decoration: underline; }
div > ::slotted(*) { font-size: 1.2em; }`);

          var host = doc.querySelector('#person3');
          var frag = doc.createElement("template");
          frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
          var shadow = frag.content;
          assert.strictEqual(shadow.querySelector('style').textContent.trim(), `\
::slotted(*) { background-color: yellow; }
::slotted(p) { text-decoration: underline; }
div > ::slotted(*) { font-size: 1.2em; }`);
        });

        it('pseudo ::part', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_match_shadow/rewrite_part.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
::part(elem1) { background-color: lime; }
#host1::part(elem2) { background-color: lime; }
#host1::part(nonexist) { background-color: red; }`);
        });
      });

      describe('cross-origin CSS', function () {
        it('capture.rewriteCss = tidy', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "tidy",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var cssFile = zip.file('linked.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
@import url("imported.css");
#linked { background-color: green; }
#unused { background-color: red; }`);

          var cssFile = zip.file('imported.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
#imported { background-color: green; }
#unused { background-color: red; }`);
        });

        it('capture.rewriteCss = tidy (headless)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "tidy",
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var cssFile = zip.file('linked.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
@import url("imported.css");
#linked { background-color: green; }
#unused { background-color: red; }`);

          var cssFile = zip.file('imported.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
#imported { background-color: green; }
#unused { background-color: red; }`);
        });

        it('capture.rewriteCss = match', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var cssFile = zip.file('linked.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
@import url("imported.css");
#linked { background-color: green; }`);

          var cssFile = zip.file('imported.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
#imported { background-color: green; }`);
        });

        it('capture.rewriteCss = match (headless)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_css_rewriteCss_cross_origin/rewrite.py`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var cssFile = zip.file('linked.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
@import url("imported.css");
#linked { background-color: green; }`);

          var cssFile = zip.file('imported.css');
          var cssText = (await readFileAsText(await cssFile.async('blob'))).trim();
          assert.strictEqual(cssText, `\
#imported { background-color: green; }`);
        });
      });

      $describe.skipIf($.noNestingCss)('nesting CSS', function () {
        it('capture.rewriteCss = url', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('case1.bmp'));
          assert.exists(zip.file('case1-1.bmp'));
          assert.exists(zip.file('case1-1-1.bmp'));
          assert.exists(zip.file('case1-1-2.bmp'));
          assert.exists(zip.file('case1-2.bmp'));
          assert.exists(zip.file('case1-2-1.bmp'));
          assert.exists(zip.file('case1-2-2.bmp'));
          assert.exists(zip.file('case2-1.bmp'));
          assert.exists(zip.file('dummy.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0;
  .case1-1 {
    .case1-1-1 {
      background: url("case1-1-1.bmp");
    }
    &.case1-1-2 {
      background: url("case1-1-2.bmp");
    }
    background: url("case1-1.bmp");
  }
  &.case1-2 {
    .case1-2-1 {
      background: url("case1-2-1.bmp");
    }
    background: url("case1-2.bmp");
    &.case1-2-2 {
      background: url("case1-2-2.bmp");
    }
  }
  .dummy { background: url("dummy.bmp"); }
  &.dummy { background: url("dummy.bmp"); }
}
& .case2 {
  .case2-1 & {
    background: url("case2-1.bmp");
  }
}`);
        });

        it('capture.rewriteCss = tidy', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "tidy",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('case1.bmp'));
          assert.exists(zip.file('case1-1.bmp'));
          assert.exists(zip.file('case1-1-1.bmp'));
          assert.exists(zip.file('case1-1-2.bmp'));
          assert.exists(zip.file('case1-2.bmp'));
          assert.exists(zip.file('case1-2-1.bmp'));
          assert.exists(zip.file('case1-2-2.bmp'));
          assert.exists(zip.file('case2-1.bmp'));
          assert.exists(zip.file('dummy.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var css = doc.querySelector('style').textContent.trim();
          var cssRegexes = [
            cssRegex`
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0px;
  .case1-1 {
    background: url("case1-1.bmp");
    .case1-1-1 { background: url("case1-1-1.bmp"); }
    &.case1-1-2 { background: url("case1-1-2.bmp"); }
  }
  &.case1-2 {
    background: url("case1-2.bmp");
    .case1-2-1 { background: url("case1-2-1.bmp"); }
    &.case1-2-2 { background: url("case1-2-2.bmp"); }
  }
  .dummy { background: url("dummy.bmp"); }
  &.dummy { background: url("dummy.bmp"); }
}
& .case2 {
  .case2-1 & {
    background: url("case2-1.bmp");
  }
}`,
            // the parsed CSS is automatically prepended "& " in some newer browsers
            // e.g. Firefox >= 128, Chromium >= 125
            cssRegex`
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0px;
  & .case1-1 {
    background: url("case1-1.bmp");
    & .case1-1-1 { background: url("case1-1-1.bmp"); }
    &.case1-1-2 { background: url("case1-1-2.bmp"); }
  }
  &.case1-2 {
    background: url("case1-2.bmp");
    & .case1-2-1 { background: url("case1-2-1.bmp"); }
    &.case1-2-2 { background: url("case1-2-2.bmp"); }
  }
  & .dummy { background: url("dummy.bmp"); }
  &.dummy { background: url("dummy.bmp"); }
}
& .case2 {
  .case2-1 & {
    background: url("case2-1.bmp");
  }
}`,
            // Firefox >= 132
            cssRegex`
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0px;
  & .case1-1 {
    & .case1-1-1 { background: url("case1-1-1.bmp"); }
    &.case1-1-2 { background: url("case1-1-2.bmp"); }
    background: url("case1-1.bmp");
  }
  &.case1-2 {
    & .case1-2-1 { background: url("case1-2-1.bmp"); }
    background: url("case1-2.bmp");
    &.case1-2-2 { background: url("case1-2-2.bmp"); }
  }
  & .dummy { background: url("dummy.bmp"); }
  &.dummy { background: url("dummy.bmp"); }
}
& .case2 {
  .case2-1 & {
    background: url("case2-1.bmp");
  }
}`,
          ];
          assert(cssRegexes.some(regex => css.match(regex)));
        });

        it('capture.rewriteCss = match', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "match",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('case1.bmp'));
          assert.exists(zip.file('case1-1.bmp'));
          assert.exists(zip.file('case1-1-1.bmp'));
          assert.exists(zip.file('case1-1-2.bmp'));
          assert.exists(zip.file('case1-2.bmp'));
          assert.exists(zip.file('case1-2-1.bmp'));
          assert.exists(zip.file('case1-2-2.bmp'));
          assert.exists(zip.file('case2-1.bmp'));
          assert.notExists(zip.file('dummy.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var css = doc.querySelector('style').textContent.trim();
          var cssRegexes = [
            cssRegex`
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0px;
  .case1-1 {
    background: url("case1-1.bmp");
    .case1-1-1 { background: url("case1-1-1.bmp"); }
    &.case1-1-2 { background: url("case1-1-2.bmp"); }
  }
  &.case1-2 {
    background: url("case1-2.bmp");
    .case1-2-1 { background: url("case1-2-1.bmp"); }
    &.case1-2-2 { background: url("case1-2-2.bmp"); }
  }
}
& .case2 {
  .case2-1 & {
    background: url("case2-1.bmp");
  }
}`,
            // the parsed CSS is automatically prepended "& " in some newer browsers
            // e.g. Firefox >= 128, Chromium >= 125
            cssRegex`
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0px;
  & .case1-1 {
    background: url("case1-1.bmp");
    & .case1-1-1 { background: url("case1-1-1.bmp"); }
    &.case1-1-2 { background: url("case1-1-2.bmp"); }
  }
  &.case1-2 {
    background: url("case1-2.bmp");
    & .case1-2-1 { background: url("case1-2-1.bmp"); }
    &.case1-2-2 { background: url("case1-2-2.bmp"); }
  }
}
& .case2 {
  .case2-1 & {
    background: url("case2-1.bmp");
  }
}`,
            // Firefox >= 132
            cssRegex`
.case1, #nonexist {
  background: url("case1.bmp");
  padding: 0px;
  & .case1-1 {
    & .case1-1-1 { background: url("case1-1-1.bmp"); }
    &.case1-1-2 { background: url("case1-1-2.bmp"); }
    background: url("case1-1.bmp");
  }
  &.case1-2 {
    & .case1-2-1 { background: url("case1-2-1.bmp"); }
    background: url("case1-2.bmp");
    &.case1-2-2 { background: url("case1-2-2.bmp"); }
  }
}
& .case2 {
  .case2-1 & { background: url("case2-1.bmp"); }
}`,
          ];
          assert(cssRegexes.some(regex => css.match(regex)));
        });

        it('capture.rewriteCss = none', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "none",
          });

          var blob = await capture({
            url: `${localhost}/capture_css_rewriteCss_nesting/rewrite.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file('case1.bmp'));
          assert.notExists(zip.file('case1-1.bmp'));
          assert.notExists(zip.file('case1-1-1.bmp'));
          assert.notExists(zip.file('case1-1-2.bmp'));
          assert.notExists(zip.file('case1-2.bmp'));
          assert.notExists(zip.file('case1-2-1.bmp'));
          assert.notExists(zip.file('case1-2-2.bmp'));
          assert.notExists(zip.file('case2-1.bmp'));
          assert.notExists(zip.file('dummy.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
.case1, #nonexist {
  background: url(./resources/case1.bmp);
  padding: 0;
  .case1-1 {
    .case1-1-1 {
      background: url(./resources/case1-1-1.bmp);
    }
    &.case1-1-2 {
      background: url(./resources/case1-1-2.bmp);
    }
    background: url(./resources/case1-1.bmp);
  }
  &.case1-2 {
    .case1-2-1 {
      background: url(./resources/case1-2-1.bmp);
    }
    background: url(./resources/case1-2.bmp);
    &.case1-2-2 {
      background: url(./resources/case1-2-2.bmp);
    }
  }
  .dummy { background: url(./resources/dummy.bmp); }
  &.dummy { background: url(./resources/dummy.bmp); }
}
& .case2 {
  .case2-1 & {
    background: url(./resources/case2-1.bmp);
  }
}`);
        });
      });
    });

    /**
     * scrapbook.parseCssText
     */
    describe('CSS syntax parsing', function () {
      it('background', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "save",
          "capture.font": "blank",
          "capture.imageBackground": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_syntax/background.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var css = doc.querySelectorAll('style');
        assert.strictEqual(css[1].textContent.trim(), `#test1 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[2].textContent.trim(), `#test2 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[3].textContent.trim(), `#test3 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[4].textContent.trim(), `#test4 { background: url( "${localhost}/capture_css_syntax/green.bmp" ); }`);
        assert.strictEqual(css[5].textContent.trim(), `#test5 { background: url("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[6].textContent.trim(), `#test6 { background: "green.bmp"; }`);
        assert.strictEqual(css[7].textContent.trim(), `#test7 { background: url/*c*/("green.bmp"); }`);
        assert.strictEqual(css[8].textContent.trim(), `#test8 { background: url(/*c*/"green.bmp"); }`);
        assert.strictEqual(css[9].textContent.trim(), `#test9 { background: url("green.bmp"/*c*/); }`);
        assert.strictEqual(css[10].textContent.trim(), `#test10 { background: url("green.bmp" "yellow.bmp"); }`);
        assert.strictEqual(css[11].textContent.trim(), `#test11 { background:url("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[12].textContent.trim(), `#test12 { background: URL("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[13].textContent.trim(), `#test13 { background: Url("${localhost}/capture_css_syntax/green.bmp"); }`);
        assert.strictEqual(css[14].textContent.trim(), `#test14 { /*background: url("green.bmp");*/ }`);
        assert.strictEqual(css[15].textContent.trim(), `#test15 { background: url("${localhost}/capture_css_syntax/foo'bar.bmp"); }`);
        assert.strictEqual(css[16].textContent.trim(), `#test16 { background: url("${localhost}/capture_css_syntax/foo'bar.bmp"); }`);
        assert.strictEqual(css[17].textContent.trim(), `#test17 { background: url(  "${localhost}/capture_css_syntax/green.bmp"  ); }`);
        assert.strictEqual(css[18].textContent.trim(), `#test18 { background: url("${localhost}/*c*/green.bmp"); }`);
        assert.strictEqual(css[19].textContent.trim(), `#test19 { background: url("${localhost}/capture_css_syntax/green.bmp/*c*/"); }`);
        assert.strictEqual(css[20].textContent.trim(), `#test20 { background: /*url("green.bmp"); }`);
      });

      it('font', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "save",
          "capture.font": "link",
          "capture.imageBackground": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_syntax/font.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var css = doc.querySelectorAll('style');
        assert(css[1].textContent.trim() ===
            `@font-face { font-family: myFont1; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
        assert(css[2].textContent.trim() ===
            `@font-face { font-family: myFont2; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
        assert(css[3].textContent.trim() ===
            `@font-face { font-family: myFont3; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
        assert(css[4].textContent.trim() ===
            `@font-face{font-family:myFont4;src:url("${localhost}/capture_css_syntax/sansation_light.woff");}`);
        assert(css[5].textContent.trim() ===
            `@font-face { font-family : myFont5 ; src : url(  "${localhost}/capture_css_syntax/sansation_light.woff"  )  ; }`);
        assert(css[6].textContent.trim() ===
            `@font-face /*c*/{ font-family: myFont6; /*c*/src: /*c*/url("${localhost}/capture_css_syntax/sansation_light.woff")/*c*/; /*c*/}`);
        assert(css[7].textContent.trim() ===
            `@font-face { font-family: myFont7, myFont; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
        assert(css[8].textContent.trim() ===
            `@font-face { font-family: "myFont8"; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
        assert(css[9].textContent.trim() ===
            `@font-face { font-family: "my font 9"; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
        assert(css[10].textContent.trim() ===
            `@font-face { font-family: 'my font 10'; src: url("${localhost}/capture_css_syntax/sansation_light.woff"); }`);
      });

      it('import', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.style": "link",
          "capture.font": "blank",
          "capture.imageBackground": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_syntax/import.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var css = doc.querySelectorAll('style');
        assert.strictEqual(css[1].textContent.trim(), `@import "${localhost}/capture_css_syntax/import/style1.css";`);
        assert.strictEqual(css[2].textContent.trim(), `@import "${localhost}/capture_css_syntax/import/style2.css";`);
        assert.strictEqual(css[3].textContent.trim(), `@import url("${localhost}/capture_css_syntax/import/style3.css");`);
        assert.strictEqual(css[4].textContent.trim(), `@import url("${localhost}/capture_css_syntax/import/style4.css");`);
        assert.strictEqual(css[5].textContent.trim(), `@import url("${localhost}/capture_css_syntax/import/style5.css");`);
        assert.strictEqual(css[6].textContent.trim(), `@import  "${localhost}/capture_css_syntax/import/style6.css" ;`);
        assert.strictEqual(css[7].textContent.trim(), `@import "${localhost}/capture_css_syntax/import/style7.css"/*c*/;`);
        assert.strictEqual(css[8].textContent.trim(), `@import/*c*/"${localhost}/capture_css_syntax/import/style8.css";`);
        assert.strictEqual(css[9].textContent.trim(), `@import"${localhost}/capture_css_syntax/import/style9.css";`);
        assert.strictEqual(css[10].textContent.trim(), `@import import/style10.css;`);
        assert.strictEqual(css[11].textContent.trim(), `@importurl("import/style11.css");`);
        assert.strictEqual(css[12].textContent.trim(), `@IMPORT "${localhost}/capture_css_syntax/import/style12.css";`);
        assert.strictEqual(css[13].textContent.trim(), `@import "${localhost}/capture_css_syntax/import/style13.css" screen;`);
        assert.strictEqual(css[14].textContent.trim(), `/* @import "import/style14.css"; */`);
        // assert.strictEqual(css[15].textContent.trim(), `#test15::after { content: '@import "import/style15.css"'; }`);
      });
    });

    /**
     * scrapbook.parseCssFile
     */
    describe('charset handling', function () {
      async function hasBomUtf8(blob) {
        var u8ar = new Uint8Array(await readFileAsArrayBuffer(blob.slice(0, 3)));
        return u8ar[0] === 0xEF && u8ar[1] === 0xBB && u8ar[2] === 0xBF;
      }

      describe('@charset', function () {
        for (const func of ["capture", "captureHeadless"]) {
          // captureHeadless doen't use dynamic CSS
          it(`should use UTF-8 encoding and add BOM before \`@charset\` rule (${func})`, async function () {
            var options = Object.assign({}, baseOptions, {
              "capture.style": "save",
            });
            var blob = await global[func]({
              url: `${localhost}/capture_css_charset/basic/index.html`,
              options,
            });

            var zip = await new JSZip().loadAsync(blob);

            var file = zip.file('header_big5.py.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `#test1::after { content: "中文"; }`);
            assert(!await hasBomUtf8(blob));

            var file = zip.file('bom_utf16.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `#test2::after { content: "中文"; }`);
            assert(!await hasBomUtf8(blob));

            var file = zip.file('at_big5.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `@charset "Big5";
#test3::after { content: "中文"; }`);
            assert(await hasBomUtf8(blob));

            var file = zip.file('utf8.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `#test4::after { content: "中文"; }`);
            assert(!await hasBomUtf8(blob));

            var file = zip.file('header_utf8_bom_utf8.py.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `#test5::after { content: "中文"; }`);
            assert(!await hasBomUtf8(blob));

            var file = zip.file('header_utf8_at_big5.py.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `@charset "Big5";
#test6::after { content: "中文"; }`);
            assert(await hasBomUtf8(blob));

            var file = zip.file('bom_utf16_at_big5.css');
            var blob = new Blob([await file.async('blob')], {type: "text/css"});
            var text = (await readFileAsText(blob)).trim();
            assert.strictEqual(text, `@charset "Big5";
#test7::after { content: "中文"; }`);
            assert(await hasBomUtf8(blob));
          });
        }
      });

      describe('document charset', function () {
        it('mode = tab: should use dynamic CSS (determined by browser parsing)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_charset/doc_charset/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var file = zip.file('link.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `@import "link_import.css";
#link::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#link_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `@import "import_import.css";
#import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('import_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#import_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));
        });

        it('infer document charset: mode = source', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_css_charset/doc_charset/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var file = zip.file('link.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@import "link_import.css";
#link::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#link_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@import "import_import.css";
#import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('import_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#import_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link-charset.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@charset "utf-8";
#link-charset::after { content: "中文"; }`);
          assert(await hasBomUtf8(blob));

          var file = zip.file('import-charset.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@charset "utf-8";
#import-charset::after { content: "中文"; }`);
          assert(await hasBomUtf8(blob));
        });
      });

      describe('link[charset] (obsolete)', function () {
        it('mode = tab: should use dynamic CSS (determined by browser parsing)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_charset/link_charset/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert(!doc.querySelector('link').hasAttribute('charset'));

          var file = zip.file('link.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@import "link_import.css";
#link::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#link_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));
        });

        it('mode = source', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_css_charset/link_charset/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert(!doc.querySelector('link').hasAttribute('charset'));

          var file = zip.file('link.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@import "link_import.css";
#link::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#link_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));
        });

        it('should keep `link[charset]` if capture.style = link', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "link",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_charset/link_charset/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('link').getAttribute('charset'), 'big5');
        });

        it('should save a file referenced by `link`s with different `charset` attributes separately', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
            "capture.saveResourcesSequentially": true,
            "capture.downLink.doc.depth": 0,
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_css_charset/link_charset/bad.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);

          var file = zip.file('link.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `\
@import "link_import.css";
#link::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link_import.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.strictEqual(text, `#link_import::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var file = zip.file('link-1.css');
          var blob = new Blob([await file.async('blob')], {type: "text/css"});
          var text = (await readFileAsText(blob)).trim();
          assert.notStrictEqual(text, `\
@import "link_import.css";
#link::after { content: "中文"; }`);
          assert(!await hasBomUtf8(blob));

          var sitemapBlob = await zip.file('index.json').async('blob');
          var expectedData = {
            "version": 3,
            "indexPages": [
              "index.html",
            ],
            "redirects": [],
            "files": [
              {
                "path": "index.json",
              },
              {
                "path": "index.dat",
              },
              {
                "path": "index.rdf",
              },
              {
                "path": "history.rdf",
              },
              {
                "path": "^metadata^",
              },
              {
                "path": "index.html",
                "url": `${localhost}/capture_css_charset/link_charset/bad.html`,
                "role": "document",
                "token": getToken(`${localhost}/capture_css_charset/link_charset/bad.html`, "document"),
              },
              {
                "path": "index.xhtml",
                "role": "document",
              },
              {
                "path": "index.svg",
                "role": "document",
              },
              {
               "path": "link.css",
               "url": `${localhost}/capture_css_charset/link_charset/link.css`,
               "role": "css-big5",
               "token": getToken(`${localhost}/capture_css_charset/link_charset/link.css`, "css-big5"),
              },
              {
               "path": "link_import.css",
               "url": `${localhost}/capture_css_charset/link_charset/link_import.css`,
               "role": "css-big5",
               "token": getToken(`${localhost}/capture_css_charset/link_charset/link_import.css`, "css-big5"),
              },
              {
               "path": "link-1.css",
               "url": `${localhost}/capture_css_charset/link_charset/link.css`,
               "role": "css-utf-8",
               "token": getToken(`${localhost}/capture_css_charset/link_charset/link.css`, "css-utf-8"),
              },
              {
               "path": "link_import-1.css",
               "url": `${localhost}/capture_css_charset/link_charset/link_import.css`,
               "role": "css-utf-8",
               "token": getToken(`${localhost}/capture_css_charset/link_charset/link_import.css`, "css-utf-8"),
              },
            ],
          };
          assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
        });
      });
    });

    describe('CSS rewrite path handling', function () {
      it('should rewrite external and imported CSS based on the CSS file (rather than the web page)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "link",
        });

        var blob = await capture({
          url: `${localhost}/capture_css_rewrite/index.py`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        // @TODO: HTTP Link header is supported by Firefox 66 but not by Chromium 73
        //        and WebScrapBook currently.
        // var file = zip.file('header.css');
        // var blob = new Blob([await file.async('blob')], {type: "text/css"});
        // var text = (await readFileAsText(blob)).trim();
        // assert.strictEqual(text, `#header { background: url("${localhost}/capture_css_rewrite/green.bmp"); }`);

        var file = zip.file('link.css');
        var blob = new Blob([await file.async('blob')], {type: "text/css"});
        var text = (await readFileAsText(blob)).trim();
        assert.strictEqual(text, `#link { background: url("${localhost}/capture_css_rewrite/green.bmp"); }`);

        var file = zip.file('import.css');
        var blob = new Blob([await file.async('blob')], {type: "text/css"});
        var text = (await readFileAsText(blob)).trim();
        assert.strictEqual(text, `#import { background: url("${localhost}/capture_css_rewrite/green.bmp"); }`);
      });

      it('should honor base[href] when rewriting URL', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "link",
        });

        var blob = await capture({
          url: `${localhost}/capture_css_rewrite_base/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `#internal { background: url("${localhost}/capture_css_rewrite_base/base/green.bmp"); }`);

        var file = zip.file('style.css');
        var blob = new Blob([await file.async('blob')], {type: "text/css"});
        var text = (await readFileAsText(blob)).trim();
        assert.strictEqual(text, `#link { background: url("${localhost}/capture_css_rewrite_base/link/yellow.bmp"); }`);
      });

      it('should keep original value for "" and hash URL', async function () {
        var blob = await capture({
          url: `${localhost}/capture_css_rewrite_empty/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
#invalid1 { background-image: url(""); }
#invalid2 { background-image: url("#123"); }`);
      });

      it('should save as file if targeting a web page (bad practice)', async function () {
        var blob = await capture({
          url: `${localhost}/capture_css_rewrite_bad/index.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index-1.html"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `#bad1 { background-image: url("index-1.html"); }`);
      });
    });

    describe('circular import', function () {
      it('htz: should keep original interlinking between saved files', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "zip",
          "capture.style": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_css_circular/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        // style1.css
        var file = zip.file('style1.css');
        var blob = new Blob([await file.async('blob')], {type: "text/css"});
        var text = (await readFileAsText(blob)).trim();
        assert.strictEqual(text, `@import "style2.css#123";\nbody { color: red; }`);

        // style2.css
        var file = zip.file('style2.css');
        var blob = new Blob([await file.async('blob')], {type: "text/css"});
        var text = (await readFileAsText(blob)).trim();
        assert.strictEqual(text, `@import "style3.css";\nbody { color: green; }`);

        // style3.css
        var file = zip.file('style3.css');
        var blob = new Blob([await file.async('blob')], {type: "text/css"});
        var text = (await readFileAsText(blob)).trim();
        assert.strictEqual(text, `@import "style1.css";\nbody { color: blue; }`);
      });

      it('singleHtml: should rewrite with urn:scrapbook:download:circular:url:...', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "singleHtml",
          "capture.style": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_css_circular/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        // style1.css
        var url = doc.querySelector('link').getAttribute('href');
        var text = (await xhr({url, responseType: "text"})).response;
        var match = text.match(rawRegex`${'^'}@import "${'('}data:text/css;charset=UTF-8;filename=style2.css,${'[^"#]*)(?:#[^"]*)?'}";`);
        assert.exists(match);

        // style2.css
        var url = match[1];
        var text = (await xhr({url, responseType: "text"})).response;
        var match = text.match(rawRegex`${'^'}@import "${'('}data:text/css;charset=UTF-8;filename=style3.css,${'[^"#]*)(?:#[^"]*)?'}";`);
        assert.exists(match);

        // style3.css
        var url = match[1];
        var text = (await xhr({url, responseType: "text"})).response;
        assert.strictEqual(text.trim(), `@import "urn:scrapbook:download:circular:url:${localhost}/capture_css_circular/style1.css";
body { color: blue; }`);
      });

      it('singleHtml: should rewrite self-importing', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "singleHtml",
          "capture.style": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_css_circular_self/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        // style1.css
        var url = doc.querySelector('link').getAttribute('href');
        var text = (await xhr({url, responseType: "text"})).response;
        assert.strictEqual(text.trim(), `@import "urn:scrapbook:download:circular:url:${localhost}/capture_css_circular_self/style1.css";
body { color: red; }`);
      });
    });

    describe('cross-origin', function () {
      /**
       * When the origin of a CSS file is different from the source document,
       * the script cannot read its CSS rules directly and a workaround is required.
       */
      it('should save only used bg images and fonts', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "save-used",
          "capture.font": "save-used",
        });
        var blob = await capture({
          url: `${localhost}/capture_css_cross_origin/cross_origin.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('bg1.bmp'));
        assert.exists(zip.file('font1.woff'));
        assert.exists(zip.file('bg2.bmp'));
        assert.exists(zip.file('font2.woff'));

        // same origin
        var cssFile = zip.file('style.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#bg1 { background: url("bg1.bmp"); }
#neverused { background: url(""); }

@font-face { font-family: bgFont1; src: url("font1.woff"); }
@font-face { font-family: neverusedFont1; src: url(""); }`);

        // cross origin
        var cssFile = zip.file('style2.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#bg2 { background: url("bg2.bmp"); }
#neverused2 { background: url(""); }

@font-face { font-family: bgFont2; src: url("font2.woff"); }
@font-face { font-family: neverusedFont2; src: url(""); }`);
      });
    });

    /**
     * capturer.DocumentCssHandler
     */
    describe('dynamic CSS', function () {
      describe('should handle script-modified CSS correctly', function () {
        it('capture.{imageBackground, font} = save', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save",
            "capture.font": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_dynamic/dynamic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('link.css'));
          assert.exists(zip.file('import.css'));
          assert.notExists(zip.file('internal-deleted.bmp'));
          assert.exists(zip.file('internal-inserted.bmp'));
          assert.notExists(zip.file('link-deleted.bmp'));
          assert.exists(zip.file('link-inserted.bmp'));
          assert.notExists(zip.file('import-deleted.bmp'));
          assert.exists(zip.file('import-inserted.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[1].textContent.trim(), `#internal-inserted { background-image: url("internal-inserted.bmp"); }`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `#link-inserted { background-image: url("link-inserted.bmp"); }`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `#import-inserted { background-image: url("import-inserted.bmp"); }`);
        });

        it('capture.{imageBackground, font} = save-used', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_dynamic/dynamic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('link.css'));
          assert.exists(zip.file('import.css'));
          assert.notExists(zip.file('internal-deleted.bmp'));
          assert.exists(zip.file('internal-inserted.bmp'));
          assert.notExists(zip.file('link-deleted.bmp'));
          assert.exists(zip.file('link-inserted.bmp'));
          assert.notExists(zip.file('import-deleted.bmp'));
          assert.exists(zip.file('import-inserted.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[1].textContent.trim(), `#internal-inserted { background-image: url("internal-inserted.bmp"); }`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `#link-inserted { background-image: url("link-inserted.bmp"); }`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `#import-inserted { background-image: url("import-inserted.bmp"); }`);
        });
      });

      describe('should save script-modified CSS as an individual file', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save",
            "capture.font": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_dynamic_rename/dynamic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('link.css'));
          assert.exists(zip.file('link-1.css'));
          assert.exists(zip.file('link-2.css'));
          assert.exists(zip.file('link-deleted.bmp'));
          assert.exists(zip.file('link-inserted.bmp'));
          assert.exists(zip.file('import.css'));
          assert.exists(zip.file('import-1.css'));
          assert.exists(zip.file('import-2.css'));
          assert.exists(zip.file('import-deleted.bmp'));
          assert.exists(zip.file('import-inserted.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var linkElems = doc.querySelectorAll('link[rel~="stylesheet"]');
          var linkNames = Array.prototype.map.call(linkElems, (elem) => {
            return elem.getAttribute('href').split('#');
          });

          assert.strictEqual(linkNames[0][0], linkNames[1][0]);
          assert.notStrictEqual(linkNames[0][0], linkNames[2][0]);
          assert.notStrictEqual(linkNames[0][0], linkNames[3][0]);
          assert.notStrictEqual(linkNames[2][0], linkNames[3][0]);

          assert.strictEqual(linkNames[0][1], undefined);
          assert.strictEqual(linkNames[1][1], '123');
          assert.strictEqual(linkNames[2][1], 'abc');
          assert.strictEqual(linkNames[3][1], 'def');

          var importNames = doc.querySelectorAll('style')[1].textContent.trim().split('\n').map((url) => {
            return url.match(rawRegex`@import "${'([^"]*)'}"`)[1].split('#');
          });

          assert.strictEqual(importNames[0][0], importNames[1][0]);
          assert.notStrictEqual(importNames[0][0], importNames[2][0]);
          assert.notStrictEqual(importNames[0][0], importNames[3][0]);
          assert.notStrictEqual(importNames[2][0], importNames[3][0]);

          assert.strictEqual(importNames[0][1], undefined);
          assert.strictEqual(importNames[1][1], '123');
          assert.strictEqual(importNames[2][1], 'abc');
          assert.strictEqual(importNames[3][1], 'def');
        });
      });
    });

    /**
     * capturer.DocumentCssHandler
     */
    $describe.skipIf($.noAdoptedStylesheet)('constructed stylesheets', function () {
      describe('should save constructed stylesheets according to capture.{adoptedStyleSheet, style}', function () {
        it('capture.adoptedStyleSheet = save, capture.style = save', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
            "capture.adoptedStyleSheet": "save",
            "capture.recordRewrites": true,
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/basic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('green.bmp'));
          assert.exists(zip.file('nonexist.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            [
              `#adopted1-1 { background-color: rgb(0, 255, 0); }`,
              `#adopted1-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
              `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            [
              `#adopted2-1 { background-color: rgb(0, 255, 0); }`,
              `#adopted2-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
              `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
            ].join('\n\n'),
          );
          assertNoRecord(docElem);
        });

        it('capture.adoptedStyleSheet = save, capture.style = link', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "link",
            "capture.adoptedStyleSheet": "save",
            "capture.recordRewrites": true,
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/basic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('green.bmp'));
          assert.exists(zip.file('nonexist.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            [
              `#adopted1-1 { background-color: rgb(0, 255, 0); }`,
              `#adopted1-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
              `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            [
              `#adopted2-1 { background-color: rgb(0, 255, 0); }`,
              `#adopted2-2 { background-image: /*scrapbook-orig-url="./green.bmp"*/url("green.bmp"); }`,
              `#nonexist { background-image: /*scrapbook-orig-url="./nonexist.bmp"*/url("nonexist.bmp"); }`,
            ].join('\n\n'),
          );
          assertNoRecord(docElem);
        });

        it('capture.adoptedStyleSheet = save, capture.style = blank', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "blank",
            "capture.adoptedStyleSheet": "save",
            "capture.recordRewrites": true,
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/basic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file('green.bmp'));
          assert.notExists(zip.file('nonexist.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
          assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});
        });

        it('capture.adoptedStyleSheet = save, capture.style = remove', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "remove",
            "capture.adoptedStyleSheet": "save",
            "capture.recordRewrites": true,
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/basic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file('green.bmp'));
          assert.notExists(zip.file('nonexist.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
          assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});
        });

        it('capture.adoptedStyleSheet = remove', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.style": "save",
            "capture.adoptedStyleSheet": "remove",
            "capture.recordRewrites": true,
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/basic.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file('green.bmp'));
          assert.notExists(zip.file('nonexist.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
          assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});
        });
      });

      describe('should save shared constructed stylesheets as same entry', function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "save-used",
          "capture.font": "save-used",
        });

        it('capture.adoptedStyleSheet = save, capture.rewriteCss = match', async function () {
          Object.assign(options, {
            "capture.adoptedStyleSheet": "save",
            "capture.rewriteCss": "match",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/shadow.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('image1-1.bmp'));
          assert.exists(zip.file('image1-2.bmp'));
          assert.exists(zip.file('image1-3.bmp'));
          assert.notExists(zip.file('image1-4.bmp'));
          assert.exists(zip.file('image2-1.bmp'));
          assert.exists(zip.file('image2-2.bmp'));
          assert.exists(zip.file('image2-3.bmp'));
          assert.notExists(zip.file('image2-4.bmp'));
          assert.exists(zip.file('font1-1.woff'));
          assert.exists(zip.file('font1-2.woff'));
          assert.exists(zip.file('font1-3.woff'));
          assert.notExists(zip.file('font1-4.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            [
              `#image1-1 { background-image: url("image1-1.bmp"); }`,
              `#image1-2 { background-image: url("image1-2.bmp"); }`,
              `#image1-3 { background-image: url("image1-3.bmp"); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            [
              `@font-face { font-family: font1-1; src: url("font1-1.woff"); }`,
              `#font1-1 { font-family: font1-1; }`,
              `@font-face { font-family: font1-2; src: url("font1-2.woff"); }`,
              `#font1-2 { font-family: font1-2; }`,
              `@font-face { font-family: font1-3; src: url("font1-3.woff"); }`,
              `#font1-3 { font-family: font1-3; }`,
              `@font-face { font-family: font1-4; src: url(""); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
            [
              `#image2-1 { background-image: url("image2-1.bmp"); }`,
              `#image2-2 { background-image: url("image2-2.bmp"); }`,
              `#image2-3 { background-image: url("image2-3.bmp"); }`,
            ].join('\n\n'),
          );

          var host1 = doc.querySelector('#shadow1');
          assert.strictEqual(
            host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1,2',
          );

          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          var host2 = shadow1.querySelector('#shadow2');
          assert.strictEqual(
            host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '2',
          );
        });

        it('capture.adoptedStyleSheet = save, capture.rewriteCss = tidy', async function () {
          Object.assign(options, {
            "capture.adoptedStyleSheet": "save",
            "capture.rewriteCss": "tidy",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/shadow.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('image1-1.bmp'));
          assert.exists(zip.file('image1-2.bmp'));
          assert.exists(zip.file('image1-3.bmp'));
          assert.notExists(zip.file('image1-4.bmp'));
          assert.exists(zip.file('image2-1.bmp'));
          assert.exists(zip.file('image2-2.bmp'));
          assert.exists(zip.file('image2-3.bmp'));
          assert.notExists(zip.file('image2-4.bmp'));
          assert.exists(zip.file('font1-1.woff'));
          assert.exists(zip.file('font1-2.woff'));
          assert.exists(zip.file('font1-3.woff'));
          assert.notExists(zip.file('font1-4.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            [
              `#image1-1 { background-image: url("image1-1.bmp"); }`,
              `#image1-2 { background-image: url("image1-2.bmp"); }`,
              `#image1-3 { background-image: url("image1-3.bmp"); }`,
              `#image1-4 { background-image: url(""); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            [
              `@font-face { font-family: font1-1; src: url("font1-1.woff"); }`,
              `#font1-1 { font-family: font1-1; }`,
              `@font-face { font-family: font1-2; src: url("font1-2.woff"); }`,
              `#font1-2 { font-family: font1-2; }`,
              `@font-face { font-family: font1-3; src: url("font1-3.woff"); }`,
              `#font1-3 { font-family: font1-3; }`,
              `@font-face { font-family: font1-4; src: url(""); }`,
              `#font1-4 { font-family: font1-4; }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
            [
              `#image2-1 { background-image: url("image2-1.bmp"); }`,
              `#image2-2 { background-image: url("image2-2.bmp"); }`,
              `#image2-3 { background-image: url("image2-3.bmp"); }`,
              `#image2-4 { background-image: url(""); }`,
            ].join('\n\n'),
          );

          var host1 = doc.querySelector('#shadow1');
          assert.strictEqual(
            host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1,2',
          );

          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          var host2 = shadow1.querySelector('#shadow2');
          assert.strictEqual(
            host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '2',
          );
        });

        it('capture.adoptedStyleSheet = save, capture.rewriteCss = url', async function () {
          Object.assign(options, {
            "capture.adoptedStyleSheet": "save",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/shadow.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('image1-1.bmp'));
          assert.exists(zip.file('image1-2.bmp'));
          assert.exists(zip.file('image1-3.bmp'));
          assert.notExists(zip.file('image1-4.bmp'));
          assert.exists(zip.file('image2-1.bmp'));
          assert.exists(zip.file('image2-2.bmp'));
          assert.exists(zip.file('image2-3.bmp'));
          assert.notExists(zip.file('image2-4.bmp'));
          assert.exists(zip.file('font1-1.woff'));
          assert.exists(zip.file('font1-2.woff'));
          assert.exists(zip.file('font1-3.woff'));
          assert.notExists(zip.file('font1-4.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            [
              `#image1-1 { background-image: url("image1-1.bmp"); }`,
              `#image1-2 { background-image: url("image1-2.bmp"); }`,
              `#image1-3 { background-image: url("image1-3.bmp"); }`,
              `#image1-4 { background-image: url(""); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            [
              `@font-face { font-family: font1-1; src: url("font1-1.woff"); }`,
              `#font1-1 { font-family: font1-1; }`,
              `@font-face { font-family: font1-2; src: url("font1-2.woff"); }`,
              `#font1-2 { font-family: font1-2; }`,
              `@font-face { font-family: font1-3; src: url("font1-3.woff"); }`,
              `#font1-3 { font-family: font1-3; }`,
              `@font-face { font-family: font1-4; src: url(""); }`,
              `#font1-4 { font-family: font1-4; }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
            [
              `#image2-1 { background-image: url("image2-1.bmp"); }`,
              `#image2-2 { background-image: url("image2-2.bmp"); }`,
              `#image2-3 { background-image: url("image2-3.bmp"); }`,
              `#image2-4 { background-image: url(""); }`,
            ].join('\n\n'),
          );

          var host1 = doc.querySelector('#shadow1');
          assert.strictEqual(
            host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1,2',
          );

          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          var host2 = shadow1.querySelector('#shadow2');
          assert.strictEqual(
            host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '2',
          );
        });

        it('capture.adoptedStyleSheet = save, capture.rewriteCss = none', async function () {
          Object.assign(options, {
            "capture.adoptedStyleSheet": "save",
            "capture.rewriteCss": "none",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/shadow.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file('image1-1.bmp'));
          assert.notExists(zip.file('image1-2.bmp'));
          assert.notExists(zip.file('image1-3.bmp'));
          assert.notExists(zip.file('image1-4.bmp'));
          assert.notExists(zip.file('image2-1.bmp'));
          assert.notExists(zip.file('image2-2.bmp'));
          assert.notExists(zip.file('image2-3.bmp'));
          assert.notExists(zip.file('image2-4.bmp'));
          assert.notExists(zip.file('font1-1.woff'));
          assert.notExists(zip.file('font1-2.woff'));
          assert.notExists(zip.file('font1-3.woff'));
          assert.notExists(zip.file('font1-4.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            [
              `#image1-1 { background-image: url("./image1-1.bmp"); }`,
              `#image1-2 { background-image: url("./image1-2.bmp"); }`,
              `#image1-3 { background-image: url("./image1-3.bmp"); }`,
              `#image1-4 { background-image: url("./image1-4.bmp"); }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            [
              `@font-face { font-family: font1-1; src: url("./font1-1.woff"); }`,
              `#font1-1 { font-family: font1-1; }`,
              `@font-face { font-family: font1-2; src: url("./font1-2.woff"); }`,
              `#font1-2 { font-family: font1-2; }`,
              `@font-face { font-family: font1-3; src: url("./font1-3.woff"); }`,
              `#font1-3 { font-family: font1-3; }`,
              `@font-face { font-family: font1-4; src: url("./font1-4.woff"); }`,
              `#font1-4 { font-family: font1-4; }`,
            ].join('\n\n'),
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-2').trim(),
            [
              `#image2-1 { background-image: url("./image2-1.bmp"); }`,
              `#image2-2 { background-image: url("./image2-2.bmp"); }`,
              `#image2-3 { background-image: url("./image2-3.bmp"); }`,
              `#image2-4 { background-image: url("./image2-4.bmp"); }`,
            ].join('\n\n'),
          );

          var host1 = doc.querySelector('#shadow1');
          assert.strictEqual(
            host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0,1,2',
          );

          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          var host2 = shadow1.querySelector('#shadow2');
          assert.strictEqual(
            host2.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '2',
          );
        });

        it('capture.adoptedStyleSheet = remove', async function () {
          Object.assign(options, {
            "capture.adoptedStyleSheet": "remove",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_css_adopted/shadow.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.notExists(zip.file('image1-1.bmp'));
          assert.notExists(zip.file('image1-2.bmp'));
          assert.notExists(zip.file('image1-3.bmp'));
          assert.notExists(zip.file('image1-4.bmp'));
          assert.notExists(zip.file('image2-1.bmp'));
          assert.notExists(zip.file('image2-2.bmp'));
          assert.notExists(zip.file('image2-3.bmp'));
          assert.notExists(zip.file('image2-4.bmp'));
          assert.notExists(zip.file('font1-1.woff'));
          assert.notExists(zip.file('font1-2.woff'));
          assert.notExists(zip.file('font1-3.woff'));
          assert.notExists(zip.file('font1-4.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

          var docElem = doc.documentElement;
          assert(!docElem.hasAttribute('data-scrapbook-adoptedstylesheets'));
          assertNoRecord(docElem, {filter: {regexAttr: /^data-scrapbook-adoptedstylesheet-\d+$/}});

          var host1 = doc.querySelector('#shadow1');
          assert(!host1.hasAttribute('data-scrapbook-adoptedstylesheets'));

          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          var host2 = shadow1.querySelector('#shadow2');
          assert(!host2.hasAttribute('data-scrapbook-adoptedstylesheets'));
        });
      });
    });
  });

  describe('CSS background images', function () {
    describe('should handle background images according to capture.imageBackground', function () {
      it('capture.imageBackground = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_imageBackground/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('link.css'));
        assert.exists(zip.file('import.css'));
        assert.exists(zip.file('red.bmp'));
        assert.exists(zip.file('green.bmp'));
        assert.exists(zip.file('blue.bmp'));
        assert.exists(zip.file('yellow.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var bodyElem = doc.body;
        assert.strictEqual(bodyElem.getAttribute('background'), `green.bmp`);
        var tableElem = doc.querySelector('table');
        assert.strictEqual(tableElem.getAttribute('background'), `red.bmp`);
        var trElems = tableElem.querySelectorAll('tr');
        assert.strictEqual(trElems[0].getAttribute('background'), `green.bmp`);
        var thElem = trElems[1].querySelector('th');
        assert.strictEqual(thElem.getAttribute('background'), `blue.bmp`);
        var tdElem = trElems[1].querySelector('td');
        assert.strictEqual(tdElem.getAttribute('background'), `yellow.bmp`);

        var bqElem = doc.querySelectorAll('blockquote')[0];
        assert.strictEqual(bqElem.getAttribute('style'), `background: url("yellow.bmp");`);

        var cssFile = zip.file('link.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#link { background: url("yellow.bmp"); }`);

        var cssFile = zip.file('import.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#import { background: url("yellow.bmp"); }`);

        var cssElem = doc.querySelectorAll('style')[2];
        assert.strictEqual(cssElem.textContent.trim(), `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("yellow.bmp"); }
  to { transform: rotate(1turn); }
}`);
      });

      it('capture.imageBackground = save-used', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "save-used",
        });
        var blob = await capture({
          url: `${localhost}/capture_imageBackground/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('link.css'));
        assert.exists(zip.file('import.css'));
        assert.exists(zip.file('red.bmp'));
        assert.exists(zip.file('green.bmp'));
        assert.exists(zip.file('blue.bmp'));
        assert.exists(zip.file('yellow.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var bodyElem = doc.body;
        assert.strictEqual(bodyElem.getAttribute('background'), `green.bmp`);
        var tableElem = doc.querySelector('table');
        assert.strictEqual(tableElem.getAttribute('background'), `red.bmp`);
        var trElems = tableElem.querySelectorAll('tr');
        assert.strictEqual(trElems[0].getAttribute('background'), `green.bmp`);
        var thElem = trElems[1].querySelector('th');
        assert.strictEqual(thElem.getAttribute('background'), `blue.bmp`);
        var tdElem = trElems[1].querySelector('td');
        assert.strictEqual(tdElem.getAttribute('background'), `yellow.bmp`);

        var bqElem = doc.querySelectorAll('blockquote')[0];
        assert.strictEqual(bqElem.getAttribute('style'), `background: url("yellow.bmp");`);

        var cssFile = zip.file('link.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#link { background: url("yellow.bmp"); }`);

        var cssFile = zip.file('import.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#import { background: url("yellow.bmp"); }`);

        var cssElem = doc.querySelectorAll('style')[2];
        assert.strictEqual(cssElem.textContent.trim(), `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("yellow.bmp"); }
  to { transform: rotate(1turn); }
}`);
      });

      it('capture.imageBackground = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_imageBackground/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 3);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var bodyElem = doc.body;
        assert.strictEqual(bodyElem.getAttribute('background'), `${localhost}/capture_imageBackground/green.bmp`);
        var tableElem = doc.querySelector('table');
        assert.strictEqual(tableElem.getAttribute('background'), `${localhost}/capture_imageBackground/red.bmp`);
        var trElems = tableElem.querySelectorAll('tr');
        assert.strictEqual(trElems[0].getAttribute('background'), `${localhost}/capture_imageBackground/green.bmp`);
        var thElem = trElems[1].querySelector('th');
        assert.strictEqual(thElem.getAttribute('background'), `${localhost}/capture_imageBackground/blue.bmp`);
        var tdElem = trElems[1].querySelector('td');
        assert.strictEqual(tdElem.getAttribute('background'), `${localhost}/capture_imageBackground/yellow.bmp`);

        var bqElem = doc.querySelectorAll('blockquote')[0];
        assert.strictEqual(bqElem.getAttribute('style'), `background: url("${localhost}/capture_imageBackground/yellow.bmp");`);

        var cssFile = zip.file('link.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#link { background: url("${localhost}/capture_imageBackground/yellow.bmp"); }`);

        var cssFile = zip.file('import.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#import { background: url("${localhost}/capture_imageBackground/yellow.bmp"); }`);

        var cssElem = doc.querySelectorAll('style')[2];
        assert.strictEqual(cssElem.textContent.trim(), `@keyframes spin {
  from { transform: rotate(0turn); background-image: url("${localhost}/capture_imageBackground/yellow.bmp"); }
  to { transform: rotate(1turn); }
}`);
      });

      it('capture.imageBackground = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.imageBackground": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_imageBackground/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 3);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var bodyElem = doc.body;
        assert(!bodyElem.hasAttribute('background'));
        var tableElem = doc.querySelector('table');
        assert(!tableElem.hasAttribute('background'));
        var trElems = tableElem.querySelectorAll('tr');
        assert(!trElems[0].hasAttribute('background'));
        var thElem = trElems[1].querySelector('th');
        assert(!thElem.hasAttribute('background'));
        var tdElem = trElems[1].querySelector('td');
        assert(!tdElem.hasAttribute('background'));

        var bqElem = doc.querySelectorAll('blockquote')[0];
        assert.strictEqual(bqElem.getAttribute('style'), `background: url("");`);

        var cssFile = zip.file('link.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#link { background: url(""); }`);

        var cssFile = zip.file('import.css');
        var text = await readFileAsText(await cssFile.async('blob'));
        assert.strictEqual(text.trim(), `#import { background: url(""); }`);

        var cssElem = doc.querySelectorAll('style')[2];
        assert.strictEqual(cssElem.textContent.trim(), `@keyframes spin {
  from { transform: rotate(0turn); background-image: url(""); }
  to { transform: rotate(1turn); }
}`);
      });
    });

    describe('used background images', function () {
      describe('basic mapping', function () {
        it('normal capture', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.imageBackground": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/basic/index.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.bmp'));
          assert.notExists(zip.file('internal-unused.bmp'));
          assert.notExists(zip.file('internal-noncaptured.bmp'));
          assert.exists(zip.file('link.bmp'));
          assert.notExists(zip.file('link-unused.bmp'));
          assert.notExists(zip.file('link-noncaptured.bmp'));
          assert.exists(zip.file('import.bmp'));
          assert.notExists(zip.file('import-unused.bmp'));
          assert.notExists(zip.file('import-noncaptured.bmp'));
          assert.exists(zip.file('pseudo-hover.bmp'));
          assert.exists(zip.file('pseudo-active.bmp'));
          assert.exists(zip.file('pseudo-before.bmp'));
          assert.exists(zip.file('pseudo-after.bmp'));
          assert.exists(zip.file('pseudo-first-letter.bmp'));
          assert.exists(zip.file('pseudo-first-line.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[1].textContent.trim(), `\
#internal { background-image: url("internal.bmp"); }
#internal-unused { background-image: url(""); }
#internal-noncaptured { background-image: url(""); }`);
          assert.strictEqual(styleElems[3].textContent.trim(), `\
#pseudo-hover:hover { background-image: url("pseudo-hover.bmp"); }
#pseudo-active:active { background-image: url("pseudo-active.bmp"); }
#pseudo-before::before { background-image: url("pseudo-before.bmp"); content: "X"; }
#pseudo-after::after { background-image: url("pseudo-after.bmp"); content: "X"; }
#pseudo-first-letter::first-letter { background-image: url("pseudo-first-letter.bmp"); }
#pseudo-first-line::first-line { background-image: url("pseudo-first-line.bmp"); }`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
#link { background-image: url("link.bmp"); }
#link-unused { background-image: url(""); }
#link-noncaptured { background-image: url(""); }`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
#import { background-image: url("import.bmp"); }
#import-unused { background-image: url(""); }
#import-noncaptured { background-image: url(""); }`);
        });

        it('headless capture', async function () {
          // the result is same as save
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.imageBackground": "save-used",
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_imageBackground_used/basic/index.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.bmp'));
          assert.exists(zip.file('internal-unused.bmp'));
          assert.exists(zip.file('internal-noncaptured.bmp'));
          assert.exists(zip.file('link.bmp'));
          assert.exists(zip.file('link-unused.bmp'));
          assert.exists(zip.file('link-noncaptured.bmp'));
          assert.exists(zip.file('import.bmp'));
          assert.exists(zip.file('import-unused.bmp'));
          assert.exists(zip.file('import-noncaptured.bmp'));
          assert.exists(zip.file('pseudo-hover.bmp'));
          assert.exists(zip.file('pseudo-active.bmp'));
          assert.exists(zip.file('pseudo-before.bmp'));
          assert.exists(zip.file('pseudo-after.bmp'));
          assert.exists(zip.file('pseudo-first-letter.bmp'));
          assert.exists(zip.file('pseudo-first-line.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[1].textContent.trim(), `\
#internal { background-image: url("internal.bmp"); }
#internal-unused { background-image: url("internal-unused.bmp"); }
#internal-noncaptured { background-image: url("internal-noncaptured.bmp"); }`);
          assert.strictEqual(styleElems[3].textContent.trim(), `\
#pseudo-hover:hover { background-image: url("pseudo-hover.bmp"); }
#pseudo-active:active { background-image: url("pseudo-active.bmp"); }
#pseudo-before::before { background-image: url("pseudo-before.bmp"); content: "X"; }
#pseudo-after::after { background-image: url("pseudo-after.bmp"); content: "X"; }
#pseudo-first-letter::first-letter { background-image: url("pseudo-first-letter.bmp"); }
#pseudo-first-line::first-line { background-image: url("pseudo-first-line.bmp"); }`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
#link { background-image: url("link.bmp"); }
#link-unused { background-image: url("link-unused.bmp"); }
#link-noncaptured { background-image: url("link-noncaptured.bmp"); }`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
#import { background-image: url("import.bmp"); }
#import-unused { background-image: url("import-unused.bmp"); }
#import-noncaptured { background-image: url("import-noncaptured.bmp"); }`);
        });
      });

      describe('should check against a selector for the root element', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/root/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('green.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          assert.strictEqual(doc.querySelector('style').textContent.trim(), `html { background-image: url("green.bmp"); }`);
        });
      });

      describe('in shadow DOM', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
            "capture.shadowDom": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/shadow/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('green.bmp'));
          assert.exists(zip.file('yellow.bmp'));
          assert.exists(zip.file('blue.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var host1 = doc.querySelector('#shadow1');
          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          assert.strictEqual(shadow1.querySelector('style').textContent.trim(), `\
:host { background-image: url("yellow.bmp"); }
#shadow { background-image: url("green.bmp"); }
@media all {
  #media { background-image: url("blue.bmp"); }
}`);
        });
      });

      describe('in @keyframes', function () {
        it('normal capture', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.imageBackground": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/keyframes/index.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal-inline.bmp'));
          assert.exists(zip.file('internal-internal.bmp'));
          assert.exists(zip.file('internal-link.bmp'));
          assert.exists(zip.file('internal-import.bmp'));
          assert.exists(zip.file('link-inline.bmp'));
          assert.exists(zip.file('link-internal.bmp'));
          assert.exists(zip.file('link-link.bmp'));
          assert.exists(zip.file('link-import.bmp'));
          assert.exists(zip.file('import-inline.bmp'));
          assert.exists(zip.file('import-internal.bmp'));
          assert.exists(zip.file('import-link.bmp'));
          assert.exists(zip.file('import-import.bmp'));
          assert.notExists(zip.file('internal-inline-unused.bmp'));
          assert.notExists(zip.file('internal-internal-unused.bmp'));
          assert.notExists(zip.file('internal-link-unused.bmp'));
          assert.notExists(zip.file('internal-import-unused.bmp'));
          assert.notExists(zip.file('link-inline-unused.bmp'));
          assert.notExists(zip.file('link-internal-unused.bmp'));
          assert.notExists(zip.file('link-link-unused.bmp'));
          assert.notExists(zip.file('link-import-unused.bmp'));
          assert.notExists(zip.file('import-inline-unused.bmp'));
          assert.notExists(zip.file('import-internal-unused.bmp'));
          assert.notExists(zip.file('import-link-unused.bmp'));
          assert.notExists(zip.file('import-import-unused.bmp'));
          assert.exists(zip.file('ref-from.bmp'));
          assert.exists(zip.file('ref-to.bmp'));
          assert.notExists(zip.file('ref-from-noncaptured.bmp'));
          assert.notExists(zip.file('ref-to-noncaptured.bmp'));
          assert.exists(zip.file('ref-0.bmp'));
          assert.exists(zip.file('ref-35.bmp'));
          assert.exists(zip.file('ref-70.bmp'));
          assert.exists(zip.file('ref-100.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@keyframes internal-inline {
  from { background-image: url("internal-inline.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-inline-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes internal-internal {
  from { background-image: url("internal-internal.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-internal-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes internal-link {
  from { background-image: url("internal-link.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-link-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes internal-import {
  from { background-image: url("internal-import.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-import-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
@keyframes link-inline {
  from { background-image: url("link-inline.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-inline-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes link-internal {
  from { background-image: url("link-internal.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-internal-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes link-link {
  from { background-image: url("link-link.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-link-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes link-import {
  from { background-image: url("link-import.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-import-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
@keyframes import-inline {
  from { background-image: url("import-inline.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-inline-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes import-internal {
  from { background-image: url("import-internal.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-internal-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes import-link {
  from { background-image: url("import-link.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-link-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}
@keyframes import-import {
  from { background-image: url("import-import.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-import-unused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
@keyframes ref-from-to {
  from { background-image: url("ref-from.bmp"); }
  to { background-image: url("ref-to.bmp"); }
}

@keyframes ref-from-to-noncaptured {
  from { background-image: url(""); }
  to { background-image: url(""); }
}

@keyframes ref-percent {
  0% { background-image: url("ref-0.bmp"); }
  35% { background-image: url("ref-35.bmp"); }
  70% { background-image: url("ref-70.bmp"); }
  100% { background-image: url("ref-100.bmp"); }
}`);
        });

        it('headless capture', async function () {
          // the result is same as save
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.imageBackground": "save-used",
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_imageBackground_used/keyframes/index.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal-inline.bmp'));
          assert.exists(zip.file('internal-internal.bmp'));
          assert.exists(zip.file('internal-link.bmp'));
          assert.exists(zip.file('internal-import.bmp'));
          assert.exists(zip.file('link-inline.bmp'));
          assert.exists(zip.file('link-internal.bmp'));
          assert.exists(zip.file('link-link.bmp'));
          assert.exists(zip.file('link-import.bmp'));
          assert.exists(zip.file('import-inline.bmp'));
          assert.exists(zip.file('import-internal.bmp'));
          assert.exists(zip.file('import-link.bmp'));
          assert.exists(zip.file('import-import.bmp'));
          assert.exists(zip.file('internal-inline-unused.bmp'));
          assert.exists(zip.file('internal-internal-unused.bmp'));
          assert.exists(zip.file('internal-link-unused.bmp'));
          assert.exists(zip.file('internal-import-unused.bmp'));
          assert.exists(zip.file('link-inline-unused.bmp'));
          assert.exists(zip.file('link-internal-unused.bmp'));
          assert.exists(zip.file('link-link-unused.bmp'));
          assert.exists(zip.file('link-import-unused.bmp'));
          assert.exists(zip.file('import-inline-unused.bmp'));
          assert.exists(zip.file('import-internal-unused.bmp'));
          assert.exists(zip.file('import-link-unused.bmp'));
          assert.exists(zip.file('import-import-unused.bmp'));
          assert.exists(zip.file('ref-from.bmp'));
          assert.exists(zip.file('ref-to.bmp'));
          assert.exists(zip.file('ref-from-noncaptured.bmp'));
          assert.exists(zip.file('ref-to-noncaptured.bmp'));
          assert.exists(zip.file('ref-0.bmp'));
          assert.exists(zip.file('ref-35.bmp'));
          assert.exists(zip.file('ref-70.bmp'));
          assert.exists(zip.file('ref-100.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[1].textContent.trim(), `\
@keyframes internal-inline {
  from { background-image: url("internal-inline.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-inline-unused {
  from { background-image: url("internal-inline-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-internal {
  from { background-image: url("internal-internal.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-internal-unused {
  from { background-image: url("internal-internal-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-link {
  from { background-image: url("internal-link.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-link-unused {
  from { background-image: url("internal-link-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-import {
  from { background-image: url("internal-import.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes internal-import-unused {
  from { background-image: url("internal-import-unused.bmp"); }
  to { transform: translateX(40px); }
}`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
@keyframes link-inline {
  from { background-image: url("link-inline.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-inline-unused {
  from { background-image: url("link-inline-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-internal {
  from { background-image: url("link-internal.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-internal-unused {
  from { background-image: url("link-internal-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-link {
  from { background-image: url("link-link.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-link-unused {
  from { background-image: url("link-link-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-import {
  from { background-image: url("link-import.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes link-import-unused {
  from { background-image: url("link-import-unused.bmp"); }
  to { transform: translateX(40px); }
}`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `\
@keyframes import-inline {
  from { background-image: url("import-inline.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-inline-unused {
  from { background-image: url("import-inline-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-internal {
  from { background-image: url("import-internal.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-internal-unused {
  from { background-image: url("import-internal-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-link {
  from { background-image: url("import-link.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-link-unused {
  from { background-image: url("import-link-unused.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-import {
  from { background-image: url("import-import.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes import-import-unused {
  from { background-image: url("import-import-unused.bmp"); }
  to { transform: translateX(40px); }
}`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
@keyframes ref-from-to {
  from { background-image: url("ref-from.bmp"); }
  to { background-image: url("ref-to.bmp"); }
}

@keyframes ref-from-to-noncaptured {
  from { background-image: url("ref-from-noncaptured.bmp"); }
  to { background-image: url("ref-to-noncaptured.bmp"); }
}

@keyframes ref-percent {
  0% { background-image: url("ref-0.bmp"); }
  35% { background-image: url("ref-35.bmp"); }
  70% { background-image: url("ref-70.bmp"); }
  100% { background-image: url("ref-100.bmp"); }
}`);
        });
      });

      describe('syntax for @keyframes', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/keyframes_syntax/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('keyframes-1.bmp'));
          assert.exists(zip.file('keyframes-2.bmp'));
          assert.exists(zip.file('keyframes-complex-1.bmp'));
          assert.exists(zip.file('keyframes-multi-1.bmp'));
          assert.exists(zip.file('keyframes-multi-2.bmp'));
          assert.exists(zip.file('keyframes-multi-3.bmp'));
          assert.exists(zip.file('keyframes-after.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[1].textContent.trim(), r`@keyframes keyframes1 {
  from { background-image: url("keyframes-1.bmp"); }
  to { background-image: url("keyframes-2.bmp"); transform: translateX(40px); }
}`);
          assert.strictEqual(styleElems[2].textContent.trim(), r`@keyframes keyframes\Awith\ complex\\syntax {
  from { background-image: url("keyframes-complex-1.bmp"); }
  to { transform: translateX(40px); }
}`);
          assert.strictEqual(styleElems[3].textContent.trim(), r`@keyframes multi\ 1 {
  from { background-image: url("keyframes-multi-1.bmp"); }
  to { transform: translateX(40px); }
}
@keyframes multi\"2\" {
  33% { background-image: url("keyframes-multi-2.bmp"); }
  66% { background-image: url("keyframes-multi-3.bmp"); }
}`);
          assert.strictEqual(styleElems[4].textContent.trim(), r`@keyframes after {
  from { background-image: url("keyframes-after.bmp"); }
  to { transform: translateX(40px); }
}`);
        });
      });

      describe('in scoped @keyframe', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
            "capture.shadowDom": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/keyframes_scope/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal1.bmp'));
          assert.exists(zip.file('internal2.bmp'));
          assert.exists(zip.file('internal3.bmp'));
          assert.notExists(zip.file('internal4.bmp'));
          assert.exists(zip.file('internal5.bmp'));
          assert.exists(zip.file('internal6.bmp'));
          assert.exists(zip.file('internal7.bmp'));
          assert.notExists(zip.file('internal8.bmp'));

          assert.exists(zip.file('shadow1.bmp'));
          assert.exists(zip.file('shadow2.bmp'));
          assert.notExists(zip.file('shadow3.bmp'));
          assert.notExists(zip.file('shadow4.bmp'));
          assert.exists(zip.file('shadow5.bmp'));
          assert.exists(zip.file('shadow6.bmp'));
          assert.notExists(zip.file('shadow7.bmp'));
          assert.notExists(zip.file('shadow8.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelectorAll('style')[1].textContent.trim(), `\
@keyframes local-upper-by-local-upper {
  from { background-image: url("internal1.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-upper-by-local {
  from { background-image: url("internal2.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-upper-by-upper {
  from { background-image: url("internal3.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-upper-by-none {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}

@keyframes upper-by-local-upper {
  from { background-image: url("internal5.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes upper-by-local {
  from { background-image: url("internal6.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes upper-by-upper {
  from { background-image: url("internal7.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes upper-by-none {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

          var host1 = doc.querySelector('#shadow1');
          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          assert.strictEqual(shadow1.querySelectorAll('style')[1].textContent.trim(), `\
@keyframes local-upper-by-local-upper {
  from { background-image: url("shadow1.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-upper-by-local {
  from { background-image: url("shadow2.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-upper-by-upper {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}

@keyframes local-upper-by-none {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}

@keyframes local-by-local-upper {
  from { background-image: url("shadow5.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-by-local {
  from { background-image: url("shadow6.bmp"); }
  to { transform: translateX(40px); }
}

@keyframes local-by-upper {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}

@keyframes local-by-none {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);
        });

        it('::part', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
            "capture.shadowDom": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/keyframes_scope_part/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@keyframes mykf {
  from { background-image: url("internal.bmp"); }
  to { transform: translateX(40px); }
}
#shadow1::part(mypart) {
  font-size: 2em;
  animation: mykf 3s linear infinite;
}`);
        });

        it('conditional', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
            "capture.shadowDom": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/keyframes_scope_conditional/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.bmp'));
          assert.exists(zip.file('shadow.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@keyframes myframe {
  from { background-image: url("internal.bmp"); }
  to { transform: translateX(40px); }
}`);

          var host1 = doc.querySelector('#shadow1');
          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          assert.strictEqual(shadow1.querySelectorAll('style')[1].textContent.trim(), `\
@media print {
  @keyframes myframe {
    from { background-image: url("shadow.bmp"); }
    to { transform: translateX(40px); }
  }
}`);
        });
      });

      describe('advanced at-rule', function () {
        $it.skipIf($.noAtLayer)('@layer', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/at/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('base.bmp'));
          assert.exists(zip.file('special.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@layer base, special;
@layer special {
  #case1 { background-image: url("special.bmp"); }
}
@layer base {
  #case1 { background-image: url("base.bmp"); }
}`);
        });
      });

      describe('should ignore images referenced only by inline stylesheets', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
            "capture.styleInline": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/inline/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('green.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[0].textContent.trim(), `#neverused { background-image: url(""); }`);
          assert.strictEqual(styleElems[1].textContent.trim(), `\
@keyframes neverused {
  from { background-image: url(""); }
  to { transform: translateX(40px); }
}`);

          assert.strictEqual(doc.querySelector('blockquote').getAttribute('style').trim(), `background-image: url("green.bmp");`);
        });
      });

      $describe.skipIf($.noAdoptedStylesheet)('in constructed stylesheet', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
            "capture.shadowDom": "save",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/adopted/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('doc.bmp'));
          assert.exists(zip.file('shadow.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var docElem = doc.documentElement;
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '0',
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-0').trim(),
            `#adopted { background-image: url("doc.bmp"); }`,
          );
          assert.strictEqual(
            docElem.getAttribute('data-scrapbook-adoptedstylesheet-1').trim(),
            `#adopted { background-image: url("shadow.bmp"); }`,
          );

          var host1 = doc.querySelector('#shadow1');
          assert.strictEqual(
            host1.getAttribute('data-scrapbook-adoptedstylesheets').trim(),
            '1',
          );
        });
      });

      describe('CSS variable', function () {
        $it.xfail()('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/var/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('var1.bmp'));
          assert.exists(zip.file('var2.bmp'));  // @FIXME
          assert.exists(zip.file('var3.bmp'));  // @FIXME
          assert.exists(zip.file('var4.bmp'));  // @FIXME
          assert.exists(zip.file('var5.bmp'));
          assert.exists(zip.file('var6.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          assert.strictEqual(styleElems[0].textContent.trim(), `\
:root { --var-1: url("var1.bmp"); }
#var1 { background: var(--var-1); }`);

          // @FIXME: image URL emptied
          assert.strictEqual(styleElems[1].textContent.trim(), `\
@keyframes var2 {
  from { background-image: url("var2.bmp"); }
  to { transform: translateX(40px); }
}
:root { --var-2: var2 3s linear infinite; }
#var2 { animation: var(--var-2); }`);

          // @FIXME: image URL emptied
          assert.strictEqual(styleElems[2].textContent.trim(), `\
@keyframes var3 {
  from { background-image: url("var3.bmp"); }
  to { transform: translateX(40px); }
}
:root { --var-3: var3; }
#var3 { animation: var(--var-3) 3s linear infinite; }`);

          // @FIXME: image URL emptied
          assert.strictEqual(styleElems[3].textContent.trim(), `\
@keyframes var4 {
  from { background-image: url("var4.bmp"); }
  to { transform: translateX(40px); }
}
:root { --var-4: var4; }
#var4 {
  animation-name: var(--var-4);
  animation-duration: 3s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}`);

          assert.strictEqual(styleElems[4].textContent.trim(), `\
@keyframes var5 {
  from { background-image: var(--var-5); }
  to { transform: translateX(40px); }
}
:root { --var-5: url("var5.bmp"); }
#var5 { animation: var5 3s linear infinite; }`);

          assert.strictEqual(styleElems[5].textContent.trim(), `\
@keyframes var6 {
  from { --var-6: url("var6.bmp"); }
  to { transform: translateX(40px); }
}
#var6 { animation: var6 3s linear infinite; }`);
        });
      });

      $describe.skipIf($.noNestingCss)('nesting CSS', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.imageBackground": "save-used",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_imageBackground_used/nesting/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('case1.bmp'));
          assert.exists(zip.file('case1-1.bmp'));
          assert.exists(zip.file('case1-1-1.bmp'));
          assert.exists(zip.file('case1-1-2.bmp'));
          assert.notExists(zip.file('case1-2.bmp'));
          assert.notExists(zip.file('case1-2-1.bmp'));
          assert.notExists(zip.file('case1-2-2.bmp'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
.case1 {
  background: url("case1.bmp");
  .case1-1 {
    background: url("case1-1.bmp");
    .case1-1-1 {
      background: url("case1-1-1.bmp");
    }
    &.case1-1-2 {
      background: url("case1-1-2.bmp");
    }
  }
  .case1-2 {
    background: url("");
    .case1-2-1 {
      background: url("");
    }
    &.case1-2-2 {
      background: url("");
    }
  }
}`);
        });
      });
    });
  });

  describe('CSS font', function () {
    describe('should handle fonts according to capture.font', function () {
      it('capture.font = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.font": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_font/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('sansation_light.woff'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var styleElems = doc.querySelectorAll('style');
        assert.strictEqual(styleElems[0].textContent.trim(), `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);
      });

      it('capture.font = save-used', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.font": "save-used",
        });
        var blob = await capture({
          url: `${localhost}/capture_font/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('sansation_light.woff'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var styleElems = doc.querySelectorAll('style');
        assert.strictEqual(styleElems[0].textContent.trim(), `@font-face { font-family: myFont; src: url("sansation_light.woff"); }`);
      });

      it('capture.font = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.font": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_font/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var styleElems = doc.querySelectorAll('style');
        assert.strictEqual(styleElems[0].textContent.trim(), `@font-face { font-family: myFont; src: url("${localhost}/capture_font/sansation_light.woff"); }`);
      });

      it('capture.font = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.font": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_font/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var styleElems = doc.querySelectorAll('style');
        assert.strictEqual(styleElems[0].textContent.trim(), `@font-face { font-family: myFont; src: url(""); }`);
      });
    });

    describe('used fonts', function () {
      describe('basic mapping', function () {
        it('normal capture', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.woff'));
          assert.exists(zip.file('link.woff'));
          assert.exists(zip.file('import.woff'));
          assert.exists(zip.file('pseudo1.woff'));
          assert.exists(zip.file('internal-keyframes.woff'));
          assert.notExists(zip.file('neverused.woff'));
          assert.notExists(zip.file('removed.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[0].textContent.trim(), `@font-face { font-family: internal; src: url("internal.woff"); }`);
          assert.strictEqual(styleElems[2].textContent.trim(), `\
@font-face { font-family: pseudo1; src: url("pseudo1.woff"); }
#pseudo1::before { font-family: pseudo1; content: "X"; }`);
          assert.strictEqual(styleElems[3].textContent.trim(), `\
@font-face { font-family: internal-keyframes; src: url("internal-keyframes.woff"); }`);
          assert.strictEqual(styleElems[5].textContent.trim(), `@font-face { font-family: neverused; src: url(""); }`);
          assert.strictEqual(styleElems[8].textContent.trim(), `@font-face { font-family: removed-internal; src: url(""); }`);
          assert.strictEqual(styleElems[9].textContent.trim(), `@font-face { font-family: removed-keyframes; src: url(""); }`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `@font-face { font-family: link; src: url("link.woff"); }`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `@font-face { font-family: import; src: url("import.woff"); }`);
        });

        it('headless capture', async function () {
          // the result is same as save
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.font": "save-used",
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_font_used/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.woff'));
          assert.exists(zip.file('link.woff'));
          assert.exists(zip.file('import.woff'));
          assert.exists(zip.file('pseudo1.woff'));
          assert.exists(zip.file('internal-keyframes.woff'));
          assert.exists(zip.file('neverused.woff'));
          assert.exists(zip.file('removed.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[0].textContent.trim(), `@font-face { font-family: internal; src: url("internal.woff"); }`);
          assert.strictEqual(styleElems[2].textContent.trim(), `\
@font-face { font-family: pseudo1; src: url("pseudo1.woff"); }
#pseudo1::before { font-family: pseudo1; content: "X"; }`);
          assert.strictEqual(styleElems[3].textContent.trim(), `\
@font-face { font-family: internal-keyframes; src: url("internal-keyframes.woff"); }`);
          assert.strictEqual(styleElems[5].textContent.trim(), `@font-face { font-family: neverused; src: url("neverused.woff"); }`);
          assert.strictEqual(styleElems[8].textContent.trim(), `@font-face { font-family: removed-internal; src: url("removed.woff"); }`);
          assert.strictEqual(styleElems[9].textContent.trim(), `@font-face { font-family: removed-keyframes; src: url("removed.woff"); }`);

          var cssFile = zip.file('link.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `@font-face { font-family: link; src: url("link.woff"); }`);

          var cssFile = zip.file('import.css');
          var text = await readFileAsText(await cssFile.async('blob'));
          assert.strictEqual(text.trim(), `@font-face { font-family: import; src: url("import.woff"); }`);
        });
      });

      describe('syntax for @font-face', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/syntax/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('identifier-1.woff'));
          assert.exists(zip.file('identifier-2.woff'));
          assert.exists(zip.file('string-1.woff'));
          assert.exists(zip.file('string-2.woff'));
          assert.exists(zip.file('string-3.woff'));
          assert.exists(zip.file('string-4.woff'));
          assert.exists(zip.file('complex-name-1.woff'));
          assert.exists(zip.file('complex-name-2.woff'));
          assert.exists(zip.file('multiple-value-1.woff'));
          assert.exists(zip.file('multiple-value-2.woff'));
          assert.exists(zip.file('keyframes-1.woff'));
          assert.exists(zip.file('keyframes-2.woff'));
          assert.exists(zip.file('keyframes-3.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);

          var styleElems = doc.querySelectorAll('style');
          assert.strictEqual(styleElems[1].textContent.trim(), `@font-face { font-family: identifier1; src: url("identifier-1.woff"); }`);
          assert.strictEqual(styleElems[2].textContent.trim(), `@font-face { font-family: identifier2; src: url("identifier-2.woff"); }`);
          assert.strictEqual(styleElems[3].textContent.trim(), `@font-face { font-family: "string1"; src: url("string-1.woff"); }`);
          assert.strictEqual(styleElems[4].textContent.trim(), `@font-face { font-family: "string2"; src: url("string-2.woff"); }`);
          assert.strictEqual(styleElems[5].textContent.trim(), `@font-face { font-family: "string3"; src: url("string-3.woff"); }`);
          assert.strictEqual(styleElems[6].textContent.trim(), `@font-face { font-family: "string 4"; src: url("string-4.woff"); }`);
          assert.strictEqual(styleElems[7].textContent.trim(), `@font-face { font-family: "complex \\\\\\"name\\\\\\" \\0A 1"; src: url("complex-name-1.woff"); }`);
          assert.strictEqual(styleElems[8].textContent.trim(), `@font-face { font-family: "complex \\\\'name\\\\' 2"; src: url("complex-name-2.woff"); }`);
          assert.strictEqual(styleElems[9].textContent.trim(), `\
@font-face { font-family: "multiple value 1"; src: url("multiple-value-1.woff"); }
@font-face { font-family: "multiple value 2"; src: url("multiple-value-2.woff"); }`);
          assert.strictEqual(styleElems[10].textContent.trim(), `\
@font-face { font-family: keyframes1; src: url("keyframes-1.woff"); }
@font-face { font-family: "keyframes 2"; src: url("keyframes-2.woff"); }
@font-face { font-family: "keyframes\\A 3"; src: url("keyframes-3.woff"); }

@keyframes keyframes1 {
  from { font-family: keyframes1, "keyframes 2"; }
  to { transform: translateX(40px); font-family: "keyframes\\A 3"; }
}`);
        });
      });

      describe('non-loaded font files', function () {
        it('save all linked fonts despite non-loaded', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/unloaded/index.html`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('alternative-1.woff'));
          assert.exists(zip.file('alternative-2.woff'));
          assert.exists(zip.file('alternative-3.woff'));
          assert.exists(zip.file('unicode-range-1.woff'));
          assert.exists(zip.file('unicode-range-2.woff'));
          assert.exists(zip.file('unicode-range-3.woff'));
          assert.exists(zip.file('unicode-range-4.woff'));
          assert.exists(zip.file('unicode-range-5.woff'));
          assert.exists(zip.file('unicode-range-6.woff'));
          assert.exists(zip.file('unicode-range-7.woff'));
          assert.exists(zip.file('unicode-range-8.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(
            doc.querySelector('style.alternative').textContent.trim(),
            `@font-face { font-family: alternative; src: url("alternative-1.woff"), url("alternative-2.woff"), url("alternative-3.woff"); }`,
          );
          assert.strictEqual(
            doc.querySelector('style.unicode-range').textContent.trim(),
            `\
@font-face { font-family: unicode-range; src: url("unicode-range-1.woff"); unicode-range: U+30; }
@font-face { font-family: unicode-range; src: url("unicode-range-2.woff"); unicode-range: U+34-35; }
@font-face { font-family: unicode-range; src: url("unicode-range-3.woff"); unicode-range: U+4?; }
@font-face { font-family: unicode-range; src: url("unicode-range-4.woff"); unicode-range: U+61-65, U+68; }
@font-face { font-family: unicode-range; src: url("unicode-range-5.woff"); unicode-range: U+10; }
@font-face { font-family: unicode-range; src: url("unicode-range-6.woff"); unicode-range: U+200-300; }
@font-face { font-family: unicode-range; src: url("unicode-range-7.woff"); unicode-range: U+5??; }
@font-face { font-family: unicode-range; src: url("unicode-range-8.woff"); unicode-range: U+700-800, U+1000; }`,
          );
        });
      });

      describe('scoped @font-face', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/scope/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal1.woff'));
          assert.exists(zip.file('internal2.woff'));
          assert.exists(zip.file('internal3.woff'));
          assert.notExists(zip.file('internal4.woff'));
          assert.exists(zip.file('internal5.woff'));
          assert.exists(zip.file('internal6.woff'));
          assert.exists(zip.file('internal7.woff'));
          assert.notExists(zip.file('internal8.woff'));
          assert.exists(zip.file('shadow1.woff'));
          assert.exists(zip.file('shadow2.woff'));
          assert.notExists(zip.file('shadow3.woff'));
          assert.notExists(zip.file('shadow4.woff'));
          assert.exists(zip.file('shadow5.woff'));
          assert.exists(zip.file('shadow6.woff'));
          assert.notExists(zip.file('shadow7.woff'));
          assert.notExists(zip.file('shadow8.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelectorAll('style')[1].textContent.trim(), `\
@font-face { font-family: local-upper-by-local-upper; src: url("internal1.woff"); }
@font-face { font-family: local-upper-by-local; src: url("internal2.woff"); }
@font-face { font-family: local-upper-by-upper; src: url("internal3.woff"); }
@font-face { font-family: local-upper-by-none; src: url(""); }
@font-face { font-family: upper-by-local-upper; src: url("internal5.woff"); }
@font-face { font-family: upper-by-local; src: url("internal6.woff"); }
@font-face { font-family: upper-by-upper; src: url("internal7.woff"); }
@font-face { font-family: upper-by-none; src: url(""); }`);

          var host1 = doc.querySelector('#shadow1');
          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          assert.strictEqual(shadow1.querySelectorAll('style')[1].textContent.trim(), `\
@font-face { font-family: local-upper-by-local-upper; src: url("shadow1.woff"); }
@font-face { font-family: local-upper-by-local; src: url("shadow2.woff"); }
@font-face { font-family: local-upper-by-upper; src: url(""); }
@font-face { font-family: local-upper-by-none; src: url(""); }
@font-face { font-family: local-by-local-upper; src: url("shadow5.woff"); }
@font-face { font-family: local-by-local; src: url("shadow6.woff"); }
@font-face { font-family: local-by-upper; src: url(""); }
@font-face { font-family: local-by-none; src: url(""); }`);
        });

        it('::part', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/scope_part/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@font-face { font-family: myff; src: url("internal.woff"); }
#shadow1::part(mypart) { font-family: myff; }`);
        });

        it('conditional', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/scope_conditional/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('internal.woff'));
          assert.exists(zip.file('shadow.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `@font-face { font-family: myfont; src: url("internal.woff"); }`);

          var host1 = doc.querySelector('#shadow1');
          var frag = doc.createElement("template");
          frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
          var shadow1 = frag.content;
          assert.strictEqual(shadow1.querySelectorAll('style')[1].textContent.trim(), `\
@media print {
  @font-face { font-family: myfont; src: url("shadow.woff"); }
}`);
        });
      });

      describe('CSS variable', function () {
        $it.xfail()('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.video": "remove",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/var/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('var1.woff'));  // @FIXME
          assert.exists(zip.file('var2.woff'));  // @FIXME
          assert.exists(zip.file('var3.woff'));  // @FIXME
          assert.exists(zip.file('var4.woff'));  // @FIXME
          assert.exists(zip.file('var5.woff'));  // @FIXME

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          var styleElems = doc.querySelectorAll('style');

          // @FIXME: font-face src emptied
          assert.strictEqual(styleElems[0].textContent.trim(), `\
@font-face { font-family: var1; src: url("var1.woff"); }
:root { --var-1: 1.1em var1; }
#var1 { font: var(--var-1); }`);

          // @FIXME: font-face src emptied
          assert.strictEqual(styleElems[1].textContent.trim(), `\
@font-face { font-family: var2; src: url("var2.woff"); }
:root { --var-2: var2; }
#var2 { font: 1.1em var(--var-2); }`);

          // @FIXME: font-face src emptied
          assert.strictEqual(styleElems[2].textContent.trim(), `\
@font-face { font-family: var3; src: url("var3.woff"); }
:root { --var-3: var3; }
#var3 { font-family: var(--var-3); font-size: 1.1em; }`);

          // @FIXME: font-face src emptied
          assert.strictEqual(styleElems[3].textContent.trim(), `\
@font-face { font-family: var4; src: url("var4.woff"); }
@keyframes anime4 {
  from { font-family: var(--var-4); font-size: 1.1em; }
  to { transform: translateX(40px); }
}
:root { --var-4: var4; }
#var4 { animation: anime4 3s linear infinite; }`);

          // @FIXME: font-face src emptied
          assert.strictEqual(styleElems[4].textContent.trim(), `\
@font-face { font-family: var5; src: url("var5.woff"); }
@keyframes anime5 {
  from { --var-5: var5; }
  to { transform: translateX(40px); }
}
#var5 { animation: anime5 3s linear infinite; font-family: var(--var-5); font-size: 1.1em; }`);
        });
      });

      $describe.skipIf($.noNestingCss)('nesting CSS', function () {
        it('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.font": "save-used",
            "capture.rewriteCss": "url",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/nesting/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('file1.woff'));
          assert.exists(zip.file('file1-1.woff'));
          assert.exists(zip.file('file1-1-1.woff'));
          assert.exists(zip.file('file1-1-2.woff'));
          assert.notExists(zip.file('file1-2.woff'));
          assert.notExists(zip.file('file1-2-1.woff'));
          assert.notExists(zip.file('file1-2-2.woff'));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.strictEqual(doc.querySelector('style').textContent.trim(), `\
@font-face { font-family: font1; src: url("file1.woff"); }
@font-face { font-family: font1-1; src: url("file1-1.woff"); }
@font-face { font-family: font1-1-1; src: url("file1-1-1.woff"); }
@font-face { font-family: font1-1-2; src: url("file1-1-2.woff"); }
@font-face { font-family: font1-2; src: url(""); }
@font-face { font-family: font1-2-1; src: url(""); }
@font-face { font-family: font1-2-2; src: url(""); }
.case1 {
  font-family: font1;
  .case1-1 {
    font-family: font1-1;
    .case1-1-1 {
      font-family: font1-1-1;
    }
    &.case1-1-2 {
      font-family: font1-1-2;
    }
  }
  .case1-2 {
    font-family: font1-2;
    .case1-2-1 {
      font-family: font1-2-1;
    }
    &.case1-2-2 {
      font-family: font1-2-2;
    }
  }
}`);
        });
      });

      describe('script loaded', function () {
        $it.xfail()('basic', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": "url",
            "capture.font": "save-used",
          });
          var blob = await capture({
            url: `${localhost}/capture_font_used/scripted/index.html`,
            options,
          }, {delay: 300});
          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file('scripted.woff'));
          assert.notExists(zip.file('removed.woff'));
        });
      });
    });
  });

  describe('script element', function () {
    describe('basic', function () {
      it('capture.script = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/script.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('script1.js'));
        assert.exists(zip.file('script2.js'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var scripts = doc.querySelectorAll('script');
        assert.strictEqual(scripts[0].textContent.trim(), `console.log('head');`);
        assert.strictEqual(scripts[1].getAttribute('src'), `script1.js`);
        assert.strictEqual(scripts[2].getAttribute('src'), `script2.js`);
        assert.strictEqual(scripts[2].textContent.trim(), `console.log('head +src');`);
        assert.strictEqual(scripts[3].textContent.trim(), `console.log('body');`);
        assert.strictEqual(scripts[4].textContent.trim(), `console.log('post-body');`);
        assert.strictEqual(scripts[5].textContent.trim(), `console.log('post-html');`);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `javascript:console.log('a');`);
        assert.strictEqual(anchors[1].getAttribute('href'), `Javascript:console.log('a');`);
        assert.strictEqual(anchors[2].getAttribute('href'), ` javascript:console.log('a');`);
        assert.strictEqual(anchors[3].getAttribute('href'), `\tjavascript:console.log('a');`);
        assert.strictEqual(anchors[4].getAttribute('href'), `\nj\na\nv\na\ns\nc\nr\ni\np\nt\n:console.log('a');`);

        assert.strictEqual(doc.querySelector('form').getAttribute('action'), `javascript:console.log('form');`);
        assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute('formaction'), `javascript:console.log('input[type=image]');`);
        assert.strictEqual(doc.querySelector('input[type="submit"]').getAttribute('formaction'), `javascript:console.log('input[type=submit]');`);
        assert.strictEqual(doc.querySelector('button').getAttribute('formaction'), `javascript:console.log('button');`);

        var elem = doc.body;
        assert.strictEqual(elem.getAttribute('onload').trim(), `console.log('load');`);
        assert.strictEqual(elem.getAttribute('oncontextmenu').trim(), `return false;`);
        var elem = doc.querySelector('div');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
        var elem = doc.querySelector('svg circle');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
        var elem = doc.querySelector('svg text');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
        var elem = doc.querySelector('math mrow');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
      });

      it('capture.script = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/script.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var scripts = doc.querySelectorAll('script');
        assert.strictEqual(scripts[0].textContent.trim(), `console.log('head');`);
        assert.strictEqual(scripts[1].getAttribute('src'), `${localhost}/capture_script/script1.js`);
        assert.strictEqual(scripts[2].getAttribute('src'), `${localhost}/capture_script/script2.js`);
        assert.strictEqual(scripts[2].textContent.trim(), `console.log('head +src');`);
        assert.strictEqual(scripts[3].textContent.trim(), `console.log('body');`);
        assert.strictEqual(scripts[4].textContent.trim(), `console.log('post-body');`);
        assert.strictEqual(scripts[5].textContent.trim(), `console.log('post-html');`);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `javascript:console.log('a');`);
        assert.strictEqual(anchors[1].getAttribute('href'), `Javascript:console.log('a');`);
        assert.strictEqual(anchors[2].getAttribute('href'), ` javascript:console.log('a');`);
        assert.strictEqual(anchors[3].getAttribute('href'), `\tjavascript:console.log('a');`);
        assert.strictEqual(anchors[4].getAttribute('href'), `\nj\na\nv\na\ns\nc\nr\ni\np\nt\n:console.log('a');`);

        assert.strictEqual(doc.querySelector('form').getAttribute('action'), `javascript:console.log('form');`);
        assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute('formaction'), `javascript:console.log('input[type=image]');`);
        assert.strictEqual(doc.querySelector('input[type="submit"]').getAttribute('formaction'), `javascript:console.log('input[type=submit]');`);
        assert.strictEqual(doc.querySelector('button').getAttribute('formaction'), `javascript:console.log('button');`);

        var elem = doc.body;
        assert.strictEqual(elem.getAttribute('onload').trim(), `console.log('load');`);
        assert.strictEqual(elem.getAttribute('oncontextmenu').trim(), `return false;`);
        var elem = doc.querySelector('div');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
        var elem = doc.querySelector('svg circle');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
        var elem = doc.querySelector('svg text');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
        var elem = doc.querySelector('math mrow');
        assert.strictEqual(elem.getAttribute('onclick').trim(), `console.log('click');`);
      });

      it('capture.script = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/script.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var scripts = doc.querySelectorAll('script');
        assert.strictEqual(scripts[0].textContent.trim(), ``);
        assert(!scripts[1].hasAttribute('src'));
        assert(!scripts[2].hasAttribute('src'));
        assert.strictEqual(scripts[2].textContent.trim(), ``);
        assert.strictEqual(scripts[3].textContent.trim(), ``);
        assert.strictEqual(scripts[4].textContent.trim(), ``);
        assert.strictEqual(scripts[5].textContent.trim(), ``);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[1].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[2].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[3].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[4].getAttribute('href'), `javascript:`);

        assert.strictEqual(doc.querySelector('form').getAttribute('action'), `javascript:`);
        assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute('formaction'), `javascript:`);
        assert.strictEqual(doc.querySelector('input[type="submit"]').getAttribute('formaction'), `javascript:`);
        assert.strictEqual(doc.querySelector('button').getAttribute('formaction'), `javascript:`);

        var elem = doc.body;
        assert(!elem.hasAttribute('onload'));
        assert(!elem.hasAttribute('oncontextmenu'));
        var elem = doc.querySelector('div');
        assert(!elem.hasAttribute('onclick'));
        var elem = doc.querySelector('svg circle');
        assert(!elem.hasAttribute('onclick'));
        var elem = doc.querySelector('svg text');
        assert(!elem.hasAttribute('onclick'));
        var elem = doc.querySelector('math mrow');
        assert(!elem.hasAttribute('onclick'));
      });

      it('capture.script = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/script.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var scripts = doc.querySelectorAll('script');
        assert.strictEqual(scripts.length, 0);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[1].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[2].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[3].getAttribute('href'), `javascript:`);
        assert.strictEqual(anchors[4].getAttribute('href'), `javascript:`);

        assert.strictEqual(doc.querySelector('form').getAttribute('action'), `javascript:`);
        assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute('formaction'), `javascript:`);
        assert.strictEqual(doc.querySelector('input[type="submit"]').getAttribute('formaction'), `javascript:`);
        assert.strictEqual(doc.querySelector('button').getAttribute('formaction'), `javascript:`);

        var elem = doc.body;
        assert(!elem.hasAttribute('onload'));
        assert(!elem.hasAttribute('oncontextmenu'));
        var elem = doc.querySelector('div');
        assert(!elem.hasAttribute('onclick'));
        var elem = doc.querySelector('svg circle');
        assert(!elem.hasAttribute('onclick'));
        var elem = doc.querySelector('svg text');
        assert(!elem.hasAttribute('onclick'));
        var elem = doc.querySelector('math mrow');
        assert(!elem.hasAttribute('onclick'));
      });
    });
  });

  describe('noscript element', function () {
    describe('basic', function () {
      it('capture.noscript = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.noscript": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/noscript.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var noscripts = doc.querySelectorAll('noscript');
        assert.strictEqual(noscripts[0].textContent.trim(), `Your browser does not support JavaScript.`);
        assert(noscripts[1].querySelector('img[src="red.bmp"]'));
      });

      it('capture.noscript = save (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.noscript": "save",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_script/noscript.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var noscripts = doc.querySelectorAll('noscript');
        assert.strictEqual(noscripts[0].textContent.trim(), `Your browser does not support JavaScript.`);
        assert(noscripts[1].querySelector('img[src="red.bmp"]'));
      });

      it('capture.noscript = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.noscript": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/noscript.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var noscripts = doc.querySelectorAll('noscript');
        assert.strictEqual(noscripts[0].textContent, ``);
        assert.strictEqual(noscripts[1].innerHTML, ``);
      });

      it('capture.noscript = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.noscript": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_script/noscript.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var noscripts = doc.querySelectorAll('noscript');
        assert.strictEqual(noscripts.length, 0);
      });
    });
  });

  describe('frame element', function () {
    describe('basic', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      it('capture.frame = save', async function () {
        options["capture.frame"] = "save";

        var blob = await capture({
          url: `${localhost}/capture_frame/same_origin.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        // frame1.html
        var frame = frames[0];
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content modified`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        // frame2.xhtml
        var frame = frames[1];
        assert.strictEqual(frame.getAttribute('src'), `index_2.xhtml`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content modified`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        // frame3.svg
        var frame = frames[2];
        assert.strictEqual(frame.getAttribute('src'), `index_3.svg`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost}/capture_frame/same_origin.html`);

        // text.txt
        var frame = frames[3];
        assert.strictEqual(frame.getAttribute('src'), 'text.txt');
        var frameFile = zip.file(frame.getAttribute('src'));
        var text = (await readFileAsText(await frameFile.async('blob'))).trim();
        assert.strictEqual(text, "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
      });

      it('capture.frame = save (cross-origin)', async function () {
        // Capture the frame content via content script and messaging.
        // The result should be same as same origin if it works normally.
        options["capture.frame"] = "save";

        var blob = await capture({
          url: `${localhost}/capture_frame/cross_origin.py`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        // frame1.html
        var frame = frames[0];
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content modified`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        // frame2.xhtml
        var frame = frames[1];
        assert.strictEqual(frame.getAttribute('src'), `index_2.xhtml`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content modified`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        // frame3.svg
        var frame = frames[2];
        assert.strictEqual(frame.getAttribute('src'), `index_3.svg`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost2}/capture_frame/same_origin.html`);

        // text.txt
        var frame = frames[3];
        assert.strictEqual(frame.getAttribute('src'), 'text.txt');
        var frameFile = zip.file(frame.getAttribute('src'));
        var text = (await readFileAsText(await frameFile.async('blob'))).trim();
        assert.strictEqual(text, "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
      });

      it('capture.frame = link', async function () {
        options["capture.frame"] = "link";

        var blob = await capture({
          url: `${localhost}/capture_frame/same_origin.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        assert.strictEqual(frames[0].getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
        assert.strictEqual(frames[1].getAttribute('src'), `${localhost}/capture_frame/frames/frame2.xhtml`);
        assert.strictEqual(frames[2].getAttribute('src'), `${localhost}/capture_frame/frames/frame3.svg`);
        assert.strictEqual(frames[3].getAttribute('src'), `${localhost}/capture_frame/frames/text.txt`);
      });

      it('capture.frame = blank', async function () {
        options["capture.frame"] = "blank";

        var blob = await capture({
          url: `${localhost}/capture_frame/same_origin.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        assert(!frames[0].hasAttribute('src'));
        assert(!frames[1].hasAttribute('src'));
        assert(!frames[2].hasAttribute('src'));
        assert(!frames[3].hasAttribute('src'));
      });

      it('capture.frame = remove', async function () {
        options["capture.frame"] = "remove";

        var blob = await capture({
          url: `${localhost}/capture_frame/same_origin.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('iframe').length, 0);
      });
    });

    describe('sandboxed iframe', function () {
      $it.xfailIf(
        userAgent.is('firefox') && userAgent.major < 128,
        'content script cannot be injected into a sandboxed iframe in Firefox < 128',
      )('allow-scripts', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveResourcesSequentially": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_frame/sandboxed.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        // frame1.html
        var indexFile = zip.file('index_1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('p').textContent.trim(), `frame1 content modified`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
      });

      $it.skipIf(
        !(userAgent.is('firefox') && userAgent.major < 128),
      )('allow-scripts (Firefox <= 128)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveResourcesSequentially": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_frame/sandboxed.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        // frame1.html
        var indexFile = zip.file('index_1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('p').textContent.trim(), `frame1 content`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
      });

      it('allow-same-origin', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveResourcesSequentially": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_frame/sandboxed2.html`,
          options,
        }, {delay: 500});
        var zip = await new JSZip().loadAsync(blob);

        // frame1.html
        var indexFile = zip.file('index_1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('p').textContent.trim(), `frame1 content modified`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
      });
    });

    describe('srcdoc frame', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      it('capture.frame = save', async function () {
        // srcdoc should be removed
        // otherwise same as same origin
        options["capture.frame"] = "save";

        var blob = await capture({
          url: `${localhost}/capture_frame/srcdoc.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('iframe');
        assert(!frame.hasAttribute('srcdoc'));
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `srcdoc content modified`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        // frame[srcdoc] should be ignored (left unchanged) and its src should be used
        //
        // In some browsers (e.g. Chromium 95), the frame loads an empty document when
        // "srcdoc" attribute exists. We skipped checking the captured document in
        // detail to prevent inconsistent results.
        var blob = await capture({
          url: `${localhost}/capture_frame/srcdoc_frame.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('frame');
        assert.strictEqual(frame.getAttribute('srcdoc').trim(), `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
      });

      it('capture.frame = link', async function () {
        // record resolved src and save rewritten srcdoc
        // resources in srcdoc should be saved as data URL
        options["capture.frame"] = "link";

        var blob = await capture({
          url: `${localhost}/capture_frame/srcdoc.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('iframe');
        assert.strictEqual(frame.getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
        var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
        var srcdoc = await readFileAsDocument(srcdocBlob);

        assert(srcdoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
        assert.strictEqual(srcdoc.querySelector('p').textContent.trim(), `srcdoc content modified`);
        assert.strictEqual(srcdoc.querySelector('img').getAttribute('src'), 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
        assert.notExists(zip.file('red.bmp'));

        // frame[srcdoc] should be ignored (left unchanged) and its src should be used
        var blob = await capture({
          url: `${localhost}/capture_frame/srcdoc_frame.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('frame');
        assert.strictEqual(frame.getAttribute('srcdoc').trim(), `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
        assert.strictEqual(frame.getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
      });

      it('capture.frame = blank', async function () {
        // srcdoc should be removed
        options["capture.frame"] = "blank";

        var blob = await capture({
          url: `${localhost}/capture_frame/srcdoc.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('iframe');
        assert(!frame.hasAttribute('src'));
        assert(!frame.hasAttribute('srcdoc'));

        // frame[srcdoc] should be ignored (left unchanged)
        var blob = await capture({
          url: `${localhost}/capture_frame/srcdoc_frame.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('frame');
        assert.strictEqual(frame.getAttribute('srcdoc').trim(), `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
        assert(!frame.hasAttribute('src'));
      });
    });

    describe('about: frame', function () {
      it('should save the current content for about: frames', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveResourcesSequentially": true,
        });

        var blob = await capture({
          url: `${localhost}/capture_frame/about.html`,
          options,
        }, {delay: 500});

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        // @TODO:
        // Check only about:blank as the behavior of about: pages may vary across
        // browsers.
        // - e.g. Firefox 123: contentDocument of about:blank?query is not accessible.
        assert.strictEqual(frames[0].getAttribute('src'), "index_1.html");
        assert.strictEqual(frames[1].getAttribute('src'), "index_2.html");

        var indexFile = zip.file('index_1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.body.textContent.trim(), 'iframe modified 1');

        var indexFile = zip.file('index_2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.body.textContent.trim(), 'iframe modified 2');
      });
    });

    describe('javascript: frame', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      describe('should tidy source URL according to `capture.script` when the raw URL is to be saved', function () {
        for (const captureFrame of ["save"]) {
          for (const captureScript of ["save", "link"]) {
            it(`capture.frame = ${captureFrame}, capture.script = ${captureScript}`, async function () {
              options["capture.frame"] = captureFrame;
              options["capture.script"] = captureScript;

              var blob = await capture({
                url: `${localhost}/capture_frame/javascript.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('iframe');
              assert.strictEqual(frames[0].getAttribute('src'), "index_1.html");
              assert.strictEqual(frames[1].getAttribute('src'), `javascript:console.log('iframe');`);
            });
          }
          for (const captureScript of ["blank", "remove"]) {
            it(`capture.frame = ${captureFrame}, capture.script = ${captureScript}`, async function () {
              options["capture.frame"] = captureFrame;
              options["capture.script"] = captureScript;

              var blob = await capture({
                url: `${localhost}/capture_frame/javascript.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('iframe');
              assert.strictEqual(frames[0].getAttribute('src'), "index_1.html");
              assert.strictEqual(frames[1].getAttribute('src'), `javascript:`);
            });
          }
        }

        for (const captureFrame of ["link"]) {
          for (const captureScript of ["save", "link"]) {
            it(`capture.frame = ${captureFrame}, capture.script = ${captureScript}`, async function () {
              options["capture.frame"] = captureFrame;
              options["capture.script"] = captureScript;

              var blob = await capture({
                url: `${localhost}/capture_frame/javascript.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('iframe');
              assert.strictEqual(frames[0].getAttribute('src'), `javascript:console.log('iframe');`);
              assert.strictEqual(frames[1].getAttribute('src'), `javascript:console.log('iframe');`);

              // frame
              var blob = await capture({
                url: `${localhost}/capture_frame/javascript_frame.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('frame');
              assert.strictEqual(frames[0].getAttribute('src'), `javascript:console.log('frame');`);
            });
          }
          for (const captureScript of ["blank", "remove"]) {
            it(`capture.frame = ${captureFrame}, capture.script = ${captureScript}`, async function () {
              options["capture.frame"] = captureFrame;
              options["capture.script"] = captureScript;

              var blob = await capture({
                url: `${localhost}/capture_frame/javascript.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('iframe');
              assert.strictEqual(frames[0].getAttribute('src'), `javascript:`);
              assert.strictEqual(frames[1].getAttribute('src'), `javascript:`);

              // frame
              var blob = await capture({
                url: `${localhost}/capture_frame/javascript_frame.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('frame');
              assert.strictEqual(frames[0].getAttribute('src'), `javascript:`);
            });
          }
        }

        for (const captureFrame of ["blank"]) {
          for (const captureScript of ["save", "link", "blank", "remove"]) {
            it(`capture.frame = ${captureFrame}, capture.script = ${captureScript}`, async function () {
              options["capture.frame"] = captureFrame;
              options["capture.script"] = captureScript;

              var blob = await capture({
                url: `${localhost}/capture_frame/javascript.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              var frames = doc.querySelectorAll('iframe');
              assert(!frames[0].hasAttribute('src'));
              assert(!frames[1].hasAttribute('src'));
            });
          }
        }

        for (const captureFrame of ["remove"]) {
          for (const captureScript of ["save", "link", "blank", "remove"]) {
            it(`capture.frame = ${captureFrame}, capture.script = ${captureScript}`, async function () {
              options["capture.frame"] = captureFrame;
              options["capture.script"] = captureScript;

              var blob = await capture({
                url: `${localhost}/capture_frame/javascript.html`,
                options,
              });

              var zip = await new JSZip().loadAsync(blob);

              var indexFile = zip.file('index.html');
              var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
              var doc = await readFileAsDocument(indexBlob);

              assert(!doc.querySelector('iframe'));
            });
          }
        }
      });
    });

    describe('duplication handling', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      it('capture.frame = save', async function () {
        options["capture.frame"] = "save";

        var blob = await capture({
          url: `${localhost}/capture_frame/duplicate.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        assert.strictEqual(frames[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(frames[1].getAttribute('src'), `index_2.html`);
        assert.strictEqual(frames[2].getAttribute('src'), `index_3.html#abc`);
        assert.strictEqual(frames[3].getAttribute('src'), `text.txt`);
        assert.strictEqual(frames[4].getAttribute('src'), `text.txt`);
      });

      it('capture.frame = link', async function () {
        options["capture.frame"] = "link";

        var blob = await capture({
          url: `${localhost}/capture_frame/duplicate.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        assert.strictEqual(frames[0].getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
        assert.strictEqual(frames[1].getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
        assert.strictEqual(frames[2].getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html#abc`);
        assert.strictEqual(frames[3].getAttribute('src'), `${localhost}/capture_frame/frames/text.txt`);
        assert.strictEqual(frames[4].getAttribute('src'), `${localhost}/capture_frame/frames/text.txt`);
      });
    });

    describe('headless', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      it('capture.frame = save', async function () {
        // frame contents are source (not modified by scripts) due to headless capture
        options["capture.frame"] = "save";

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/same_origin.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        var frame = frames[0];
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        var frame = frames[1];
        assert.strictEqual(frame.getAttribute('src'), `index_2.xhtml`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var frame = frames[2];
        assert.strictEqual(frame.getAttribute('src'), `index_3.svg`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost}/capture_frame/same_origin.html`);

        var frame = frames[3];
        assert.strictEqual(frame.getAttribute('src'), 'text.txt');
        var frameFile = zip.file(frame.getAttribute('src'));
        var text = (await readFileAsText(await frameFile.async('blob'))).trim();
        assert.strictEqual(text, "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");
      });
    });

    describe('headless srcdoc frame', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      it('capture.frame = save', async function () {
        // srcdoc content should be rewritten
        options["capture.frame"] = "save";

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/srcdoc.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('iframe');
        assert(!frame.hasAttribute('srcdoc'));
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `srcdoc content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        // meta refresh in the srcdoc should be resolved according to the base URL of the main document
        var frame = doc.querySelectorAll('iframe')[1];
        assert(!frame.hasAttribute('srcdoc'));
        assert.strictEqual(frame.getAttribute('src'), `index_2.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.exists(frameDoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
        var mrs = frameDoc.querySelectorAll('meta[http-equiv="refresh"]');
        assert.strictEqual(mrs[0].getAttribute('content'), `0; url=${localhost}/capture_frame/frames/frame1.html`);

        // frame[srcdoc] should be ignored (left unchanged) and its src should be used
        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/srcdoc_frame.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelectorAll('frame')[0];
        assert.strictEqual(frame.getAttribute('srcdoc').trim(), `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
      });

      it('capture.frame = link', async function () {
        // record resolved src and save rewritten srcdoc
        // resources in srcdoc should be saved as data URL
        options["capture.frame"] = "link";

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/srcdoc.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('iframe');
        assert.strictEqual(frame.getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
        var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
        var srcdoc = await readFileAsDocument(srcdocBlob);

        assert(srcdoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
        assert.strictEqual(srcdoc.querySelector('p').textContent.trim(), `srcdoc content`);
        assert.strictEqual(srcdoc.querySelector('img').getAttribute('src'), 'data:image/bmp;filename=red.bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');
        assert.notExists(zip.file('red.bmp'));

        // meta refresh in the srcdoc should be resolved according to the base URL of the main document
        var frame = doc.querySelectorAll('iframe')[1];
        var srcdocBlob = new Blob([frame.getAttribute('srcdoc')], {type: "text/html"});
        var srcdoc = await readFileAsDocument(srcdocBlob);

        assert(srcdoc.querySelector('html[data-scrapbook-source="about:srcdoc"]'));
        var mrs = srcdoc.querySelectorAll('meta[http-equiv="refresh"]');
        assert.strictEqual(mrs[0].getAttribute('content'), `0; url=${localhost}/capture_frame/frames/frame1.html`);

        // frame[srcdoc] should be ignored (left unchanged) and its src should be used
        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/srcdoc_frame.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelectorAll('frame')[0];
        assert.strictEqual(frame.getAttribute('srcdoc').trim(), `\
<p>srcdoc content</p>
<img src="frames/red.bmp">

<style>img { width: 60px; }</style>
<script>
document.querySelector("p").textContent = "srcdoc content modified";
</script>`);
        assert.strictEqual(frame.getAttribute('src'), `${localhost}/capture_frame/frames/frame1.html`);
      });
    });

    describe('headless about: frame', function () {
      it('should keep original URL for about: frames', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveResourcesSequentially": true,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/about.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');
        assert.strictEqual(frames[0].getAttribute('src'), "about:blank");
        assert.strictEqual(frames[1].getAttribute('src'), "about:blank");
        assert.strictEqual(frames[2].getAttribute('src'), "about:blank?foo=bar");
        assert.strictEqual(frames[3].getAttribute('src'), "about:blank?foo=bar#frag");
        assert.strictEqual(frames[4].getAttribute('src'), "about:srcdoc");
        assert.strictEqual(frames[5].getAttribute('src'), "about:invalid");
        assert.strictEqual(frames[6].getAttribute('src'), "about:newtab");
        assert.strictEqual(frames[7].getAttribute('src'), "about:unknown");
      });
    });

    describe('headless self-pointing frame', function () {
      it('should rewrite self-pointing URLs without saving an extra page', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/self.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        assert(!frames[0].hasAttribute('src'));
        assert.strictEqual(frames[1].getAttribute('src'), "");
        assert.strictEqual(frames[2].getAttribute('src'), "#123");
        assert.strictEqual(frames[3].getAttribute('src'), "index.html");
      });
    });

    describe('headless duplication handling', function () {
      it('capture.frame = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame/duplicate.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('iframe');

        assert.strictEqual(frames[0].getAttribute('src'), "index_1.html");
        assert.strictEqual(frames[1].getAttribute('src'), "index_1.html");
        assert.strictEqual(frames[2].getAttribute('src'), "index_1.html#abc");
        assert.strictEqual(frames[3].getAttribute('src'), "text.txt");
        assert.strictEqual(frames[4].getAttribute('src'), "text.txt");
      });
    });

    describe('singleHtml', function () {
      /**
       * Check data URL output for frame capture.
       *
       * - Should use the original filename.
       */
      describe('data URL handling', function () {
        it('capture.saveDataUriAsSrcdoc = true', async function () {
          // data URI charset should be UTF-8
          var options = Object.assign({}, baseOptions, {
            "capture.saveAs": "singleHtml",
            "capture.frame": "save",
            "capture.saveDataUriAsSrcdoc": true,
          });

          var blob = await capture({
            url: `${localhost}/capture_frame/same_origin.html`,
            options,
          });

          var doc = await readFileAsDocument(blob);
          var frames = doc.querySelectorAll('iframe');

          var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(frames[0].getAttribute('srcdoc'))}`;
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content modified`);

          var frameSrc = frames[1].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content modified`);

          var frameSrc = frames[2].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:image/svg+xml;charset=UTF-8;filename=frame3.svg,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost}/capture_frame/same_origin.html`);

          var frameSrc = frames[3].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:text/plain;filename=text.txt,`));
          var text = (await xhr({url: frameSrc, responseType: "text"})).response;
          assert.strictEqual(text, "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

          // <frame> does not support srcdoc and should use data URL
          var blob = await capture({
            url: `${localhost}/capture_frame/frameset.html`,
            options,
          });

          var doc = await readFileAsDocument(blob);
          var frames = doc.querySelectorAll('frame');

          var frameSrc = frames[0].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content modified`);

          var frameSrc = frames[1].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content modified`);
        });

        it('capture.saveDataUriAsSrcdoc = false', async function () {
          // data URI charset should be UTF-8
          var options = Object.assign({}, baseOptions, {
            "capture.saveAs": "singleHtml",
            "capture.frame": "save",
            "capture.saveDataUriAsSrcdoc": false,
          });

          var blob = await capture({
            url: `${localhost}/capture_frame/same_origin.html`,
            options,
          });

          var doc = await readFileAsDocument(blob);
          var frames = doc.querySelectorAll('iframe');

          var frameSrc = frames[0].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content modified`);

          var frameSrc = frames[1].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content modified`);

          var frameSrc = frames[2].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:image/svg+xml;charset=UTF-8;filename=frame3.svg,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost}/capture_frame/same_origin.html`);

          var frameSrc = frames[3].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:text/plain;filename=text.txt,`));
          var text = (await xhr({url: frameSrc, responseType: "text"})).response;
          assert.strictEqual(text, "Lorem ipsum dolor sit amet. 旡羖甾惤怤齶覅煋朸汊狦芎沝抾邞塯乇泹銧裧。");

          // <frame> does not support srcdoc and should use data URL
          var blob = await capture({
            url: `${localhost}/capture_frame/frameset.html`,
            options,
          });

          var doc = await readFileAsDocument(blob);
          var frames = doc.querySelectorAll('frame');

          var frameSrc = frames[0].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content modified`);

          var frameSrc = frames[1].getAttribute('src');
          assert(frameSrc.match(rawRegex`${'^'}data:application/xhtml+xml;charset=UTF-8;filename=frame2.xhtml,`));
          var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;
          assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content modified`);
        });
      });

      /**
       * Check data URL output for duplicated references
       *
       * - Should use non-uniquified for the filename parameter of the data URL.
       * - Should not contain a hash for the data URL.
       */
      describe('duplication handling', function () {
        it('capture.saveDataUriAsSrcdoc = true', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.saveAs": "singleHtml",
            "capture.frame": "save",
            "capture.saveDataUriAsSrcdoc": true,
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_frame/duplicate.html`,
            options,
          });

          var doc = await readFileAsDocument(blob);
          var frames = doc.querySelectorAll('iframe');

          assert.strictEqual(frames[0].getAttribute('srcdoc'), frames[1].getAttribute('srcdoc'));
          assert.strictEqual(frames[0].getAttribute('srcdoc'), frames[2].getAttribute('srcdoc'));
          assert.strictEqual(frames[3].getAttribute('srcdoc'), frames[4].getAttribute('srcdoc'));
        });

        it('capture.saveDataUriAsSrcdoc = false', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.saveAs": "singleHtml",
            "capture.frame": "save",
            "capture.saveDataUriAsSrcdoc": false,
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_frame/duplicate.html`,
            options,
          });

          var doc = await readFileAsDocument(blob);
          var frames = doc.querySelectorAll('iframe');

          assert.strictEqual(frames[0].getAttribute('src'), frames[1].getAttribute('src'));
          assert.strictEqual(frames[0].getAttribute('src'), frames[2].getAttribute('src'));
          assert.strictEqual(frames[3].getAttribute('src'), frames[4].getAttribute('src'));
        });
      });
    });

    describe('circular frame', function () {
      it('capture.saveAs = zip', async function () {
        // link to corresponding downloaded frame file
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "zip",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame_circular/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // frame1.html
        var frame = doc.querySelector('iframe');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index_1.html');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        // frame2.html
        var frame = frameDoc.querySelector('iframe');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index_2.html');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        // index.html
        var frame = frameDoc.querySelector('iframe');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index.html');
      });

      it('capture.saveAs = singleHtml; capture.saveDataUriAsSrcdoc = true', async function () {
        // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsSrcdoc": true,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame_circular/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        // frame1.html
        var frame = doc.querySelector('iframe');
        var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(frame.getAttribute('srcdoc'))}`;
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // frame2.html
        var frame = frameDoc.querySelector('iframe');
        var frameSrc = `data:text/html;charset=UTF-8,${encodeURIComponent(frame.getAttribute('srcdoc'))}`;
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // index.html
        var frame = frameDoc.querySelector('iframe');
        assert.strictEqual(frame.getAttribute('src'), `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular/index.html`);
        assert(!frame.hasAttribute('srcdoc'));
      });

      it('capture.saveAs = singleHtml; capture.saveDataUriAsSrcdoc = false', async function () {
        // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsSrcdoc": false,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame_circular/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        // frame1.html
        var frame = doc.querySelector('iframe');
        var frameSrc = frame.getAttribute('src');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // frame2.html
        var frame = frameDoc.querySelector('iframe');
        var frameSrc = frame.getAttribute('src');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // index.html
        var frame = frameDoc.querySelector('iframe');
        assert.strictEqual(frame.getAttribute('src'), `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular/index.html`);
        assert(!frame.hasAttribute('srcdoc'));
      });
    });

    describe('circular frame to self', function () {
      it('capture.frame = save', async function () {
        // link to corresponding downloaded frame file
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame_circular_self/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frame = doc.querySelector('iframe');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index.html');
      });

      it('capture.saveAs = singleHtml; capture.saveDataUriAsSrcdoc = true', async function () {
        // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsSrcdoc": true,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame_circular_self/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        var frame = doc.querySelector('iframe');
        assert.strictEqual(frame.getAttribute('src'), `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular_self/index.html`);
        assert(!frame.hasAttribute('srcdoc'));
      });

      it('capture.saveAs = singleHtml; capture.saveDataUriAsSrcdoc = false', async function () {
        // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsSrcdoc": false,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frame_circular_self/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        var frame = doc.querySelector('iframe');
        assert.strictEqual(frame.getAttribute('src'), `urn:scrapbook:download:circular:url:${localhost}/capture_frame_circular_self/index.html`);
        assert(!frame.hasAttribute('srcdoc'));
      });
    });

    describe('should name frames according to capture.frameRename', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
      });

      it('capture.frameRename = true', async function () {
        Object.assign(options, {
          "capture.frameRename": true,
          "capture.frame": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_frameRename/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.xhtml`);
        assert.strictEqual(doc.querySelectorAll('iframe')[2].getAttribute('src'), `index_3.svg`);
        assert.strictEqual(doc.querySelectorAll('iframe')[3].getAttribute('src'), `text.txt`);
        assert.strictEqual(doc.querySelectorAll('iframe')[4].getAttribute('src'), `red.bmp`);
      });

      it('capture.frameRename = false', async function () {
        Object.assign(options, {
          "capture.frameRename": false,
          "capture.frame": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_frameRename/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `frame1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `frame2.xhtml`);
        assert.strictEqual(doc.querySelectorAll('iframe')[2].getAttribute('src'), `frame3.svg`);
        assert.strictEqual(doc.querySelectorAll('iframe')[3].getAttribute('src'), `text.txt`);
        assert.strictEqual(doc.querySelectorAll('iframe')[4].getAttribute('src'), `red.bmp`);
      });
    });

    describe('should take header filename', function () {
      it('capture.frameRename = false', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.frameRename": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_frameRename_header/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.exists(zip.file("frame1.html"));
        assert.exists(zip.file("frame2.html"));
        assert.exists(zip.file("frame3.py.html"));
        assert.exists(zip.file("a中b#c.php.html"));

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `frame1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `frame2.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[2].getAttribute('src'), `frame3.py.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[3].getAttribute('src'), `a中b%23c.php.html`);
      });

      it('capture.frameRename = false (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.frameRename": false,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frameRename_header/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.exists(zip.file("frame1.html"));
        assert.exists(zip.file("frame2.html"));
        assert.exists(zip.file("frame3.py.html"));
        assert.exists(zip.file("a中b#c.php.html"));

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `frame1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `frame2.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[2].getAttribute('src'), `frame3.py.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[3].getAttribute('src'), `a中b%23c.php.html`);
      });

      it('capture.saveAs = singleHtml; srcdoc = false', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsSrcdoc": false,
        });

        var blob = await capture({
          url: `${localhost}/capture_frameRename_header/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        var frameSrc = doc.querySelectorAll('iframe')[0].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));

        var frameSrc = doc.querySelectorAll('iframe')[1].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame2.html,`));

        var frameSrc = doc.querySelectorAll('iframe')[2].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame3.py.html,`));

        var frameSrc = doc.querySelectorAll('iframe')[3].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=a%E4%B8%ADb%23c.php.html,`));
      });

      it('capture.saveAs = singleHtml; srcdoc = false (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.frame": "save",
          "capture.saveAs": "singleHtml",
          "capture.saveDataUriAsSrcdoc": false,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_frameRename_header/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        var frameSrc = doc.querySelectorAll('iframe')[0].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame1.html,`));

        var frameSrc = doc.querySelectorAll('iframe')[1].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame2.html,`));

        var frameSrc = doc.querySelectorAll('iframe')[2].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=frame3.py.html,`));

        var frameSrc = doc.querySelectorAll('iframe')[3].getAttribute('src');
        assert(frameSrc.match(rawRegex`${'^'}data:text/html;charset=UTF-8;filename=a%E4%B8%ADb%23c.php.html,`));
      });
    });
  });

  describe('anchor element', function () {
    describe('basic', function () {
      it('should rewrite URLs correctly', async function () {
        var blob = await capture({
          url: `${localhost}/capture_anchor/basic/basic.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var anchors = doc.querySelectorAll('a');

        assert.strictEqual(anchors[0].getAttribute('href'), ``);
        assert.strictEqual(anchors[1].getAttribute('href'), `#`);
        assert.strictEqual(anchors[2].getAttribute('href'), `#123`);
        assert.strictEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?`);
        assert.strictEqual(anchors[4].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123`);
        assert.strictEqual(anchors[5].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123#456`);

        assert.strictEqual(anchors[6].getAttribute('href'), ``);
        assert.strictEqual(anchors[7].getAttribute('href'), `#`);
        assert.strictEqual(anchors[8].getAttribute('href'), `#123`);
        assert.strictEqual(anchors[9].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?`);
        assert.strictEqual(anchors[10].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123`);
        assert.strictEqual(anchors[11].getAttribute('href'), `${localhost}/capture_anchor/basic/basic.html?id=123#456`);

        assert.strictEqual(anchors[12].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html`);
        assert.strictEqual(anchors[13].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html#`);
        assert.strictEqual(anchors[14].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html#123`);
        assert.strictEqual(anchors[15].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html?`);
        assert.strictEqual(anchors[16].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html?id=123`);
        assert.strictEqual(anchors[17].getAttribute('href'), `${localhost}/capture_anchor/basic/linked.html?id=123#456`);

        assert.strictEqual(anchors[18].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html`);
        assert.strictEqual(anchors[19].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html#`);
        assert.strictEqual(anchors[20].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html#123`);
        assert.strictEqual(anchors[21].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html?`);
        assert.strictEqual(anchors[22].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html?id=123`);
        assert.strictEqual(anchors[23].getAttribute('href'), `${localhost}/capture_anchor/basic/subdir/linked.html?id=123#456`);

        assert.strictEqual(anchors[24].getAttribute('href'), `http://example.com/`); // fixed from http://example.com
        assert.strictEqual(anchors[25].getAttribute('href'), `http://example.com/#`);
        assert.strictEqual(anchors[26].getAttribute('href'), `http://example.com/#123`);
        assert.strictEqual(anchors[27].getAttribute('href'), `http://example.com/?`);
        assert.strictEqual(anchors[28].getAttribute('href'), `http://example.com/?id=123`);
        assert.strictEqual(anchors[29].getAttribute('href'), `http://example.com/?id=123#456`);

        assert.strictEqual(anchors[30].getAttribute('href'), `about:blank`);
        assert.strictEqual(anchors[31].getAttribute('href'), `about:blank#`);
        assert.strictEqual(anchors[32].getAttribute('href'), `about:blank#123`);
        assert.strictEqual(anchors[33].getAttribute('href'), `about:blank?`);
        assert.strictEqual(anchors[34].getAttribute('href'), `about:blank?id=123`);
        assert.strictEqual(anchors[35].getAttribute('href'), `about:blank?id=123#456`);

        assert.strictEqual(anchors[36].getAttribute('href'), `urn:scrapbook:download:error:http://example.com`);
        assert.strictEqual(anchors[37].getAttribute('href'), `urn:scrapbook:download:error:http://example.com#`);
        assert.strictEqual(anchors[38].getAttribute('href'), `urn:scrapbook:download:error:http://example.com#123`);
        assert.strictEqual(anchors[39].getAttribute('href'), `urn:scrapbook:download:error:http://example.com?`);
        assert.strictEqual(anchors[40].getAttribute('href'), `urn:scrapbook:download:error:http://example.com?id=123`);
        assert.strictEqual(anchors[41].getAttribute('href'), `urn:scrapbook:download:error:http://example.com?id=123#456`);

        assert.strictEqual(anchors[42].getAttribute('href'), `mailto:noresponse@example.com`);
      });
    });

    describe('capture selection', function () {
      it('should rewrite URL to original page if targeting a non-captured part in self page', async function () {
        var blob = await capture({
          url: `${localhost}/capture_anchor/partial_noncaptured/partial.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var anchors = doc.querySelectorAll('a');

        assert.strictEqual(anchors[0].getAttribute('href'), ``);
        assert.strictEqual(anchors[1].getAttribute('href'), `#`);
        assert.strictEqual(anchors[2].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_id`);
        assert.strictEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_name`);

        assert.strictEqual(anchors[4].getAttribute('href'), ``);
        assert.strictEqual(anchors[5].getAttribute('href'), `#`);
        assert.strictEqual(anchors[6].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_id`);
        assert.strictEqual(anchors[7].getAttribute('href'), `${localhost}/capture_anchor/partial_noncaptured/partial.html#target_name`);
      });

      it('should rewrite URL to captured page if targeting a captured part in self page', async function () {
        var blob = await capture({
          url: `${localhost}/capture_anchor/partial/partial.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var anchors = doc.querySelectorAll('a');

        assert.strictEqual(anchors[0].getAttribute('href'), ``);
        assert.strictEqual(anchors[1].getAttribute('href'), `#`);
        assert.strictEqual(anchors[2].getAttribute('href'), `#target_id`);
        assert.strictEqual(anchors[3].getAttribute('href'), `#target_name`);

        assert.strictEqual(anchors[4].getAttribute('href'), ``);
        assert.strictEqual(anchors[5].getAttribute('href'), `#`);
        assert.strictEqual(anchors[6].getAttribute('href'), `#target_id`);
        assert.strictEqual(anchors[7].getAttribute('href'), `#target_name`);
      });
    });

    describe('anchor in srcdoc', function () {
      it('depth = null', async function () {
        // Links to the original page should be rewritten to the captured one,
        // but it's over-complicated to do so for a non-indepth capture.
        // Link to the original URL instead.
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": null,
        });
        var blob = await capture({
          url: `${localhost}/capture_anchor/srcdoc/srcdoc.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = doc.querySelector('iframe').getAttribute('src');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        var anchors = frameDoc.querySelectorAll('a');

        assert.strictEqual(anchors[0].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html`);
        assert.strictEqual(anchors[1].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#`);
        assert.strictEqual(anchors[2].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#123`);
        assert.strictEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?`);
        assert.strictEqual(anchors[4].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

        assert.strictEqual(anchors[5].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html`);
        assert.strictEqual(anchors[6].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#`);
        assert.strictEqual(anchors[7].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html#123`);
        assert.strictEqual(anchors[8].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?`);
        assert.strictEqual(anchors[9].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

        assert.strictEqual(anchors[10].getAttribute('href'), `about:srcdoc`);
      });

      it('depth = 0', async function () {
        // links to the original page should be rewritten to be the captured one
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 0,
        });
        var blob = await capture({
          url: `${localhost}/capture_anchor/srcdoc/srcdoc.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameSrc = doc.querySelector('iframe').getAttribute('src');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        var anchors = frameDoc.querySelectorAll('a');

        assert.strictEqual(anchors[0].getAttribute('href'), `index.html`);
        assert.strictEqual(anchors[1].getAttribute('href'), `index.html#`);
        assert.strictEqual(anchors[2].getAttribute('href'), `index.html#123`);
        assert.strictEqual(anchors[3].getAttribute('href'), `index.html`);  // "srcdoc.html?" is normalized to "srcdoc.html"
        assert.strictEqual(anchors[4].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

        assert.strictEqual(anchors[5].getAttribute('href'), `index.html`);
        assert.strictEqual(anchors[6].getAttribute('href'), `index.html#`);
        assert.strictEqual(anchors[7].getAttribute('href'), `index.html#123`);
        assert.strictEqual(anchors[8].getAttribute('href'), `index.html`);  // "srcdoc.html?" is normalized to "srcdoc.html"
        assert.strictEqual(anchors[9].getAttribute('href'), `${localhost}/capture_anchor/srcdoc/srcdoc.html?id=123`);

        assert.strictEqual(anchors[10].getAttribute('href'), `about:srcdoc`);
      });
    });

    describe('honor base[href] when rewriting URL', function () {
      it('basic', async function () {
        var blob = await capture({
          url: `${localhost}/capture_anchor/base/base.html`,
          options: baseOptions,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var anchors = doc.querySelectorAll('a');

        assert.strictEqual(anchors[0].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html`);
        assert.strictEqual(anchors[1].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html#`);
        assert.strictEqual(anchors[2].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html#123`);
        assert.strictEqual(anchors[3].getAttribute('href'), `${localhost}/capture_anchor/base/subdir/linked.html?id=123`);

        assert.strictEqual(anchors[4].getAttribute('href'), ``);
        assert.strictEqual(anchors[5].getAttribute('href'), `#`);
        assert.strictEqual(anchors[6].getAttribute('href'), `#123`);
        assert.strictEqual(anchors[7].getAttribute('href'), `${localhost}/capture_anchor/base/base.html?id=123`);

        assert.strictEqual(anchors[8].getAttribute('href'), `http://example.com/`); // slight changed from http://example.com
      });
    });

    describe('ping attribute', function () {
      it('capture.ping = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.ping": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_anchor/ping/ping.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var a = doc.querySelector('a');

        assert.strictEqual(a.getAttribute('ping'), `${localhost}/capture_anchor/ping/ping.py ${localhost}/capture_anchor/ping/ping2.py`);
      });

      it('capture.ping = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.ping": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_anchor/ping/ping.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var a = doc.querySelector('a');

        assert.strictEqual(a.hasAttribute('ping'), false);
      });
    });
  });

  describe('image element', function () {
    describe('basic', function () {
      it('capture.image = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_image/image.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));
        assert.exists(zip.file('green.bmp'));
        assert.exists(zip.file('blue.bmp'));
        assert.exists(zip.file('yellow.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[1].getAttribute('srcset'), `red.bmp`);
        assert.strictEqual(imgs[2].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[2].getAttribute('srcset'), `green.bmp 2x, blue.bmp 3x, yellow.bmp 4x`);
        assert.strictEqual(imgs[3].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[3].getAttribute('srcset'), `green.bmp 120w, blue.bmp 180w, yellow.bmp 240w`);
        var picture = doc.querySelector('picture');
        var sources = picture.querySelectorAll('source');
        assert.strictEqual(sources[0].getAttribute('srcset'), `green.bmp`);
        assert.strictEqual(sources[1].getAttribute('srcset'), `blue.bmp`);
        var imgs = picture.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `red.bmp`);
        var input = doc.querySelector('input');
        assert.strictEqual(input.getAttribute('src'), `red.bmp`);
      });

      it('capture.image = save-current', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "save-current",
        });
        var blob = await capture({
          url: `${localhost}/capture_image/image.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert(Object.keys(zip.files).length > 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[1].getAttribute('src'), `red.bmp`);
        assert(!imgs[1].hasAttribute('srcset'));
        assert([`red.bmp`, `green.bmp`, `blue.bmp`, `yellow.bmp`].includes(imgs[2].getAttribute('src')));
        assert(!imgs[2].hasAttribute('srcset'));
        assert([`red.bmp`, `green.bmp`, `blue.bmp`, `yellow.bmp`].includes(imgs[3].getAttribute('src')));
        assert(!imgs[3].hasAttribute('srcset'));
        var picture = doc.querySelector('picture');
        assert.strictEqual(picture.querySelectorAll('source').length, 0);
        var imgs = picture.querySelectorAll('img');
        assert([`red.bmp`, `green.bmp`, `blue.bmp`].includes(imgs[0].getAttribute('src')));
        assert(!imgs[0].hasAttribute('srcset'));
        var input = doc.querySelector('input');
        assert.strictEqual(input.getAttribute('src'), `red.bmp`);
      });

      it('capture.image = save-current (headless)', async function () {
        // the result is same as save
        var options = Object.assign({}, baseOptions, {
          "capture.image": "save-current",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_image/image.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));
        assert.exists(zip.file('green.bmp'));
        assert.exists(zip.file('blue.bmp'));
        assert.exists(zip.file('yellow.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[1].getAttribute('srcset'), `red.bmp`);
        assert.strictEqual(imgs[2].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[2].getAttribute('srcset'), `green.bmp 2x, blue.bmp 3x, yellow.bmp 4x`);
        assert.strictEqual(imgs[3].getAttribute('src'), `red.bmp`);
        assert.strictEqual(imgs[3].getAttribute('srcset'), `green.bmp 120w, blue.bmp 180w, yellow.bmp 240w`);
        var picture = doc.querySelector('picture');
        var sources = picture.querySelectorAll('source');
        assert.strictEqual(sources[0].getAttribute('srcset'), `green.bmp`);
        assert.strictEqual(sources[1].getAttribute('srcset'), `blue.bmp`);
        var imgs = picture.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `red.bmp`);
        var input = doc.querySelector('input');
        assert.strictEqual(input.getAttribute('src'), `red.bmp`);
      });

      it('capture.image = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_image/image.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `${localhost}/capture_image/red.bmp`);
        assert.strictEqual(imgs[1].getAttribute('srcset'), `${localhost}/capture_image/red.bmp`);
        assert.strictEqual(imgs[2].getAttribute('src'), `${localhost}/capture_image/red.bmp`);
        assert.strictEqual(imgs[2].getAttribute('srcset'), `${localhost}/capture_image/green.bmp 2x, ${localhost}/capture_image/blue.bmp 3x, ${localhost}/capture_image/yellow.bmp 4x`);
        assert.strictEqual(imgs[3].getAttribute('src'), `${localhost}/capture_image/red.bmp`);
        assert.strictEqual(imgs[3].getAttribute('srcset'), `${localhost}/capture_image/green.bmp 120w, ${localhost}/capture_image/blue.bmp 180w, ${localhost}/capture_image/yellow.bmp 240w`);
        var picture = doc.querySelector('picture');
        var sources = picture.querySelectorAll('source');
        assert.strictEqual(sources[0].getAttribute('srcset'), `${localhost}/capture_image/green.bmp`);
        assert.strictEqual(sources[1].getAttribute('srcset'), `${localhost}/capture_image/blue.bmp`);
        var imgs = picture.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `${localhost}/capture_image/red.bmp`);
        var input = doc.querySelector('input');
        assert.strictEqual(input.getAttribute('src'), `${localhost}/capture_image/red.bmp`);
      });

      it('capture.image = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_image/image.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgs = doc.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `about:blank`);
        assert(!imgs[1].hasAttribute('srcset'));
        assert.strictEqual(imgs[2].getAttribute('src'), `about:blank`);
        assert(!imgs[2].hasAttribute('srcset'));
        assert.strictEqual(imgs[3].getAttribute('src'), `about:blank`);
        assert(!imgs[3].hasAttribute('srcset'));
        var picture = doc.querySelector('picture');
        var sources = picture.querySelectorAll('source');
        assert(!sources[0].hasAttribute('srcset'));
        assert(!sources[1].hasAttribute('srcset'));
        var imgs = picture.querySelectorAll('img');
        assert.strictEqual(imgs[0].getAttribute('src'), `about:blank`);
        var input = doc.querySelector('input');
        assert.strictEqual(input.getAttribute('src'), `about:blank`);
      });

      it('capture.image = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_image/image.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('img').length, 0);
        assert.strictEqual(doc.querySelectorAll('picture').length, 0);
        assert.strictEqual(doc.querySelectorAll('input').length, 0);
      });
    });
  });

  describe('audio element', function () {
    describe('basic', function () {
      // Use headless for most test cases since loading audio in the browser is slow.

      it('capture.audio = save (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.audio": "save",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_audio/audio.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('horse.ogg'));
        assert.exists(zip.file('horse.mp3'));
        assert.exists(zip.file('horse_en.vtt'));
        assert.exists(zip.file('horse_zh.vtt'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var audioElems = doc.querySelectorAll('audio');
        assert.strictEqual(audioElems[0].getAttribute('src'), `horse.mp3`);
        var sourceElems = audioElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `horse.ogg`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `horse.mp3`);
        var trackElems = audioElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `horse_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `horse_zh.vtt`);
      });

      it('capture.audio = save-current', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.audio": "save-current",
        });
        var blob = await capture({
          url: `${localhost}/capture_audio/audio.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert(Object.keys(zip.files).length > 1);
        assert.exists(zip.file('horse_en.vtt'));
        assert.exists(zip.file('horse_zh.vtt'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var audioElems = doc.querySelectorAll('audio');
        assert.strictEqual(audioElems[0].getAttribute('src'), `horse.mp3`);
        assert.strictEqual(audioElems[1].getAttribute('src'), `horse.ogg`);
        var sourceElems = audioElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems.length, 0);
        var trackElems = audioElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `horse_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `horse_zh.vtt`);
      });

      it('capture.audio = save-current (headless)', async function () {
        // the result is same as save
        var options = Object.assign({}, baseOptions, {
          "capture.audio": "save-current",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_audio/audio.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('horse.ogg'));
        assert.exists(zip.file('horse.mp3'));
        assert.exists(zip.file('horse_en.vtt'));
        assert.exists(zip.file('horse_zh.vtt'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var audioElems = doc.querySelectorAll('audio');
        assert.strictEqual(audioElems[0].getAttribute('src'), `horse.mp3`);
        var sourceElems = audioElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `horse.ogg`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `horse.mp3`);
        var trackElems = audioElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `horse_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `horse_zh.vtt`);
      });

      it('capture.audio = link (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.audio": "link",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_audio/audio.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var audioElems = doc.querySelectorAll('audio');
        assert.strictEqual(audioElems[0].getAttribute('src'), `${localhost}/capture_audio/horse.mp3`);
        var sourceElems = audioElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `${localhost}/capture_audio/horse.ogg`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `${localhost}/capture_audio/horse.mp3`);
        var trackElems = audioElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `${localhost}/capture_audio/horse_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `${localhost}/capture_audio/horse_zh.vtt`);
      });

      it('capture.audio = blank (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.audio": "blank",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_audio/audio.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var audioElems = doc.querySelectorAll('audio');
        assert.strictEqual(audioElems[0].getAttribute('src'), `about:blank`);
        var sourceElems = audioElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `about:blank`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `about:blank`);
        var trackElems = audioElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `about:blank`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `about:blank`);
      });

      it('capture.audio = remove (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.audio": "remove",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_audio/audio.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var audioElems = doc.querySelectorAll('audio');
        assert.strictEqual(audioElems.length, 0);
        var sourceElems = doc.querySelectorAll('source');
        assert.strictEqual(sourceElems.length, 0);
        var trackElems = doc.querySelectorAll('track');
        assert.strictEqual(trackElems.length, 0);
      });
    });
  });

  describe('video element', function () {
    describe('basic', function () {
      // Use headless for most test cases since loading video in the browser is slow.

      it('capture.video = save (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.video": "save",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_video/video.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('small.mp4'));
        assert.exists(zip.file('small.webm'));
        assert.exists(zip.file('small_en.vtt'));
        assert.exists(zip.file('small_zh.vtt'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var videoElems = doc.querySelectorAll('video');
        assert.strictEqual(videoElems[0].getAttribute('src'), `small.mp4`);
        assert.strictEqual(videoElems[0].getAttribute('poster'), `yellow.bmp`);
        var sourceElems = videoElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `small.webm`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `small.mp4`);
        var trackElems = videoElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `small_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `small_zh.vtt`);
      });

      it('capture.video = save-current', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.video": "save-current",
        });
        var blob = await capture({
          url: `${localhost}/capture_video/video.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert(Object.keys(zip.files).length > 1);
        assert.exists(zip.file('small_en.vtt'));
        assert.exists(zip.file('small_zh.vtt'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var videoElems = doc.querySelectorAll('video');
        assert.strictEqual(videoElems[0].getAttribute('src'), `small.mp4`);
        assert.strictEqual(videoElems[0].getAttribute('poster'), `yellow.bmp`);
        assert([`small.mp4`, `small.webm`].includes(videoElems[1].getAttribute('src')));
        var sourceElems = videoElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems.length, 0);
        var trackElems = videoElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `small_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `small_zh.vtt`);
      });

      it('capture.video = save-current (headless)', async function () {
        // the result is same as save
        var options = Object.assign({}, baseOptions, {
          "capture.video": "save-current",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_video/video.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('small.mp4'));
        assert.exists(zip.file('small.webm'));
        assert.exists(zip.file('small_en.vtt'));
        assert.exists(zip.file('small_zh.vtt'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var videoElems = doc.querySelectorAll('video');
        assert.strictEqual(videoElems[0].getAttribute('src'), `small.mp4`);
        assert.strictEqual(videoElems[0].getAttribute('poster'), `yellow.bmp`);
        var sourceElems = videoElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `small.webm`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `small.mp4`);
        var trackElems = videoElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `small_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `small_zh.vtt`);
      });

      it('capture.video = link (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.video": "link",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_video/video.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var videoElems = doc.querySelectorAll('video');
        assert.strictEqual(videoElems[0].getAttribute('src'), `${localhost}/capture_video/small.mp4`);
        assert.strictEqual(videoElems[0].getAttribute('poster'), `${localhost}/capture_video/yellow.bmp`);
        var sourceElems = videoElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `${localhost}/capture_video/small.webm`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `${localhost}/capture_video/small.mp4`);
        var trackElems = videoElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `${localhost}/capture_video/small_en.vtt`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `${localhost}/capture_video/small_zh.vtt`);
      });

      it('capture.video = blank (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.video": "blank",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_video/video.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var videoElems = doc.querySelectorAll('video');
        assert.strictEqual(videoElems[0].getAttribute('src'), `about:blank`);
        assert(!videoElems[0].hasAttribute('poster'));
        var sourceElems = videoElems[1].querySelectorAll('source');
        assert.strictEqual(sourceElems[0].getAttribute('src'), `about:blank`);
        assert.strictEqual(sourceElems[1].getAttribute('src'), `about:blank`);
        var trackElems = videoElems[1].querySelectorAll('track');
        assert.strictEqual(trackElems[0].getAttribute('src'), `about:blank`);
        assert.strictEqual(trackElems[1].getAttribute('src'), `about:blank`);
      });

      it('capture.video = remove (headless)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.video": "remove",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_video/video.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var videoElems = doc.querySelectorAll('video');
        assert.strictEqual(videoElems.length, 0);
        var sourceElems = doc.querySelectorAll('source');
        assert.strictEqual(sourceElems.length, 0);
        var trackElems = doc.querySelectorAll('track');
        assert.strictEqual(trackElems.length, 0);
      });
    });
  });

  describe('canvas element', function () {
    describe('basic', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.script": "remove",
        "capture.recordRewrites": true,
      });

      it('capture.canvas = save', async function () {
        options["capture.canvas"] = "save";
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        assert(!doc.querySelector('#c1').hasAttribute("data-scrapbook-canvas"));
        assert(doc.querySelector('#c2').getAttribute("data-scrapbook-canvas").match(rawRegex`${'^'}data:image/png;base64,`));
        assertNoRecord(doc.querySelector('#c2'));

        // canvas in the shadow DOM
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas_shadow.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        var host = doc.querySelector('span');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;
        assert(shadow.querySelector('canvas').getAttribute('data-scrapbook-canvas').match(rawRegex`${'^'}data:image/png;base64,`));
        assertNoRecord(shadow.querySelector('canvas'));
      });

      it('capture.canvas = blank', async function () {
        options["capture.canvas"] = "blank";
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));
        assert(!doc.querySelector('#c1').hasAttribute("data-scrapbook-canvas"));
        assert(!doc.querySelector('#c2').hasAttribute("data-scrapbook-canvas"));

        // canvas in the shadow DOM
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas_shadow.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        var host = doc.querySelector('span');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;
        assert(!shadow.querySelector('canvas').hasAttribute('data-scrapbook-canvas'));
      });

      it('capture.canvas = remove', async function () {
        options["capture.canvas"] = "remove";
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));
        assert.notExists(doc.querySelector('#c1'));
        assert.notExists(doc.querySelector('#c2'));

        // canvas in the shadow DOM
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas_shadow.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        var host = doc.querySelector('span');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;
        assert(!shadow.querySelector('canvas'));
      });
    });

    describe('webgl', function () {
      it('should save the content of a webgl canvas with `preserveDrawingBuffer` = true', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.canvas": "save",
          "capture.script": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_canvas/canvas_webgl.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        assert(doc.querySelector('canvas').getAttribute("data-scrapbook-canvas").match(rawRegex`${'^'}data:image/png;base64,`));
      });
    });
  });

  describe('embed element', function () {
    describe('basic', function () {
      it('capture.embed = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.embed": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_embed/embed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('helloworld.swf'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var embed = doc.querySelector('embed');
        assert.strictEqual(embed.getAttribute('src'), `helloworld.swf`);
      });

      it('capture.embed = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.embed": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_embed/embed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var embed = doc.querySelector('embed');
        assert.strictEqual(embed.getAttribute('src'), `${localhost}/capture_embed/helloworld.swf`);
      });

      it('capture.embed = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.embed": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_embed/embed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var embed = doc.querySelector('embed');
        assert(!embed.hasAttribute('src'));
      });

      it('capture.embed = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.embed": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_embed/embed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var embed = doc.querySelector('embed');
        assert.notExists(embed);
      });
    });

    describe('page', function () {
      it('should capture headlessly like a frame', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
          "capture.embed": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_embed_frame/cross_origin.py`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('embed');

        // frame1.html
        var frame = frames[0];
        assert.strictEqual(frame.getAttribute('src'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        // frame2.xhtml
        var frame = frames[1];
        assert.strictEqual(frame.getAttribute('src'), `index_2.xhtml`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        // frame3.svg
        var frame = frames[2];
        assert.strictEqual(frame.getAttribute('src'), `index_3.svg`);
        var frameFile = zip.file(frame.getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost2}/capture_embed_frame/cross_origin.py`);

        // frame4.txt
        var frame = frames[3];
        assert.strictEqual(frame.getAttribute('src'), 'frame4.txt');
        var frameFile = zip.file(frame.getAttribute('src'));
        var text = (await readFileAsText(await frameFile.async('blob'))).trim();
        assert.strictEqual(text, `<!DOCTYPE>
<style>img { width: 60px; }</style>
<p>Frame page content.</p>
<img src="./red.bmp">`);
      });
    });

    describe('about: page', function () {
      it('should keep as-is', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
          "capture.embed": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_embed_frame/about.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('embed');
        assert.strictEqual(frames[0].getAttribute('src'), "about:blank");
        assert.strictEqual(frames[1].getAttribute('src'), "about:blank?foo=bar#baz");
        assert.strictEqual(frames[2].getAttribute('src'), "about:srcdoc");
        assert.strictEqual(frames[3].getAttribute('src'), "about:invalid");
      });
    });

    describe('circular', function () {
      it('capture.saveAs = zip', async function () {
        // link to corresponding downloaded frame file
        var options = Object.assign({}, baseOptions, {
          "capture.embed": "save",
          "capture.saveAs": "zip",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_embed_circular/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // frame1.html
        var frame = doc.querySelector('embed');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index_1.html');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        // frame2.html
        var frame = frameDoc.querySelector('embed');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index_2.html');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        // index.html
        var frame = frameDoc.querySelector('embed');
        var frameSrc = frame.getAttribute('src');
        assert.strictEqual(frameSrc, 'index.html');
      });

      it('capture.saveAs = singleHtml', async function () {
        // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
        var options = Object.assign({}, baseOptions, {
          "capture.embed": "save",
          "capture.saveAs": "singleHtml",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_embed_circular/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        // frame1.html
        var frame = doc.querySelector('embed');
        var frameSrc = frame.getAttribute('src');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // frame2.html
        var frame = frameDoc.querySelector('embed');
        var frameSrc = frame.getAttribute('src');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // index.html
        var frame = frameDoc.querySelector('embed');
        assert.strictEqual(frame.getAttribute('src'), `urn:scrapbook:download:circular:url:${localhost}/capture_embed_circular/index.html`);
      });
    });
  });

  describe('object element', function () {
    describe('basic', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.frameRename": false,
        "capture.saveResourcesSequentially": true,
      });

      it('capture.object = save', async function () {
        options["capture.object"] = "save";
        var blob = await capture({
          url: `${localhost}/capture_object/object.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('demo.svg'));
        assert.exists(zip.file('green.bmp'));
        assert.exists(zip.file('demo2.svg'));
        assert.exists(zip.file('green2.bmp'));
        assert.exists(zip.file('demo-1.svg'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var objects = doc.querySelectorAll('object');
        assert.strictEqual(objects[0].getAttribute('data'), `demo.svg`);
        assert.strictEqual(objects[1].getAttribute('data'), `green.bmp`);
        assert.strictEqual(objects[2].getAttribute('data'), `demo2.svg`);
        assert(!objects[2].hasAttribute('codebase'));
        assert.strictEqual(objects[3].getAttribute('data'), `green2.bmp`);
        assert(!objects[3].hasAttribute('codebase'));
        assert.strictEqual(objects[4].getAttribute('archive'), `demo-1.svg green.bmp`);
      });

      it('capture.object = link', async function () {
        options["capture.object"] = "link";
        var blob = await capture({
          url: `${localhost}/capture_object/object.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var objects = doc.querySelectorAll('object');
        assert.strictEqual(objects[0].getAttribute('data'), `${localhost}/capture_object/demo.svg`);
        assert.strictEqual(objects[1].getAttribute('data'), `${localhost}/capture_object/green.bmp`);
        assert.strictEqual(objects[2].getAttribute('data'), `${localhost}/capture_object/resources/demo2.svg`);
        assert(!objects[2].hasAttribute('codebase'));
        assert.strictEqual(objects[3].getAttribute('data'), `${localhost}/capture_object/resources/green2.bmp`);
        assert(!objects[3].hasAttribute('codebase'));
        assert.strictEqual(objects[4].getAttribute('archive'), `${localhost}/capture_object/demo.svg ${localhost}/capture_object/green.bmp`);
      });

      it('capture.object = blank', async function () {
        options["capture.object"] = "blank";
        var blob = await capture({
          url: `${localhost}/capture_object/object.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var objects = doc.querySelectorAll('object');
        assert(!objects[0].hasAttribute('data'));
        assert(!objects[1].hasAttribute('data'));
        assert(!objects[2].hasAttribute('data'));
        assert(!objects[2].hasAttribute('codebase'));
        assert(!objects[3].hasAttribute('data'));
        assert(!objects[3].hasAttribute('codebase'));
        assert(!objects[4].hasAttribute('archive'));
      });

      it('capture.object = remove', async function () {
        options["capture.object"] = "remove";
        var blob = await capture({
          url: `${localhost}/capture_object/object.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notExists(doc.querySelector('object'));
      });
    });

    describe('page', function () {
      it('should capture headlessly like a frame', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
          "capture.object": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_object_frame/cross_origin.py`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('object');

        // frame1.html
        var frame = frames[0];
        assert.strictEqual(frame.getAttribute('data'), `index_1.html`);
        var frameFile = zip.file(frame.getAttribute('data'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame1 content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        var imgFile = zip.file('red.bmp');
        assert.exists(imgFile);
        var imgData = await imgFile.async('base64');
        assert.strictEqual(imgData, 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAAD/AAAA');

        // frame2.xhtml
        var frame = frames[1];
        assert.strictEqual(frame.getAttribute('data'), `index_2.xhtml`);
        var frameFile = zip.file(frame.getAttribute('data'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "application/xhtml+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('p').textContent.trim(), `frame2 content`);
        assert.strictEqual(frameDoc.querySelector('img').getAttribute('src'), 'red.bmp');

        // frame3.svg
        var frame = frames[2];
        assert.strictEqual(frame.getAttribute('data'), `index_3.svg`);
        var frameFile = zip.file(frame.getAttribute('data'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "image/svg+xml"});
        var frameDoc = await readFileAsDocument(frameBlob);
        assert.strictEqual(frameDoc.querySelector('a').getAttribute("href").trim(), `${localhost2}/capture_object_frame/cross_origin.py`);

        // frame4.txt
        var frame = frames[3];
        assert.strictEqual(frame.getAttribute('data'), 'frame4.txt');
        var frameFile = zip.file(frame.getAttribute('data'));
        var text = (await readFileAsText(await frameFile.async('blob'))).trim();
        assert.strictEqual(text, `<!DOCTYPE>
<style>img { width: 60px; }</style>
<p>Frame page content.</p>
<img src="./red.bmp">`);
      });
    });

    describe('about: page', function () {
      it('should keep as-is', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
          "capture.object": "save",
        });

        var blob = await capture({
          url: `${localhost}/capture_object_frame/about.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var frames = doc.querySelectorAll('object');
        assert.strictEqual(frames[0].getAttribute('data'), "about:blank");
        assert.strictEqual(frames[1].getAttribute('data'), "about:blank?foo=bar#baz");
        assert.strictEqual(frames[2].getAttribute('data'), "about:srcdoc");
        assert.strictEqual(frames[3].getAttribute('data'), "about:invalid");
      });
    });

    describe('circular', function () {
      it('capture.saveAs = zip', async function () {
        // link to corresponding downloaded frame file
        var options = Object.assign({}, baseOptions, {
          "capture.object": "save",
          "capture.saveAs": "zip",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_object_circular/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // frame1.html
        var frame = doc.querySelector('object');
        var frameSrc = frame.getAttribute('data');
        assert.strictEqual(frameSrc, 'index_1.html');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        // frame2.html
        var frame = frameDoc.querySelector('object');
        var frameSrc = frame.getAttribute('data');
        assert.strictEqual(frameSrc, 'index_2.html');
        var frameFile = zip.file(frameSrc);
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var frameDoc = await readFileAsDocument(frameBlob);

        // index.html
        var frame = frameDoc.querySelector('object');
        var frameSrc = frame.getAttribute('data');
        assert.strictEqual(frameSrc, 'index.html');
      });

      it('capture.saveAs = singleHtml', async function () {
        // rewrite a circular referencing with urn:scrapbook:download:circular:url:...
        var options = Object.assign({}, baseOptions, {
          "capture.object": "save",
          "capture.saveAs": "singleHtml",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_object_circular/index.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);

        // frame1.html
        var frame = doc.querySelector('object');
        var frameSrc = frame.getAttribute('data');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // frame2.html
        var frame = frameDoc.querySelector('object');
        var frameSrc = frame.getAttribute('data');
        var frameDoc = (await xhr({url: frameSrc, responseType: "document"})).response;

        // index.html
        var frame = frameDoc.querySelector('object');
        assert.strictEqual(frame.getAttribute('data'), `urn:scrapbook:download:circular:url:${localhost}/capture_object_circular/index.html`);
      });
    });
  });

  describe('applet element', function () {
    describe('basic', function () {
      it('capture.applet = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.applet": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_applet/applet.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('applet.class'));
        assert.exists(zip.file('applet.jar'));
        assert.exists(zip.file('applet2.class'));
        assert.exists(zip.file('applet2.jar'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var applets = doc.querySelectorAll('applet');
        assert.strictEqual(applets[0].getAttribute('code'), `applet.class`);
        assert.strictEqual(applets[0].getAttribute('archive'), `applet.jar`);
        assert.strictEqual(applets[1].getAttribute('code'), `applet2.class`);
        assert.strictEqual(applets[1].getAttribute('archive'), `applet2.jar`);
        assert(!applets[1].hasAttribute('codebase'));
      });

      it('capture.applet = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.applet": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_applet/applet.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var applets = doc.querySelectorAll('applet');
        assert.strictEqual(applets[0].getAttribute('code'), `${localhost}/capture_applet/applet.class`);
        assert.strictEqual(applets[0].getAttribute('archive'), `${localhost}/capture_applet/applet.jar`);
        assert.strictEqual(applets[1].getAttribute('code'), `${localhost}/capture_applet/resources/applet2.class`);
        assert.strictEqual(applets[1].getAttribute('archive'), `${localhost}/capture_applet/resources/applet2.jar`);
        assert(!applets[1].hasAttribute('codebase'));
      });

      it('capture.applet = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.applet": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_applet/applet.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var applets = doc.querySelectorAll('applet');
        assert(!applets[0].hasAttribute('code'));
        assert(!applets[0].hasAttribute('archive'));
        assert(!applets[1].hasAttribute('code'));
        assert(!applets[1].hasAttribute('archive'));
        assert(!applets[1].hasAttribute('codebase'));
      });

      it('capture.applet = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.applet": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_applet/applet.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notExists(doc.querySelector('applet'));
      });
    });
  });

  describe('template element', function () {
    /**
     * Check if template content is captured.
     *
     * - Getting/setting template.innerHTML/outerHTML is redirected to handle
     *   template.content, which is a hidden DocumentFragment.
     * - Getting/setting template.textContent or template.appendChild handles
     *   its childNodes. By default a templates is styled display: none, but can
     *   be changed by CSS.
     */
    describe('basic', function () {
      it('capture tab', async function () {
        var blob = await capture({
          url: `${localhost}/capture_template/template.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('template').innerHTML.trim(), `\
<img src="./nonexist.bmp">
<a href="./nonexist.html">anchor</a>`);
      });

      it('capture headless', async function () {
        var blob = await captureHeadless({
          url: `${localhost}/capture_template/template.html`,
          options: baseOptions,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('template').innerHTML.trim(), `\
<img src="./nonexist.bmp">
<a href="./nonexist.html">anchor</a>`);
      });
    });
  });

  describe('form status handling', function () {
    describe('basic', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.recordRewrites": true,
      });

      it('capture.formStatus = save-all', async function () {
        options["capture.formStatus"] = "save-all";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(!doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[0].getAttribute('data-scrapbook-input-checked'), 'true');
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[3].getAttribute('data-scrapbook-input-checked'), 'false');
        assert(!doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute('data-scrapbook-input-checked'), 'true');
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute('data-scrapbook-input-checked'), 'false');
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
        assert(!doc.querySelector('input[type="text"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute('data-scrapbook-input-value'), "myname");
        assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="password"]').getAttribute('data-scrapbook-input-value'), "mypassword");
        assert(!doc.querySelector('input[type="number"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute('data-scrapbook-input-value'), "3");
        assert(!doc.querySelector('input[type="search"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute('data-scrapbook-input-value'), "search input");
        assert(!doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="color"]').hasAttribute('data-scrapbook-input-value'));
        assert(!doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="range"]').hasAttribute('data-scrapbook-input-value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "");
        assert.strictEqual(doc.querySelector('textarea').getAttribute('data-scrapbook-textarea-value'), "textarea input");
        assert(!doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert.strictEqual(doc.querySelectorAll('option')[0].getAttribute('data-scrapbook-option-selected'), "true");
        assert(doc.querySelectorAll('option')[1].hasAttribute('selected'));
        assert.strictEqual(doc.querySelectorAll('option')[1].getAttribute('data-scrapbook-option-selected'), "false");

        // check records
        // no attribute change except for added "data-scrapbook-*" ones
        assertNoRecord(doc);
      });

      it('capture.formStatus = save', async function () {
        options["capture.formStatus"] = "save";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(!doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[0].getAttribute('data-scrapbook-input-checked'), 'true');
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[3].getAttribute('data-scrapbook-input-checked'), 'false');
        assert(!doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute('data-scrapbook-input-checked'), 'true');
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute('data-scrapbook-input-checked'), 'false');
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
        assert(!doc.querySelector('input[type="text"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute('data-scrapbook-input-value'), "myname");
        assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
        assert(!doc.querySelector('input[type="password"]').hasAttribute('data-scrapbook-input-value'));
        assert(!doc.querySelector('input[type="number"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute('data-scrapbook-input-value'), "3");
        assert(!doc.querySelector('input[type="search"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute('data-scrapbook-input-value'), "search input");
        assert(!doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="color"]').hasAttribute('data-scrapbook-input-value'));
        assert(!doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="range"]').hasAttribute('data-scrapbook-input-value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "");
        assert.strictEqual(doc.querySelector('textarea').getAttribute('data-scrapbook-textarea-value'), "textarea input");
        assert(!doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert.strictEqual(doc.querySelectorAll('option')[0].getAttribute('data-scrapbook-option-selected'), "true");
        assert(doc.querySelectorAll('option')[1].hasAttribute('selected'));
        assert.strictEqual(doc.querySelectorAll('option')[1].getAttribute('data-scrapbook-option-selected'), "false");

        // check records
        // no attribute change except for added "data-scrapbook-*" ones
        assertNoRecord(doc);
      });

      it('capture.formStatus = keep-all', async function () {
        options["capture.formStatus"] = "keep-all";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute('value'), "myname");
        assert.strictEqual(doc.querySelector('input[type="password"]').getAttribute('value'), "mypassword");
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute('value'), "3");
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute('value'), "search input");
        assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "textarea input");
        assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

        // check records
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="password"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`), ``);
        assertNoRecord(doc, {filter: 'scrapbook'});
      });

      it('capture.formStatus = keep', async function () {
        options["capture.formStatus"] = "keep";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute('value'), "myname");
        assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute('value'), "3");
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute('value'), "search input");
        assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "textarea input");
        assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

        // check records
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assertNoRecord(doc.querySelector('input[type="password"]'));
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`), ``);
        assertNoRecord(doc, {filter: 'scrapbook'});
      });

      it('capture.formStatus = html-all', async function () {
        options["capture.formStatus"] = "html-all";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute('value'), "myname");
        assert.strictEqual(doc.querySelector('input[type="password"]').getAttribute('value'), "mypassword");
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute('value'), "3");
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute('value'), "search input");
        assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "textarea input");
        assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

        // check records
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="password"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`), ``);
        assertNoRecord(doc, {filter: 'scrapbook'});
      });

      it('capture.formStatus = html', async function () {
        options["capture.formStatus"] = "html";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[4].hasAttribute('data-scrapbook-input-indeterminate'));
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute('value'), "myname");
        assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute('value'), "3");
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute('value'), "search input");
        assert(doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "textarea input");
        assert(doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert(!doc.querySelectorAll('option')[1].hasAttribute('selected'));

        // check records
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="radio"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="radio"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[0].getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[1]);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[2]);
        assert.strictEqual(doc.querySelectorAll('input[type="checkbox"]')[3].getAttribute(`data-scrapbook-orig-attr-checked-${timeId}`), ``);
        assertNoRecord(doc.querySelectorAll('input[type="checkbox"]')[4]);
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assertNoRecord(doc.querySelector('input[type="password"]'));
        assert.strictEqual(doc.querySelector('input[type="number"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="search"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="color"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="range"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[0].getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('option')[1].getAttribute(`data-scrapbook-orig-attr-selected-${timeId}`), ``);
        assertNoRecord(doc, {filter: 'scrapbook'});
      });

      it('capture.formStatus = reset', async function () {
        options["capture.formStatus"] = "reset";
        var blob = await capture({
          url: `${localhost}/capture_form/form-status.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert(!doc.querySelectorAll('input[type="radio"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="radio"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="radio"]')[2].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[0].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[1].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[2].hasAttribute('checked'));
        assert(doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('checked'));
        assert(!doc.querySelectorAll('input[type="checkbox"]')[3].hasAttribute('data-scrapbook-input-indeterminate'));
        assert(!doc.querySelector('input[type="text"]').hasAttribute('value'));
        assert(!doc.querySelector('input[type="password"]').hasAttribute('value'));
        assert(!doc.querySelector('input[type="number"]').hasAttribute('value'));
        assert(!doc.querySelector('input[type="search"]').hasAttribute('value'));
        assert(!doc.querySelector('input[type="color"]').hasAttribute('value'));
        assert(!doc.querySelector('input[type="range"]').hasAttribute('value'));
        assert.strictEqual(doc.querySelector('textarea').textContent, "");
        assert(!doc.querySelectorAll('option')[0].hasAttribute('selected'));
        assert(doc.querySelectorAll('option')[1].hasAttribute('selected'));

        // check records
        assertNoRecord(doc);
      });
    });
  });

  describe('SVG handling', function () {
    describe('basic', function () {
      it('embed.html', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "save",
          "capture.script": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_svg/embed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));
        assert.exists(zip.file("blue.bmp"));
        assert.exists(zip.file("script.js"));
        assert.exists(zip.file("script2.js"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('svg a')[0].getAttribute('href'), `${localhost}/capture_svg/resources/green.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href'), `${localhost}/capture_svg/resources/blue.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg image')[0].getAttribute('href'), `green.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg image')[1].getAttribute('xlink:href'), `blue.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg use')[0].getAttribute('href'), `#img1`);
        assert.strictEqual(doc.querySelectorAll('svg use')[1].getAttribute('xlink:href'), `#img2`);
        assert.strictEqual(doc.querySelectorAll('svg script')[0].getAttribute('href'), `script.js`);
        assert.strictEqual(doc.querySelectorAll('svg script')[1].getAttribute('xlink:href'), `script2.js`);
      });

      it('external.svg', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "save",
          "capture.script": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_svg/external.svg`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("index.svg"));
        assert.exists(zip.file("green.bmp"));

        var indexFile = zip.file('index.svg');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('svg a')[0].getAttribute('href'), `${localhost}/capture_svg/resources/green.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href'), `${localhost}/capture_svg/resources/blue.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg image')[0].getAttribute('href'), `green.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg image')[1].getAttribute('xlink:href'), `blue.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg use')[0].getAttribute('href'), `#img1`);
        assert.strictEqual(doc.querySelectorAll('svg use')[1].getAttribute('xlink:href'), `#img2`);
        assert.strictEqual(doc.querySelectorAll('svg script')[0].getAttribute('href'), `script.js`);
        assert.strictEqual(doc.querySelectorAll('svg script')[1].getAttribute('xlink:href'), `script2.js`);
      });
    });
  });

  describe('MathML handling', function () {
    describe('basic', function () {
      it('embed.html', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.image": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_mathml/embed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('math')[0].getAttribute('href'), `${localhost}/capture_mathml/resources/green.bmp`);
        assert.strictEqual(doc.querySelectorAll('math msup')[0].getAttribute('href'), `${localhost}/capture_mathml/resources/red.bmp`);
        assert.strictEqual(doc.querySelectorAll('math mi')[2].getAttribute('href'), `${localhost}/capture_mathml/resources/blue.bmp`);
      });
    });
  });

  describe('namespace handling', function () {
    it('should save `style`/`script` elements in another namespace', async function () {
      var blob = await capture({
        url: `${localhost}/capture_namespace/namespace.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      var styleElems = doc.querySelectorAll('style');
      assert.strictEqual(styleElems[0].innerHTML.trim(), `body > #html { background: green; }`);
      assert.strictEqual(styleElems[1].innerHTML.trim(), `body > #non-html { background: green; }`);
      assert.strictEqual(styleElems[2].innerHTML.trim(), `#svg &gt; circle { fill: green; }`);
      assert.strictEqual(styleElems[3].innerHTML.trim(), `#non-svg &gt; circle { fill: green; }`);

      var scriptElems = doc.querySelectorAll('script');
      assert.strictEqual(scriptElems[0].innerHTML.trim(), `console.log("head > html script")`);
      assert.strictEqual(scriptElems[1].innerHTML.trim(), `console.log("head > non-html script")`);
      assert.strictEqual(scriptElems[2].innerHTML.trim(), `console.log("svg &gt; svg script")`);
      assert.strictEqual(scriptElems[3].innerHTML.trim(), `console.log("svg &gt; html script")`);
    });
  });

  describe('invalid tags', function () {
    it('should escape bad tag content for security', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "save",
        "capture.script": "save",
      });

      var blob = await capture({
        url: `${localhost}/capture_invalid_tags/index.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.strictEqual(doc.querySelector('xmp').textContent.trim(), r`Explode <\/xmp> with a bomb!<script>alert("bomb");</script>`);
      assert.strictEqual(doc.querySelector('style').textContent.trim(), r`/*Explode <\/style> with a bomb!<script>alert("bomb");</script>*/`);
      assert.strictEqual(doc.querySelector('script').textContent.trim(), r`/*Explode <\/script> with a bomb!<script>alert("bomb");<\/script>*/`);
    });
  });

  /**
   * capturer.captureDocument
   */
  describe('recursive', function () {
    it('should work correctly when parent is to be removed and child is to be captured', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "remove",
        "capture.script": "save",
      });
      var blob = await capture({
        url: `${localhost}/capture_recursive/index.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      assert.exists(zip.file("index.html"));
      assert.notExists(zip.file("red.bmp"));
      assert.notExists(zip.file("blue.bmp"));

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.notExists(doc.querySelector('picture'));
      assert.notExists(doc.querySelector('img'));
      assert.notExists(doc.querySelector('script'));
    });
  });

  describe('removeHidden', function () {
    it('capture.removeHidden = undisplayed', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.removeHidden": "undisplayed",
      });

      var blob = await capture({
        url: `${localhost}/capture_removeHidden/index.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      assert.exists(zip.file("index.html"));
      assert.notExists(zip.file("red.bmp"));

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.notExists(doc.querySelector('p'));
      assert.notExists(doc.querySelector('blockquote'));
      assert.notExists(doc.querySelector('img'));

      // these elements should not be altered anyway
      assert.exists(doc.querySelector('html'));
      assert.exists(doc.querySelector('head'));
      assert.exists(doc.querySelector('meta'));
      assert.exists(doc.querySelector('title'));
      assert.exists(doc.querySelector('style'));
      assert.exists(doc.querySelector('link[rel="stylesheet"]'));
      assert.exists(doc.querySelector('body'));
      assert.exists(doc.querySelector('noscript'));
      assert.exists(doc.querySelector('template'));
    });

    it('capture.removeHidden = none', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.removeHidden": "none",
      });

      var blob = await capture({
        url: `${localhost}/capture_removeHidden/index.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      assert.exists(zip.file("index.html"));
      assert.exists(zip.file("red.bmp"));

      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.exists(doc.querySelector('p'));
      assert.exists(doc.querySelector('blockquote'));

      assert.exists(doc.querySelector('img'));
      assert.exists(doc.querySelector('html'));
      assert.exists(doc.querySelector('head'));
      assert.exists(doc.querySelector('meta'));
      assert.exists(doc.querySelector('title'));
      assert.exists(doc.querySelector('style'));
      assert.exists(doc.querySelector('link[rel="stylesheet"]'));
      assert.exists(doc.querySelector('body'));
      assert.exists(doc.querySelector('noscript'));
      assert.exists(doc.querySelector('template'));
    });
  });

  describe('cite element', function () {
    it('should rewrite the URL', async function () {
      var blob = await capture({
        url: `${localhost}/capture_cite/cite.html`,
        options: baseOptions,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      assert.strictEqual(doc.querySelector('q').getAttribute('cite'), `${localhost}/capture_cite/test.html`);
      assert.strictEqual(doc.querySelector('blockquote').getAttribute('cite'), `${localhost}/capture_cite/test.html`);
      assert.strictEqual(doc.querySelector('ins').getAttribute('cite'), `${localhost}/capture_cite/test.html`);
      assert.strictEqual(doc.querySelector('del').getAttribute('cite'), `${localhost}/capture_cite/test.html`);
    });
  });

  describe('preload', function () {
    it('capture.preload = blank', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.preload": "blank",
      });
      var blob = await capture({
        url: `${localhost}/capture_preload/preload.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      var preloads = doc.querySelectorAll('link[rel="preload"]');
      assert(!preloads[0].hasAttribute('href'));
      assert(!preloads[1].hasAttribute('href'));
      assert(!preloads[2].hasAttribute('href'));
      assert(!preloads[3].hasAttribute('href'));
      assert(!preloads[4].hasAttribute('imagesrcset'));
      var preloads = doc.querySelectorAll('link[rel="modulepreload"]');
      assert(!preloads[0].hasAttribute('href'));
      var preloads = doc.querySelectorAll('link[rel="dns-prefetch"]');
      assert(!preloads[0].hasAttribute('href'));
      var preloads = doc.querySelectorAll('link[rel="preconnect"]');
      assert(!preloads[0].hasAttribute('href'));
    });

    it('capture.preload = remove', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.preload": "remove",
      });
      var blob = await capture({
        url: `${localhost}/capture_preload/preload.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      assert.notExists(doc.querySelector('link[rel="preload"]'));
      assert.notExists(doc.querySelector('link[rel="modulepreload"]'));
      assert.notExists(doc.querySelector('link[rel="dns-prefetch"]'));
      assert.notExists(doc.querySelector('link[rel="preconnect"]'));
    });
  });

  describe('prefetch', function () {
    it('capture.prefetch = blank', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.prefetch": "blank",
      });
      var blob = await capture({
        url: `${localhost}/capture_prefetch/prefetch.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      var prefetches = doc.querySelectorAll('link[rel="prefetch"]');
      assert(!prefetches[0].hasAttribute('href'));
      assert(!prefetches[1].hasAttribute('href'));
      assert(!prefetches[2].hasAttribute('href'));
      assert(!prefetches[3].hasAttribute('href'));
      var prefetches = doc.querySelectorAll('link[rel="prerender"]');
      assert(!prefetches[0].hasAttribute('href'));
    });

    it('capture.prefetch = remove', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.prefetch": "remove",
      });
      var blob = await capture({
        url: `${localhost}/capture_prefetch/prefetch.html`,
        options,
      });

      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);
      assert.notExists(doc.querySelector('link[rel="prefetch"]'));
      assert.notExists(doc.querySelector('link[rel="prerender"]'));
    });
  });

  describe('crossorigin attribute', function () {
    it('save', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.favicon": "save",
        "capture.audio": "save",
        "capture.video": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
      });

      var blob = await capture({
        url: `${localhost}/capture_crossorigin/crossorigin.py`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert(!doc.querySelector('link[rel~="stylesheet"]').hasAttribute('crossorigin'));
      assert(!doc.querySelector('link[rel~="icon"]').hasAttribute('crossorigin'));
      assert(!doc.querySelector('script').hasAttribute('crossorigin'));
      assert(!doc.querySelector('img').hasAttribute('crossorigin'));
      assert(!doc.querySelector('audio').hasAttribute('crossorigin'));
      assert(!doc.querySelector('video').hasAttribute('crossorigin'));
    });

    it('link', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "link",
        "capture.favicon": "link",
        "capture.audio": "link",
        "capture.video": "link",
        "capture.style": "link",
        "capture.script": "link",
      });

      var blob = await capture({
        url: `${localhost}/capture_crossorigin/crossorigin.py`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.strictEqual(doc.querySelector('link[rel~="stylesheet"]').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('script').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('img').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('audio').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('video').getAttribute('crossorigin'), '');
    });

    it('blank', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "blank",
        "capture.favicon": "blank",
        "capture.audio": "blank",
        "capture.video": "blank",
        "capture.style": "blank",
        "capture.script": "blank",
      });

      var blob = await capture({
        url: `${localhost}/capture_crossorigin/crossorigin.py`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.strictEqual(doc.querySelector('link[rel~="stylesheet"]').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('script').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('img').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('audio').getAttribute('crossorigin'), '');
      assert.strictEqual(doc.querySelector('video').getAttribute('crossorigin'), '');
    });
  });

  describe('integrity attribute', function () {
    it('save', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "save",
        "capture.script": "save",
        "capture.rewriteCss": "url",
      });

      var blob = await capture({
        url: `${localhost}/capture_integrity/integrity.html`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert(!doc.querySelector('link').hasAttribute('integrity'));
      assert(!doc.querySelector('script').hasAttribute('integrity'));
    });

    it('link', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "link",
        "capture.script": "link",
      });
      var blob = await capture({
        url: `${localhost}/capture_integrity/integrity.html`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert(!doc.querySelector('link').hasAttribute('integrity'));
      assert(!doc.querySelector('script').hasAttribute('integrity'));
    });

    it('blank', async function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "blank",
        "capture.script": "blank",
      });
      var blob = await capture({
        url: `${localhost}/capture_integrity/integrity.html`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert(!doc.querySelector('link').hasAttribute('integrity'));
      assert(!doc.querySelector('script').hasAttribute('integrity'));
    });
  });

  describe('referrer', function () {
    describe('capture.referrerPolicy', function () {
      it('capture.referrerPolicy = no-referrer', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "no-referrer",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, "");
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, "");
      });

      it('capture.referrerPolicy = origin', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "origin",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
      });

      it('capture.referrerPolicy = unsafe-url', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
      });

      it('capture.referrerPolicy = origin-when-cross-origin', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "origin-when-cross-origin",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
      });

      it('capture.referrerPolicy = same-origin', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "same-origin",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, "");
      });

      it('capture.referrerPolicy = no-referrer-when-downgrade', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "no-referrer-when-downgrade",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
      });

      it('capture.referrerPolicy = strict-origin', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "strict-origin",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
      });

      it('capture.referrerPolicy = strict-origin-when-cross-origin', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "strict-origin-when-cross-origin",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
      });
    });

    describe('capture.referrerSpoofSource', function () {
      it('should send the usual referrer if referrerSpoofSource = false', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
          "capture.referrerSpoofSource": false,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/index.py`);
      });

      it('should send spoofed referrer if referrerSpoofSource = true', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
          "capture.referrerSpoofSource": true,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer/referrer.py`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost2}/capture_referrer/referrer2.py`);
      });

      it('should send spoofed referrer if referrerSpoofSource = true (modified by referrerPolicy)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "origin",
          "capture.referrerSpoofSource": true,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer/index.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var file = zip.file('referrer.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
        var file = zip.file('referrer2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost2}/`);
      });
    });

    describe('referrer related attributes', function () {
      it('should prioritize `referrerpolicy` and `rel=noreferrer` attributes', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "py",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer_attr/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var file = zip.file('favicon.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('favicon_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, ``);

        var file = zip.file('stylesheet.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('stylesheet_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, ``);

        var file = zip.file('script.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('imgsrc.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('imgsrcset.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('iframe.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('a.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('a_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, ``);

        var file = zip.file('area.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('area_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, ``);
      });

      it('should prioritize capture.referrerPolicy with "+"-prefix the highest', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "+unsafe-url",
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "py",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer_attr/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var file = zip.file('favicon.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('favicon_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('stylesheet.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('stylesheet_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('script.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('imgsrc.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('imgsrcset.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('iframe.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('a.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('a_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('area.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);

        var file = zip.file('area_rel.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_attr/index.html`);
      });
    });

    describe('document referrer', function () {
      it('should prioritize `meta[name="referrer"]`', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "py",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer_doc/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var file = zip.file('style_import.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('style_font.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('style_bg.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('favicon.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('stylesheet.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('script.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('imgsrc.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('imgsrcset.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('iframe.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('a.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('area.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        // other
        var file = zip.file('table.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('tr.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('th.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('td.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('input.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('picture_source.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('audio.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('audio_source.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('audio_track.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('video.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('video_poster.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('video_source.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('video_track.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('embed.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('object.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('object_archive.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('applet.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('applet_archive.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        // svg
        var file = zip.file('svg_image.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('svg_imagex.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('svg_script.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('svg_scriptx.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('svg_a.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('svg_ax.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        // math
        var file = zip.file('math_msup.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);
      });

      it('should prioritize capture.referrerPolicy with "+"-prefix the highest', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "+unsafe-url",
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "py",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer_doc/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var file = zip.file('style_import.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('style_font.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('style_bg.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('favicon.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('stylesheet.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('script.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('imgsrc.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('imgsrcset.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('iframe.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('a.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('area.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('svg_image.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('svg_imagex.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('svg_script.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('svg_scriptx.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('svg_a.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('svg_ax.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);

        var file = zip.file('math_msup.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_doc/index.html`);
      });

      it('should honor the last `meta[name="referrer"]` before the rewritten URL', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "py",
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_referrer_dynamic/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var file = zip.file('css1.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_dynamic/index.html`);

        var file = zip.file('css2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/`);

        var file = zip.file('css3.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, ``);
      });

      it('should ignore `meta[name="referrer"]` in a shadow root', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.referrerPolicy": "unsafe-url",
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "py",
        });
        var blob = await capture({
          url: `${localhost}/capture_referrer_dynamic_shadow/index.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var file = zip.file('css1.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_dynamic_shadow/index.html`);

        var file = zip.file('css2.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_dynamic_shadow/index.html`);

        var file = zip.file('css3.py');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `${localhost}/capture_referrer_dynamic_shadow/index.html`);
      });
    });

    describe('cross-origin CSS', function () {
      for (const rewriteCss of ["url", "tidy", "match"]) {
        it(`should apply referrer policy for cross-origin CSS (capture.rewriteCss = ${rewriteCss})`, async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.rewriteCss": rewriteCss,
            "capture.referrerPolicy": "",
          });
          var blob = await captureHeadless({
            url: `${localhost}/capture_referrer_cross_origin/index.py`,
            options,
          });
          var zip = await new JSZip().loadAsync(blob);

          var file = zip.file('css_bg.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_referrer_cross_origin/index.py`);

          var file = zip.file('css_style_bg.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_referrer_cross_origin/index.py`);

          var file = zip.file('css_style_font.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost}/capture_referrer_cross_origin/index.py`);

          var file = zip.file('css_style_import.py.css');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `:root { --referrer: "${localhost}/capture_referrer_cross_origin/index.py"; }`);

          var file = zip.file('css_link.py.css');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text.split('\n').pop(), `:root { --referrer: "${localhost}/capture_referrer_cross_origin/index.py"; }`);

          var file = zip.file('css_link_bg.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost2}/capture_referrer_cross_origin/css_link.py`);

          var file = zip.file('css_link_font.py');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `${localhost2}/capture_referrer_cross_origin/css_link.py`);

          var file = zip.file('css_link_import.py.css');
          var text = (await readFileAsText(await file.async('blob'))).trim();
          assert.strictEqual(text, `:root { --referrer: "${localhost2}/capture_referrer_cross_origin/css_link.py"; }`);
        });
      }
    });
  });

  describe('shadow root', function () {
    describe('should handle shadow DOMs according to capture.shadowDom', function () {
      it('capture.shadowDom = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "save",
          "capture.image": "save",
          "capture.script": "remove",
          "capture.recordRewrites": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/open.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));
        assert.exists(zip.file("blue.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host1 = doc.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
        var shadow1 = frag.content;
        assert.strictEqual(shadow1.querySelector('img').getAttribute('src'), `green.bmp`);

        var host2 = shadow1.querySelector('p');
        var frag = doc.createElement("template");
        frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
        var shadow2 = frag.content;
        assert.strictEqual(shadow2.querySelector('img').getAttribute('src'), `blue.bmp`);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        // check records
        assertNoRecord(host1);
        assertNoRecord(host2);
      });

      it('capture.shadowDom = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "remove",
          "capture.image": "save",
          "capture.script": "remove",
          "capture.recordRewrites": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/open.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.notExists(zip.file("green.bmp"));
        assert.notExists(zip.file("blue.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('[data-scrapbook-shadowroot]'));
        assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

        // check records
        var host1 = doc.querySelector('div');
        assertNoRecord(host1);
      });
    });

    $describe.skipIf(
      userAgent.is('chromium') && userAgent.major < 88,
      'retrieving closed shadow DOM is not supported in Chromium < 88',
    )('should handle closed shadow DOMs', function () {

      it('capture.shadowDom = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "save",
          "capture.image": "save",
          "capture.script": "remove",
          "capture.recordRewrites": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/closed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));
        assert.exists(zip.file("blue.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host1 = doc.querySelector('div');
        assert.strictEqual(host1.getAttribute("data-scrapbook-shadowdom-mode"), "closed");
        var frag = doc.createElement("template");
        frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
        var shadow1 = frag.content;
        assert.strictEqual(shadow1.querySelector('img').getAttribute('src'), `green.bmp`);

        var host2 = shadow1.querySelector('p');
        assert.strictEqual(host2.getAttribute("data-scrapbook-shadowdom-mode"), "closed");
        var frag = doc.createElement("template");
        frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
        var shadow2 = frag.content;
        assert.strictEqual(shadow2.querySelector('img').getAttribute('src'), `blue.bmp`);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        // check records
        assertNoRecord(host1);
        assertNoRecord(host2);
      });
    });

    $describe.skipIf($.noShadowRootClonable)('should handle clonable shadow DOMs', function () {
      it('capture.shadowDom = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "save",
          "capture.image": "save",
          "capture.script": "remove",
          "capture.recordRewrites": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/clonable.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));
        assert.exists(zip.file("blue.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host1 = doc.querySelector('div');
        assert(host1.hasAttribute("data-scrapbook-shadowdom-clonable"));
        var frag = doc.createElement("template");
        frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
        var shadow1 = frag.content;
        assert.strictEqual(shadow1.querySelector('img').getAttribute('src'), `green.bmp`);

        var host2 = shadow1.querySelector('p');
        assert(host2.hasAttribute("data-scrapbook-shadowdom-clonable"));
        var frag = doc.createElement("template");
        frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
        var shadow2 = frag.content;
        assert.strictEqual(shadow2.querySelector('img').getAttribute('src'), `blue.bmp`);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        // check records
        assertNoRecord(host1);
        assertNoRecord(host2);
      });

      it('capture.shadowDom = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "remove",
          "capture.image": "save",
          "capture.script": "remove",
          "capture.recordRewrites": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/clonable.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.notExists(zip.file("green.bmp"));
        assert.notExists(zip.file("blue.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('[data-scrapbook-shadowroot]'));
        assert.notExists(doc.querySelector('script[data-scrapbook-elem="basic-loader"]'));

        // check records
        var host1 = doc.querySelector('div');
        assertNoRecord(host1);
      });
    });

    $describe.skipIf($.noShadowRootDelegatesFocus)
        .skipIf($.noShadowRootSerializable)
        .skipIf($.noShadowRootSlotAssignment)('should handle further shadow DOM properties', function () {

      it('capture.shadowDom = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "save",
          "capture.recordRewrites": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/options.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host1 = doc.querySelector('div');
        assert(host1.hasAttribute("data-scrapbook-shadowdom-delegates-focus"));
        assert(host1.hasAttribute("data-scrapbook-shadowdom-serializable"));
        assert.strictEqual(host1.getAttribute("data-scrapbook-shadowdom-slot-assignment"), "manual");

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        // check records
        assertNoRecord(host1);
      });
    });

    $describe.skipIf($.noShadowRootSlotAssignment)('should handle slots', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.shadowDom": "save",
        "capture.recordRewrites": true,
      });

      it('slotAssignment = manual', async function () {
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/slot-manual.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var host = doc.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;

        var spans = host.querySelectorAll('span');
        assert.strictEqual(spans[0].getAttribute('data-scrapbook-slot-index'), "0");
        assert(!spans[1].hasAttribute('data-scrapbook-slot-index'));
        assert.strictEqual(spans[2].getAttribute('data-scrapbook-slot-index'), "2");
        assert.strictEqual(spans[3].getAttribute('data-scrapbook-slot-index'), "3");
        assert(!spans[4].hasAttribute('data-scrapbook-slot-index'));

        var node = spans[1].nextSibling;
        assert.strictEqual(node.nodeType, 8);
        assert.strictEqual(node.nodeValue, 'scrapbook-slot-index=1');
        var node = node.nextSibling;
        assert.strictEqual(node.nodeType, 3);
        assert.strictEqual(node.nodeValue.trim(), 'Default3');
        var node = node.nextSibling;
        assert.strictEqual(node.nodeType, 8);
        assert.strictEqual(node.nodeValue, '/scrapbook-slot-index');

        var slots = shadow.querySelectorAll('slot');
        assert.strictEqual(slots[0].getAttribute('data-scrapbook-slot-assigned'), "0,1");
        assert.strictEqual(slots[1].getAttribute('data-scrapbook-slot-assigned'), "2,3");

        var host2 = shadow.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
        var shadow2 = frag.content;

        var spans = host2.querySelectorAll('span');
        assert(!spans[0].hasAttribute('data-scrapbook-slot-index'));
        assert.strictEqual(spans[1].getAttribute('data-scrapbook-slot-index'), "4");
        assert.strictEqual(spans[2].getAttribute('data-scrapbook-slot-index'), "5");

        var slots = shadow2.querySelectorAll('slot');
        assert.strictEqual(slots[0].getAttribute('data-scrapbook-slot-assigned'), "4,5");

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        assertNoRecord(host);
        assertNoRecord(shadow);
        assertNoRecord(host2);
        assertNoRecord(shadow2);
      });

      it('slotAssignment = named', async function () {
        var blob = await capture({
          url: `${localhost}/capture_shadowRoot/slot-named.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var host = doc.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;

        var spans = host.querySelectorAll('span');
        var node = spans[1].nextSibling;
        assert.strictEqual(node.nodeType, 3);
        assert.strictEqual(node.nodeValue.trim(), 'Default3');
        assert.strictEqual(node.nextSibling, spans[2]);

        var host2 = shadow.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host2.getAttribute("data-scrapbook-shadowdom");
        var shadow2 = frag.content;

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));

        assertNoRecord(host);
        assertNoRecord(host, {filter: {regexAttr: /^data-scrapbook-slot-/}});
        assertNoRecord(shadow);
        assertNoRecord(shadow, {filter: {regexAttr: /^data-scrapbook-slot-/}});
        assertNoRecord(host2);
        assertNoRecord(host2, {filter: {regexAttr: /^data-scrapbook-slot-/}});
        assertNoRecord(shadow2);
        assertNoRecord(shadow2, {filter: {regexAttr: /^data-scrapbook-slot-/}});
      });
    });

    describe('should handle shadow DOMs auto-generated by custom elements', function () {
      it('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "save",
          "capture.image": "save",
          "capture.script": "remove",
        });

        var blob = await capture({
          url: `${localhost}/capture_shadowRoot_custom/open.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host1 = doc.querySelector('custom-elem');
        var frag = doc.createElement("template");
        frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
        var shadow1 = frag.content;
        assert.strictEqual(shadow1.querySelector('img').getAttribute('src'), `green.bmp`);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));
      });
    });

    $describe.skipIf(
      userAgent.is('chromium') && userAgent.major < 88,
      'retrieving closed shadow DOM is not supported in Chromium < 88',
    )('should be able to save closed shadow DOMs auto-generated by custom elements', function () {

      it('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.shadowDom": "save",
          "capture.image": "save",
          "capture.script": "remove",
        });

        var blob = await capture({
          url: `${localhost}/capture_shadowRoot_custom/closed.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host1 = doc.querySelector('custom-elem');
        assert.strictEqual(host1.getAttribute("data-scrapbook-shadowdom-mode"), "closed");
        var frag = doc.createElement("template");
        frag.innerHTML = host1.getAttribute("data-scrapbook-shadowdom");
        var shadow1 = frag.content;
        assert.strictEqual(shadow1.querySelector('img').getAttribute('src'), `green.bmp`);

        var loader = doc.querySelector('script[data-scrapbook-elem="basic-loader"]');
        assert(loader.textContent.trim().match(rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`));
      });
    });

    describe('should generate registry for valid custom elements', function () {
      it('capture.script = save', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "save",
        });
        var blob = await capture({
          url: `${localhost}/capture_custom_elements/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notExists(doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`));
      });

      it('capture.script = link', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "link",
        });
        var blob = await capture({
          url: `${localhost}/capture_custom_elements/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notExists(doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`));
      });

      it('capture.script = blank', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "blank",
        });
        var blob = await capture({
          url: `${localhost}/capture_custom_elements/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var value = doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`).textContent.trim();
        assert(value.match(rawRegex`${'^'}(function${'\\s*'}(${'\\w+'})${'\\s*'}{${'.+'}})(["custom-subelem","custom-elem"])${'$'}`));
      });

      it('capture.script = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_custom_elements/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var value = doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`).textContent.trim();
        assert(value.match(rawRegex`${'^'}(function${'\\s*'}(${'\\w+'})${'\\s*'}{${'.+'}})(["custom-subelem","custom-elem"])${'$'}`));
      });
    });

    describe('should not generate registry for invalid custom elements', function () {
      it('capture.script = remove', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.script": "remove",
        });
        var blob = await capture({
          url: `${localhost}/capture_custom_elements/bad.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.notExists(doc.querySelector(`script[data-scrapbook-elem="custom-elements-loader"]`));
      });
    });
  });

  describe('downLink', function () {
    describe('should handle linked files according to capture.downLink.file.mode', function () {
      it('capture.downLink.file.mode = header', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `txt, bmp, css, html`,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.exists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.exists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 8);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `file.bmp`);
        assert.strictEqual(anchors[1].getAttribute('href'), `file.css#123`);
        assert.strictEqual(anchors[2].getAttribute('href'), `page.html`);
        assert.strictEqual(anchors[3].getAttribute('href'), `file.txt`);
        assert.strictEqual(anchors[4].getAttribute('href'), `file2.txt`);
        assert.strictEqual(anchors[5].getAttribute('href'), `${localhost}/capture_downLink_file/unknown.py`);
        assert.strictEqual(anchors[6].getAttribute('href'), `file3.txt`);
        assert.strictEqual(anchors[7].getAttribute('href'), `${localhost}/capture_downLink_file/nofilename.py`);
        assert.strictEqual(anchors[8].getAttribute('href'), `redirect.txt`);

        // page should be saved as file (not rewritten)
        var file = zip.file('page.html');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>img {width: 60px;}</style>
</head>
<body>
<p><img src="./file.bmp"></p>
<p>Page content.</p>
</body>
</html>`);
      });

      it('capture.downLink.file.mode = url', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `txt, bmp, css, html`,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.exists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 5);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `file.bmp`);
        assert.strictEqual(anchors[1].getAttribute('href'), `file.css#123`);
        assert.strictEqual(anchors[2].getAttribute('href'), `page.html`);
        assert.strictEqual(anchors[3].getAttribute('href'), `file.txt`);
        assert.strictEqual(anchors[4].getAttribute('href'), `${localhost}/capture_downLink_file/mime.py`);
        assert.strictEqual(anchors[5].getAttribute('href'), `${localhost}/capture_downLink_file/unknown.py`);
        assert.strictEqual(anchors[6].getAttribute('href'), `${localhost}/capture_downLink_file/filename.py`);
        assert.strictEqual(anchors[7].getAttribute('href'), `${localhost}/capture_downLink_file/nofilename.py`);
        assert.strictEqual(anchors[8].getAttribute('href'), `${localhost}/capture_downLink_file/redirect.pyr`);

        // page should be saved as file (not rewritten)
        var file = zip.file('page.html');
        var text = (await readFileAsText(await file.async('blob'))).trim();
        assert.strictEqual(text, `\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>img {width: 60px;}</style>
</head>
<body>
<p><img src="./file.bmp"></p>
<p>Page content.</p>
</body>
</html>`);
      });

      it('capture.downLink.file.mode = none', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "none",
          "capture.downLink.file.extFilter": `txt, bmp, css, html`,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.notExists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `${localhost}/capture_downLink_file/file.bmp`);
        assert.strictEqual(anchors[1].getAttribute('href'), `${localhost}/capture_downLink_file/file.css#123`);
        assert.strictEqual(anchors[2].getAttribute('href'), `${localhost}/capture_downLink_file/page.html`);
        assert.strictEqual(anchors[3].getAttribute('href'), `${localhost}/capture_downLink_file/file.txt`);
        assert.strictEqual(anchors[4].getAttribute('href'), `${localhost}/capture_downLink_file/mime.py`);
        assert.strictEqual(anchors[5].getAttribute('href'), `${localhost}/capture_downLink_file/unknown.py`);
        assert.strictEqual(anchors[6].getAttribute('href'), `${localhost}/capture_downLink_file/filename.py`);
        assert.strictEqual(anchors[7].getAttribute('href'), `${localhost}/capture_downLink_file/nofilename.py`);
        assert.strictEqual(anchors[8].getAttribute('href'), `${localhost}/capture_downLink_file/redirect.pyr`);
      });
    });

    describe('syntax of capture.downLink.file.extFilter', function () {
      it('one rule per line', async function () {
        // match URL (*.py) but download using resolved filename using header (*.txt)
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `txt\nbmp\ncss\npy`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.exists(zip.file("unknown.bin"));
        assert.exists(zip.file("file3.txt"));
        assert.exists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 8);
      });

      it('plain: space separator', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `txt bmp css`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 4);
      });

      it('plain: comma separator', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `txt,bmp,css`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 4);
      });

      it('plain: semicolon separator', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `txt;bmp;css`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 4);
      });

      it('plain: mixed separators', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `txt; bmp ,; css`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 4);
      });

      it('plain: match full extension', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `tx, mp, s`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.notExists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 1);
      });

      it('regex: with flag', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `/(TXT|BMP|CSS)/i`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 4);
      });

      it('regex: without flag', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `/(TXT|BMP|CSS)/`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.notExists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 1);
      });

      it('regex: wildcards', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `/(?!py).+/`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.exists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("file4.txt"));
        assert.lengthOf(Object.keys(zip.files), 5);
      });

      it('regex: match full extension', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `/tx/`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.notExists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 1);
      });

      it('regex: unknown MIME should not match any extension', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `/.*/`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.exists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.exists(zip.file("file3.txt"));
        assert.exists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 9);
      });

      it('regex: take URL filename if no Content-Disposition filename', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `//`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.notExists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 1);
      });

      it('mime: filter with full MIME', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `\
mime:text/plain
mime:image/bmp
mime:application/wsb.unknown`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.exists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 6);
      });

      it('mime: filter with regex', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `mime:/text/.+/i`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.exists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 6);
      });

      it('mime: filter should not hit if no Content-Type', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `mime:/.*/i`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.exists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.exists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 8);
      });

      it('mime: filter should not hit for url mode', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `mime:/.*/i`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.notExists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 1);
      });
    });

    describe('should handle nonexistent linked files', function () {
      it('url mode: should download matched URL with error', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `/|txt/`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[9].getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_downLink_file/nonexist`);
        assert.strictEqual(anchors[10].getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_downLink_file/nonexist.txt`);
        assert.strictEqual(anchors[11].getAttribute('href'), `${localhost}/capture_downLink_file/nonexist.html`);
      });

      it('header mode: should not match any filter', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `/.*/\nmime:/.*/`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[9].getAttribute('href'), `${localhost}/capture_downLink_file/nonexist`);
        assert.strictEqual(anchors[10].getAttribute('href'), `${localhost}/capture_downLink_file/nonexist.txt`);
        assert.strictEqual(anchors[11].getAttribute('href'), `${localhost}/capture_downLink_file/nonexist.html`);
      });
    });

    describe('syntax of capture.downLink.file.urlFilter', function () {
      it('plain: basic', async function () {
        // a rule each line
        // plain text rule
        // match original URL
        // rule and URL have hash stripped before comparison
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `txt, bmp, css`,
          // 1. should match
          // 2. should match (hash in rule and URL are stripped)
          // 3. should match (hash in rule is stripped)
          // 4. should match (match source URL rather then redirected URL)
          "capture.downLink.urlFilter": `\
${localhost}/capture_downLink_file/file.bmp
${localhost}/capture_downLink_file/file.css#whatever
${localhost}/capture_downLink_file/mime.py#foo
${localhost}/capture_downLink_file/redirect.pyr#bar`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.exists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.notExists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 3);
      });

      it('plain: match full URL', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `txt, bmp, css`,
          // 1. should not match
          // 2. should match (hash in URL is stripped)
          "capture.downLink.urlFilter": `\
capture_downLink_file/mime.py
${localhost}/capture_downLink_file/file.css`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.exists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 6);
      });

      it('plain: strip chars after spaces', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `txt, bmp, css`,
          // 1. should not match
          // 2. should match (hash in URL is stripped)
          "capture.downLink.urlFilter": `\
capture_downLink_file/mime.py  foo
${localhost}/capture_downLink_file/file.css\tbar`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.notExists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.exists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.exists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 6);
      });

      it('regex: basic', async function () {
        // RegExp rule
        // match original URL
        // match partial URL
        // URL has hash stripped before comparison but rule is not
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `txt, bmp, css`,
          // 1. should match
          // 2. should not match (hash stripped in URL but not in rule)
          "capture.downLink.urlFilter": `\
/[/][^/]+[.]PY$/i
/#.+$/i`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_file/basic.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("file.bmp"));
        assert.exists(zip.file("file.css"));
        assert.notExists(zip.file("page.html"));
        assert.exists(zip.file("file.txt"));
        assert.notExists(zip.file("file2.txt"));
        assert.notExists(zip.file("unknown.bin"));
        assert.notExists(zip.file("file3.txt"));
        assert.notExists(zip.file("nofilename.py"));
        assert.exists(zip.file("redirect.txt"));
        assert.lengthOf(Object.keys(zip.files), 5);
      });
    });

    describe('should handle in-depth capture according to capture.downLink.doc.depth', function () {
      it('depth = null', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": null,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 1);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-5.html#`);

        assert.notExists(zip.file('index.json'));
      });

      it('depth = 0', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 0,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 2);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'site');
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-5.html#`);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });

      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'site');
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `linked1-5.html#`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

        var indexFile = zip.file('linked1-3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#1-3`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-5.html#1-3`);

        var indexFile = zip.file('linked1-4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `index.html#1-4`);

        var indexFile = zip.file('linked1-5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        assert.notExists(zip.file('linked2-1.html'));

        assert.notExists(zip.file('linked2-2.html'));

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "linked1-1.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-1.html`, "document"),
            },
            {
              "path": "linked1-2.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-2.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-2.html`, "document"),
            },
            {
              "path": "linked1-3.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-3.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-3.html`, "document"),
            },
            {
              "path": "linked1-4.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-4.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-4.html`, "document"),
            },
            {
              "path": "linked1-5.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-5.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-5.html`, "document"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });

      it('depth = 2', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 2,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'site');
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `linked1-5.html#`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked2-2.html#1-2`);

        var indexFile = zip.file('linked1-3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#1-3`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-5.html#1-3`);

        var indexFile = zip.file('linked1-4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `index.html#1-4`);

        var indexFile = zip.file('linked1-5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        var indexFile = zip.file('linked2-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        var indexFile = zip.file('linked2-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked3-1.html#2-2`);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "linked1-1.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-1.html`, "document"),
            },
            {
              "path": "linked1-2.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-2.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-2.html`, "document"),
            },
            {
              "path": "linked1-3.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-3.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-3.html`, "document"),
            },
            {
              "path": "linked1-4.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-4.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-4.html`, "document"),
            },
            {
              "path": "linked1-5.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-5.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-5.html`, "document"),
            },
            {
              "path": "linked2-1.html",
              "url": `${localhost}/capture_downLink_indepth/linked2-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked2-1.html`, "document"),
            },
            {
              "path": "linked2-2.html",
              "url": `${localhost}/capture_downLink_indepth/linked2-2.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked2-2.html`, "document"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('in-depth capture with tab mode', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
          "capture.downLink.doc.mode": "tab",
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'site');
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `linked1-5.html#`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

        var indexFile = zip.file('linked1-3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#1-3`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-5.html#1-3`);

        var indexFile = zip.file('linked1-4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `index.html#1-4`);

        var indexFile = zip.file('linked1-5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        assert.notExists(zip.file('linked2-1.html'));

        assert.notExists(zip.file('linked2-2.html'));

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "linked1-1.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-1.html`, "document"),
            },
            {
              "path": "linked1-2.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-2.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-2.html`, "document"),
            },
            {
              "path": "linked1-3.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-3.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-3.html`, "document"),
            },
            {
              "path": "linked1-4.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-4.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-4.html`, "document"),
            },
            {
              "path": "linked1-5.html",
              "url": `${localhost}/capture_downLink_indepth/linked1-5.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth/linked1-5.html`, "document"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should ignore in-depth capture for singleHtml', function () {
      it('depth = 0', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 0,
          "capture.saveAs": "singleHtml",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
      });

      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
          "capture.saveAs": "singleHtml",
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var doc = await readFileAsDocument(blob);
        assert(!doc.documentElement.hasAttribute('data-scrapbook-type'));
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
      });
    });

    describe('should ignore in-depth capture when capturing a file', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveAs": "zip",
          "capture.saveFileAsHtml": false,
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_file/file.bmp`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.hasAllKeys(zip.files, ['index.html', 'file.bmp']);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-type'), 'file');
        assert.exists(doc.querySelector('meta[http-equiv="refresh"][content="0; url=file.bmp"]'));
      });
    });

    describe('should ignore downLink.file for doc when downLink.doc.depth is set', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": `bmp, html`,
      });

      it('depth = null', async function () {
        options["capture.downLink.doc.depth"] = null;

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `linked1-5.html#`);

        // downloaded as file (not rewritten)
        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        // downloaded as file (not rewritten)
        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `./linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `./linked2-2.html#1-2`);

        // downloaded as file (not rewritten)
        var indexFile = zip.file('linked1-3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `./linked1-1.html#1-3`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `./linked1-5.html#1-3`);

        // downloaded as file (not rewritten)
        var indexFile = zip.file('linked1-4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `./in-depth.html#1-4`);

        // downloaded as file (not rewritten)
        var indexFile = zip.file('linked1-5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        // not accessed
        assert.notExists(zip.file('linked2-1.html'));
        assert.notExists(zip.file('linked2-2.html'));
      });

      it('depth = 0', async function () {
        options["capture.downLink.doc.depth"] = 0;

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-5.html#`);

        // skip downLinkFile even if depth exceeds
        assert.notExists(zip.file('linked1-1.html'));
        assert.notExists(zip.file('linked1-2.html'));
        assert.notExists(zip.file('linked1-3.html'));
        assert.notExists(zip.file('linked1-4.html'));
        assert.notExists(zip.file('linked1-5.html'));
        assert.notExists(zip.file('linked2-1.html'));
        assert.notExists(zip.file('linked2-2.html'));
      });

      it('depth = 1', async function () {
        options["capture.downLink.doc.depth"] = 1;

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `linked1-5.html#`);

        // captured as page (rewritten)
        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        // captured as page (rewritten)
        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

        // captured as page (rewritten)
        var indexFile = zip.file('linked1-3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#1-3`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-5.html#1-3`);

        // captured as page (rewritten)
        var indexFile = zip.file('linked1-4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `index.html#1-4`);

        // captured as page (rewritten)
        var indexFile = zip.file('linked1-5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        // skip downLinkFile even if depth exceeds
        assert.notExists(zip.file('linked2-1.html'));
        assert.notExists(zip.file('linked2-2.html'));
      });
    });

    describe('syntax of capture.downLink.doc.urlFilter', function () {
      it('plain: match full URL', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 2,
          "capture.downLink.doc.urlFilter": `\
${localhost}/capture_downLink_indepth/linked1-2.html
${localhost}/capture_downLink_indepth/linked2-1.html`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-5.html#`);

        assert.notExists(zip.file('linked1-1.html'));

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

        assert.notExists(zip.file('linked1-3.html'));

        assert.notExists(zip.file('linked1-4.html'));

        assert.notExists(zip.file('linked1-5.html'));

        var indexFile = zip.file('linked2-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        assert.notExists(zip.file('linked2-2.html'));
      });

      it('regex', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 2,
          "capture.downLink.doc.urlFilter": `/linked1-[12]\\.HTML$/i`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/file.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked1-2.html#222`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-3.html#333`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-4.html#444`);
        assert.strictEqual(doc.querySelectorAll('a')[5].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked1-5.html#`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-1.html#1-2`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth/linked2-2.html#1-2`);

        assert.notExists(zip.file('linked1-3.html'));

        assert.notExists(zip.file('linked1-4.html'));

        assert.notExists(zip.file('linked1-5.html'));

        assert.notExists(zip.file('linked2-1.html'));

        assert.notExists(zip.file('linked2-2.html'));
      });
    });

    describe('should rebuild links for XHTML/SVG pages', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth_nonHtml/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1.html`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked2.html`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked3.html`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `subpage1.xhtml`);
        assert.strictEqual(doc.querySelectorAll('a')[4].getAttribute('href'), `subpage2.svg`);

        var indexFile = zip.file('subpage1.xhtml');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1.html`);

        var indexFile = zip.file('subpage2.svg');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked2.html`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('xlink:href'), `linked3.html`);
      });
    });

    describe('should have the same depth for pages linked from a frame as from the frame parent', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth_frame/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);

        var indexFile = zip.file('index_1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1.html`);

        var indexFile = zip.file('linked1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc);
      });
    });

    describe('frame renaming for deep pages', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
        "capture.downLink.doc.depth": 1,
      });

      it('capture.frameRename = true', async function () {
        options["capture.frameRename"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth_renaming/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1.html`);

        var indexFile = zip.file('linked1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `linked1_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `linked1_2.html`);
      });

      it('capture.frameRename = false', async function () {
        options["capture.frameRename"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth_renaming/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1.html`);

        var indexFile = zip.file('linked1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `frame1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `frame2.html`);
      });
    });

    describe('should rebuild links in shadow DOMs', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_shadow/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var host = doc.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;
        assert.strictEqual(shadow.querySelectorAll('a')[0].getAttribute('href'), `linked1.html#111`);

        var host = shadow.querySelector('div');
        var frag = doc.createElement("template");
        frag.innerHTML = host.getAttribute("data-scrapbook-shadowdom");
        var shadow = frag.content;
        assert.strictEqual(shadow.querySelectorAll('a')[0].getAttribute('href'), `linked2.html#222`);
      });
    });

    describe('should treat meta refresh as having extra depth', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_metaRefresh/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-2.html#in-depth`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=${localhost}/capture_downLink_indepth_metaRefresh/linked2-1.html#linked1-1`);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=${localhost}/capture_downLink_indepth_metaRefresh/linked2-2.html`);

        assert.notExists(zip.file('linked2-1.html'));

        assert.notExists(zip.file('linked2-2.html'));

        assert.notExists(zip.file('linked3-1.html'));

        assert.notExists(zip.file('linked3-2.html'));
      });

      it('depth = 2', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 2,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_metaRefresh/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-2.html#in-depth`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked2-1.html#linked1-1`);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked2-2.html`);

        var indexFile = zip.file('linked2-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=${localhost}/capture_downLink_indepth_metaRefresh/linked3-1.html#linked2-1`);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth_metaRefresh/linked3-2.html#linked2-1`);

        var indexFile = zip.file('linked2-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked1-2.html`);

        assert.notExists(zip.file('linked3-1.html'));

        assert.notExists(zip.file('linked3-2.html'));
      });

      it('depth = 3', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 3,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_metaRefresh/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked1-2.html#in-depth`);

        var indexFile = zip.file('linked1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked2-1.html#linked1-1`);

        var indexFile = zip.file('linked1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked2-2.html`);

        var indexFile = zip.file('linked2-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked3-1.html#linked2-1`);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked3-2.html#linked2-1`);

        var indexFile = zip.file('linked2-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('meta[http-equiv="refresh"]')[0].getAttribute('content'), `0; url=linked1-2.html`);

        assert.exists(zip.file('linked3-1.html'));

        assert.exists(zip.file('linked3-2.html'));
      });
    });

    describe('should trace redirects and record in `redirects`', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_redirect/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1-2.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth_redirect/linked1-2.pyr#in-depth`);

        var indexFile = zip.file('linked1-1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth_redirect/linked2-1.html#1-1-2`);

        assert.notExists(zip.file('linked2-1.html'));

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
         "version": 3,
         "indexPages": [
          "index.html",
         ],
         "redirects": [
          [
           `${localhost}/capture_downLink_indepth_redirect/linked1-1.pyr`,
           `${localhost}/capture_downLink_indepth_redirect/linked1-1-2.html`,
          ],
         ],
         "files": [
          {
           "path": "index.json",
          },
          {
           "path": "index.dat",
          },
          {
           "path": "index.rdf",
          },
          {
           "path": "history.rdf",
          },
          {
           "path": "^metadata^",
          },
          {
           "path": "index.html",
           "url": `${localhost}/capture_downLink_indepth_redirect/in-depth.html`,
           "role": "document",
           "token": getToken(`${localhost}/capture_downLink_indepth_redirect/in-depth.html`, "document"),
          },
          {
           "path": "index.xhtml",
           "role": "document",
          },
          {
           "path": "index.svg",
           "role": "document",
          },
          {
           "path": "linked1-1-2.html",
           "url": `${localhost}/capture_downLink_indepth_redirect/linked1-1-2.html`,
           "role": "document",
           "token": getToken(`${localhost}/capture_downLink_indepth_redirect/linked1-1-2.html`, "document"),
          },
         ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });

      it('depth = 2', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 2,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_redirect/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked1-1-2.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth_redirect/linked1-2.pyr#in-depth`);

        var indexFile = zip.file('linked1-1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked2-1.html#1-1-2`);

        assert.exists(zip.file('linked2-1.html'));

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
         "version": 3,
         "indexPages": [
          "index.html",
         ],
         "redirects": [
          [
           `${localhost}/capture_downLink_indepth_redirect/linked1-1.pyr`,
           `${localhost}/capture_downLink_indepth_redirect/linked1-1-2.html`,
          ],
         ],
         "files": [
          {
           "path": "index.json",
          },
          {
           "path": "index.dat",
          },
          {
           "path": "index.rdf",
          },
          {
           "path": "history.rdf",
          },
          {
           "path": "^metadata^",
          },
          {
           "path": "index.html",
           "url": `${localhost}/capture_downLink_indepth_redirect/in-depth.html`,
           "role": "document",
           "token": getToken(`${localhost}/capture_downLink_indepth_redirect/in-depth.html`, "document"),
          },
          {
           "path": "index.xhtml",
           "role": "document",
          },
          {
           "path": "index.svg",
           "role": "document",
          },
          {
           "path": "linked1-1-2.html",
           "url": `${localhost}/capture_downLink_indepth_redirect/linked1-1-2.html`,
           "role": "document",
           "token": getToken(`${localhost}/capture_downLink_indepth_redirect/linked1-1-2.html`, "document"),
          },
          {
           "path": "linked2-1.html",
           "url": `${localhost}/capture_downLink_indepth_redirect/linked2-1.html`,
           "role": "document",
           "token": getToken(`${localhost}/capture_downLink_indepth_redirect/linked2-1.html`, "document"),
          },
         ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should not record URL for data URLs in `index.json`', function () {
      it('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
          "capture.downLink.doc.depth": 0,
          "capture.saveDataUriAsFile": true,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_datauri/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `test.bmp`);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_datauri/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_datauri/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
             "path": "dbc82be549e49d6db9a5719086722a4f1c5079cd.bmp",
             "role": "resource",
             "token": "53724543b9eec02e09e333bf253affae8bbf71d4",
            },
            {
             "path": "test.bmp",
             "role": "resource",
             "token": "273f4b77f14df7c6f331c0cd1ee01746e41797e7",
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should not record URL for blob: URLs in `index.json`', function () {
      it('depth = 0', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveResourcesSequentially": true,
          "capture.downLink.doc.depth": 0,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_blob/in-depth.html`,
          options,
        }, {delay: 500});

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var imgElems = doc.querySelectorAll('img');
        var imgFn = imgElems[0].getAttribute('src');
        var imgFn1 = imgElems[1].getAttribute('src');
        var imgFn2 = imgElems[2].getAttribute('src');
        assert.strictEqual(imgFn, imgFn1);
        assert.notStrictEqual(imgFn, imgFn2);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_blob/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_blob/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
             "path": imgFn,
             "role": "resource",
             "token": getToken(`blob:${localhost}/${imgFn.slice(0, -4)}`, "resource"),
            },
            {
             "path": imgFn2,
             "role": "resource",
             "token": getToken(`blob:${localhost}/${imgFn2.slice(0, -4)}`, "resource"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should keep as-is for about: URLs', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_about/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `about:blank`);
        assert.strictEqual(anchors[1].getAttribute('href'), `about:blank?foo=bar#baz`);
        assert.strictEqual(anchors[2].getAttribute('href'), `about:srcdoc`);
        assert.strictEqual(anchors[3].getAttribute('href'), `about:invalid`);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_about/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_about/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should safely ignore invalid URLs when rebuilding links', function () {
      it('depth = 1', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_invalid/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var anchors = doc.querySelectorAll('a');
        assert.strictEqual(anchors[0].getAttribute('href'), `https://exa%23mple.org/`);
        assert.strictEqual(anchors[1].getAttribute('href'), `https://#fragment`);
        assert.strictEqual(anchors[2].getAttribute('href'), `https://:443`);
        assert.strictEqual(anchors[3].getAttribute('href'), `https://example.org:70000`);
        assert.strictEqual(anchors[4].getAttribute('href'), `https://example.org:7z`);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_invalid/in-depth.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_invalid/in-depth.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    /**
     * Should download an attachment page as a file and not capture.
     * Also check that links in an embedded SVG or MathML are handled correctly.
     */
    describe('should not capture attachment pages', function () {
      it('downLink', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": "html",
          "capture.downLink.doc.depth": 0,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_attachment/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth_attachment/attachment1.py#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `attachment1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `attachment2.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `attachment2-2.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('svg a')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth_attachment/attachment3.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href'), `${localhost}/capture_downLink_indepth_attachment/attachment4.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('math [href]')[0].getAttribute('href'), `${localhost}/capture_downLink_indepth_attachment/attachment5.html#in-depth`);

        // downloaded as file (not rewritten)
        var indexFile = zip.file('attachment1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('attachment2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('attachment2-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));
      });

      it('inDepth', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "none",
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_attachment/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.notExists(zip.file('attachment2.py'));
        assert.notExists(zip.file('attachment2-2.py'));
        assert.exists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `attachment1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_downLink_indepth_attachment/attachment1.py#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `${localhost}/capture_downLink_indepth_attachment/attachment2.py#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_downLink_indepth_attachment/attachment2-2.py#in-depth`);
        assert.strictEqual(doc.querySelectorAll('svg a')[0].getAttribute('href'), `attachment3.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href'), `attachment4.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('math [href]')[0].getAttribute('href'), `attachment5.html#in-depth`);

        // captured as page (rewritten)
        var indexFile = zip.file('attachment1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));

        // captured as page (rewritten)
        var indexFile = zip.file('attachment3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));

        // captured as page (rewritten)
        var indexFile = zip.file('attachment4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));

        // captured as page (rewritten)
        var indexFile = zip.file('attachment5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));
      });

      it('downLink & inDepth', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": "html",
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_attachment/in-depth.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('red.bmp'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `attachment1-1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `attachment1.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `attachment2.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `attachment2-2.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('svg a')[0].getAttribute('href'), `attachment3.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('svg a')[1].getAttribute('xlink:href'), `attachment4.html#in-depth`);
        assert.strictEqual(doc.querySelectorAll('math [href]')[0].getAttribute('href'), `attachment5.html#in-depth`);

        // captured as page (rewritten)
        var indexFile = zip.file('attachment1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('attachment1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('attachment2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('attachment2-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./red.bmp"]'));

        // captured as page (rewritten)
        var indexFile = zip.file('attachment3.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));

        // captured as page (rewritten)
        var indexFile = zip.file('attachment4.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));

        // captured as page (rewritten)
        var indexFile = zip.file('attachment5.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="red.bmp"]'));
      });
    });

    describe('should add file/page according to capture.downLink.urlExtra', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.downLink.file.extFilter": "jpg",
        "capture.downLink.doc.urlFilter": "/(?!)/",
        "capture.downLink.urlFilter": "//",
        "capture.downLink.urlExtra": `\
${localhost}/capture_downLink_indepth_urlExtra/1-1.html
${localhost}/capture_downLink_indepth_urlExtra/1-2.py
${localhost}/capture_downLink_indepth_urlExtra/1-3.txt`,
      });

      it('-downLink -inDepth', async function () {
        options["capture.downLink.file.mode"] = "none";
        options["capture.downLink.doc.depth"] = null;

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index.html'));
        assert.notExists(zip.file('index.json'));
        assert.notExists(zip.file('1-1.html'));
        assert.notExists(zip.file('1-1.bmp'));
        assert.notExists(zip.file('1-2.html'));
        assert.notExists(zip.file('1-2.bmp'));
        assert.notExists(zip.file('1-3.txt'));
      });

      it('+downLink -inDepth', async function () {
        options["capture.downLink.file.mode"] = "url";
        options["capture.downLink.doc.depth"] = null;

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index.html'));
        assert.notExists(zip.file('index.json'));
        assert.notExists(zip.file('1-1.bmp'));
        assert.notExists(zip.file('1-2.bmp'));
        assert.exists(zip.file('1-3.txt'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./1-1.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./1-2.bmp"]'));
      });

      it('-downLink +inDepth', async function () {
        options["capture.downLink.file.mode"] = "none";
        options["capture.downLink.doc.depth"] = 0;

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index.html'));
        assert.exists(zip.file('1-1.bmp'));
        assert.notExists(zip.file('1-2.html'));
        assert.notExists(zip.file('1-2.bmp'));
        assert.notExists(zip.file('1-3.txt'));

        // captured as page (rewritten)
        var indexFile = zip.file('1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="1-1.bmp"]'));

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
            "1-1.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/main.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "1-1.html",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.html`, "document"),
            },
            {
              "path": "1-1.bmp",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`,
              "role": "resource",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`, "resource"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });

      it('+downLink +inDepth', async function () {
        options["capture.downLink.file.mode"] = "url";
        options["capture.downLink.doc.depth"] = 0;

        var blob = await capture({
          url: `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index.html'));
        assert.exists(zip.file('1-1.bmp'));
        assert.notExists(zip.file('1-2.bmp'));
        assert.exists(zip.file('1-3.txt'));

        // captured as page (rewritten)
        var indexFile = zip.file('1-1.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="1-1.bmp"]'));

        // downloaded as file (not rewritten)
        var indexFile = zip.file('1-2.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.exists(doc.querySelector('img[src="./1-2.bmp"]'));

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
            "1-1.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/main.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/main.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "1-2.html",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/1-2.py`,
              "role": "resource",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-2.py`, "resource"),
            },
            {
              "path": "1-3.txt",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/1-3.txt`,
              "role": "resource",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-3.txt`, "resource"),
            },
            {
              "path": "1-1.html",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.html`, "document"),
            },
            {
              "path": "1-1.bmp",
              "url": `${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`,
              "role": "resource",
              "token": getToken(`${localhost}/capture_downLink_indepth_urlExtra/1-1.bmp`, "resource"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should preserve case for `path` in `index.json`', function () {
      it('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.doc.depth": 1,
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": `bmp`,
        });

        var blob = await captureHeadless({
          url: `${localhost}/capture_downLink_indepth_case/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.lengthOf(Object.keys(zip.files), 5);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `Green.bmp`);

        var sitemapBlob = await zip.file('index.json').async('blob');
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_downLink_indepth_case/index.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_downLink_indepth_case/index.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "Green.bmp",
              "url": `${localhost}/capture_downLink_indepth_case/Green.bmp`,
              "role": "resource",
              "token": getToken(`${localhost}/capture_downLink_indepth_case/Green.bmp`, "resource"),
            },
            {
             "path": "Yellow.bmp",
             "url": `${localhost}/capture_downLink_indepth_case/Yellow.bmp`,
             "role": "resource",
             "token": getToken(`${localhost}/capture_downLink_indepth_case/Yellow.bmp`, "resource"),
            },
            {
             "path": "Linked.html",
             "url": `${localhost}/capture_downLink_indepth_case/Linked.html`,
             "role": "document",
             "token": getToken(`${localhost}/capture_downLink_indepth_case/Linked.html`, "document"),
            },
          ],
        };
        assert.deepEqual(JSON.parse(await readFileAsText(sitemapBlob)), expectedData);
      });
    });

    describe('should save linked blob URL file/page', function () {
      it('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `bmp`,
          "capture.downLink.doc.depth": 1,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_blob/basic.html`,
          options,
        }, {delay: 500});
        var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgFn = doc.querySelector('#file1 a').getAttribute('href');
        assert(imgFn.match(regex`^${uuid}\.bmp$`));
        assert.exists(zip.file(imgFn));

        var page1Fn = doc.querySelector('#page1 a').getAttribute('href');
        assert(page1Fn.match(regex`^${uuid}\.html$`));

        var indexFile = zip.file(page1Fn);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgFn1 = doc.querySelector('img').getAttribute('src');
        assert.strictEqual(imgFn1, imgFn);
      });
    });

    describe('should save upper-scope blob URLs in a deep blob URL page', function () {
      $it.xfailIf(
        userAgent.is('firefox'),
        'unable to fetch an upper-scope blob URL from the content script in Firefox',
      )('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.downLink.file.mode": "header",
          "capture.downLink.file.extFilter": `bmp`,
          "capture.downLink.doc.depth": 2,
        });

        var blob = await capture({
          url: `${localhost}/capture_downLink_blob/basic.html`,
          options,
        }, {delay: 500});
        var uuid = r`[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}`;

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgFn = doc.querySelector('#file1 a').getAttribute('href');
        assert(imgFn.match(regex`^${uuid}\.bmp$`));
        assert.exists(zip.file(imgFn));

        var page1Fn = doc.querySelector('#page1 a').getAttribute('href');
        assert(page1Fn.match(regex`^${uuid}\.html$`));

        var indexFile = zip.file(page1Fn);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgFn1 = doc.querySelector('img').getAttribute('src');
        assert.strictEqual(imgFn1, imgFn);
        var imgFn2 = doc.querySelectorAll('img')[1].getAttribute('src');
        assert.exists(zip.file(imgFn2));

        var page11Fn = doc.querySelector('a').getAttribute('href');
        assert(page11Fn.match(regex`^${uuid}\.html$`));

        var indexFile = zip.file(page11Fn);
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var imgFn11 = doc.querySelector('img').getAttribute('src');
        assert.strictEqual(imgFn11, imgFn);
      });
    });
  });

  /**
   * capturer.captureDocument
   * capturer.captureFile
   * capturer.captureBookmark
   */
  describe('record', function () {
    /**
     * Should NOT record the original value of "data-scrapbook-" attributes.
     */
    describe('should record item meta in root element according to capture.recordDocumentMeta', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.recordRewrites": true,
      });

      it('html; +capture.recordDocumentMeta', async function () {
        options["capture.recordDocumentMeta"] = true;
        var blob = await capture({
          url: `${localhost}/capture_record/meta.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var html = doc.documentElement;

        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.html`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assertNoRecord(html, {filter: 'scrapbook'});
      });

      it('html; -capture.recordDocumentMeta', async function () {
        options["capture.recordDocumentMeta"] = false;
        var blob = await capture({
          url: `${localhost}/capture_record/meta.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var html = doc.documentElement;

        assertNoRecord(doc, {filter: {regexAttr: /^data-scrapbook-/}});
        assertNoRecord(html, {filter: 'scrapbook'});
      });

      it('text (Big5); +capture.recordDocumentMeta', async function () {
        options["capture.recordDocumentMeta"] = true;
        var blob = await capture({
          url: `${localhost}/capture_record/text.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var html = doc.documentElement;

        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/text.py`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assert.strictEqual(html.getAttribute('data-scrapbook-type'), 'file');
        assert.strictEqual(html.getAttribute('data-scrapbook-charset'), 'Big5');
        assertNoRecord(html, {filter: 'scrapbook'});
      });

      it('text (Big5); -capture.recordDocumentMeta', async function () {
        options["capture.recordDocumentMeta"] = false;
        var blob = await capture({
          url: `${localhost}/capture_record/text.py`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assertNoRecord(doc, {filter: {regexAttr: /^data-scrapbook-/}});
      });

      it('bookmark; +capture.recordDocumentMeta', async function () {
        options["capture.recordDocumentMeta"] = true;
        var blob = await capture({
          url: `${localhost}/capture_record/meta.html`,
          mode: "bookmark",
          options,
        });
        var doc = await readFileAsDocument(blob);
        var html = doc.documentElement;

        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.html`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assert.strictEqual(html.getAttribute('data-scrapbook-type'), 'bookmark');
        assertNoRecord(html, {filter: 'scrapbook'});
      });

      it('bookmark; -capture.recordDocumentMeta', async function () {
        options["capture.recordDocumentMeta"] = false;
        var blob = await capture({
          url: `${localhost}/capture_record/meta.html`,
          mode: "bookmark",
          options,
        });
        var doc = await readFileAsDocument(blob);

        assertNoRecord(doc, {filter: {regexAttr: /^data-scrapbook-/}});
      });
    });

    describe('should record hash in main document and NOT in frames', function () {
      it('html', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_record/frame.html#abc`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/frame.html#abc`);

        var frameFile = zip.file('index_1.html');
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(frameBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.html`);
      });

      it('html; headless', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_record/frame.html#abc`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/frame.html#abc`);

        var frameFile = zip.file('index_1.html');
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(frameBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.html`);
      });

      it('file', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_record/text.py#abc`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/text.py#abc`);
      });

      it('file; headless', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_record/text.py#abc`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/text.py#abc`);
      });

      it('bookmark', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
        });
        var blob = await capture({
          url: `${localhost}/capture_record/meta.html#abc`,
          mode: "bookmark",
          options,
        });
        var doc = await readFileAsDocument(blob);
        assert.strictEqual(doc.documentElement.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.html#abc`);
      });
    });

    describe('should record the redirected URL', function () {
      it('html; +capture.recordDocumentMeta', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_record/meta.pyr#abc`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var html = doc.documentElement;

        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.html#abc`);
      });
    });

    describe('should record meta in `index.html` rather than in `*.xhtml` (except for source)', function () {
      it('html; +capture.recordDocumentMeta', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.recordDocumentMeta": true,
          "capture.downLink.doc.depth": 0,
        });
        var blob = await captureHeadless({
          url: `${localhost}/capture_record/meta.xhtml#abc`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var html = doc.documentElement;
        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.xhtml#abc`);
        assert(html.getAttribute('data-scrapbook-create').match(regex`^\d{17}$`));
        assert.strictEqual(html.getAttribute('data-scrapbook-type'), `site`);

        var indexFile = zip.file('index.xhtml');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "application/xhtml+xml"});
        var doc = await readFileAsDocument(indexBlob);
        var html = doc.documentElement;
        assert.strictEqual(html.getAttribute('data-scrapbook-source'), `${localhost}/capture_record/meta.xhtml`);
        assertNoRecord(html, {filter: {regexAttr: /^data-scrapbook-(?!source)/}});
      });
    });

    describe('should record removed nodes according to capture.recordRewrites', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "remove",
        "capture.favicon": "remove",
        "capture.canvas": "remove",
        "capture.audio": "remove",
        "capture.video": "remove",
        "capture.embed": "remove",
        "capture.object": "remove",
        "capture.applet": "remove",
        "capture.frame": "remove",
        "capture.style": "remove",
        "capture.script": "remove",
        "capture.noscript": "remove",
        "capture.preload": "remove",
        "capture.prefetch": "remove",
        "capture.base": "remove",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_record/nodes1.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var head = doc.querySelector('head');
        var body = doc.body;
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert(head.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<base[^>]*?>-->`,
        ));

        assert(head.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="shortcut icon"[^>]*?>-->`,
        ));

        assert(head.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="stylesheet"[^>]*?>-->`,
        ));

        assert(head.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="preload"[^>]*?>-->`,
        ));

        assert(head.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<link[^>]*? rel="prefetch"[^>]*?>-->`,
        ));

        assert(head.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<script[^>]*?>[\s\S]*?</script>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<img[^>]*? src=[^>]*?>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<img[^>]*? srcset=[^>]*?>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<picture>[\s\S]*?</picture>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<input[^>]*? type="image"[^>]*?>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<canvas[^>]*?>[\s\S]*?</canvas>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<audio[^>]*?>[\s\S]*?</audio>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\s\S]*?</video>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<video[^>]*?>[\s\S]*?</video>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<embed[^>]*?>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<object[^>]*?>[\s\S]*?</object>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<applet[^>]*?>[\s\S]*?</applet>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<iframe[^>]*?>[\s\S]*?</iframe>-->`,
        ));

        assert(body.innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<noscript[^>]*?>[\s\S]*?</noscript>-->`,
        ));
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_record/nodes1.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assertNoRecord(doc);
      });
    });

    describe('should record removed source nodes in picture, audio, and video', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save-current",
        "capture.audio": "save-current",
        "capture.video": "save-current",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await capture({
          url: `${localhost}/capture_record/nodes2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert(doc.querySelector('picture').innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`,
        ));

        assert(doc.querySelector('audio').innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`,
        ));

        assert(doc.querySelector('video').innerHTML.match(
          regex`<!--scrapbook-orig-node-${timeId}=<source[^>]*?>-->`,
        ));
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await capture({
          url: `${localhost}/capture_record/nodes2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assertNoRecord(doc);
      });
    });

    describe('should record added nodes according to capture.recordRewrites', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save-current",
        "capture.audio": "save-current",
        "capture.video": "save-current",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await capture({
          url: `${localhost}/capture_record/nodes3.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
        assert.exists(doc.querySelector(`head:not([data-scrapbook-orig-null-node-${timeId}])`));
        assert.exists(doc.querySelector(`meta[charset="UTF-8"][data-scrapbook-orig-null-node-${timeId}]`));

        var blob = await capture({
          url: `${localhost}/capture_record/nodes4.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');
        assert.exists(doc.querySelector(`head[data-scrapbook-orig-null-node-${timeId}]`));
        assert.exists(doc.querySelector(`meta[charset="UTF-8"][data-scrapbook-orig-null-node-${timeId}]`));
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await capture({
          url: `${localhost}/capture_record/nodes3.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assertNoRecord(doc);

        var blob = await capture({
          url: `${localhost}/capture_record/nodes4.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        assertNoRecord(doc);
      });
    });

    /**
     * This test verifies that no record is generated when the option is not
     * set, focusing on a subset of captures. Other record details are covered
     * in related tests, which primarily only check for the
     * `capture.recordRewrites = true` case, with the presumption that every
     * record is generated through an option-aware function like
     * `captureRewriteAttr()`.
     */
    describe('should record changed attributes according to capture.recordRewrites', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.frame": "save",
        "capture.styleInline": "blank",
        "capture.rewriteCss": "url",
        "capture.script": "blank",
        "capture.formStatus": "keep",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs1.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('meta').getAttribute(`data-scrapbook-orig-attr-charset-${timeId}`), `Big5`);
        assert.strictEqual(doc.querySelector('body').getAttribute(`data-scrapbook-orig-attr-onload-${timeId}`), `console.log('load');`);
        assert.strictEqual(doc.querySelector('div').getAttribute(`data-scrapbook-orig-attr-style-${timeId}`), `background-color: green;`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-srcdoc-${timeId}`), `frame page content`);
        assert.strictEqual(doc.querySelector('a').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `javascript:console.log('a');`);
        assert.strictEqual(doc.querySelector('input[type="checkbox"]').getAttribute(`data-scrapbook-orig-null-attr-checked-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="text"]').getAttribute(`data-scrapbook-orig-null-attr-value-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('textarea').getAttribute(`data-scrapbook-orig-textcontent-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('select option').getAttribute(`data-scrapbook-orig-null-attr-selected-${timeId}`), ``);
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs1.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assertNoRecord(doc);
      });
    });

    describe('record changed attributes: save', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.audio": "save",
        "capture.video": "save",
        "capture.embed": "save",
        "capture.object": "save",
        "capture.applet": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.styleInline": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.ping": "blank",
        "capture.preload": "blank",
        "capture.prefetch": "blank",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
        "capture.contentSecurityPolicy": "remove",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        // attr
        assert.strictEqual(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.css`);
        assert.strictEqual(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert(!doc.querySelector('link[rel="preload"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
        assert.strictEqual(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`), `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
        assert.strictEqual(doc.querySelector('link[rel="prefetch"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null2.css`);
        assert.strictEqual(doc.querySelector('link[rel="prefetch"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert(!doc.querySelector('link[rel="prefetch"]').hasAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`));
        assert.strictEqual(doc.querySelector('link[rel="preload"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`), `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), `anonymous`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`), `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.css`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`), `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
        assert.strictEqual(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.js`);
        assert.strictEqual(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), `use-credentials`);
        assert.strictEqual(doc.querySelector('script[src]').getAttribute(`data-scrapbook-orig-attr-integrity-${timeId}`), `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`);
        assert.strictEqual(doc.querySelector('script:not([src])').getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`), `./null.bmp 1x, ./null.bmp 2x`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('picture source').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table tr').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table tr th').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table tr td').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.mp3`);
        assert.strictEqual(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('audio:not([src])').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('audio source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.ogg`);
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.mp4`);
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('video:not([src])').getAttribute(`data-scrapbook-orig-attr-crossorigin-${timeId}`), ``);
        assert.strictEqual(doc.querySelector('video source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.webm`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.html`);
        assert.strictEqual(doc.querySelector('embed').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.swf`);
        assert.strictEqual(doc.querySelector('object').getAttribute(`data-scrapbook-orig-attr-data-${timeId}`), `./null.swf`);
        assert.strictEqual(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-code-${timeId}`), `./null.class`);
        assert.strictEqual(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-archive-${timeId}`), `./null.jar`);
        assert.strictEqual(doc.querySelector('a').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.txt`);

        assert.strictEqual(doc.querySelectorAll('svg a[*|href]')[0].getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.txt`);
        assert.strictEqual(doc.querySelectorAll('svg a[*|href]')[1].getAttribute(`xlink:data-scrapbook-orig-attr-href-${timeId}`), `./null.txt`);
        assert.strictEqual(doc.querySelectorAll('svg image[*|href]')[0].getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelectorAll('svg image[*|href]')[1].getAttribute(`xlink:data-scrapbook-orig-attr-href-${timeId}`), `./null.bmp`);

        // CSS
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import /*scrapbook-orig-url="./null.css"*/url("null.css");
@font-face { font-family: myFont; src: /*scrapbook-orig-url="./null.woff"*/url("null.woff"); }
p { background-image: /*scrapbook-orig-url="./null.bmp"*/url("null.bmp"); }`);
        assert.strictEqual(doc.querySelector('div').getAttribute('style'), `background: /*scrapbook-orig-url="./null.bmp"*/url("null.bmp");`);
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // attr
        assertNoRecord(doc);

        // CSS
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("null.css");
@font-face { font-family: myFont; src: url("null.woff"); }
p { background-image: url("null.bmp"); }`);
        assert.strictEqual(doc.querySelector('div').getAttribute('style'), `background: url("null.bmp");`);
      });
    });

    /**
     * save styles to save CSS and check image background and font
     */
    describe('record changed attributes: blank', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "blank",
        "capture.imageBackground": "blank",
        "capture.favicon": "blank",
        "capture.audio": "blank",
        "capture.video": "blank",
        "capture.embed": "blank",
        "capture.object": "blank",
        "capture.applet": "blank",
        "capture.frame": "blank",
        "capture.font": "blank",
        "capture.style": "save",
        "capture.styleInline": "save",
        "capture.rewriteCss": "url",
        "capture.script": "blank",
        "capture.contentSecurityPolicy": "remove",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        // attr
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelectorAll('script')[0].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.js`);
        assert.strictEqual(doc.querySelectorAll('script')[0].getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert.strictEqual(doc.querySelectorAll('script')[1].getAttribute(`data-scrapbook-orig-textContent-${timeId}`).trim(), `console.log('script:not[src]');`);
        assert.strictEqual(doc.querySelectorAll('script')[1].getAttribute(`data-scrapbook-orig-attr-nonce-${timeId}`), `2726c7f26c`);
        assert.strictEqual(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`), `./null.bmp 1x, ./null.bmp 2x`);
        assert.strictEqual(doc.querySelector('picture source').getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('input[type="image"]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table tr').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table tr th').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('table tr td').getAttribute(`data-scrapbook-orig-attr-background-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.mp3`);
        assert.strictEqual(doc.querySelector('audio source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.ogg`);
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.mp4`);
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('video source').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.webm`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.html`);
        assert.strictEqual(doc.querySelector('embed').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.swf`);
        assert.strictEqual(doc.querySelector('object').getAttribute(`data-scrapbook-orig-attr-data-${timeId}`), `./null.swf`);
        assert.strictEqual(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-code-${timeId}`), `./null.class`);
        assert.strictEqual(doc.querySelector('applet').getAttribute(`data-scrapbook-orig-attr-archive-${timeId}`), `./null.jar`);

        // CSS
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import /*scrapbook-orig-url="./null.css"*/url("null.css");
@font-face { font-family: myFont; src: /*scrapbook-orig-url="./null.woff"*/url(""); }
p { background-image: /*scrapbook-orig-url="./null.bmp"*/url(""); }`);
        assert.strictEqual(doc.querySelector('div').getAttribute('style'), `background: /*scrapbook-orig-url="./null.bmp"*/url("");`);
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // attr
        assertNoRecord(doc);

        // CSS
        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("null.css");
@font-face { font-family: myFont; src: url(""); }
p { background-image: url(""); }`);
        assert.strictEqual(doc.querySelector('div').getAttribute('style'), `background: url("");`);
      });
    });

    describe('record changed attributes: save-current', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save-current",
        "capture.audio": "save-current",
        "capture.video": "save-current",
        "capture.style": "blank",
      });

      it('+capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = true;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        // attr
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.css`);
        assert.strictEqual(doc.querySelector('img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`), ``);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute(`data-scrapbook-orig-attr-srcset-${timeId}`), `./null.bmp 1x, ./null.bmp 2x`);
        assert.strictEqual(doc.querySelector('picture img').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelector('audio[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.mp3`);
        assert.strictEqual(doc.querySelectorAll('audio')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`), ``);
        assert(!doc.querySelectorAll('audio')[1].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`)); // double record bug
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-src-${timeId}`), `./null.mp4`);
        assert.strictEqual(doc.querySelector('video[src]').getAttribute(`data-scrapbook-orig-attr-poster-${timeId}`), `./null.bmp`);
        assert.strictEqual(doc.querySelectorAll('video')[1].getAttribute(`data-scrapbook-orig-null-attr-src-${timeId}`), ``);
        assert(!doc.querySelectorAll('video')[1].getAttribute(`data-scrapbook-orig-attr-src-${timeId}`)); // double record bug
      });

      it('-capture.recordRewrites', async function () {
        options["capture.recordRewrites"] = false;

        var blob = await capture({
          url: `${localhost}/capture_record/attrs2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        // attr
        assertNoRecord(doc);
      });
    });

    describe('record changed attributes: base elements', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.recordRewrites": true,
      });

      it('capture.base = save', async function () {
        options["capture.base"] = "save";

        var blob = await capture({
          url: `${localhost}/capture_record/attrs3.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('base').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.html`);
      });

      it('capture.base = blank', async function () {
        options["capture.base"] = "blank";

        var blob = await capture({
          url: `${localhost}/capture_record/attrs3.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('base').getAttribute(`data-scrapbook-orig-attr-href-${timeId}`), `./null.html`);
      });
    });
  });

  /**
   * capturer.captureDocument
   * capturer.downloadFile
   * capturer.captureUrl
   * capturer.captureBookmark
   */
  describe('linkUnsavedUri', function () {
    describe('basic', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error1.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.css");
@font-face { font-family: myFont; src: url("urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.woff"); }
p { background-image: url("urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp"); }`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.css`);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.js`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp 1x, urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.bmp 2x`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.html`);
      });

      it('+capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error1.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("${localhost}/capture_linkUnsavedUri/nonexist.css");
@font-face { font-family: myFont; src: url("${localhost}/capture_linkUnsavedUri/nonexist.woff"); }
p { background-image: url("${localhost}/capture_linkUnsavedUri/nonexist.bmp"); }`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.css`);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), `${localhost}/capture_linkUnsavedUri/nonexist.js`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `${localhost}/capture_linkUnsavedUri/nonexist.bmp`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `${localhost}/capture_linkUnsavedUri/nonexist.bmp 1x, ${localhost}/capture_linkUnsavedUri/nonexist.bmp 2x`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `${localhost}/capture_linkUnsavedUri/nonexist.html`);
      });
    });

    describe('downLink', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri; mode = url', async function () {
        options["capture.downLink.file.mode"] = "url";
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        // downLink, error
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_linkUnsavedUri/nonexist.txt`);

        // no downLink, no error
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.css`);
      });

      it('-capture.linkUnsavedUri; mode = header', async function () {
        options["capture.downLink.file.mode"] = "header";
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.css`);
      });

      it('+capture.linkUnsavedUri', async function () {
        options["capture.downLink.file.mode"] = "url";
        options["capture.linkUnsavedUri"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error2.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_linkUnsavedUri/nonexist.css`);
      });
    });

    /**
     * Should NOT generate error URL for non-absolute URLs.
     */
    describe('empty URL', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error3.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("");
@font-face { font-family: myFont; src: url(""); }
p { background-image: url(""); }`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('href'), ``);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), ``);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), ``);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), ``);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), ``);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), ``);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), ``);
      });
    });

    /**
     * Should NOT generate error URL for non-absolute URLs.
     */
    describe('hash URL', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error4.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("#123");
@font-face { font-family: myFont; src: url("#123"); }
p { background-image: url("#123"); }`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('href'), `#123`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), `#123`);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), `#123`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `#123`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `#123 1x, #123 2x`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `#123`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `#123`);
      });
    });

    /**
     * Should NOT generate error URL for non-absolute URLs.
     */
    describe('non-resolvable URL', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error5.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        var frameFile = zip.file(doc.querySelector('iframe').getAttribute('src'));
        var frameBlob = new Blob([await frameFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(frameBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("nonexist.css");
@font-face { font-family: myFont; src: url("nonexist.woff"); }
p { background-image: url("nonexist.bmp"); }`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('href'), `nonexist.bmp`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), `nonexist.css`);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), `nonexist.js`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `nonexist.bmp`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `nonexist.bmp 1x, nonexist.bmp 2x`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `nonexist.html`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `nonexist.txt`);
        assert.strictEqual(doc.querySelector('a[name]').getAttribute('href'), `nonexist.css`);
      });
    });

    /**
     * Should NOT generate error URL if the protocol is not http, https, file, or about.
     */
    describe('other protocol URL', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_linkUnsavedUri/error6.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);
        var timeId = doc.documentElement.getAttribute('data-scrapbook-create');

        assert.strictEqual(doc.querySelector('style').textContent.trim(), `@import url("ftp://example.com/nonexist.css");
@font-face { font-family: myFont; src: url("ftp://example.com/nonexist.woff"); }
p { background-image: url("ftp://example.com/nonexist.bmp"); }`);
        assert.strictEqual(doc.querySelector('link[rel~="icon"]').getAttribute('href'), `ftp://example.com/nonexist.bmp`);
        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), `ftp://example.com/nonexist.css`);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), `ftp://example.com/nonexist.js`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `ftp://example.com/nonexist.bmp`);
        assert.strictEqual(doc.querySelector('img[srcset]').getAttribute('srcset'), `ftp://example.com/nonexist.bmp 1x, ftp://example.com/nonexist.bmp 2x`);
        assert.strictEqual(doc.querySelector('iframe').getAttribute('src'), `ftp://example.com/nonexist.html`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `ftp://example.com/nonexist.txt`);
        assert.strictEqual(doc.querySelector('a[name]').getAttribute('href'), `mailto:nonexist@example.com`);
      });
    });

    /**
     * Should record briefly for data and blob URL.
     */
    describe('blob URL', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.image": "save",
        "capture.imageBackground": "save",
        "capture.favicon": "save",
        "capture.frame": "save",
        "capture.font": "save",
        "capture.style": "save",
        "capture.rewriteCss": "url",
        "capture.script": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.urlFilter": "",
      });

      it('-capture.linkUnsavedUri', async function () {
        options["capture.linkUnsavedUri"] = false;

        var blob = await capture({
          url: `${localhost}/capture_linkUnsavedUri/error7.html`,
          options,
        });
        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelector('link[rel="stylesheet"]').getAttribute('href'), `urn:scrapbook:download:error:blob:`);
        assert.strictEqual(doc.querySelector('script').getAttribute('src'), `urn:scrapbook:download:error:blob:`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `urn:scrapbook:download:error:blob:`);
      });
    });
  });

  describe('insertInfoBar', function () {
    var options = Object.assign({}, baseOptions, {});

    it('capture.insertInfoBar = true', async function () {
      options["capture.insertInfoBar"] = true;

      var blob = await capture({
        url: `${localhost}/capture_insertInfoBar/index.html`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.exists(doc.querySelector('script[data-scrapbook-elem="infobar-loader"]'));
    });

    it('capture.insertInfoBar = false', async function () {
      options["capture.insertInfoBar"] = false;

      var blob = await capture({
        url: `${localhost}/capture_insertInfoBar/index.html`,
        options,
      });
      var zip = await new JSZip().loadAsync(blob);
      var indexFile = zip.file('index.html');
      var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
      var doc = await readFileAsDocument(indexBlob);

      assert.notExists(doc.querySelector('script[data-scrapbook-elem="infobar-loader"]'));
    });
  });

  describe('sizeLimit', function () {
    describe('should apply to normal resource and CSS', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "save",
        "capture.image": "save",
        "capture.downLink.file.mode": "url",
        "capture.downLink.file.extFilter": "txt",
        "capture.downLink.doc.depth": 1,
        "capture.downLink.urlFilter": "",
      });

      it('sizeLimit = null', async function () {
        options["capture.resourceSizeLimit"] = null;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('link.css'));
        assert.exists(zip.file('link2.css'));
        assert.exists(zip.file('img.bmp'));
        assert.exists(zip.file('img2.bmp'));
        assert.exists(zip.file('linked.txt'));
        assert.exists(zip.file('linked2.txt'));
        assert.exists(zip.file('linked.html'));
        assert.exists(zip.file('linked2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('link')[0].getAttribute('href'), `link.css`);
        assert.strictEqual(doc.querySelectorAll('link')[1].getAttribute('href'), `link2.css`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `img.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `img2.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `linked2.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked.html`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `linked2.html`);
      });

      it('sizeLimit = 1KB; linkUnsavedUri = false', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('link.css'));
        assert.notExists(zip.file('link2.css'));
        assert.exists(zip.file('img.bmp'));
        assert.notExists(zip.file('img2.bmp'));
        assert.exists(zip.file('linked.txt'));
        assert.notExists(zip.file('linked2.txt'));
        assert.exists(zip.file('linked.html'));
        assert.notExists(zip.file('linked2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('link')[0].getAttribute('href'), `link.css`);
        assert.strictEqual(doc.querySelectorAll('link')[1].getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/link2.css`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `img.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/img2.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `urn:scrapbook:download:error:${localhost}/capture_sizeLimit/linked2.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked.html`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_sizeLimit/linked2.html`);
      });

      it('sizeLimit = 1KB; linkUnsavedUri = true', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = true;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('link.css'));
        assert.notExists(zip.file('link2.css'));
        assert.exists(zip.file('img.bmp'));
        assert.notExists(zip.file('img2.bmp'));
        assert.exists(zip.file('linked.txt'));
        assert.notExists(zip.file('linked2.txt'));
        assert.exists(zip.file('linked.html'));
        assert.notExists(zip.file('linked2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('link')[0].getAttribute('href'), `link.css`);
        assert.strictEqual(doc.querySelectorAll('link')[1].getAttribute('href'), `${localhost}/capture_sizeLimit/link2.css`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `img.bmp`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `${localhost}/capture_sizeLimit/img2.bmp`);
        assert.strictEqual(doc.querySelectorAll('a')[0].getAttribute('href'), `linked.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[1].getAttribute('href'), `${localhost}/capture_sizeLimit/linked2.txt`);
        assert.strictEqual(doc.querySelectorAll('a')[2].getAttribute('href'), `linked.html`);
        assert.strictEqual(doc.querySelectorAll('a')[3].getAttribute('href'), `${localhost}/capture_sizeLimit/linked2.html`);
      });
    });

    describe('should apply to headless frames', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
        "capture.frame": "save",
      });

      it('sizeLimit = null', async function () {
        options["capture.resourceSizeLimit"] = null;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit_frame/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index_1.html'));
        assert.exists(zip.file('index_2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });

      it('sizeLimit = 1KB; linkUnsavedUri = false', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit_frame/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index_1.html'));
        assert.exists(zip.file('index_2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });

      it('sizeLimit = 1KB; linkUnsavedUri = true', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = true;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit_frame/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index_1.html'));
        assert.exists(zip.file('index_2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });

      it('sizeLimit = null; headless', async function () {
        options["capture.resourceSizeLimit"] = null;

        var blob = await captureHeadless({
          url: `${localhost}/capture_sizeLimit_frame/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index_1.html'));
        assert.exists(zip.file('index_2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });

      it('sizeLimit = 1KB; linkUnsavedUri = false; headless', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_sizeLimit_frame/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index_1.html'));
        assert.notExists(zip.file('index_2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `urn:scrapbook:download:error:${localhost}/capture_sizeLimit_frame/iframe2.html`);
      });

      it('sizeLimit = 1KB; linkUnsavedUri = true; headless', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_sizeLimit_frame/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file('index_1.html'));
        assert.notExists(zip.file('index_2.html'));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `${localhost}/capture_sizeLimit_frame/iframe2.html`);
      });
    });

    describe('should NOT apply to data URL', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.style": "save",
        "capture.image": "save",
      });

      it('sizeLimit = 1KB', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;
        options["capture.saveDataUriAsFile"] = true;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit_datauri/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('link')[0].getAttribute('href'), `e06bed7af2c6b885afd226014f801aaba2e355f7.css`);
        assert.strictEqual(doc.querySelectorAll('link')[1].getAttribute('href'), `275502e8b8f6089c3b23980127a4b237c92ebd91.css`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `f3c161973c06d37459e1fa3e14b78387fd4216f7.svg`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `5aa9b03760d4bac901b27efe48a29b210d0bc6ec.svg`);
      });

      it('sizeLimit = 1KB; headless', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;
        options["capture.saveDataUriAsFile"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_sizeLimit_datauri/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('link')[0].getAttribute('href'), `e06bed7af2c6b885afd226014f801aaba2e355f7.css`);
        assert.strictEqual(doc.querySelectorAll('link')[1].getAttribute('href'), `275502e8b8f6089c3b23980127a4b237c92ebd91.css`);
        assert.strictEqual(doc.querySelectorAll('img')[0].getAttribute('src'), `f3c161973c06d37459e1fa3e14b78387fd4216f7.svg`);
        assert.strictEqual(doc.querySelectorAll('img')[1].getAttribute('src'), `5aa9b03760d4bac901b27efe48a29b210d0bc6ec.svg`);
      });
    });

    describe('should NOT apply to data URL (for frames)', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
        "capture.frame": "save",
      });

      it('sizeLimit = 1KB', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;
        options["capture.saveDataUriAsFile"] = true;

        var blob = await captureHeadless({
          url: `${localhost}/capture_sizeLimit_frame_datauri/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });

      it('sizeLimit = 1KB; headless', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;
        options["capture.saveDataUriAsFile"] = true;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit_frame_datauri/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });
    });

    describe('should NOT apply to srcdoc', function () {
      var options = Object.assign({}, baseOptions, {
        "capture.saveResourcesSequentially": true,
        "capture.frame": "save",
      });

      it('sizeLimit = 1KB', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;

        var blob = await capture({
          url: `${localhost}/capture_sizeLimit_frame_srcdoc/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });

      it('sizeLimit = 1KB; headless', async function () {
        options["capture.resourceSizeLimit"] = 1 / 1024;
        options["capture.linkUnsavedUri"] = false;

        var blob = await captureHeadless({
          url: `${localhost}/capture_sizeLimit_frame_srcdoc/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.strictEqual(doc.querySelectorAll('iframe')[0].getAttribute('src'), `index_1.html`);
        assert.strictEqual(doc.querySelectorAll('iframe')[1].getAttribute('src'), `index_2.html`);
      });
    });
  });

  describe('capture helpers', function () {
    describe('basic', function () {
      it('capture.helpers set and enabled', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": true,
          "capture.helpers": JSON.stringify([
            {
              "commands": [
                ["remove", "#exclude, .exclude, img"],
              ],
            },
          ]),
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/basic/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.notExists(zip.file("red.bmp"));
        assert.notExists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('#exclude'));
        assert.notExists(doc.querySelector('.exclude'));
        assert.notExists(doc.querySelector('img'));
      });

      it('capture.helpers set and enabled (debug = true, debugging commands)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": true,
          "capture.helpers": JSON.stringify([
            {
              "debug": true,
              "commands": [
                ["*remove", "#exclude, .exclude, img"],
              ],
            },
          ]),
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/basic/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.notExists(zip.file("red.bmp"));
        assert.notExists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('#exclude'));
        assert.notExists(doc.querySelector('.exclude'));
        assert.notExists(doc.querySelector('img'));
      });

      it('capture.helpers set and enabled (debug = false, debugging commands)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": true,
          "capture.helpers": JSON.stringify([
            {
              "debug": false,
              "commands": [
                ["*remove", "#exclude, .exclude, img"],
              ],
            },
          ]),
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/basic/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.notExists(zip.file("red.bmp"));
        assert.notExists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.notExists(doc.querySelector('#exclude'));
        assert.notExists(doc.querySelector('.exclude'));
        assert.notExists(doc.querySelector('img'));
      });

      it('capture.helpers set and not enabled', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": false,
          "capture.helpers": JSON.stringify([
            {
              "commands": [
                ["remove", "#exclude, .exclude, img"],
              ],
            },
          ]),
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/basic/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("red.bmp"));
        assert.exists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.exists(doc.querySelector('#exclude'));
        assert.exists(doc.querySelector('.exclude'));
        assert.exists(doc.querySelector('img'));
      });

      it('capture.helpers not set', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": true,
          "capture.helpers": "",
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/basic/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("red.bmp"));
        assert.exists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.exists(doc.querySelector('#exclude'));
        assert.exists(doc.querySelector('.exclude'));
        assert.exists(doc.querySelector('img'));
      });

      it('capture.helpers invalid (regard as not set)', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": true,
          "capture.helpers": `[bad syntax]`,
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/basic/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("red.bmp"));
        assert.exists(zip.file("green.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.exists(doc.querySelector('#exclude'));
        assert.exists(doc.querySelector('.exclude'));
        assert.exists(doc.querySelector('img'));
      });
    });

    describe('nested', function () {
      it('basic', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.helpersEnabled": true,
          "capture.helpers": JSON.stringify([
            {
              "commands": [
                ["attr", {"css": "img[data-src]"}, "src", ["get_attr", null, "data-src"]],
              ],
            },
          ]),
        });

        var blob = await capture({
          url: `${localhost}/capture_helpers/nesting/index.html`,
          options,
        });

        var zip = await new JSZip().loadAsync(blob);
        assert.exists(zip.file("index.html"));
        assert.exists(zip.file("green.bmp"));
        assert.notExists(zip.file("red.bmp"));

        var indexFile = zip.file('index.html');
        var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
        var doc = await readFileAsDocument(indexBlob);

        assert.exists(doc.querySelector('img[src="green.bmp"]'));
      });
    });

    describe('options', function () {
      describe('basic', function () {
        it('capture.helpers set and enabled', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "options": {
                  "capture.image": "remove",
                },
              },
            ]),
          });

          var blob = await capture({
            url: `${localhost}/capture_helpers/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("index.html"));
          assert.exists(zip.file("red.bmp"));
          assert.notExists(zip.file("green.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('img'));
        });

        it('capture.helpers set and not enabled', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": false,
            "capture.helpers": JSON.stringify([
              {
                "options": {
                  "capture.image": "remove",
                },
              },
            ]),
          });

          var blob = await capture({
            url: `${localhost}/capture_helpers/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("index.html"));
          assert.exists(zip.file("red.bmp"));
          assert.exists(zip.file("green.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('img'));
        });

        it('capture.helpers with matching URL (tab)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "//capture_helpers//",
                "options": {
                  "capture.image": "remove",
                },
              },
            ]),
          });

          var blob = await capture({
            url: `${localhost}/capture_helpers/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("index.html"));
          assert.exists(zip.file("red.bmp"));
          assert.notExists(zip.file("green.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('img'));
        });

        it('capture.helpers with non-matching URL (tab)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "/(?!)/",
                "options": {
                  "capture.image": "remove",
                },
              },
            ]),
          });

          var blob = await capture({
            url: `${localhost}/capture_helpers/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("index.html"));
          assert.exists(zip.file("red.bmp"));
          assert.exists(zip.file("green.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('img'));
        });

        it('capture.helpers with matching URL (source)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "//capture_helpers//",
                "options": {
                  "capture.image": "remove",
                },
              },
            ]),
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("index.html"));
          assert.exists(zip.file("red.bmp"));
          assert.notExists(zip.file("green.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('img'));
        });

        it('capture.helpers with non-matching URL (source)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "/(?!)/",
                "options": {
                  "capture.image": "remove",
                },
              },
            ]),
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/basic/index.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          assert.exists(zip.file("index.html"));
          assert.exists(zip.file("red.bmp"));
          assert.exists(zip.file("green.bmp"));

          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('img'));
        });
      });

      describe('redirect', function () {
        it('capture.helpers with matching URL (source)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "/redirected\\.html/",
                "options": {
                  "capture.style": "remove",
                },
              },
            ]),
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/redirect/redirect.pyr`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('style'));
        });

        it('capture.helpers with non-matching URL (source)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "/redirect\\.pyr/",
                "options": {
                  "capture.style": "remove",
                },
              },
            ]),
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/redirect/redirect.pyr`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('style'));
        });

        it('capture.resourceSizeLimit should not apply for the initial fetch', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": `[]`,
            "capture.resourceSizeLimit": 0,
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/redirect/redirect.pyr`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc);
        });
      });

      describe('refresh', function () {
        it('capture.helpers with matching URL (source)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "/redirected\\.html/",
                "options": {
                  "capture.style": "remove",
                },
              },
            ]),
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/redirect/refresh.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.notExists(doc.querySelector('style'));
        });

        it('capture.helpers with non-matching URL (source)', async function () {
          var options = Object.assign({}, baseOptions, {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                "pattern": "/refresh\\.html/",
                "options": {
                  "capture.style": "remove",
                },
              },
            ]),
          });

          var blob = await captureHeadless({
            url: `${localhost}/capture_helpers/redirect/refresh.html`,
            options,
          });

          var zip = await new JSZip().loadAsync(blob);
          var indexFile = zip.file('index.html');
          var indexBlob = new Blob([await indexFile.async('blob')], {type: "text/html"});
          var doc = await readFileAsDocument(indexBlob);
          assert.exists(doc.querySelector('style'));
        });
      });
    });
  });

  describe('recapture', function () {
    describe('basic', function () {
      var itemId;
      var itemId2;

      before('perform recapture', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
        });

        var response = await capture({
          url: `${localhost}/capture_recapture/page1/index.html`,
          options,
        }, {rawResponse: true});
        ({timeId: itemId} = response);

        // these overriding options should be safely ignored
        var options = Object.assign(options, {
          "capture.helpersEnabled": true,
          "capture.helpers": JSON.stringify([
            {
              "options": {
                "capture.saveTo": "folder",
              },
            },
          ]),
        });

        var response = await captureHeadless({
          url: `${localhost}/capture_recapture/page2/index.html`,
          options,
          recaptureInfo: {bookId: "", itemId},
        }, {rawResponse: true});
        ({timeId: itemId2} = response);
      });

      it('remove original files', async function () {
        var {data: response} = await backendRequest({
          url: `${backend}/data/${itemId}`,
          body: {f: 'json', a: 'info'},
        }).then(r => r.json());
        assert.isNull(response.type);
      });

      it('save recaptured files to the new ID path', async function () {
        var doc = (await xhr({
          url: `${backend}/data/${itemId2}/index.html`,
          responseType: "document",
        })).response;
        assert.strictEqual(doc.querySelector('p').textContent, `Page content 2`);
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `yellow.bmp`);

        var {data: response} = await backendRequest({
          url: `${backend}/data/${itemId2}`,
          body: {f: 'json', a: 'list'},
        }).then(r => r.json());
        assert.sameMembers(response.map(r => r.name), [
          "index.html",
          "fav2.bmp",
          "yellow.bmp",
        ]);
      });

      it('update index, icon, and mtime of the item', async function () {
        var {data: [response]} = await backendRequest({
          body: {
            a: 'query',
            f: 'json',
            q: JSON.stringify({
              book: '',
              cmd: 'get_items',
              args: [[itemId, itemId2]],
            }),
            details: 1,
          },
          csrfToken: true,
        }).then(r => r.json());
        assert.hasAllKeys(response, [itemId]);  // no itemId2
        assert.deepInclude(response[itemId].meta, {
          index: `${itemId2}/index.html`,
          title: "Page1",
          type: "",
          create: itemId,
          source: `${localhost}/capture_recapture/page2/index.html`,
          icon: "fav2.bmp",
        });
        assert(response[itemId].meta.modify > itemId);
        assert(response[itemId].meta.modify > itemId2);
      });
    });

    describe('migrate annotations', function () {
      it('linemarker', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
        });

        var response = await capture({
          url: `${localhost}/capture_recapture_migrate/page1/index.html`,
          options,
        }, {rawResponse: true});
        var {timeId: itemId} = response;

        var html = await backendRequest({
          url: `${backend}/data/${itemId}/index.html`,
        }).then(r => r.text());
        var body = `\
<p>Lorem ipsum dolor sit amet, <scrapbook-linemarker data-scrapbook-id="20240928140450705" data-scrapbook-elem="linemarker" style="background-color: yellow;" class="first last">consectetur adipiscing elit</scrapbook-linemarker>. Maecenas suscipit maximus. Sed urna nisl, rhoncus vel finibus eget, elementum sed massa. Interdum et malesuada fames ac ante ipsum primis in faucibus.</p>
<p>Integer placerat viverra augue quis fermentum. <scrapbook-linemarker data-scrapbook-id="20240928140505409" data-scrapbook-elem="linemarker" style="background-color: yellow;" class="first last">Quisque at felis interdum, finibus sapien eu, feugiat ipsum.</scrapbook-linemarker> Etiam sed massa at felis maximus semper. Quisque eu orci fringilla odio lobortis elementum.</p>
`;
        html = html.replace(regex`<body>([\s\S]*?)</body>`, `<body>${body}</body>`);

        /* recapture same document */
        var response = await backendRequest({
          url: `${backend}/data/${itemId}/index.html`,
          body: {
            a: 'save',
            f: 'json',
            upload: new File([html], `index.json`, {type: "text/javascript"}),
          },
          csrfToken: true,
        }).then(r => r.json());

        var response = await captureHeadless({
          url: `${localhost}/capture_recapture_migrate/page1/index.html`,
          options,
          recaptureInfo: {bookId: "", itemId},
        }, {rawResponse: true});
        var {timeId: itemId2} = response;

        var doc = (await xhr({
          url: `${backend}/data/${itemId2}/index.html`,
          responseType: "document",
        })).response;
        assert.exists(doc.querySelector('scrapbook-linemarker[data-scrapbook-id="20240928140450705"]'));
        assert.exists(doc.querySelector('scrapbook-linemarker[data-scrapbook-id="20240928140505409"]'));

        /* recapture slightly modified document */
        var response = await captureHeadless({
          url: `${localhost}/capture_recapture_migrate/page2/index.html`,
          options,
          recaptureInfo: {bookId: "", itemId},
        }, {rawResponse: true});
        var {timeId: itemId3} = response;

        var doc = (await xhr({
          url: `${backend}/data/${itemId3}/index.html`,
          responseType: "document",
        })).response;
        var pElems = doc.querySelectorAll('p');
        assert.strictEqual(pElems[0].innerHTML, `Lorem ipsum dolor sit amet, <scrapbook-linemarker data-scrapbook-id="20240928140450705" data-scrapbook-elem="linemarker" style="background-color: yellow;" class="first last">consectetur adipiscing elit</scrapbook-linemarker>. Maecenas tincidunt suscipit maximus. Interdum et malesuada faucibus.`);
        assert.strictEqual(pElems[1].innerHTML, `Integer placerat viverra augue quis fermentum. Quisque at felis interdum, feugiat ipsum. Etiam sed massa at felis maximus semper. Quisque eu orci fringilla odio lobortis elementum.`);
      });

      it('sticky', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
        });

        var response = await capture({
          url: `${localhost}/capture_recapture_migrate/page1/index.html`,
          options,
        }, {rawResponse: true});
        var {timeId: itemId} = response;

        var html = await backendRequest({
          url: `${backend}/data/${itemId}/index.html`,
        }).then(r => r.text());
        var body = `\
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas suscipit maximus. Sed urna nisl, rhoncus vel finibus eget, elementum sed massa. Interdum et malesuada fames ac ante ipsum primis in faucibus.</p><scrapbook-sticky data-scrapbook-id="20240928140529186" data-scrapbook-elem="sticky" class="styled plaintext relative">relative note</scrapbook-sticky>
<p>Integer placerat viverra augue quis fermentum. Quisque at felis interdum, finibus sapien eu, feugiat ipsum. Etiam sed massa at felis maximus semper. Quisque eu orci fringilla odio lobortis elementum.</p>
<scrapbook-sticky data-scrapbook-id="20240928140509146" data-scrapbook-elem="sticky" class="styled plaintext" style="left: 265px; top: 169px; width: 250px; height: 100px;">absolute note</scrapbook-sticky><style data-scrapbook-elem="annotation-css">[data-scrapbook-elem="linemarker"][title] { cursor: help; } [data-scrapbook-elem="sticky"] { display: block; overflow: auto; } [data-scrapbook-elem="sticky"].styled { position: absolute; z-index: 2147483647; opacity: .95; box-sizing: border-box; margin: 0; border: 1px solid #CCCCCC; border-top-width: 1.25em; border-radius: .25em; padding: .25em; min-width: 6em; min-height: 4em; background: #FAFFFA; box-shadow: .15em .15em .3em black; font: .875em/1.2 sans-serif; color: black; overflow-wrap: break-word; cursor: help; } [data-scrapbook-elem="sticky"].styled.relative { position: relative; margin: 16px auto; } [data-scrapbook-elem="sticky"].styled.plaintext { white-space: pre-wrap; } [data-scrapbook-elem="sticky"].dragging { opacity: .75; } </style><script data-scrapbook-elem="annotation-loader">(function () { var w = window, d = document, r = d.documentElement, e; d.addEventListener('click', function (E) { if (r.hasAttribute('data-scrapbook-toolbar-active')) { return; } if (!w.getSelection().isCollapsed) { return; } e = E.target; if (e.matches('[data-scrapbook-elem="linemarker"]')) { if (e.title) { if (!confirm(e.title)) { E.preventDefault(); E.stopPropagation(); } } } else if (e.matches('[data-scrapbook-elem="sticky"]')) { if (confirm('刪除這個批註嗎？')) { e.parentNode.removeChild(e); E.preventDefault(); E.stopPropagation(); } } }, true); })()</script>`;
        html = html.replace(regex`<body>([\s\S]*?)</body>`, `<body>${body}</body>`);

        /* recapture same document */
        var response = await backendRequest({
          url: `${backend}/data/${itemId}/index.html`,
          body: {
            a: 'save',
            f: 'json',
            upload: new File([html], `index.json`, {type: "text/javascript"}),
          },
          csrfToken: true,
        }).then(r => r.json());

        var response = await captureHeadless({
          url: `${localhost}/capture_recapture_migrate/page1/index.html`,
          options,
          recaptureInfo: {bookId: "", itemId},
        }, {rawResponse: true});
        var {timeId: itemId2} = response;

        var doc = (await xhr({
          url: `${backend}/data/${itemId2}/index.html`,
          responseType: "document",
        })).response;
        assert.exists(doc.querySelector('scrapbook-sticky[data-scrapbook-id="20240928140529186"]'));
        assert.exists(doc.querySelector('scrapbook-sticky[data-scrapbook-id="20240928140509146"]'));

        /* recapture slightly modified document */
        var response = await captureHeadless({
          url: `${localhost}/capture_recapture_migrate/page2/index.html`,
          options,
          recaptureInfo: {bookId: "", itemId},
        }, {rawResponse: true});
        var {timeId: itemId3} = response;

        var doc = (await xhr({
          url: `${backend}/data/${itemId3}/index.html`,
          responseType: "document",
        })).response;
        assert.exists(doc.querySelector('scrapbook-sticky[data-scrapbook-id="20240928140529186"]'));
        assert.exists(doc.querySelector('scrapbook-sticky[data-scrapbook-id="20240928140509146"]'));
      });
    });
  });

  describe('merge capture', function () {
    describe('basic', function () {
      var itemId;

      before('perform merge capture', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
          "capture.downLink.doc.depth": 0,
        });

        var response = await capture({
          url: `${localhost}/capture_mergeCapture/main.html`,
          options,
        }, {rawResponse: true});

        ({timeId: itemId} = response);
        var mergeCaptureInfo = {bookId: "", itemId};

        // these overriding options should be safely ignored
        var options = Object.assign(options, {
          "capture.helpersEnabled": true,
          "capture.helpers": JSON.stringify([
            {
              "options": {
                "capture.saveTo": "folder",
                "capture.saveAs": "zip",
                "capture.saveOverwrite": false,
              },
            },
          ]),
        });

        var response = await capture({
          url: `${localhost}/capture_mergeCapture/linked1-1.html`,
          options,
          mergeCaptureInfo,
        }, {rawResponse: true});

        var response = await capture({
          url: `${localhost}/capture_mergeCapture/linked1-2.xhtml`,
          options,
          mergeCaptureInfo,
        }, {rawResponse: true});

        var response = await capture({
          url: `${localhost}/capture_mergeCapture/linked1-3.svg`,
          options,
          mergeCaptureInfo,
        }, {rawResponse: true});

        var response = await capture({
          url: `${localhost}/capture_mergeCapture/linked1-4.txt`,
          options,
          mergeCaptureInfo,
        }, {rawResponse: true});
      });

      it('should add captured resources', async function () {
        var doc = (await xhr({
          url: `${backend}/data/${itemId}/index.html`,
          responseType: "document",
        })).response;
        var anchors = doc.querySelectorAll('a[href]');
        assert.strictEqual(anchors[0].getAttribute('href'), `linked1-1.html#111`);
        assert.strictEqual(anchors[1].getAttribute('href'), `linked1-2.xhtml#222`);
        assert.strictEqual(anchors[2].getAttribute('href'), `linked1-3.svg#333`);

        // Currently we don't rewrite links for resources, which introduces an
        // issue where links to the same URL with a different role be
        // incorrectly rewritten. (see `should not capture attachment pages`)
        //
        // To prevent such issue, linked files should initially be captured
        // using the `downLink.file.*` options, or perform a merge capture for
        // the main page with such options.
        // (see `should capture same main document with updated content`)
        assert.strictEqual(anchors[3].getAttribute('href'), `${localhost}/capture_mergeCapture/linked1-4.txt#444`);

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/linked1-1.html`,
          responseType: "document",
        })).response;
        assert.strictEqual(doc.querySelector('p').textContent, `Linked page 1-1.`);

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/linked1-2.xhtml`,
          responseType: "document",
        })).response;
        assert.strictEqual(doc.querySelector('p').textContent, `Linked page 1-2.`);

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/linked1-3.svg`,
          responseType: "document",
        })).response;
        assert.exists(doc.querySelector('rect'));

        var text = (await xhr({
          url: `${backend}/data/${itemId}/linked1-4.txt`,
        })).response;
        assert.strictEqual(text, 'Linked file 1-4.');
      });

      it('should add each main page of the merge capture to `indexPages` in `index.json`', async function () {
        var sitemap = await backendRequest({
          url: `${backend}/data/${itemId}/index.json`,
        }).then(r => r.json());
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
            "linked1-1.html",
            "linked1-2.xhtml",
            "linked1-3.svg",
            "linked1-4.txt",
          ],
          "redirects": [],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_mergeCapture/main.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture/main.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "linked1-1.html",
              "url": `${localhost}/capture_mergeCapture/linked1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture/linked1-1.html`, "document"),
            },
            {
              "path": "linked1-2.xhtml",
              "url": `${localhost}/capture_mergeCapture/linked1-2.xhtml`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture/linked1-2.xhtml`, "document"),
            },
            {
              "path": "linked1-3.svg",
              "url": `${localhost}/capture_mergeCapture/linked1-3.svg`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture/linked1-3.svg`, "document"),
            },
            {
              "path": "linked1-4.txt",
              "url": `${localhost}/capture_mergeCapture/linked1-4.txt`,
              "role": "resource",
              "token": getToken(`${localhost}/capture_mergeCapture/linked1-4.txt`, "resource"),
            },
          ],
        };
        assert.deepEqual(sitemap, expectedData);
      });

      it('should update mtime of the item', async function () {
        var {data: [response]} = await backendRequest({
          body: {
            a: 'query',
            f: 'json',
            q: JSON.stringify({
              book: '',
              cmd: 'get_items',
              args: [[itemId]],
            }),
            details: 1,
          },
          csrfToken: true,
        }).then(r => r.json());
        assert.deepInclude(response[itemId].meta, {
          index: `${itemId}/index.html`,
          title: "main.html",
          type: "site",
          create: itemId,
          source: `${localhost}/capture_mergeCapture/main.html`,
        });
        assert(response[itemId].meta.modify > itemId);
      });
    });

    describe('recapture', function () {
      it('should capture same main document with updated content', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
          "capture.downLink.doc.depth": 0,
        });

        var response = await capture({
          url: `${localhost}/capture_mergeCapture_again/main.html`,
          options,
        }, {rawResponse: true});
        var {timeId: itemId} = response;

        var {data} = await backendRequest({
          url: `${backend}/data/${itemId}`,
          body: {f: 'json', a: 'list'},
        }).then(r => r.json());
        assert.sameMembers(data.map(r => r.name), [
          'index.html',
          'index.json',
          'red.bmp',
        ]);

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/index.html`,
          responseType: "document",
        })).response;
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `red.bmp`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `${localhost}/capture_mergeCapture_again/attachment.txt`);

        // recapture
        var options = Object.assign({}, options, {
          "capture.downLink.file.mode": "url",
          "capture.downLink.file.extFilter": "txt",
        });

        var response = await captureHeadless({
          url: `${localhost}/capture_mergeCapture_again/main.html`,
          options,
          mergeCaptureInfo: {bookId: "", itemId},
        }, {rawResponse: true});

        var {data: response} = await backendRequest({
          url: `${backend}/data/${itemId}`,
          body: {f: 'json', a: 'list'},
        }).then(r => r.json());
        assert.sameMembers(response.map(r => r.name), [
          'index.html',
          'index.json',
          'red.bmp',
          'green.bmp',
          'attachment.txt',
        ]);

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/index.html`,
          responseType: "document",
        })).response;
        assert.strictEqual(doc.querySelector('img').getAttribute('src'), `green.bmp`);
        assert.strictEqual(doc.querySelector('a').getAttribute('href'), `attachment.txt`);
      });
    });

    describe('redirect', function () {
      it('should rewrite every link to a URL that redirects to a resource with an existing captured version in an added page', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
          "capture.downLink.doc.depth": 1,
        });

        var response = await capture({
          url: `${localhost}/capture_mergeCapture_redirect/main.html`,
          options,
        }, {rawResponse: true});

        var bookId = "";
        var {timeId: itemId} = response;

        var options = baseOptions;
        var response = await capture({
          url: `${localhost}/capture_mergeCapture_redirect/other.html`,
          options,
          mergeCaptureInfo: {bookId, itemId},
        }, {rawResponse: true});

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/index.html`,
          responseType: "document",
        })).response;
        var anchors = doc.querySelectorAll('a[href]');
        assert.strictEqual(anchors[0].getAttribute('href'), `redirected1-1.html#111`);
        assert.strictEqual(anchors[1].getAttribute('href'), `redirected1-2.xhtml#222`);

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/other.html`,
          responseType: "document",
        })).response;
        var anchors = doc.querySelectorAll('a[href]');
        assert.strictEqual(anchors[0].getAttribute('href'), `redirected1-1.html#x111`);
        assert.strictEqual(anchors[1].getAttribute('href'), `redirected1-2.xhtml#x222`);

        var sitemap = await backendRequest({
          url: `${backend}/data/${itemId}/index.json`,
        }).then(r => r.json());
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
            "other.html",
          ],
          "redirects": [
            [
              `${localhost}/capture_mergeCapture_redirect/linked1-1.pyr`,
              `${localhost}/capture_mergeCapture_redirect/redirected1-1.html`,
            ],
            [
              `${localhost}/capture_mergeCapture_redirect/linked1-2.pyr`,
              `${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`,
            ],
          ],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_mergeCapture_redirect/main.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/main.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "redirected1-1.html",
              "url": `${localhost}/capture_mergeCapture_redirect/redirected1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/redirected1-1.html`, "document"),
            },
            {
              "path": "redirected1-2.xhtml",
              "url": `${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`, "document"),
            },
            {
              "path": "other.html",
              "url": `${localhost}/capture_mergeCapture_redirect/other.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/other.html`, "document"),
            },
          ],
        };
        assert.deepEqual(sitemap, expectedData);
      });

      it('should honor `redirects` in `index.json` when rebuilding links', async function () {
        var options = Object.assign({}, baseOptions, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
          "capture.downLink.doc.depth": 0,
        });

        var response = await capture({
          url: `${localhost}/capture_mergeCapture_redirect/main.html`,
          options,
        }, {rawResponse: true});

        var bookId = "";
        var {timeId: itemId} = response;

        var sitemap = await backendRequest({
          url: `${backend}/data/${itemId}/index.json`,
        }).then(r => r.json());

        sitemap.redirects = [
          [
            `${localhost}/capture_mergeCapture_redirect/linked1-1.pyr`,
            `${localhost}/capture_mergeCapture_redirect/redirected1-1.html`,
          ],
          [
            `${localhost}/capture_mergeCapture_redirect/linked1-2.pyr`,
            `${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`,
          ],
        ];

        var response = await backendRequest({
          url: `${backend}/data/${itemId}/index.json`,
          body: {
            a: 'save',
            f: 'json',
            upload: new File([JSON.stringify(sitemap, null, 1)], `index.json`, {type: "text/javascript"}),
          },
          csrfToken: true,
        }).then(r => r.json());

        var response = await capture({
          url: `${localhost}/capture_mergeCapture_redirect/redirected1-1.html`,
          options,
          mergeCaptureInfo: {bookId, itemId},
        }, {rawResponse: true});

        var response = await capture({
          url: `${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`,
          options,
          mergeCaptureInfo: {bookId, itemId},
        }, {rawResponse: true});

        var doc = (await xhr({
          url: `${backend}/data/${itemId}/index.html`,
          responseType: "document",
        })).response;

        var anchors = doc.querySelectorAll('a[href]');
        assert.strictEqual(anchors[0].getAttribute('href'), `redirected1-1.html#111`);
        assert.strictEqual(anchors[1].getAttribute('href'), `redirected1-2.xhtml#222`);

        var sitemap = await backendRequest({
          url: `${backend}/data/${itemId}/index.json`,
        }).then(r => r.json());
        var expectedData = {
          "version": 3,
          "indexPages": [
            "index.html",
            "redirected1-1.html",
            "redirected1-2.xhtml",
          ],
          "redirects": [
            [
              `${localhost}/capture_mergeCapture_redirect/linked1-1.pyr`,
              `${localhost}/capture_mergeCapture_redirect/redirected1-1.html`,
            ],
            [
              `${localhost}/capture_mergeCapture_redirect/linked1-2.pyr`,
              `${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`,
            ],
          ],
          "files": [
            {
              "path": "index.json",
            },
            {
              "path": "index.dat",
            },
            {
              "path": "index.rdf",
            },
            {
              "path": "history.rdf",
            },
            {
              "path": "^metadata^",
            },
            {
              "path": "index.html",
              "url": `${localhost}/capture_mergeCapture_redirect/main.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/main.html`, "document"),
            },
            {
              "path": "index.xhtml",
              "role": "document",
            },
            {
              "path": "index.svg",
              "role": "document",
            },
            {
              "path": "redirected1-1.html",
              "url": `${localhost}/capture_mergeCapture_redirect/redirected1-1.html`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/redirected1-1.html`, "document"),
            },
            {
              "path": "redirected1-2.xhtml",
              "url": `${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`,
              "role": "document",
              "token": getToken(`${localhost}/capture_mergeCapture_redirect/redirected1-2.xhtml`, "document"),
            },
          ],
        };
        assert.deepEqual(sitemap, expectedData);
      });
    });
  });
});  // Capture tests

}));
